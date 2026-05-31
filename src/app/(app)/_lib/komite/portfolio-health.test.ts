import { describe, expect, it } from "vitest";

import { OPEN_GATE } from "./gate";
import { computePortfolioHealth, type PortfolioHealthInput } from "./portfolio-health";
import type { GateResult, RawPosition } from "./types";

function pos(over: Partial<RawPosition>): RawPosition {
  return {
    symbol: over.symbol ?? "AAA",
    name: over.name ?? over.symbol ?? "AAA",
    assetClass: over.assetClass ?? "equity_tr",
    sector: over.sector ?? null,
    quantity: over.quantity ?? 1,
    price: "price" in over ? (over.price ?? null) : 100,
    bookValue: over.bookValue ?? 100,
    qualityRaw: over.qualityRaw ?? 80,
    gate: over.gate ?? OPEN_GATE,
    atrPct: over.atrPct ?? null,
    healthLabel: over.healthLabel ?? null,
    healthColor: over.healthColor ?? null,
  };
}

function gate(over: Partial<GateResult>): GateResult {
  return {
    multiplier: over.multiplier ?? 1,
    quarantine: over.quarantine ?? false,
    tier: over.tier ?? "ok",
    reasons: over.reasons ?? [],
  };
}

function input(over: Partial<PortfolioHealthInput>): PortfolioHealthInput {
  return {
    positions: over.positions ?? [],
    cashTry: over.cashTry ?? 0,
    sectorRanks: over.sectorRanks ?? new Map(),
    topSectors: over.topSectors ?? [],
    saaTargets: over.saaTargets,
    partial: over.partial,
  };
}

describe("computePortfolioHealth — değerleme & ağırlık", () => {
  it("canlı fiyat varsa qty×price, yoksa bookValue", () => {
    const v = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", quantity: 10, price: 50 }), // 500
          pos({ symbol: "B", quantity: 1, price: null, bookValue: 1500 }), // book
        ],
      }),
    );
    expect(v.totalValue).toBe(2000);
    const a = v.positions.find((p) => p.symbol === "A")!;
    expect(a.value).toBe(500);
    expect(a.weight).toBe(25);
  });

  it("nakit sentetik pozisyon olarak eklenir ve toplam/ağırlığa girer", () => {
    const v = computePortfolioHealth(
      input({ positions: [pos({ symbol: "A", quantity: 1, price: 800 })], cashTry: 200 }),
    );
    expect(v.totalValue).toBe(1000);
    const cash = v.positions.find((p) => p.symbol === "NAKİT")!;
    expect(cash.weight).toBe(20);
    expect(cash.bucket).toBe("cash");
  });

  it("boş portföy → skorlar çökmeden 0/0", () => {
    const v = computePortfolioHealth(input({}));
    expect(v.totalValue).toBe(0);
    expect(v.scores.quality).toBe(0);
    expect(v.positions).toHaveLength(0);
  });
});

describe("Kalite — gate & karantina", () => {
  it("temiz hisseler → kalite ağırlıklı ortalama", () => {
    const v = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", quantity: 1, price: 100, qualityRaw: 90 }),
          pos({ symbol: "B", quantity: 1, price: 100, qualityRaw: 70 }),
        ],
      }),
    );
    expect(v.scores.quality).toBeCloseTo(80, 0);
  });

  it("karantina (gate.quarantine) → effectiveQuality 0, portföy kalitesini düşürür", () => {
    const v = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", quantity: 1, price: 100, qualityRaw: 90 }),
          pos({
            symbol: "GESAN",
            quantity: 1,
            price: 100,
            qualityRaw: 95, // teknik güçlü AMA...
            gate: gate({ multiplier: 0, quarantine: true, tier: "hard" }),
          }),
        ],
      }),
    );
    const gesan = v.positions.find((p) => p.symbol === "GESAN")!;
    expect(gesan.effectiveQuality).toBe(0);
    // 90 ve 0'ın eşit ağırlıklı ortalaması → 45
    expect(v.scores.quality).toBeCloseTo(45, 0);
  });

  it("yumuşak gate (cap) → effectiveQuality = qualityRaw × multiplier", () => {
    const v = computePortfolioHealth(
      input({
        positions: [
          pos({
            symbol: "A",
            quantity: 1,
            price: 100,
            qualityRaw: 80,
            gate: gate({ multiplier: 0.5, quarantine: false, tier: "soft" }),
          }),
        ],
      }),
    );
    expect(v.positions[0].effectiveQuality).toBeCloseTo(40);
  });

  it("skorlanmayan kova (altın) kalite paydasına girmez", () => {
    const v = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", assetClass: "equity_tr", quantity: 1, price: 100, qualityRaw: 80 }),
          pos({ symbol: "GOLD", assetClass: "metal", quantity: 1, price: 100, qualityRaw: null }),
        ],
      }),
    );
    expect(v.scores.quality).toBeCloseTo(80, 0); // sadece hisse
    expect(v.positions.find((p) => p.symbol === "GOLD")!.effectiveQuality).toBeNull();
  });
});

describe("Risk — konsantrasyon, gate maruziyeti, volatilite", () => {
  it("tek pozisyon (yoğun) → yüksek konsantrasyon riski", () => {
    const concentrated = computePortfolioHealth(
      input({ positions: [pos({ symbol: "A", quantity: 1, price: 1000, qualityRaw: 80 })] }),
    );
    const diversified = computePortfolioHealth(
      input({
        positions: Array.from({ length: 10 }, (_, i) =>
          pos({ symbol: `S${i}`, quantity: 1, price: 100, qualityRaw: 80 }),
        ),
      }),
    );
    expect(concentrated.scores.risk).toBeGreaterThan(diversified.scores.risk);
  });

  it("gate-bayraklı ağırlık riski artırır", () => {
    const clean = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", quantity: 1, price: 100 }),
          pos({ symbol: "B", quantity: 1, price: 100 }),
        ],
      }),
    );
    const flagged = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", quantity: 1, price: 100 }),
          pos({
            symbol: "B",
            quantity: 1,
            price: 100,
            gate: gate({ multiplier: 0.2, tier: "soft" }),
          }),
        ],
      }),
    );
    expect(flagged.scores.risk).toBeGreaterThan(clean.scores.risk);
  });

  it("yüksek ATR% → daha yüksek volatilite riski", () => {
    const calm = computePortfolioHealth(
      input({ positions: [pos({ symbol: "A", quantity: 1, price: 100, atrPct: 1 })] }),
    );
    const wild = computePortfolioHealth(
      input({ positions: [pos({ symbol: "A", quantity: 1, price: 100, atrPct: 10 })] }),
    );
    expect(wild.scores.risk).toBeGreaterThan(calm.scores.risk);
  });
});

describe("Sağlık", () => {
  it("Health = 0.5·Kalite + 0.5·(100−Risk)", () => {
    const v = computePortfolioHealth(
      input({ positions: [pos({ symbol: "A", quantity: 1, price: 100, qualityRaw: 80 })] }),
    );
    const expected = 0.5 * v.scores.quality + 0.5 * (100 - v.scores.risk);
    expect(v.scores.health).toBeCloseTo(Math.round(expected * 10) / 10, 1);
  });
});

describe("Sektör maruziyeti & sınıf sapması", () => {
  it("zayıf sektörde overweight → overweight_weak rozeti", () => {
    const v = computePortfolioHealth(
      input({
        positions: [
          pos({ symbol: "A", sector: "Perakende", quantity: 1, price: 100, qualityRaw: 70 }),
        ],
        sectorRanks: new Map([["Perakende", 9]]),
      }),
    );
    const s = v.sectors.find((x) => x.sector === "Perakende")!;
    expect(s.flag).toBe("overweight_weak");
  });

  it("güçlü sektörde temsil yok → gap rozeti + fırsat skoru artar", () => {
    const v = computePortfolioHealth(
      input({
        positions: [pos({ symbol: "A", sector: "Savunma", quantity: 1, price: 100, qualityRaw: 70 })],
        sectorRanks: new Map([["Savunma", 2], ["Bankacılık", 1]]),
        topSectors: ["Bankacılık", "Savunma"],
      }),
    );
    const gap = v.sectors.find((x) => x.sector === "Bankacılık" && x.flag === "gap");
    expect(gap).toBeTruthy();
    expect(v.scores.opportunity).toBeGreaterThan(0);
  });

  it("sınıf sapması: mevcut − hedef işareti doğru", () => {
    const v = computePortfolioHealth(
      input({
        positions: [pos({ symbol: "A", assetClass: "equity_tr", quantity: 1, price: 100 })],
        saaTargets: { equity: 30, fund: 35, gold: 15, cash: 8, other: 12 },
      }),
    );
    const equity = v.classDrift.find((d) => d.bucket === "equity")!;
    expect(equity.currentPct).toBe(100);
    expect(equity.deltaPct).toBe(70); // 100 - 30
  });
});

describe("partial flag", () => {
  it("partial girişi view'a taşınır", () => {
    const v = computePortfolioHealth(input({ partial: true }));
    expect(v.partial).toBe(true);
  });
});
