import { describe, expect, it } from "vitest";

import { anchorOnOrBefore, bridgeVerdict, bridgeWindow, monthlyBridge, type BridgeInputs } from "./wealth-bridge";

// Nakit = toplam − döviz − altın − yatırım
// 17.05: nakit 200, döviz 200 (USD 40), altın 100 (gr 1000), yatırım 500 → 1000
// 18.05: USD 44 (+%10), gr 1100 (+%10); 100 TL hisse alındı ve hisseler +50;
//        maaş 300, temettü 10, gider 50 → nakit 360, döviz 220, altın 110, yatırım 650 → 1340
// 01.06: kayda girmemiş 40 TL harcama → 1300
function base(over: Partial<BridgeInputs> = {}): BridgeInputs {
  return {
    today: "2026-06-01",
    daily: [
      { date: "2026-05-17", total: 1000, fx: 200, metal: 100, invest: 500, usdtry: 40, xau: 1000 },
      { date: "2026-05-18", total: 1340, fx: 220, metal: 110, invest: 650, usdtry: 44, xau: 1100 },
      { date: "2026-06-01", total: 1300, fx: 220, metal: 110, invest: 650, usdtry: 44, xau: 1100 },
    ],
    manual: [{ date: "2025-12-31", value: 900 }],
    txns: [
      { date: "2026-02-01", direction: "inflow", amount: 100, dividend: false },
      { date: "2026-02-03", direction: "outflow", amount: 20, dividend: false },
      { date: "2026-05-18", direction: "inflow", amount: 300, dividend: false },
      { date: "2026-05-18", direction: "inflow", amount: 10, dividend: true },
      { date: "2026-05-18", direction: "outflow", amount: 50, dividend: false },
    ],
    flows: [{ date: "2026-05-18", amount: -100 }],
    ...over,
  };
}

describe("dayanak", () => {
  it("tarihe ≤ en son günlük kayıt ya da elle girilen yıl sonu", () => {
    expect(anchorOnOrBefore(base(), "2026-03-01")).toEqual({ date: "2025-12-31", value: 900, source: "manual" });
    expect(anchorOnOrBefore(base(), "2026-05-31")).toEqual({ date: "2026-05-18", value: 1340, source: "daily" });
    expect(anchorOnOrBefore(base(), "2025-01-01")).toBeNull();
  });
  it("aynı gün hem günlük hem elle kayıt varsa günlük", () => {
    const b = base({ manual: [{ date: "2026-05-17", value: 999 }] });
    expect(anchorOnOrBefore(b, "2026-05-17")?.source).toBe("daily");
  });
});

describe("köprü", () => {
  it("ölçülen dönem: tasarruf, hisse (temettü dahil), kur, altın, diğer", () => {
    const w = bridgeWindow(base(), "2026-05-17", "2026-05-18")!;
    expect(w.delta).toBe(340);
    expect(w.parts.savings).toBe(250); // 310 gelir − 50 gider − 10 temettü
    expect(w.parts.invest).toBe(60); // +50 piyasa + 10 temettü; 100 TL alım akıştır
    expect(w.parts.fx).toBeCloseTo(20, 9);
    expect(w.parts.metal).toBeCloseTo(10, 9);
    expect(w.parts.other).toBeCloseTo(0, 9);
    expect(w.parts.untracked).toBe(0);
    expect(w.untrackedUntil).toBeNull();
    expect([w.income, w.expense, w.dividends]).toEqual([310, 50, 10]);
  });

  it("yıl başı elle girilmişse ilk günlük kayda kadarki kısım ayrıştırılamaz", () => {
    const w = bridgeWindow(base(), "2025-12-31", "2026-06-01")!;
    expect(w.start).toEqual({ date: "2025-12-31", value: 900, source: "manual" });
    expect(w.delta).toBe(400);
    expect(w.untrackedUntil).toBe("2026-05-17");
    expect(w.parts.savings).toBe(80 + 250);
    expect(w.parts.untracked).toBe(100 - 80);
    expect(w.parts.other).toBeCloseTo(-40, 9);
    const p = w.parts;
    expect(p.savings + p.invest + p.fx + p.metal + p.other + p.untracked).toBeCloseTo(w.delta, 9);
  });

  it("kuru eksik gün önceki kurla devam eder", () => {
    const daily = base().daily.map((d, i) => (i === 1 ? { ...d, usdtry: null } : d));
    const w = bridgeWindow(base({ daily }), "2026-05-17", "2026-06-01")!;
    // 17→18 kur yok (40 sayılır), 18→01: 220 × (44/40 − 1) = 22
    expect(w.parts.fx).toBeCloseTo(22, 9);
  });

  it("veri yoksa ya da dönem boşsa null", () => {
    expect(bridgeWindow(base(), "2026-06-01", "2026-06-30")).toBeNull();
    expect(bridgeWindow(base({ daily: [] }), "2025-12-31", "2026-06-01")).toBeNull();
  });
});

describe("aylık", () => {
  it("takip öncesi ayrı satır; aylar zincirlenir; yeni → eski", () => {
    const rows = monthlyBridge(base());
    expect(rows.map((r) => r.key)).toEqual(["2026-06", "2026-05", "pre-2025-12-31"]);
    const [jun, may, pre] = rows;
    expect(pre.pre).toBe(true);
    expect(pre.window.parts).toMatchObject({ savings: 80, untracked: 20 });
    expect(may.window.start.date).toBe("2026-05-17");
    expect(may.window.delta).toBe(340);
    expect(jun.window.start.date).toBe("2026-05-18");
    expect(jun.window.parts.other).toBeCloseTo(-40, 9);
    const total = rows.reduce((s, r) => s + r.window.delta, 0);
    expect(total).toBe(1300 - 900);
  });
});

describe("sonuç cümlesi", () => {
  it("dört durum", () => {
    const w = bridgeWindow(base(), "2025-12-31", "2026-06-01")!;
    expect(bridgeVerdict(w)).toMatchObject({ kind: "both-up", savingsShare: 330 / 400 });
    const mk = (savings: number, delta: number) => bridgeVerdict({ ...w, delta, parts: { ...w.parts, savings } });
    expect(mk(500, 100)).toMatchObject({ kind: "savings-carried", market: -400 });
    expect(mk(-50, 100)).toMatchObject({ kind: "market-carried", market: 150 });
    expect(mk(-50, -100)).toMatchObject({ kind: "both-down", market: -50 });
  });
});
