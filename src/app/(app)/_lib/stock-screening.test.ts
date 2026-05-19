import { describe, expect, it } from "vitest";

import { computeSectorMomentum } from "./stock-screening";

interface Row {
  symbol: string;
  sector: string | null;
  score: number | null;
  month_pct: number | null;
}

describe("computeSectorMomentum", () => {
  it("boş input → boş Map", async () => {
    const result = await computeSectorMomentum([]);
    expect(result.size).toBe(0);
  });

  it("3'ten az sembol olan sektörler ranking'e girmiyor", async () => {
    const rows: Row[] = [
      { symbol: "A", sector: "Banka", score: 80, month_pct: 5 },
      { symbol: "B", sector: "Banka", score: 70, month_pct: 3 }, // 2 sembol < 3
      { symbol: "C", sector: "Sanayi", score: 60, month_pct: 0 },
      { symbol: "D", sector: "Sanayi", score: 55, month_pct: 2 },
      { symbol: "E", sector: "Sanayi", score: 50, month_pct: -1 }, // 3 sembol OK
    ];
    const result = await computeSectorMomentum(rows);
    expect(result.has("Sanayi")).toBe(true);
    expect(result.has("Banka")).toBe(false);
  });

  it("rank'lar yüksek momentum skoruna göre 1'den başlar", async () => {
    const rows: Row[] = [
      // Sanayi: 80/80/80 + month 10/10/10 → yüksek
      { symbol: "A1", sector: "Sanayi", score: 80, month_pct: 10 },
      { symbol: "A2", sector: "Sanayi", score: 80, month_pct: 10 },
      { symbol: "A3", sector: "Sanayi", score: 80, month_pct: 10 },
      // Banka: 30/30/30 + month -10 → düşük
      { symbol: "B1", sector: "Banka", score: 30, month_pct: -10 },
      { symbol: "B2", sector: "Banka", score: 30, month_pct: -10 },
      { symbol: "B3", sector: "Banka", score: 30, month_pct: -10 },
    ];
    const result = await computeSectorMomentum(rows);
    expect(result.get("Sanayi")?.sector_rank).toBe(1);
    expect(result.get("Banka")?.sector_rank).toBe(2);
  });

  it("score null olanları yoksayar", async () => {
    const rows: Row[] = [
      { symbol: "A", sector: "Tekstil", score: null, month_pct: 5 },
      { symbol: "B", sector: "Tekstil", score: null, month_pct: 5 },
      { symbol: "C", sector: "Tekstil", score: 50, month_pct: 0 },
    ];
    // Sadece 1 score'lu kalır → < 3 → ranking dışı
    const result = await computeSectorMomentum(rows);
    expect(result.has("Tekstil")).toBe(false);
  });

  it("sector null olanları yoksayar", async () => {
    const rows: Row[] = [
      { symbol: "A", sector: null, score: 80, month_pct: 5 },
      { symbol: "B", sector: null, score: 80, month_pct: 5 },
      { symbol: "C", sector: null, score: 80, month_pct: 5 },
    ];
    const result = await computeSectorMomentum(rows);
    expect(result.size).toBe(0);
  });

  it("sector_avg_score sektör skor ortalaması", async () => {
    const rows: Row[] = [
      { symbol: "A", sector: "X", score: 60, month_pct: 0 },
      { symbol: "B", sector: "X", score: 70, month_pct: 0 },
      { symbol: "C", sector: "X", score: 80, month_pct: 0 },
    ];
    const result = await computeSectorMomentum(rows);
    expect(result.get("X")?.sector_avg_score).toBe(70); // (60+70+80)/3
  });

  it("sector_size doğru sayar", async () => {
    const rows: Row[] = [
      { symbol: "A", sector: "X", score: 50, month_pct: 0 },
      { symbol: "B", sector: "X", score: 50, month_pct: 0 },
      { symbol: "C", sector: "X", score: 50, month_pct: 0 },
      { symbol: "D", sector: "X", score: 50, month_pct: 0 },
    ];
    const result = await computeSectorMomentum(rows);
    expect(result.get("X")?.sector_size).toBe(4);
  });

  it("month_pct ±30 dışı clamp ediliyor", async () => {
    // Aşırı momentum klamplenmeli — sonuç ortalama 30 olarak hesaplanır
    const high: Row[] = [
      { symbol: "A", sector: "X", score: 100, month_pct: 999 }, // clamp → 30
      { symbol: "B", sector: "X", score: 100, month_pct: 999 },
      { symbol: "C", sector: "X", score: 100, month_pct: 999 },
    ];
    const result = await computeSectorMomentum(high);
    // monthNorm = (30+30)/60 = 1; momentum = 0.7*1 + 0.3*1 = 1 → 100
    expect(result.get("X")?.sector_momentum_score).toBeCloseTo(100, 0);
  });

  it("aynı momentum'da deterministik sıralama (ilk gelen üstte)", async () => {
    const rows: Row[] = [
      { symbol: "A1", sector: "A", score: 50, month_pct: 0 },
      { symbol: "A2", sector: "A", score: 50, month_pct: 0 },
      { symbol: "A3", sector: "A", score: 50, month_pct: 0 },
      { symbol: "B1", sector: "B", score: 50, month_pct: 0 },
      { symbol: "B2", sector: "B", score: 50, month_pct: 0 },
      { symbol: "B3", sector: "B", score: 50, month_pct: 0 },
    ];
    const result = await computeSectorMomentum(rows);
    // İkisi de aynı skor olsa rank'lar 1,2 olarak atanmalı (stable)
    expect(result.get("A")?.sector_rank).toBeLessThanOrEqual(2);
    expect(result.get("B")?.sector_rank).toBeLessThanOrEqual(2);
    expect(result.get("A")?.sector_rank).not.toBe(result.get("B")?.sector_rank);
  });
});
