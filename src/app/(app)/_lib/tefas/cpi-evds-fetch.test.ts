import { describe, expect, it } from "vitest";

import {
  buildCpiRows,
  fetchEvdsCpi,
  normalizePeriod,
  parseEvdsValue,
} from "./cpi-evds-fetch";

const VALID_KEY = "x".repeat(32);

/** Test helper: JSON yanıt mock. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Test helper: HTML yanıt mock. */
function htmlResponse(body: string, status = 401): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("parseEvdsValue", () => {
  it("number döner", () => {
    expect(parseEvdsValue(123.45)).toBe(123.45);
  });
  it("string sayı → number", () => {
    expect(parseEvdsValue("123.45")).toBe(123.45);
  });
  it("virgüllü → number", () => {
    expect(parseEvdsValue("123,45")).toBe(123.45);
  });
  it("null/undefined/boş → null", () => {
    expect(parseEvdsValue(null)).toBeNull();
    expect(parseEvdsValue(undefined)).toBeNull();
    expect(parseEvdsValue("")).toBeNull();
    expect(parseEvdsValue("   ")).toBeNull();
    expect(parseEvdsValue("null")).toBeNull();
  });
  it("geçersiz string → null", () => {
    expect(parseEvdsValue("abc")).toBeNull();
  });
  it("NaN/Infinity → null", () => {
    expect(parseEvdsValue(NaN)).toBeNull();
    expect(parseEvdsValue(Infinity)).toBeNull();
  });
});

describe("normalizePeriod", () => {
  it("YYYY-MM zaten doğru", () => {
    expect(normalizePeriod("2026-04")).toBe("2026-04");
  });
  it("M-YYYY → YYYY-MM", () => {
    expect(normalizePeriod("4-2026")).toBe("2026-04");
  });
  it("Tek haneli ay zero-pad", () => {
    expect(normalizePeriod("2026-4")).toBe("2026-04");
    expect(normalizePeriod("4-2026")).toBe("2026-04");
  });
  it("Boşluk trim", () => {
    expect(normalizePeriod("  2026-04  ")).toBe("2026-04");
  });
});

describe("buildCpiRows", () => {
  it("Boş items → boş array", () => {
    expect(buildCpiRows({ items: [] }, "TP_FG_J0")).toEqual([]);
  });

  it("Sıralı endeksler için m/m doğru hesap", () => {
    const result = buildCpiRows(
      {
        items: [
          { Tarih: "2025-01", TP_FG_J0: "100" },
          { Tarih: "2025-02", TP_FG_J0: "110" },
          { Tarih: "2025-03", TP_FG_J0: "121" },
        ],
      },
      "TP_FG_J0",
    );
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      period_month: "2025-01",
      index_value: 100,
      monthly_change_pct: null, // ilk satır
      is_final: true,
    });
    expect(result[1].monthly_change_pct).toBe(10); // 110/100 - 1 = %10
    expect(result[2].monthly_change_pct).toBe(10); // 121/110 - 1 = %10
  });

  it("Karışık sıra → sıralanır", () => {
    const result = buildCpiRows(
      {
        items: [
          { Tarih: "2025-03", TP_FG_J0: "121" },
          { Tarih: "2025-01", TP_FG_J0: "100" },
          { Tarih: "2025-02", TP_FG_J0: "110" },
        ],
      },
      "TP_FG_J0",
    );
    expect(result.map((r) => r.period_month)).toEqual([
      "2025-01",
      "2025-02",
      "2025-03",
    ]);
  });

  it("Null/zero değerli satırlar atlanır", () => {
    const result = buildCpiRows(
      {
        items: [
          { Tarih: "2025-01", TP_FG_J0: "100" },
          { Tarih: "2025-02", TP_FG_J0: null },
          { Tarih: "2025-03", TP_FG_J0: "0" },
          { Tarih: "2025-04", TP_FG_J0: "110" },
        ],
      },
      "TP_FG_J0",
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.period_month)).toEqual(["2025-01", "2025-04"]);
  });

  it("Virgüllü ondalık parse", () => {
    const result = buildCpiRows(
      {
        items: [{ Tarih: "2025-01", TP_FG_J0: "1234,56" }],
      },
      "TP_FG_J0",
    );
    expect(result[0].index_value).toBe(1234.56);
  });
});

describe("fetchEvdsCpi — happy path", () => {
  it("Geçerli yanıt → ok=true + rows", async () => {
    const fetchImpl = async () =>
      jsonResponse({
        totalCount: 3,
        items: [
          { Tarih: "2025-01", TP_FG_J0: "100" },
          { Tarih: "2025-02", TP_FG_J0: "110" },
          { Tarih: "2025-03", TP_FG_J0: "121" },
        ],
      });
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.evds_series).toBe("TP.FG.J0");
    expect(r.fetched_periods).toBe(3);
    expect(r.rows).toHaveLength(3);
    expect(r.window).toEqual({ start: "2025-01", end: "2025-03" });
  });

  it("URL header'da key + query'de key (geriye dönük)", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      return jsonResponse({ items: [] });
    };
    await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
      fetchImpl,
    });
    expect(capturedUrl).toContain("TP.FG.J0");
    expect(capturedUrl).toContain(`key=${VALID_KEY}`);
    expect(capturedUrl).toContain("startDate=01-01-2025");
    expect(capturedUrl).toContain("endDate=01-03-2025");
    // Header'da da key var
    const hdrs = capturedHeaders as Record<string, string>;
    expect(hdrs.key).toBe(VALID_KEY);
  });
});

describe("fetchEvdsCpi — hata yolları", () => {
  it("Bilinmeyen series → ok=false", async () => {
    const r = await fetchEvdsCpi({
      series: "INVALID",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Bilinmeyen series");
  });

  it("Boş API key → ok=false + diagnostic", async () => {
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: "",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("eksik veya boş");
    expect(r.diagnostic?.api_key_len).toBe(0);
  });

  it("Kısa API key kabul edilir (EVDS yeni sistemi 10 char verir)", async () => {
    // EVDS3 yeni sistemde key uzunluğu daha kısa olabilir. Min uzunluk
    // validasyonu kaldırıldı; gerçek geçerlilik EVDS yanıtından belli olur.
    const fetchImpl = async () =>
      jsonResponse({ totalCount: 1, items: [{ Tarih: "2025-01", TP_FG_J0: "100" }] });
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: "IsyBcVi1fg", // 10 char — kullanıcı tarafından doğrulanmış format
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.fetched_periods).toBe(1);
  });

  it("HTTP 500 → ok=false + status_code + body_snippet", async () => {
    const fetchImpl = async () =>
      new Response("Server error: internal", { status: 500 });
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostic?.status_code).toBe(500);
    expect(r.diagnostic?.body_snippet).toContain("Server error");
  });

  it("HTML yanıt → JSON parse fail + hints", async () => {
    const fetchImpl = async () =>
      htmlResponse("<!doctype html><html>Login required</html>", 200);
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("JSON değil");
    expect(r.diagnostic?.hints).toContain("EVDS login sayfası döndü — API key geçersiz veya süresi dolmuş");
  });

  it("CAPTCHA HTML → CAPTCHA hint", async () => {
    const fetchImpl = async () =>
      htmlResponse("<html><body>Please solve captcha</body></html>", 200);
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
      fetchImpl,
    });
    expect(r.diagnostic?.hints).toContain("EVDS CAPTCHA döndürdü (rate limit veya IP block olabilir)");
  });

  it("Network error → ok=false", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: VALID_KEY,
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ECONNREFUSED");
  });

  it("URL redacted — API key dış değil", async () => {
    const fetchImpl = async () =>
      new Response("Forbidden", { status: 403 });
    const r = await fetchEvdsCpi({
      series: "CPI_TR_GENERAL",
      start: "2025-01",
      end: "2025-03",
      apiKey: "supersecretkey1234567890abcdef",
      fetchImpl,
    });
    expect(r.diagnostic?.evds_url_redacted).toBeDefined();
    expect(r.diagnostic?.evds_url_redacted).not.toContain("supersecretkey");
    expect(r.diagnostic?.evds_url_redacted).toContain("***");
  });
});
