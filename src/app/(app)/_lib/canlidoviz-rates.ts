// canlidoviz — FX + altın için güncel kur ve günlük değişim (token'sız).
//
// İki kaynak:
//   1) Canlı sayfa  https://canlidoviz.com/altin-fiyatlari  (sunucuda render
//      edilmiş anlık değerler). Altın türlerinin GÜNCEL fiyatı buradan:
//        <span cid="32" dt="bA">6.304,06</span>        → alış
//        <span cid="32" dt="amount">6.305,03</span>    → satış (itemprop="price")
//        <span cid="32" cp="6.439,68" dt="change">     → cp = önceki kapanış
//        <span cid="32" dt="lastUpdate">17:46:39</span> → İstanbul saati
//      Sitedeki %DEĞ de cp'ye göre: (satış − cp) / cp.
//   2) Günlük OHLC  a.canlidoviz.com/items/history?period=DAILY  — bugünün mumu
//      gün kapanmadan oluşmaz (gün içinde son mum dünkü kapanıştır). Canlı sayfa
//      alınamazsa fiyat ve değişim buradan gelir (dünkü kapanış), FX için de
//      Truncgil'in altındaki taban budur.
//
// Endpoint'ler doğrulandı: DAILY Vercel runtime'dan çalışıyor (benchmark cron).

import { cache } from "react";

import { parseCanlidovizHistory } from "./benchmark/canlidoviz-adapter";
import type { BenchmarkPoint } from "./benchmark/types";
import { istanbulToday } from "@/lib/finance/istanbul-date";
import type { BidAskQuote } from "@/lib/finance/liquidation";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const API_BASE = "https://a.canlidoviz.com";
const LIVE_URL = "https://canlidoviz.com/altin-fiyatlari";
/** Canlı sayfa yavaşsa sayfayı bekletmesin; zaman aşımında DAILY'ye düşülür. */
const LIVE_TIMEOUT_MS = 5_000;

// Uygulama currency kodu → canlidoviz itemDataId (borsapy _providers/canlidoviz).
// Canlı sayfadaki `cid` aynı id. TRY-bazlı tek-birim varlıklarla sınırlı (JPY
// per-100 gibi birim tuzakları hariç).
export const CANLIDOVIZ_RATE_IDS: Record<string, number> = {
  USD: 1,
  EUR: 50,
  GBP: 100,
  CHF: 51,
  XAU: 32, // gram altın
  XAG: 20, // gram gümüş
  XAU_OZ: 81, // ons altın (TRY) — ham değer tutarsız, asset-rates gramdan türetir
  CEYREK: 11,
  YARIM: 47,
  TAM: 14,
  CUMHURIYET: 27,
  ATA: 43,
};

/** Fiyatı canlı sayfadan okunan altın türleri (FX canlı sayfada eksik; Truncgil'den gelir). */
export const LIVE_GOLD_CODES = ["XAU", "XAG", "XAU_OZ", "CEYREK", "YARIM", "TAM", "CUMHURIYET", "ATA"] as const;

// Kod-başına makul TRY aralığı (2026). Birim tuzağına / ayrıştırma hatasına
// karşı aralık dışı reddedilir (o kod bir sonraki kaynağa düşer). [min, max]
const RATE_BOUNDS: Record<string, [number, number]> = {
  USD: [10, 500],
  EUR: [10, 600],
  GBP: [10, 800],
  CHF: [10, 600],
  XAU: [1_000, 100_000], // gram altın
  XAG: [10, 5_000], // gram gümüş
  XAU_OZ: [30_000, 3_000_000], // ons
  CEYREK: [3_000, 500_000],
  YARIM: [6_000, 1_000_000],
  TAM: [12_000, 2_000_000],
  CUMHURIYET: [12_000, 2_000_000],
  ATA: [12_000, 2_000_000],
};

// Son nokta bundan eskiyse seri "durmuş" sayılır (bayram tatili ≤ 9 gün ama
// hafta içi kurlar/altın her gün işlem görür; 4 gün güvenli eşik).
const MAX_STALE_DAYS = 4;
// Önceki kapanıştan bundan büyük fark veri hatası sayılır.
const MAX_DAILY_CHANGE_PCT = 15;
/** Alış satışın bu oranından düşükse makas verisi bozuk sayılır. */
const MIN_BID_RATIO = 0.8;

/** UTC gün → "YYYY-MM-DD" */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inBounds(code: string, v: number): boolean {
  const b = RATE_BOUNDS[code];
  return !b || (v >= b[0] && v <= b[1]);
}

// ---------------------------------------------------------------------------
// Canlı sayfa
// ---------------------------------------------------------------------------

export interface CanlidovizLiveQuote {
  /** Satış (dt="amount") — uygulamanın değerleme fiyatı */
  selling: number;
  /** Alış (dt="bA") — bozdurma; yoksa / satıştan büyük-eşitse null */
  buying: number | null;
  /** Önceki kapanış (dt="change" öğesinin cp özniteliği) */
  prevClose: number | null;
  /** Sayfadaki güncelleme saati, "HH:MM:SS" (İstanbul; tarih verilmez) */
  lastUpdate: string | null;
}

/** TR biçimli sayı: "6.305,38" → 6305.38, "81,4837" → 81.4837, "%-2,09" → -2.09. */
export function parseTrNumber(raw: string): number | null {
  const s = raw.trim().replace(/^%/, "");
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const SPAN_RE = /<span\b([^>]*)>([^<]*)/g;
const ATTR_RE = /([\w:-]+)="([^"]*)"/g;
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * canlidoviz canlı sayfasından cid → kotasyon. Öznitelik sırasından bağımsız
 * (sikke satırlarında `itemprop` `cid`'den önce gelir). Aynı cid sayfada birkaç
 * kez geçer (üst şerit, tablo, yan panel); her alan için ilk değer alınır.
 * Burada aralık kontrolü yok — bkz. validateLiveQuote.
 */
export function parseCanlidovizLiveHtml(html: string): Record<number, CanlidovizLiveQuote> {
  const fields = new Map<number, Map<string, { text: string; cp: string | null }>>();
  for (const m of html.matchAll(SPAN_RE)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(ATTR_RE)) attrs[a[1]] = a[2];
    const cid = Number(attrs.cid);
    const dt = attrs.dt;
    if (!attrs.cid || !Number.isInteger(cid) || !dt) continue;
    let f = fields.get(cid);
    if (!f) fields.set(cid, (f = new Map()));
    if (!f.has(dt)) f.set(dt, { text: m[2].trim(), cp: attrs.cp ?? null });
  }

  const out: Record<number, CanlidovizLiveQuote> = {};
  for (const [cid, f] of fields) {
    const selling = parseTrNumber(f.get("amount")?.text ?? "");
    if (selling == null || !(selling > 0)) continue;
    const buying = parseTrNumber(f.get("bA")?.text ?? "");
    const cp = f.get("change")?.cp ?? f.get("changeAmount")?.cp ?? null;
    const prevClose = cp == null ? null : parseTrNumber(cp);
    const lu = f.get("lastUpdate")?.text ?? null;
    out[cid] = {
      selling,
      buying: buying != null && buying > 0 ? buying : null,
      prevClose: prevClose != null && prevClose > 0 ? prevClose : null,
      lastUpdate: lu != null && TIME_RE.test(lu) ? lu : null,
    };
  }
  return out;
}

/**
 * Kod için canlı kotasyonu doğrula. Satış aralık dışıysa ya da önceki
 * kapanıştan %15'ten fazla sapıyorsa (ayrıştırma hatası) tümü reddedilir →
 * kod DAILY'ye düşer. Alış satıştan büyük-eşit ya da %20'den fazla düşükse
 * yalnız alış atılır (makas verisi yok; bozdurma Truncgil'e düşer).
 */
export function validateLiveQuote(code: string, q: CanlidovizLiveQuote): CanlidovizLiveQuote | null {
  if (!inBounds(code, q.selling)) return null;
  const prevClose = q.prevClose != null && inBounds(code, q.prevClose) ? q.prevClose : null;
  if (prevClose != null && Math.abs(q.selling / prevClose - 1) * 100 > MAX_DAILY_CHANGE_PCT) return null;
  const buying =
    q.buying != null && q.buying < q.selling && q.buying >= q.selling * MIN_BID_RATIO ? q.buying : null;
  return { ...q, prevClose, buying };
}

/**
 * Canlı sayfadan altın kotasyonları (kod → doğrulanmış kotasyon). Sayfa
 * alınamaz / ayrıştırılamazsa boş döner ve uyarı loglanır; çağıran DAILY'ye
 * düşer. 5 dk veri önbelleği; aynı render içinde tek istek (react cache —
 * `signal` fetch tekilleştirmesini kapattığı için).
 */
export const fetchCanlidovizLive = cache(async (): Promise<Record<string, CanlidovizLiveQuote>> => {
  try {
    const res = await fetch(LIVE_URL, {
      next: { revalidate: 300, tags: ["asset-rates"] },
      headers: {
        "User-Agent": UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        Referer: "https://canlidoviz.com/",
      },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[canlidoviz] canlı sayfa HTTP ${res.status} → dünkü kapanışa düşülüyor`);
      return {};
    }
    const byCid = parseCanlidovizLiveHtml(await res.text());
    const out: Record<string, CanlidovizLiveQuote> = {};
    const rejected: string[] = [];
    for (const code of LIVE_GOLD_CODES) {
      const q = byCid[CANLIDOVIZ_RATE_IDS[code]];
      const v = q ? validateLiveQuote(code, q) : null;
      if (v) out[code] = v;
      else rejected.push(code);
    }
    if (rejected.length > 0) {
      console.warn(`[canlidoviz] canlı sayfada eksik/geçersiz: ${rejected.join(", ")} → dünkü kapanış`);
    }
    return out;
  } catch (err) {
    console.warn(
      "[canlidoviz] canlı sayfa alınamadı → dünkü kapanışa düşülüyor:",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
});

// ---------------------------------------------------------------------------
// Günlük seri (yedek + FX tabanı)
// ---------------------------------------------------------------------------

async function fetchDaily(code: string, id: number, start: string, end: string): Promise<BenchmarkPoint[] | null> {
  const url = `${API_BASE}/items/history?period=DAILY&itemDataId=${id}&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 600, tags: ["asset-rates"] },
      headers: { "User-Agent": UA, Origin: "https://canlidoviz.com", Referer: "https://canlidoviz.com/" },
    });
    if (!res.ok) return null;
    const pts = parseCanlidovizHistory((await res.json()) as Record<string, unknown>);
    if (pts.length === 0) return null;
    const last = pts[pts.length - 1];
    // Durmuş seri güncel kur gibi gösterilmesin (ve persistRates'e yazılmasın).
    const staleCutoff = ymd(new Date(Date.now() - MAX_STALE_DAYS * 86_400_000));
    if (last.as_of < staleCutoff) return null;
    if (!inBounds(code, last.value)) return null; // birim tuzağı
    return pts;
  } catch {
    return null;
  }
}

/**
 * DAILY seriden "önceki kapanış": gün içinde bugünün mumu yoktur → son mum;
 * gün kapandıysa (son mum bugüne aitse) → sondan ikinci mum. Mum tarihleri
 * UTC gece yarısı damgalı işlem günüdür; İstanbul takvim günüyle karşılaştırılır.
 */
export function prevCloseFromDaily(pts: BenchmarkPoint[], today: string): number | null {
  if (pts.length === 0) return null;
  const last = pts[pts.length - 1];
  if (last.as_of < today) return last.value;
  return pts.length >= 2 ? pts[pts.length - 2].value : null;
}

export type RateSource = "live" | "daily";

export interface CombinedRate {
  rate: number;
  change: number | null;
  source: RateSource;
  /** Canlı alış (yalnız canlı kaynakta) */
  buying: number | null;
  lastUpdate: string | null;
}

/**
 * Bir kod için fiyat + günlük % değişim. Fiyat canlı satış; canlı yoksa DAILY
 * son kapanış. Değişim tabanı canlıda sayfadaki cp (sitedeki %DEĞ ile aynı),
 * cp yoksa DAILY'den önceki kapanış; DAILY yedeğinde son iki kapanış.
 */
export function combineRate(
  live: CanlidovizLiveQuote | undefined,
  daily: BenchmarkPoint[] | null,
  today: string,
): CombinedRate | null {
  const pct = (v: number, prev: number | null) => {
    if (prev == null || !(prev > 0)) return null;
    const c = ((v - prev) / prev) * 100;
    // Hatalı önceki kapanış ±%50 gibi sahte değişim üretmesin.
    return Math.abs(c) > MAX_DAILY_CHANGE_PCT ? null : c;
  };
  if (live) {
    const prev = live.prevClose ?? (daily ? prevCloseFromDaily(daily, today) : null);
    return {
      rate: live.selling,
      change: pct(live.selling, prev),
      source: "live",
      buying: live.buying,
      lastUpdate: live.lastUpdate,
    };
  }
  if (daily && daily.length > 0) {
    const rate = daily[daily.length - 1].value;
    const prev = daily.length >= 2 ? daily[daily.length - 2].value : null;
    return { rate, change: pct(rate, prev), source: "daily", buying: null, lastUpdate: null };
  }
  return null;
}

export interface CanlidovizRates {
  rates: Record<string, number>;
  changes: Record<string, number>;
  /** Kod → fiyatın geldiği yer (canlı sayfa / dünkü kapanış) */
  sources: Record<string, RateSource>;
  /** Canlı alış/satış — yalnız alışı geçerli olan canlı kodlar (bozdurma oranı) */
  quotes: Record<string, BidAskQuote>;
  /** Kod → canlı fiyatın sayfadaki saati ("HH:MM:SS", İstanbul) */
  lastUpdate: Record<string, string>;
}

/**
 * Verilen kodlar (varsayılan: desteklenen tümü) için canlidoviz'den güncel kur
 * ve günlük % değişim. Altın türlerinde canlı sayfa, yoksa DAILY son kapanış;
 * FX'te DAILY. Her kod bağımsız; biri patlarsa diğerleri döner.
 */
export async function fetchCanlidovizRates(codes?: string[]): Promise<CanlidovizRates> {
  const targets = (codes ?? Object.keys(CANLIDOVIZ_RATE_IDS)).filter(
    (c) => CANLIDOVIZ_RATE_IDS[c] != null,
  );
  // Gün hassasiyetinde aralık → URL gün boyu sabit, `revalidate: 600` önbelleği
  // gerçekten çalışır. Eskiden endDate saniyeye kadar "şimdi" idi: her çağrı
  // yeni URL → önbellek hiç tutmuyor, her sayfa ~36 istek (rate-limit riski).
  const now = new Date();
  const startStr = `${ymd(new Date(now.getTime() - 8 * 86_400_000))}T00:00:00`;
  const endStr = `${ymd(now)}T23:59:59`;
  const today = istanbulToday(now);

  const [live, dailies] = await Promise.all([
    targets.some((c) => (LIVE_GOLD_CODES as readonly string[]).includes(c))
      ? fetchCanlidovizLive()
      : Promise.resolve({} as Record<string, CanlidovizLiveQuote>),
    Promise.all(targets.map((code) => fetchDaily(code, CANLIDOVIZ_RATE_IDS[code], startStr, endStr))),
  ]);

  const out: CanlidovizRates = { rates: {}, changes: {}, sources: {}, quotes: {}, lastUpdate: {} };
  targets.forEach((code, i) => {
    const r = combineRate(live[code], dailies[i], today);
    if (!r) return;
    out.rates[code] = r.rate;
    out.sources[code] = r.source;
    if (r.change != null) out.changes[code] = r.change;
    if (r.buying != null) out.quotes[code] = { buying: r.buying, selling: r.rate };
    if (r.lastUpdate) out.lastUpdate[code] = r.lastUpdate;
  });
  return out;
}
