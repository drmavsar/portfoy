import { describe, expect, it } from "vitest";

import {
  inUnit,
  pointBefore,
  pointOnOrBefore,
  unitChange,
  unitDayChange,
  type UnitRates,
  type WealthPoint,
} from "./wealth-units";

const R = (USD: number | null, EUR: number | null, XAU: number | null): UnitRates => ({ USD, EUR, XAU });

describe("inUnit", () => {
  it("TL, dolar, euro ve gram altına çevirir; kur yoksa null", () => {
    expect(inUnit(1000, "TRY", R(null, null, null))).toBe(1000);
    expect(inUnit(1000, "USD", R(50, 55, 5000))).toBe(20);
    expect(inUnit(10_000, "XAU", R(50, 55, 5000))).toBe(2);
    expect(inUnit(1000, "EUR", R(50, null, 5000))).toBeNull();
  });
});

describe("unitDayChange", () => {
  it("dolar bazında günlük değişim kur hareketini içerir", () => {
    // Dün 1.000.000 TL @ 50 = 20.000 $; bugün fiyatlar +%1 (1.010.000 TL), kur 51
    const d = unitDayChange(1_010_000, 10_000, "USD", R(51, null, null), R(50, null, null))!;
    // 1.010.000/51 − 1.000.000/50 = 19.803,92 − 20.000 = −196,08 $
    expect(d).toBeCloseTo(1_010_000 / 51 - 20_000, 6);
    // Eski hesap (TL değişimi / bugünkü kur) +196 $ derdi; gerçekte dolar bazında kayıp
    expect(d).toBeLessThan(0);
  });
  it("TL'de manşet değişimi aynen; dünkü kur yoksa null", () => {
    expect(unitDayChange(100, 5, "TRY", R(null, null, null), null)).toBe(5);
    expect(unitDayChange(100, 5, "USD", R(50, null, null), null)).toBeNull();
  });
});

describe("unitChange / referans noktaları", () => {
  const hist: WealthPoint[] = [
    { date: "2025-12-31", totalTry: 4_000_000, rates: R(40, 45, 5000) },
    { date: "2026-09-04", totalTry: 5_000_000, rates: R(48, 55, 6900) },
    { date: "2026-10-03", totalTry: 5_200_000, rates: R(49, 55.4, 6540) },
  ];
  const now: WealthPoint = { date: "2026-10-04", totalTry: 5_200_000, rates: R(49.2, 55.5, 6550) };

  it("yıl başından: TL +%30 iken dolar bazında daha az", () => {
    const tl = unitChange(now, hist[0], "TRY")!;
    const usd = unitChange(now, hist[0], "USD")!;
    expect(tl.pct).toBeCloseTo(0.3, 6);
    expect(usd.pct).toBeCloseTo(5_200_000 / 49.2 / 100_000 - 1, 6);
    expect(usd.pct!).toBeLessThan(tl.pct!);
  });

  it("pointOnOrBefore / pointBefore", () => {
    expect(pointOnOrBefore(hist, "2026-09-04")!.date).toBe("2026-09-04");
    expect(pointOnOrBefore(hist, "2026-09-03")!.date).toBe("2025-12-31");
    expect(pointOnOrBefore(hist, "2025-01-01")).toBeNull();
    expect(pointBefore(hist, "2026-10-04")!.date).toBe("2026-10-03");
    expect(pointBefore(hist, "2026-10-03")!.date).toBe("2026-09-04");
  });
});
