import { describe, expect, it } from "vitest";

import { validateAllSeries, validateSingleSeries } from "./series-validator";
import { findCandidate, BENCHMARK_CANDIDATES } from "./series-config";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("validateSingleSeries", () => {
  it("İlk aday başarılıysa onu seçer, diğerlerini denemez? Hayır — TÜM adayları dener (diagnostic için)", async () => {
    const candidate = findCandidate("XU100")!;
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount++;
      return jsonResponse({
        items: [{ Tarih: "01-01-2024", X: 9000 }],
      });
    }) as unknown as typeof fetch;
    const r = await validateSingleSeries(candidate, {
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.working_candidate).toBe(candidate.candidates[0]); // ilk başarılı
    expect(r.attempts.length).toBe(candidate.candidates.length); // hepsini dener
    expect(callCount).toBe(candidate.candidates.length);
  });

  it("İlk 2 aday fail, 3. başarılı → 3. seçilir", async () => {
    const candidate = findCandidate("XAUTRY")!;
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls <= 2) return jsonResponse({ items: [] });
      return jsonResponse({ items: [{ Tarih: "01-01-2024", X: 2500 }] });
    }) as unknown as typeof fetch;
    const r = await validateSingleSeries(candidate, {
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.working_candidate).toBe(candidate.candidates[2]);
    expect(r.attempts[0].ok).toBe(false);
    expect(r.attempts[1].ok).toBe(false);
    expect(r.attempts[2].ok).toBe(true);
  });

  it("Hiçbir aday başarısız → working_candidate null", async () => {
    const candidate = findCandidate("XU100")!;
    const fetchImpl = (async () =>
      jsonResponse({ items: [] })) as unknown as typeof fetch;
    const r = await validateSingleSeries(candidate, {
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.working_candidate).toBeNull();
    expect(r.recommendation).toContain("ZORUNLU");
  });

  it("Opsiyonel seri başarısızsa recommendation fallback'i hatırlatır", async () => {
    const candidate = findCandidate("TLREF")!;
    const fetchImpl = (async () =>
      jsonResponse({ items: [] })) as unknown as typeof fetch;
    const r = await validateSingleSeries(candidate, {
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.working_candidate).toBeNull();
    expect(r.recommendation).toContain("fallback");
  });

  it("Sample data — son 3 satır", async () => {
    const candidate = findCandidate("XU100")!;
    const fetchImpl = (async () =>
      jsonResponse({
        items: [
          { Tarih: "01-01-2024", X: 100 },
          { Tarih: "02-01-2024", X: 110 },
          { Tarih: "03-01-2024", X: 120 },
          { Tarih: "04-01-2024", X: 130 },
          { Tarih: "05-01-2024", X: 140 },
        ],
      })) as unknown as typeof fetch;
    const r = await validateSingleSeries(candidate, {
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.attempts[0].sample).toHaveLength(3);
    expect(r.attempts[0].sample![2].value).toBe(140);
  });
});

describe("validateAllSeries", () => {
  it("Tüm seriler başarılıysa ok=true, summary pozitif", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        items: [{ Tarih: "01-01-2024", X: 100 }],
      })) as unknown as typeof fetch;
    const r = await validateAllSeries({
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.ok).toBe(true);
    expect(r.required_failures).toEqual([]);
    expect(r.summary).toContain("✓");
  });

  it("Zorunlu seriler başarısızsa ok=false", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ items: [] })) as unknown as typeof fetch;
    const r = await validateAllSeries({
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.ok).toBe(false);
    expect(r.required_failures.length).toBeGreaterThan(0);
  });

  it("Sadece TLREF (opsiyonel) başarısızsa ok=true", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      // TLREF aday kodlarından birini içeriyorsa empty dön
      if (u.includes("TLREF") || u.includes("PR.MT01") || u.includes("GECELIK")) {
        return jsonResponse({ items: [] });
      }
      return jsonResponse({ items: [{ Tarih: "01-01-2024", X: 100 }] });
    }) as unknown as typeof fetch;
    const r = await validateAllSeries({
      apiKey: "k",
      fetchImpl,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(r.ok).toBe(true);
    expect(r.required_failures).toEqual([]);
  });
});

describe("BENCHMARK_CANDIDATES", () => {
  it("5 series tanımlı", () => {
    expect(BENCHMARK_CANDIDATES.length).toBe(5);
  });

  it("4 zorunlu (XU100/XAU/USD/EUR) + 1 opsiyonel (TLREF)", () => {
    const required = BENCHMARK_CANDIDATES.filter((c) => c.required);
    expect(required.map((c) => c.code).sort()).toEqual(["EURTRY", "USDTRY", "XAUTRY", "XU100"]);
    const optional = BENCHMARK_CANDIDATES.filter((c) => !c.required);
    expect(optional.map((c) => c.code)).toEqual(["TLREF"]);
  });

  it("Her seri en az 1 aday EVDS kodu içerir", () => {
    for (const c of BENCHMARK_CANDIDATES) {
      expect(c.candidates.length).toBeGreaterThanOrEqual(1);
    }
  });
});
