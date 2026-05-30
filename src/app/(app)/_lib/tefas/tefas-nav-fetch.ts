// TEFAS NAV fetcher — yeni JSON API çağrısı + parse.
// `api/tefas-prices.py` (tefas-crawler bağımlısı) Node'a port edildi (PR-B).
// Function-to-function HTTP zinciri kaldırıldı.
//
// TEFAS yeni JSON API (2025+):
//   POST https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir
//   Body: {"fonKodu": "HFI", "dil": "TR", "periyod": 1}
//   periyod: 1 / 3 / 6 / 12 / 36 / 60 (ay sayısı, sabit enum)
//   Response: {"resultList": [{"tarih":"YYYY-MM-DD","fonKodu":"...","fiyat":n}, ...]}
//
// Eksiklikler (yeni API): market_cap, investor_count, share_count YOK
// (Sprint-2 dokümante edildi; fund_prices schema'sında null olarak kalır).
//
// Pure: DB/Next.js bağımsız. fetch global çağrı (test'te mock'lanır).

const TEFAS_BASE_DEFAULT = "https://www.tefas.gov.tr";
const PRICE_ENDPOINT = "/api/funds/fonFiyatBilgiGetir";
const DEFAULT_PERIOD: TefasPeriod = 1; // 1 ay — günlük cron için yeter

/** TEFAS API'nin kabul ettiği sabit periyod enum (ay). */
export type TefasPeriod = 1 | 3 | 6 | 12 | 36 | 60;
const VALID_PERIODS: ReadonlyArray<TefasPeriod> = [1, 3, 6, 12, 36, 60];

export interface NavFetchOptions {
  /** Lookback period in months (TEFAS enum: 1/3/6/12/36/60). Default 1. */
  periodMonths?: TefasPeriod;
  /** Override base URL (test/dev için). */
  baseUrl?: string;
  /** Fetch override (test için). */
  fetchImpl?: typeof fetch;
  /** Tek istek timeout (ms). Default 15000. */
  timeoutMs?: number;
  /** Paralel istek sayısı (TEFAS rate limit). Default 3. */
  concurrency?: number;
}

export interface NavPriceRow {
  /** Fon kodu (örn. "HFI"). */
  code: string;
  /** Fon adı (TEFAS resmi adı). */
  title: string | null;
  /** En son NAV tarihi (YYYY-MM-DD). */
  as_of: string;
  /** Pay başına net aktif değer. */
  nav: number;
}

export type NavFailureReason =
  | "http_error"
  | "html_response"
  | "json_parse_error"
  | "empty_result"
  | "no_valid_row"
  | "network_error"
  | "timeout";

export interface NavFetchFailure {
  code: string;
  reason: NavFailureReason;
  http_status?: number;
  content_type?: string;
  body_snippet?: string;
  error_message?: string;
}

export interface NavFetchResult {
  ok: boolean;
  source: "tefas";
  fetched_at: string;
  /** Tam endpoint URL (debug için). */
  endpoint: string;
  api_version: "v2-spa";
  requested: number;
  succeeded: number;
  prices: NavPriceRow[];
  /** Backward-compat: failed code listesi. */
  failed: string[];
  /** Detaylı failure metadata (debug için). */
  failures: NavFetchFailure[];
  /** Beklenmedik fatal error (validation gibi) varsa burada. */
  error?: string;
}

interface TefasResultItem {
  tarih?: string;
  fonKodu?: string;
  fonUnvan?: string;
  fiyat?: string | number;
  [k: string]: unknown;
}
interface TefasResponse {
  resultList?: TefasResultItem[];
}

function defaultHeaders(baseUrl: string): Record<string, string> {
  // TEFAS kimi zaman Referer/Origin başlığını ve tarayıcı UA'sını arar.
  // Browser benzeri payload — Cloudflare/akamai bot filtrelerini geçmek için.
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
    Origin: baseUrl,
    Referer: `${baseUrl}/FonAnaliz/`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
  };
}

/** HTML detect (kolay heuristic). */
function looksLikeHtml(body: string, contentType: string | null): boolean {
  if (contentType && /text\/html/i.test(contentType)) return true;
  const t = body.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<");
}

/** TEFAS POST body içeren JSON yanıtı parse + son tarihli satırı bul. */
export function parseLatestNav(json: TefasResponse, fallbackCode: string): NavPriceRow | null {
  const items = Array.isArray(json.resultList) ? json.resultList : [];
  if (items.length === 0) return null;

  // En son tarihli satırı al
  let latest: TefasResultItem | null = null;
  for (const it of items) {
    const t = String(it.tarih ?? "").slice(0, 10);
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    if (!latest || String(latest.tarih ?? "").slice(0, 10) < t) latest = it;
  }
  if (!latest) return null;

  const navRaw = latest.fiyat;
  const nav =
    typeof navRaw === "number"
      ? navRaw
      : navRaw != null
      ? Number(String(navRaw).replace(",", "."))
      : NaN;
  if (!Number.isFinite(nav) || nav <= 0) return null;

  const code = String(latest.fonKodu ?? fallbackCode).trim().toUpperCase();
  const title = latest.fonUnvan != null ? String(latest.fonUnvan).trim() : null;
  const asOf = String(latest.tarih).slice(0, 10);
  return { code, title: title || null, as_of: asOf, nav };
}

type FetchOneResult =
  | { ok: true; row: NavPriceRow }
  | { ok: false; failure: NavFetchFailure };

/** Tek bir fon için TEFAS NAV çağrısı (HTTP POST). Diagnostic capture'lı. */
export async function fetchOneFundDetailed(
  code: string,
  options: NavFetchOptions = {},
): Promise<FetchOneResult> {
  const periodMonths = options.periodMonths ?? DEFAULT_PERIOD;
  const baseUrl = options.baseUrl ?? TEFAS_BASE_DEFAULT;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15000;

  const url = `${baseUrl}${PRICE_ENDPOINT}`;
  const body = JSON.stringify({
    fonKodu: code,
    dil: "TR",
    periyod: periodMonths,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: defaultHeaders(baseUrl),
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    const reason: NavFailureReason = /abort/i.test(msg) ? "timeout" : "network_error";
    return {
      ok: false,
      failure: { code, reason, error_message: msg },
    };
  }
  clearTimeout(timer);

  const contentType = res.headers.get("content-type");
  const text = await res.text().catch(() => "");

  if (!res.ok) {
    return {
      ok: false,
      failure: {
        code,
        reason: "http_error",
        http_status: res.status,
        content_type: contentType ?? undefined,
        body_snippet: text.slice(0, 300),
      },
    };
  }

  if (looksLikeHtml(text, contentType)) {
    return {
      ok: false,
      failure: {
        code,
        reason: "html_response",
        http_status: res.status,
        content_type: contentType ?? undefined,
        body_snippet: text.slice(0, 300),
      },
    };
  }

  let json: TefasResponse;
  try {
    json = JSON.parse(text) as TefasResponse;
  } catch (je) {
    return {
      ok: false,
      failure: {
        code,
        reason: "json_parse_error",
        http_status: res.status,
        content_type: contentType ?? undefined,
        body_snippet: text.slice(0, 300),
        error_message: je instanceof Error ? je.message : String(je),
      },
    };
  }

  const items = Array.isArray(json.resultList) ? json.resultList : [];
  if (items.length === 0) {
    return {
      ok: false,
      failure: {
        code,
        reason: "empty_result",
        http_status: res.status,
        content_type: contentType ?? undefined,
        body_snippet: text.slice(0, 300),
      },
    };
  }

  const row = parseLatestNav(json, code);
  if (!row) {
    return {
      ok: false,
      failure: {
        code,
        reason: "no_valid_row",
        http_status: res.status,
        content_type: contentType ?? undefined,
        body_snippet: text.slice(0, 300),
      },
    };
  }
  return { ok: true, row };
}

/**
 * Birden çok fon için TEFAS NAV çek. Her fon ayrı POST (TEFAS yeni API'sinin
 * limitasyonu — bulk endpoint yok).
 *
 * Concurrency: TEFAS rate limit riski; küçük gruplar halinde paralel
 * (default 3'lük chunk). Hata halinde fon `failed[]`'a düşer + `failures[]`'da
 * detaylı diagnostic; toplam sonuç bozulmaz.
 *
 * `ok` semantiği: en az 1 fon başarılı olursa true; tamamı fail ise false
 * (bulk debug için).
 */
export async function fetchTefasNav(
  codes: string[],
  options: NavFetchOptions = {},
): Promise<NavFetchResult> {
  const periodMonths = options.periodMonths ?? DEFAULT_PERIOD;
  const baseUrl = options.baseUrl ?? TEFAS_BASE_DEFAULT;
  const endpointFull = `${baseUrl}${PRICE_ENDPOINT}`;
  if (!VALID_PERIODS.includes(periodMonths)) {
    return {
      ok: false,
      source: "tefas",
      fetched_at: new Date().toISOString(),
      endpoint: endpointFull,
      api_version: "v2-spa",
      requested: codes.length,
      succeeded: 0,
      prices: [],
      failed: codes,
      failures: codes.map((c) => ({
        code: c,
        reason: "http_error" as NavFailureReason,
        error_message: `Geçersiz periodMonths=${periodMonths}`,
      })),
      error: `Geçersiz periodMonths=${periodMonths}. Kabul edilen: ${VALID_PERIODS.join(", ")}`,
    };
  }

  const concurrency = Math.max(1, options.concurrency ?? 3);

  const prices: NavPriceRow[] = [];
  const failed: string[] = [];
  const failures: NavFetchFailure[] = [];

  for (let i = 0; i < codes.length; i += concurrency) {
    const batch = codes.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((code) => fetchOneFundDetailed(code, options)),
    );
    for (const r of results) {
      if (r.ok) prices.push(r.row);
      else {
        failed.push(r.failure.code);
        failures.push(r.failure);
      }
    }
  }

  return {
    ok: prices.length > 0,
    source: "tefas",
    fetched_at: new Date().toISOString(),
    endpoint: endpointFull,
    api_version: "v2-spa",
    requested: codes.length,
    succeeded: prices.length,
    prices,
    failed,
    failures,
  };
}
