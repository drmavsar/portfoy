// CPI EVDS fetcher — TCMB EVDS API çağrısı + parse.
// `api/cpi-ingest.py` Node'a port edildi (PR-A). Function-to-function HTTP
// çağrısı kaldırıldı; cron route doğrudan bu fonksiyonu çağırır.
//
// EVDS değişiklikleri (5 Nisan 2024):
//   - API key HTTP header'da (`key: <token>`) gönderilir.
//   - Query parametresi `?key=...` da geriye dönük destek için ekli.
//
// Pure: hiçbir DB veya Next.js bağımlılığı yok. `fetch` global olarak çağrılır
// (test'te mock'lanır).

const EVDS_BASE = "https://evds2.tcmb.gov.tr/service/evds/series";

export const SERIES_MAP: Record<string, string> = {
  // Bizim kanonik kodumuz → TCMB EVDS seri kodu
  CPI_TR_GENERAL: "TP.FG.J0",
};

export type CpiSeriesCode = keyof typeof SERIES_MAP;

export interface EvdsFetchOptions {
  series: string; // "CPI_TR_GENERAL"
  start: string; // "YYYY-MM"
  end: string; // "YYYY-MM"
  apiKey: string;
  /** İsteğe bağlı fetch override (test için). */
  fetchImpl?: typeof fetch;
}

export interface CpiRow {
  period_month: string; // "YYYY-MM"
  index_value: number;
  monthly_change_pct: number | null;
  is_final: boolean;
}

export interface EvdsFetchDiagnostic {
  status_code?: number;
  content_type?: string;
  body_snippet?: string;
  api_key_len?: number;
  api_key_first6?: string;
  evds_url_redacted?: string;
  hints?: string[];
}

export interface EvdsFetchResult {
  ok: boolean;
  series_code?: string;
  evds_series?: string;
  window?: { start: string; end: string };
  fetched_periods?: number;
  rows?: CpiRow[];
  error?: string;
  diagnostic?: EvdsFetchDiagnostic;
}

/** EVDS bazen virgüllü sayı döner; bazen null/boş string. */
export function parseEvdsValue(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null") return null;
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** "M-YYYY" veya "YYYY-MM" → "YYYY-MM". */
export function normalizePeriod(tarih: string): string {
  const s = tarih.trim();
  if (!s.includes("-")) return s;
  const parts = s.split("-");
  if (parts.length !== 2) return s;
  const [a, b] = [parts[0].trim(), parts[1].trim()];
  const isYearFirst = a.length === 4;
  const y = isYearFirst ? a : b;
  const m = isYearFirst ? b : a;
  return `${Number(y).toString().padStart(4, "0")}-${Number(m).toString().padStart(2, "0")}`;
}

interface EvdsRawItem {
  Tarih?: string;
  [k: string]: unknown;
}
interface EvdsRawResponse {
  items?: EvdsRawItem[];
  totalCount?: number;
}

/** EVDS yanıtını sıralı CpiRow'lara çevirir + m/m hesabını yapar. */
export function buildCpiRows(
  evdsJson: EvdsRawResponse,
  evdsField: string,
): CpiRow[] {
  const items = Array.isArray(evdsJson.items) ? evdsJson.items : [];
  type Pair = readonly [string, number];
  const parsed: Pair[] = [];
  for (const it of items) {
    const period = normalizePeriod(String(it.Tarih ?? ""));
    const value = parseEvdsValue(it[evdsField]);
    if (!period || value === null || value <= 0) continue;
    parsed.push([period, value] as const);
  }
  parsed.sort((a, b) => a[0].localeCompare(b[0]));

  const rows: CpiRow[] = [];
  let prev: number | null = null;
  for (const [period, value] of parsed) {
    const change =
      prev !== null && prev > 0 ? ((value / prev) - 1) * 100 : null;
    rows.push({
      period_month: period,
      index_value: Number(value.toFixed(4)),
      monthly_change_pct: change !== null ? Number(change.toFixed(4)) : null,
      is_final: true,
    });
    prev = value;
  }
  return rows;
}

/** EVDS HTTP URL'i kur. `key` hem header hem query'de (geriye dönük). */
function buildEvdsUrl(evdsSeries: string, start: string, end: string, apiKey: string): string {
  const [sy, sm] = start.split("-");
  const [ey, em] = end.split("-");
  const startEvds = `01-${sm.padStart(2, "0")}-${sy.padStart(4, "0")}`;
  const endEvds = `01-${em.padStart(2, "0")}-${ey.padStart(4, "0")}`;
  const params = new URLSearchParams({
    startDate: startEvds,
    endDate: endEvds,
    type: "json",
    frequency: "5",
    aggregationTypes: "avg",
    formulas: "0",
    decimalSeperator: ".",
    key: apiKey,
  });
  return `${EVDS_BASE}=${evdsSeries}&${params.toString()}`;
}

/** HTML detect (kolay heuristic). */
function isHtml(body: string): boolean {
  const t = body.trimStart().toLowerCase();
  return t.startsWith("<") || t.startsWith("&lt;");
}

/** Hata mesajından olası nedenleri çıkar. */
function diagnoseHints(body: string, apiKey: string): string[] {
  const hints: string[] = [];
  const low = body.toLowerCase();
  if (isHtml(body) && low.includes("captcha")) {
    hints.push("EVDS CAPTCHA döndürdü (rate limit veya IP block olabilir)");
  }
  if (isHtml(body) && low.includes("login")) {
    hints.push("EVDS login sayfası döndü — API key geçersiz veya süresi dolmuş");
  }
  if (body.includes("Forbidden") || body.includes("403")) {
    hints.push("403 Forbidden — IP veya User-Agent reject");
  }
  if (apiKey.length < 20) {
    hints.push(`API key kısa görünüyor (len=${apiKey.length}) — yanlış kopyalanmış olabilir`);
  }
  return hints;
}

/**
 * EVDS'ten bir seri çek ve CpiRow[]'a çevir.
 *
 * Önceden Python (`api/cpi-ingest.py`) tarafından yapılan iş şimdi burada.
 * Function-to-function HTTP zinciri yok.
 */
export async function fetchEvdsCpi(opts: EvdsFetchOptions): Promise<EvdsFetchResult> {
  const series = opts.series.toUpperCase();
  const evdsSeries = SERIES_MAP[series];
  if (!evdsSeries) {
    return {
      ok: false,
      error: `Bilinmeyen series: ${series}. Geçerli: ${Object.keys(SERIES_MAP).join(", ")}`,
    };
  }

  const apiKey = (opts.apiKey ?? "").trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "EVDS_API_KEY env var eksik veya boş",
      diagnostic: { api_key_len: 0 },
    };
  }
  if (apiKey.length < 16) {
    return {
      ok: false,
      error: `EVDS_API_KEY anlamsız kısa (len=${apiKey.length})`,
      diagnostic: { api_key_len: apiKey.length },
    };
  }

  const url = buildEvdsUrl(evdsSeries, opts.start, opts.end, apiKey);
  const urlRedacted = url.replace(apiKey, "***");
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        key: apiKey,
        "User-Agent": "Mozilla/5.0 (compatible; portfoy-cpi-ingest/2.0)",
        Accept: "application/json",
      },
      // EVDS sık değişmez ama cron'da no-store
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: `EVDS fetch network error: ${err instanceof Error ? err.message : String(err)}`,
      diagnostic: { api_key_len: apiKey.length, evds_url_redacted: urlRedacted },
    };
  }

  const contentType = res.headers.get("content-type") ?? "unknown";
  const body = await res.text();
  const baseDiag: EvdsFetchDiagnostic = {
    status_code: res.status,
    content_type: contentType,
    api_key_len: apiKey.length,
    api_key_first6: apiKey.slice(0, 6) + "***",
    evds_url_redacted: urlRedacted,
  };

  if (!res.ok) {
    return {
      ok: false,
      error: `EVDS HTTP ${res.status}`,
      diagnostic: {
        ...baseDiag,
        body_snippet: body.slice(0, 300),
        hints: diagnoseHints(body, apiKey),
      },
    };
  }

  let parsed: EvdsRawResponse;
  try {
    parsed = JSON.parse(body) as EvdsRawResponse;
  } catch (je) {
    return {
      ok: false,
      error: `EVDS yanıtı JSON değil: ${je instanceof Error ? je.message : String(je)}`,
      diagnostic: {
        ...baseDiag,
        body_snippet: body.slice(0, 300),
        hints: diagnoseHints(body, apiKey),
      },
    };
  }

  const rows = buildCpiRows(parsed, evdsSeries.replace(/\./g, "_"));
  return {
    ok: true,
    series_code: series,
    evds_series: evdsSeries,
    window: { start: opts.start, end: opts.end },
    fetched_periods: rows.length,
    rows,
  };
}
