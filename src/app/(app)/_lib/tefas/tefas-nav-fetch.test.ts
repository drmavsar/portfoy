import { describe, expect, it } from "vitest";

import {
  fetchOneFundDetailed,
  fetchTefasNav,
  fetchTefasNavHistory,
  parseAllNavRows,
  parseLatestNav,
} from "./tefas-nav-fetch";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("parseLatestNav", () => {
  it("Boş resultList → null", () => {
    expect(parseLatestNav({ resultList: [] }, "HFI")).toBeNull();
    expect(parseLatestNav({}, "HFI")).toBeNull();
  });

  it("Tek satır → o satır döner", () => {
    const r = parseLatestNav(
      {
        resultList: [
          { tarih: "2026-01-15", fonKodu: "HFI", fonUnvan: "Test Fon", fiyat: 12.34 },
        ],
      },
      "HFI",
    );
    expect(r).toEqual({ code: "HFI", title: "Test Fon", as_of: "2026-01-15", nav: 12.34 });
  });

  it("Birden çok satır → en son tarihli seçilir", () => {
    const r = parseLatestNav(
      {
        resultList: [
          { tarih: "2026-01-10", fonKodu: "HFI", fiyat: 11.0 },
          { tarih: "2026-01-15", fonKodu: "HFI", fiyat: 12.34 },
          { tarih: "2026-01-12", fonKodu: "HFI", fiyat: 11.5 },
        ],
      },
      "HFI",
    );
    expect(r?.as_of).toBe("2026-01-15");
    expect(r?.nav).toBe(12.34);
  });

  it("String fiyat → number'a çevrilir", () => {
    const r = parseLatestNav(
      { resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: "12.34" }] },
      "HFI",
    );
    expect(r?.nav).toBe(12.34);
  });

  it("Virgüllü fiyat → number'a çevrilir", () => {
    const r = parseLatestNav(
      { resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: "12,34" }] },
      "HFI",
    );
    expect(r?.nav).toBe(12.34);
  });

  it("Geçersiz tarih satırı atlanır", () => {
    const r = parseLatestNav(
      {
        resultList: [
          { tarih: "bozuk", fonKodu: "HFI", fiyat: 99 },
          { tarih: "2026-01-15", fonKodu: "HFI", fiyat: 12.34 },
        ],
      },
      "HFI",
    );
    expect(r?.as_of).toBe("2026-01-15");
  });

  it("Sıfır/negatif NAV → null", () => {
    expect(
      parseLatestNav(
        { resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 0 }] },
        "HFI",
      ),
    ).toBeNull();
    expect(
      parseLatestNav(
        { resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: -1 }] },
        "HFI",
      ),
    ).toBeNull();
  });

  it("Title yoksa null", () => {
    const r = parseLatestNav(
      { resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 1 }] },
      "HFI",
    );
    expect(r?.title).toBeNull();
  });
});

describe("fetchTefasNav — happy path", () => {
  it("Tek fon, başarılı yanıt → prices'a düşer", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fonUnvan: "Test", fiyat: 12.34 }],
      })) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.requested).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toEqual([]);
    expect(r.failures).toEqual([]);
    expect(r.prices[0]).toEqual({
      code: "HFI",
      title: "Test",
      as_of: "2026-01-15",
      nav: 12.34,
    });
  });

  it("Birden çok fon — her biri için ayrı POST", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      const body = JSON.parse(init?.body as string);
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: body.fonKodu, fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI", "KMF", "KPI"], { fetchImpl });
    expect(r.succeeded).toBe(3);
    expect(calls).toHaveLength(3);
    expect(r.prices.map((p) => p.code).sort()).toEqual(["HFI", "KMF", "KPI"]);
  });

  it("Bazı fonlar başarısız → diğerleri yine prices'a düşer + diagnostic", async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (body.fonKodu === "BAD") return new Response("Server error", { status: 500 });
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: body.fonKodu, fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI", "BAD", "KMF"], { fetchImpl });
    expect(r.ok).toBe(true); // en az 1 başarı var
    expect(r.succeeded).toBe(2);
    expect(r.failed).toEqual(["BAD"]);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({
      code: "BAD",
      reason: "http_error",
      http_status: 500,
    });
    expect(r.failures[0].body_snippet).toContain("Server error");
  });

  it("Boş resultList (TEFAS o gün yayın yapmadı) → failure detayı 'empty_result'", async () => {
    const fetchImpl = (async () => jsonResponse({ resultList: [] })) as unknown as typeof fetch;
    const r = await fetchTefasNav(["XYZ"], { fetchImpl });
    expect(r.ok).toBe(false); // tamamı failed → ok=false
    expect(r.succeeded).toBe(0);
    expect(r.failed).toEqual(["XYZ"]);
    expect(r.failures[0].reason).toBe("empty_result");
  });

  it("Network error → 'network_error' failure", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual(["HFI"]);
    expect(r.failures[0]).toMatchObject({
      code: "HFI",
      reason: "network_error",
      error_message: "ECONNREFUSED",
    });
  });

  it("HTML yanıt (TEFAS bakım / Cloudflare challenge) → 'html_response' failure", async () => {
    const fetchImpl = (async () =>
      new Response("<!doctype html>...", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual(["HFI"]);
    expect(r.failures[0]).toMatchObject({
      code: "HFI",
      reason: "html_response",
      http_status: 200,
      content_type: "text/html",
    });
    expect(r.failures[0].body_snippet).toContain("<!doctype html>");
  });

  it("JSON parse hatası → 'json_parse_error' failure (body snippet'li)", async () => {
    const fetchImpl = (async () =>
      new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], { fetchImpl });
    expect(r.failures[0].reason).toBe("json_parse_error");
    expect(r.failures[0].body_snippet).toBe("not json");
  });
});

describe("fetchTefasNav — POST body + endpoint", () => {
  it("Doğru URL + body içeriği + endpoint full URL response'ta", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? "GET";
      capturedBody = init?.body as string;
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], { fetchImpl, periodMonths: 12 });
    expect(capturedUrl).toBe("https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir");
    expect(capturedMethod).toBe("POST");
    const body = JSON.parse(capturedBody);
    expect(body).toEqual({ fonKodu: "HFI", dil: "TR", periyod: 12 });
    expect(capturedHeaders["Referer"]).toContain("tefas.gov.tr");
    expect(r.endpoint).toBe("https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir");
  });

  it("Default periodMonths = 1", async () => {
    let body: { periyod?: number } = {};
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    await fetchTefasNav(["HFI"], { fetchImpl });
    expect(body.periyod).toBe(1);
  });

  it("Geçersiz period (örn. 7) → ok=false + hiçbir çağrı yapılmaz", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse({ resultList: [] });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], {
      fetchImpl,
      periodMonths: 7 as 1, // bilerek invalid
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Geçersiz periodMonths");
    expect(calls).toBe(0);
  });

  it("baseUrl override → endpoint URL'ine yansır", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNav(["HFI"], {
      fetchImpl,
      baseUrl: "https://mock.local",
    });
    expect(capturedUrl).toBe("https://mock.local/api/funds/fonFiyatBilgiGetir");
    expect(r.endpoint).toBe("https://mock.local/api/funds/fonFiyatBilgiGetir");
  });
});

describe("fetchOneFundDetailed — single-fund debug", () => {
  it("Başarılı → { ok: true, row }", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fonUnvan: "Test", fiyat: 12.34 }],
      })) as unknown as typeof fetch;
    const r = await fetchOneFundDetailed("HFI", { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row).toEqual({ code: "HFI", title: "Test", as_of: "2026-01-15", nav: 12.34 });
  });

  it("HTTP 403 → { ok: false, failure: { reason: 'http_error', http_status: 403 } }", async () => {
    const fetchImpl = (async () =>
      new Response("forbidden", {
        status: 403,
        headers: { "content-type": "text/plain" },
      })) as unknown as typeof fetch;
    const r = await fetchOneFundDetailed("HFI", { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.reason).toBe("http_error");
      expect(r.failure.http_status).toBe(403);
      expect(r.failure.body_snippet).toBe("forbidden");
    }
  });

  it("HTML response (Cloudflare) → 'html_response'", async () => {
    const fetchImpl = (async () =>
      new Response("<html><body>Bot check</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const r = await fetchOneFundDetailed("HFI", { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.reason).toBe("html_response");
      expect(r.failure.body_snippet).toContain("Bot check");
    }
  });
});

describe("parseAllNavRows", () => {
  it("Boş resultList → []", () => {
    expect(parseAllNavRows({ resultList: [] }, "HFI")).toEqual([]);
    expect(parseAllNavRows({}, "HFI")).toEqual([]);
  });

  it("Tüm satırları sırayla döner, yalnız en sonuncu değil", () => {
    const rows = parseAllNavRows(
      {
        resultList: [
          { tarih: "2026-01-10", fonKodu: "HFI", fonUnvan: "Test", fiyat: 11 },
          { tarih: "2026-01-15", fonKodu: "HFI", fiyat: 12.34 },
          { tarih: "2026-01-12", fonKodu: "HFI", fiyat: 11.5 },
        ],
      },
      "HFI",
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.as_of).sort()).toEqual([
      "2026-01-10",
      "2026-01-12",
      "2026-01-15",
    ]);
  });

  it("Geçersiz tarih / negatif NAV satırlarını atlar", () => {
    const rows = parseAllNavRows(
      {
        resultList: [
          { tarih: "bozuk", fonKodu: "HFI", fiyat: 99 },
          { tarih: "2026-01-15", fonKodu: "HFI", fiyat: 0 }, // sıfır NAV → atla
          { tarih: "2026-01-16", fonKodu: "HFI", fiyat: -1 }, // negatif → atla
          { tarih: "2026-01-17", fonKodu: "HFI", fiyat: 12.34 }, // geçerli
        ],
      },
      "HFI",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].as_of).toBe("2026-01-17");
  });

  it("Optional total_value / share_count / investor_count parse", () => {
    const rows = parseAllNavRows(
      {
        resultList: [
          {
            tarih: "2026-01-15",
            fonKodu: "HFI",
            fiyat: 12.34,
            portfoyToplamDeger: "123456.78",
            toplamPay: 1000000,
            kisiSayisi: "12345",
          },
        ],
      },
      "HFI",
    );
    expect(rows[0]).toMatchObject({
      total_value_try: 123456.78,
      share_count: 1000000,
      investor_count: 12345,
    });
  });

  it("Optional alanlar yoksa null kalır", () => {
    const rows = parseAllNavRows(
      { resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 12.34 }] },
      "HFI",
    );
    expect(rows[0]).toMatchObject({
      total_value_try: null,
      share_count: null,
      investor_count: null,
    });
  });
});

describe("fetchTefasNavHistory — bulk history", () => {
  it("Tek fon, çok satır → prices flat, rows_per_fund + date_min/max", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        resultList: [
          { tarih: "2025-12-01", fonKodu: "HFI", fonUnvan: "Test", fiyat: 10 },
          { tarih: "2026-01-15", fonKodu: "HFI", fiyat: 12 },
          { tarih: "2025-06-10", fonKodu: "HFI", fiyat: 9.5 },
        ],
      })) as unknown as typeof fetch;
    const r = await fetchTefasNavHistory(["HFI"], { fetchImpl, periodMonths: 12 });
    expect(r.ok).toBe(true);
    expect(r.requested).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.prices).toHaveLength(3);
    expect(r.rows_per_fund).toEqual({ HFI: 3 });
    expect(r.date_min).toBe("2025-06-10");
    expect(r.date_max).toBe("2026-01-15");
    expect(r.period_months).toBe(12);
  });

  it("Çoklu fon — her biri için ayrı POST, tüm satırlar tek listede", async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(init?.body as string);
      const c = body.fonKodu as string;
      return jsonResponse({
        resultList: [
          { tarih: "2026-01-10", fonKodu: c, fiyat: 10 },
          { tarih: "2026-01-15", fonKodu: c, fiyat: 11 },
        ],
      });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNavHistory(["HFI", "KMF", "KPI"], { fetchImpl });
    expect(calls).toBe(3);
    expect(r.succeeded).toBe(3);
    expect(r.prices).toHaveLength(6);
    expect(r.rows_per_fund).toEqual({ HFI: 2, KMF: 2, KPI: 2 });
  });

  it("Bazı fonlar fail — diğerleri yine prices'a düşer, failures detaylı", async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      if (body.fonKodu === "BAD") return new Response("500", { status: 500 });
      if (body.fonKodu === "EMPTY") return jsonResponse({ resultList: [] });
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: body.fonKodu, fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNavHistory(["HFI", "BAD", "EMPTY", "KMF"], { fetchImpl });
    expect(r.succeeded).toBe(2);
    expect(r.failed.sort()).toEqual(["BAD", "EMPTY"]);
    const reasons = Object.fromEntries(r.failures.map((f) => [f.code, f.reason]));
    expect(reasons).toEqual({ BAD: "http_error", EMPTY: "empty_result" });
  });

  it("Tamamı fail → ok=false", async () => {
    const fetchImpl = (async () => jsonResponse({ resultList: [] })) as unknown as typeof fetch;
    const r = await fetchTefasNavHistory(["HFI", "KMF"], { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.succeeded).toBe(0);
    expect(r.failed).toEqual(["HFI", "KMF"]);
    expect(r.date_min).toBeNull();
    expect(r.date_max).toBeNull();
  });

  it("Geçersiz period → ok=false, hiçbir çağrı yapılmaz", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse({ resultList: [] });
    }) as unknown as typeof fetch;
    const r = await fetchTefasNavHistory(["HFI"], {
      fetchImpl,
      periodMonths: 7 as 1,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Geçersiz periodMonths");
    expect(calls).toBe(0);
  });

  it("POST body periyod parametresi geçer", async () => {
    let body: { periyod?: number } = {};
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(init?.body as string);
      return jsonResponse({
        resultList: [{ tarih: "2026-01-15", fonKodu: "HFI", fiyat: 10 }],
      });
    }) as unknown as typeof fetch;
    await fetchTefasNavHistory(["HFI"], { fetchImpl, periodMonths: 60 });
    expect(body.periyod).toBe(60);
  });
});
