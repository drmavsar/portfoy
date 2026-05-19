import { describe, expect, it } from "vitest";

import {
  auditPortfolio,
  sectorBreakdown,
  topPositionsBreakdown,
  type PortfolioRiskInput,
} from "./portfolio-risk";
import type { TradePlan } from "./trade-plan";

function mockPlan(health: TradePlan["health"]): TradePlan {
  return {
    wac: 100,
    current: 110,
    atr14: 5,
    t1: 120,
    t2: 130,
    s1: 102.5,
    s2: 95,
    delta_t1_pct: 9.09,
    delta_t2_pct: 18.18,
    delta_s1_pct: -6.82,
    delta_s2_pct: -13.64,
    rr1: 1.33,
    rr2: 2.67,
    high_52w_distance_pct: 20,
    ma20_extension_pct: 5,
    health,
    health_label: "Test",
    health_color: "var(--positive)",
  };
}

function makePos(
  symbol: string,
  mv: number,
  sector: string | null = null,
  benId: string | null = null,
  benName: string | null = null,
  plan?: TradePlan,
): PortfolioRiskInput {
  return { symbol, mv, sector, beneficiary_id: benId, beneficiary_name: benName, plan };
}

describe("auditPortfolio", () => {
  it("boş portföyde uyarı yok", () => {
    const warnings = auditPortfolio([], 0);
    expect(warnings).toEqual([]);
  });

  it("tek pozisyon > %25 → warn", () => {
    const positions = [
      makePos("AAA", 50_000), // 50%
      makePos("BBB", 30_000),
      makePos("CCC", 20_000),
    ];
    const warnings = auditPortfolio(positions, 100_000);
    const w = warnings.find((x) => x.type === "single_position");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("warn");
    expect(w?.symbols).toContain("AAA");
  });

  it("hiçbir pozisyon %25'i geçmiyorsa single_position uyarısı yok", () => {
    const positions = [
      makePos("A", 20),
      makePos("B", 20),
      makePos("C", 20),
      makePos("D", 20),
      makePos("E", 20),
    ];
    const warnings = auditPortfolio(positions, 100);
    expect(warnings.some((w) => w.type === "single_position")).toBe(false);
  });

  it("sektör > %40 → warn", () => {
    const positions = [
      makePos("AAA", 30_000, "Banka"),
      makePos("BBB", 25_000, "Banka"), // toplam Banka 55%
      makePos("CCC", 45_000, "Sanayi"),
    ];
    const warnings = auditPortfolio(positions, 100_000);
    const w = warnings.find((x) => x.type === "sector_concentration");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("warn");
    expect(w?.message).toContain("Banka");
  });

  it("below_stop pozisyon → critical", () => {
    const positions = [makePos("AAA", 50_000, null, null, null, mockPlan("below_stop"))];
    const warnings = auditPortfolio(positions, 50_000);
    const w = warnings.find((x) => x.type === "below_stop");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("critical");
  });

  it("below_wac pozisyon → info", () => {
    const positions = [makePos("AAA", 50_000, null, null, null, mockPlan("below_wac"))];
    const warnings = auditPortfolio(positions, 50_000);
    const w = warnings.find((x) => x.type === "below_wac");
    expect(w).toBeDefined();
    expect(w?.severity).toBe("info");
  });

  it("uyarılar critical → warn → info sırasında", () => {
    const positions = [
      makePos("AAA", 50_000, "Banka", null, null, mockPlan("below_stop")), // critical
      makePos("BBB", 30_000, "Banka", null, null, mockPlan("below_wac")), // info
      makePos("CCC", 20_000, "Banka"), // sector concentration warn
    ];
    const warnings = auditPortfolio(positions, 100_000);
    // En az 3 uyarı olmalı: below_stop (critical), sector (warn), below_wac (info)
    const severities = warnings.map((w) => w.severity);
    // İlk gelen kritik olmalı
    expect(severities[0]).toBe("critical");
    // En sonda info gelmeli
    expect(severities[severities.length - 1]).toBe("info");
  });

  it("kişi > %70 → info", () => {
    const positions = [
      makePos("AAA", 80_000, null, "ben-1", "Mehmet"),
      makePos("BBB", 20_000, null, "ben-2", "Ahmet"),
    ];
    const warnings = auditPortfolio(positions, 100_000);
    const w = warnings.find((x) => x.type === "beneficiary_concentration");
    expect(w).toBeDefined();
    expect(w?.message).toContain("Mehmet");
  });
});

describe("topPositionsBreakdown", () => {
  it("MV'ye göre azalan sıralar", () => {
    const positions = [
      makePos("AAA", 10),
      makePos("BBB", 50),
      makePos("CCC", 20),
    ];
    const top = topPositionsBreakdown(positions, 80, 3);
    expect(top.map((t) => t.label)).toEqual(["BBB", "CCC", "AAA"]);
  });

  it("limit'i respect eder", () => {
    const positions = Array.from({ length: 10 }, (_, i) => makePos(`SYM${i}`, 100 - i));
    const top = topPositionsBreakdown(positions, 1000, 5);
    expect(top.length).toBe(5);
  });

  it("totalMv 0 ise boş döner", () => {
    expect(topPositionsBreakdown([makePos("A", 100)], 0)).toEqual([]);
  });
});

describe("sectorBreakdown", () => {
  it("sektör bazında toplar", () => {
    const positions = [
      makePos("A", 30, "Banka"),
      makePos("B", 20, "Banka"),
      makePos("C", 50, "Sanayi"),
    ];
    const stats = sectorBreakdown(positions, 100);
    const banka = stats.find((s) => s.label === "Banka");
    expect(banka?.value).toBe(50);
    expect(banka?.pct).toBe(50);
  });

  it("sektörsüzleri '(Sektörsüz)' altında toplar", () => {
    const positions = [makePos("A", 100, null)];
    const stats = sectorBreakdown(positions, 100);
    expect(stats[0].label).toBe("(Sektörsüz)");
  });

  it("yüzdeye göre azalan sıralar", () => {
    const positions = [
      makePos("A", 10, "X"),
      makePos("B", 90, "Y"),
    ];
    const stats = sectorBreakdown(positions, 100);
    expect(stats[0].label).toBe("Y");
    expect(stats[1].label).toBe("X");
  });
});
