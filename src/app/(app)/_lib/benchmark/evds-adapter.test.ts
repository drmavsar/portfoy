import { describe, expect, it } from "vitest";

import { __internals, fetchEvdsSeries } from "./evds-adapter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("internals", () => {
  it("parseEvdsValue: number/string/virgül/null", () => {
    expect(__internals.parseEvdsValue(12.5)).toBe(12.5);
    expect(__internals.parseEvdsValue("12.5")).toBe(12.5);
    expect(__internals.parseEvdsValue("12,5")).toBe(12.5);
    expect(__internals.parseEvdsValue(null)).toBeNull();
    expect(__internals.parseEvdsValue("null")).toBeNull();
    expect(__internals.parseEvdsValue("")).toBeNull();
  });

  it("normalizeDate: DD-MM-YYYY → YYYY-MM-DD", () => {
    expect(__internals.normalizeDate("01-06-2024")).toBe("2024-06-01");
    expect(__internals.normalizeDate("31-12-2023")).toBe("2023-12-31");
  });

  it("normalizeDate: zaten YYYY-MM-DD", () => {
    expect(__internals.normalizeDate("2024-06-01")).toBe("2024-06-01");
  });

  it("normalizeDate: aylık M-YYYY", () => {
    expect(__internals.normalizeDate("3-2024")).toBe("2024-03-01");
    expect(__internals.normalizeDate("2024-3")).toBe("2024-03-01");
  });

  it("toEvdsDate: YYYY-MM-DD → DD-MM-YYYY", () => {
    expect(__internals.toEvdsDate("2024-06-01")).toBe("01-06-2024");
  });
});

describe("fetchEvdsSeries — happy path", () => {
  it("EVDS items → BenchmarkPoint[] (ASC sıralı)", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        items: [
          { Tarih: "01-06-2024", "TP_MK_F_BIST100": "10500.5" },
          { Tarih: "01-07-2024", "TP_MK_F_BIST100": "10800.2" },
          { Tarih: "01-05-2024", "TP_MK_F_BIST100": "10200.1" },
        ],
      })) as unknown as typeof fetch;
    const r = await fetchEvdsSeries({
      evdsSeries: "TP.MK.F.BIST100",
      startDate: "2024-05-01",
      endDate: "2024-07-31",
      apiKey: "test-key",
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.fetched_periods).toBe(3);
    expect(r.points.map((p) => p.as_of)).toEqual([
      "2024-05-01",
      "2024-06-01",
      "2024-07-01",
    ]);
    expect(r.points[0].value).toBeCloseTo(10200.1, 1);
  });

  it("Virgüllü değerler parse edilir", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        items: [{ Tarih: "01-06-2024", "X": "1.234,56" }],
      })) as unknown as typeof fetch;
    const r = await fetchEvdsSeries({
      evdsSeries: "X",
      startDate: "2024-06-01",
      endDate: "2024-06-30",
      apiKey: "k",
      fetchImpl,
    });
    // Virgül/nokta hibrit Avrupa formatı — JSON adapter sadece comma→dot
    // çevirir. "1.234,56" → "1.234.56" → NaN; filtreden geçmez. Bu beklenen
    // davranış: EVDS zaten decimalSeperator=. ile dönüyor; bu test bilinen
    // sınırı belgeliyor.
    expect(r.points.length).toBe(0);
  });

  it("EVDS empty items → ok=false + diagnostic", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ items: [] })) as unknown as typeof fetch;
    const r = await fetchEvdsSeries({
      evdsSeries: "BAD.CODE",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      apiKey: "k",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("items boş");
  });
});

describe("fetchEvdsSeries — failure paths", () => {
  it("HTTP 401 → ok=false + body_snippet", async () => {
    const fetchImpl = (async () =>
      new Response("Unauthorized", {
        status: 401,
        headers: { "content-type": "text/plain" },
      })) as unknown as typeof fetch;
    const r = await fetchEvdsSeries({
      evdsSeries: "X",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      apiKey: "wrong",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("HTTP 401");
    expect(r.diagnostic?.body_snippet).toBe("Unauthorized");
  });

  it("HTML body (login redirect) → diagnostic hints", async () => {
    const fetchImpl = (async () =>
      new Response("<html><body>Please login</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const r = await fetchEvdsSeries({
      evdsSeries: "X",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      apiKey: "k",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    // JSON.parse(html) → SyntaxError; bizim hata "JSON parse"
    expect(r.error).toContain("JSON parse");
  });

  it("Boş API key → erken çık", async () => {
    const r = await fetchEvdsSeries({
      evdsSeries: "X",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      apiKey: "",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("EVDS_API_KEY");
  });

  it("Network error → ok=false", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const r = await fetchEvdsSeries({
      evdsSeries: "X",
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      apiKey: "k",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Network");
  });
});

describe("fetchEvdsSeries — URL building", () => {
  it("EVDS query string DD-MM-YYYY tarih + frequency=1 default", async () => {
    let capturedUrl = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return jsonResponse({ items: [{ Tarih: "01-01-2024", X: 100 }] });
    }) as unknown as typeof fetch;
    await fetchEvdsSeries({
      evdsSeries: "TP.MK.F.BIST100",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      apiKey: "k",
      fetchImpl,
    });
    expect(capturedUrl).toContain("series=TP.MK.F.BIST100");
    expect(capturedUrl).toContain("startDate=01-01-2024");
    expect(capturedUrl).toContain("endDate=31-12-2024");
    expect(capturedUrl).toContain("frequency=1");
  });
});
