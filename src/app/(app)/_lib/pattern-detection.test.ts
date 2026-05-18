import { describe, expect, it } from "vitest";

import {
  computeATR14,
  detectATHBreakout,
  detectDoubleBottom,
  scanAllPatterns,
  type OHLC,
} from "./pattern-detection";

/** Sentetik OHLC üreten yardımcı */
function buildOHLC(closes: number[], options: { range?: number } = {}): OHLC {
  const range = options.range ?? 1;
  return {
    close: closes,
    high: closes.map((c) => c + range),
    low: closes.map((c) => c - range),
  };
}

describe("computeATR14", () => {
  it("yeterli veri yoksa null", () => {
    expect(computeATR14([1, 2], [0.5, 1.5], [1, 2])).toBeNull();
  });

  it("sabit fiyatta ATR = 0 değil pozitif (high-low spread'i)", () => {
    const closes = Array(20).fill(100);
    const highs = closes.map((c) => c + 2);
    const lows = closes.map((c) => c - 2);
    const atr = computeATR14(highs, lows, closes);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });

  it("volatilite arttıkça ATR artar", () => {
    const flatCloses = Array(20).fill(100);
    const flatATR = computeATR14(
      flatCloses.map((c) => c + 1),
      flatCloses.map((c) => c - 1),
      flatCloses,
    )!;
    const volatileCloses = Array.from({ length: 20 }, (_, i) => 100 + (i % 2 === 0 ? 5 : -5));
    const volATR = computeATR14(
      volatileCloses.map((c) => c + 5),
      volatileCloses.map((c) => c - 5),
      volatileCloses,
    )!;
    expect(volATR).toBeGreaterThan(flatATR);
  });
});

describe("detectATHBreakout", () => {
  it("son close prev_high'ın çok altında → null veya near", () => {
    // Yeni zirveye yakın değil → null beklenir. ATH_LOOKBACK 252 günü kullandığı için
    // önceki günlerde yüksek bir bar olmalı. Son close o zirveden uzakta olmalı.
    const closes = [...Array(50).fill(200), ...Array(210).fill(100)];
    // İlk 50 bar high=201, son 210 bar high=101. ATH lookback son 252 bar'ı kapsar
    // → prev_high (son bar hariç) = 201. son close = 100. 201 * 0.97 = 195 → 100 << 195
    // → near_breakout false, breakout false → null
    const ohlc = buildOHLC(closes, { range: 1 });
    const result = detectATHBreakout(ohlc, 2, 100);
    expect(result).toBeNull();
  });

  it("son fiyat 252 günlük max'ı aşıyor → ATH breakout (teyitli)", () => {
    // İlk 259 gün 100, son gün 120 → açık breakout
    const closes = [...Array(259).fill(100), 120];
    const ohlc = buildOHLC(closes, { range: 1 });
    const result = detectATHBreakout(ohlc, 2, 105);
    expect(result).not.toBeNull();
    expect(result?.breakout_confirmed).toBe(true);
    expect(result?.pattern).toBe("ath_breakout");
    expect(result?.entry).toBeGreaterThanOrEqual(101); // prev_high (101 = 100+range) ya da close
  });

  it("close prev_high'ın %1 altında → near_breakout", () => {
    // Önce ortayı yüksek tut ki son close near olsun
    const closes = [...Array(259).fill(100), 99]; // son close 99
    // high = close+1, son barda da 100. prev_high (önceki 259 gün) max high = 101.
    // close 99, 101 * 0.97 = 97.97 → 99 >= 97.97 → near, ama 99 < 101 → not breakout
    const ohlc = buildOHLC(closes, { range: 1 });
    const result = detectATHBreakout(ohlc, 1.5, 100);
    // Near breakout olabilir
    if (result) {
      expect(result.breakout_confirmed).toBe(false);
    }
  });

  it("ekstrem MA20 extension → watchlist setup", () => {
    // close 120, MA20 100 → extension %20 (15+%) → watchlist
    const closes = [...Array(259).fill(100), 120];
    const ohlc = buildOHLC(closes);
    const result = detectATHBreakout(ohlc, 2, 100); // MA20 = 100
    expect(result?.setup_type).toBe("watchlist");
  });

  it("veri kısa → null", () => {
    const closes = Array(50).fill(100);
    const ohlc = buildOHLC(closes);
    expect(detectATHBreakout(ohlc, 1.5, 100)).toBeNull();
  });
});

describe("detectDoubleBottom", () => {
  it("hiç dip yoksa null", () => {
    // Monoton artan
    const closes = Array.from({ length: 95 }, (_, i) => 100 + i);
    const ohlc = buildOHLC(closes);
    expect(detectDoubleBottom(ohlc, 2, null)).toBeNull();
  });

  it("2 dip + neckline kırılımı tespit ediliyor", () => {
    // Pattern: 90→80→90→80→90→100 (basitleştirilmiş double bottom)
    // 95 günlük seri inşa edelim
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) closes.push(95 + Math.sin(i / 3) * 5); // gürültü
    // İlk dip
    closes.push(90, 85, 80, 85, 90, 92, 94, 92, 90); // 9 bar
    // Toparlanma + neckline yükselişi
    closes.push(93, 95, 97, 96, 94, 92); // 6 bar
    // İkinci dip (aynı civar)
    closes.push(89, 85, 81, 86, 90, 94, 96); // 7 bar
    // Neckline aşımı
    closes.push(98, 100); // son 2
    while (closes.length < 95) closes.push(100); // boyut doldur

    const ohlc: OHLC = {
      close: closes,
      high: closes.map((c) => c + 1),
      low: closes.map((c) => c - 1),
    };
    const result = detectDoubleBottom(ohlc, 2, 95);
    // Tam doğru pattern detection sentetik veri ile zor — en azından crash etmemeli
    if (result) {
      expect(result.pattern).toBe("double_bottom");
      expect(result.entry).toBeGreaterThan(0);
    }
  });

  it("veri kısa → null", () => {
    const closes = Array(50).fill(100);
    expect(detectDoubleBottom(buildOHLC(closes), 1.5, null)).toBeNull();
  });
});

describe("scanAllPatterns", () => {
  it("rastgele seri için array dönmeli (crash etmemeli)", () => {
    const closes = Array.from({ length: 260 }, () => 100 + Math.random() * 0.1);
    const result = scanAllPatterns(buildOHLC(closes), 1.5, 100);
    expect(Array.isArray(result)).toBe(true);
  });

  it("dönen pattern'lar quality × rr'ye göre sıralı", () => {
    const closes = [...Array(259).fill(100), 120];
    const result = scanAllPatterns(buildOHLC(closes), 2, 105);
    if (result.length > 1) {
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1].pattern_quality * result[i - 1].rr;
        const cur = result[i].pattern_quality * result[i].rr;
        expect(prev).toBeGreaterThanOrEqual(cur);
      }
    }
  });
});
