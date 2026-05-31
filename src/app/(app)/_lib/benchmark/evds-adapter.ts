// Sprint-5.6 PR-A — Generic EVDS series fetcher.
//
// CPI ingest pattern (cpi-evds-fetch.ts) genelleştirildi. Hangi EVDS series
// olursa olsun (XU100, XAU, USD, EUR, TLREF) tek fonksiyondan çağrılır.
//
// EVDS3 endpoint (varsayılan): https://evds3.tcmb.gov.tr/igmevdsms-dis/series
// EVDS2 (legacy):              https://evds2.tcmb.gov.tr/service/evds/series
// EVDS API key:                header "key: <token>" + query param "key=..."

import type { BenchmarkPoint } from "./types";

const EVDS_BASE_DEFAULT = "https://evds3.tcmb.gov.tr/igmevdsms-dis/series";

export interface EvdsSeriesOptions {
  /** EVDS series code (örn. "TP.MK.F.BIST100"). */
  evdsSeries: string;
  /** YYYY-MM-DD. EVDS DD-MM-YYYY ister, adapter çevirir. */
  startDate: string;
  /** YYYY-MM-DD. */
  endDate: string;
  apiKey: string;
  /** Default EVDS3. Override için: EVDS2 endpoint vs. */
  baseUrl?: string;
  /** 1=günlük, 5=aylık. Default 1. */
  frequency?: 1 | 5 | 8;
  /** "avg" | "last" | "first" | "sum" — default "last" (kapanış için doğru). */
  aggregationType?: "avg" | "last" | "first" | "sum";
  /** Test için fetch override. */
  fetchImpl?: typeof fetch;
}

export interface EvdsDiagnostic {
  status_code?: number;
  content_type?: string;
  body_snippet?: string;
  api_key_len?: number;
  evds_url_redacted?: string;
  hints?: string[];
}

export interface EvdsSeriesResult {
  ok: boolean;
  evds_series: string;
  fetched_periods: number;
  points: BenchmarkPoint[];
  error?: string;
  diagnostic?: EvdsDiagnostic;
}

interface EvdsRawItem {
  Tarih?: string;
  [k: string]: unknown;
}
interface EvdsRawResponse {
  items?: EvdsRawItem[];
  totalCount?: number;
}

/** EVDS bazen virgüllü sayı döner; null/boş string. */
function parseEvdsValue(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "null") return null;
  const normalized = s.replace(/,/g, ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** YYYY-MM-DD → DD-MM-YYYY (EVDS query formatı). */
function toEvdsDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y.padStart(4, "0")}`;
}

/** EVDS "01-01-2024" gibi tarihi YYYY-MM-DD'ye normalize et. */
function normalizeDate(raw: string): string {
  const s = raw.trim();
  // Format A: DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split("-");
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Format B: YYYY-MM-DD (zaten doğru)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Format C: aylık "M-YYYY" veya "YYYY-MM"
  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [m, y] = s.split("-");
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-01`;
  }
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [y, m] = s.split("-");
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-01`;
  }
  return s;
}

/** EVDS URL kur. Hem header hem query'de key (geriye dönük). */
function buildEvdsUrl(opts: Required<Pick<EvdsSeriesOptions, "evdsSeries" | "startDate" | "endDate" | "apiKey">> & Pick<EvdsSeriesOptions, "baseUrl" | "frequency" | "aggregationType">): string {
  const params = new URLSearchParams({
    startDate: toEvdsDate(opts.startDate),
    endDate: toEvdsDate(opts.endDate),
    type: "json",
    frequency: String(opts.frequency ?? 1),
    aggregationTypes: opts.aggregationType ?? "last",
    formulas: "0",
    decimalSeperator: ".",
    key: opts.apiKey,
  });
  const base = opts.baseUrl ?? EVDS_BASE_DEFAULT;
  return `${base}=${opts.evdsSeries}&${params.toString()}`;
}

function isHtml(body: string): boolean {
  const t = body.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<");
}

function diagnoseHints(body: string, apiKey: string): string[] {
  const hints: string[] = [];
  const low = body.toLowerCase();
  if (isHtml(body) && low.includes("captcha")) {
    hints.push("EVDS CAPTCHA döndürdü (rate limit veya IP block olabilir)");
  }
  if (isHtml(body) && low.includes("login")) {
    hints.push("EVDS login sayfası — API key geçersiz veya süresi dolmuş");
  }
  if (body.includes("Forbidden") || body.includes("403")) {
    hints.push("403 Forbidden — IP veya User-Agent reject");
  }
  if (apiKey.length < 8) {
    hints.push(`API key kısa görünüyor (len=${apiKey.length})`);
  }
  return hints;
}

/**
 * EVDS'ten bir seri çek + BenchmarkPoint[] olarak normalize et.
 *
 * Items dizisinde Tarih + value field'ları bulunur. value field'ı serinin
 * EVDS series code'una göre adlandırılır (örn. "TP_MK_F_BIST100"). Adapter
 * generic: Tarih dışındaki ilk numeric field'ı value olarak alır.
 */
export async function fetchEvdsSeries(opts: EvdsSeriesOptions): Promise<EvdsSeriesResult> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) {
    return {
      ok: false,
      evds_series: opts.evdsSeries,
      fetched_periods: 0,
      points: [],
      error: "EVDS_API_KEY eksik veya boş",
      diagnostic: { api_key_len: 0 },
    };
  }

  const url = buildEvdsUrl({
    evdsSeries: opts.evdsSeries,
    startDate: opts.startDate,
    endDate: opts.endDate,
    apiKey,
    baseUrl: opts.baseUrl,
    frequency: opts.frequency,
    aggregationType: opts.aggregationType,
  });
  const urlRedacted = url.replace(apiKey, "***");
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: {
        key: apiKey,
        "User-Agent": "Mozilla/5.0 (compatible; portfoy-benchmark-ingest/1.0)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      evds_series: opts.evdsSeries,
      fetched_periods: 0,
      points: [],
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      diagnostic: { api_key_len: apiKey.length, evds_url_redacted: urlRedacted },
    };
  }

  const contentType = res.headers.get("content-type") ?? "unknown";
  const body = await res.text();
  const baseDiag: EvdsDiagnostic = {
    status_code: res.status,
    content_type: contentType,
    api_key_len: apiKey.length,
    evds_url_redacted: urlRedacted,
  };

  if (!res.ok) {
    return {
      ok: false,
      evds_series: opts.evdsSeries,
      fetched_periods: 0,
      points: [],
      error: `EVDS HTTP ${res.status}`,
      diagnostic: { ...baseDiag, body_snippet: body.slice(0, 300), hints: diagnoseHints(body, apiKey) },
    };
  }

  let parsed: EvdsRawResponse;
  try {
    parsed = JSON.parse(body) as EvdsRawResponse;
  } catch (je) {
    return {
      ok: false,
      evds_series: opts.evdsSeries,
      fetched_periods: 0,
      points: [],
      error: `JSON parse: ${je instanceof Error ? je.message : String(je)}`,
      diagnostic: { ...baseDiag, body_snippet: body.slice(0, 300), hints: diagnoseHints(body, apiKey) },
    };
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length === 0) {
    return {
      ok: false,
      evds_series: opts.evdsSeries,
      fetched_periods: 0,
      points: [],
      error: "EVDS items boş — series code yanlış veya tarih aralığı dışı",
      diagnostic: { ...baseDiag, body_snippet: body.slice(0, 300) },
    };
  }

  // Value field: Tarih dışındaki ilk numeric field. EVDS series_code'u
  // "TP.MK.F.BIST100" → field name "TP_MK_F_BIST100" gibi nokta yerine
  // alt-tire ile dönüyor genelde. Generic detect.
  const points: BenchmarkPoint[] = [];
  for (const it of items) {
    const dateRaw = String(it.Tarih ?? "");
    if (!dateRaw) continue;
    const as_of = normalizeDate(dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of)) continue;

    // Tarih dışındaki ilk parse-edilebilir numeric value
    let value: number | null = null;
    for (const [key, raw] of Object.entries(it)) {
      if (key === "Tarih" || key === "UNIXTIME") continue;
      const v = parseEvdsValue(raw);
      if (v != null) {
        value = v;
        break;
      }
    }
    if (value == null) continue;
    if (value <= 0) continue;
    points.push({ as_of, value });
  }

  // Tarih DESC olabilir → ASC sırala
  points.sort((a, b) => a.as_of.localeCompare(b.as_of));

  return {
    ok: points.length > 0,
    evds_series: opts.evdsSeries,
    fetched_periods: points.length,
    points,
    diagnostic: baseDiag,
  };
}

export const __internals = { parseEvdsValue, normalizeDate, toEvdsDate, buildEvdsUrl };
