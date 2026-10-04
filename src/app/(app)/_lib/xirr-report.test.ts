import { describe, expect, it } from "vitest";

import {
  computeXirrReport,
  findUnmatchedSells,
  valueOnOrBefore,
  type SellCheckTrade,
  type XirrInputs,
} from "./xirr-report";

function base(over: Partial<XirrInputs> = {}): XirrInputs {
  return {
    // P1: 2025-10-04'te 1.000 TL alım, bugün (365 gün sonra) 1.210 TL değer
    trades: [
      { portfolio_id: "P1", side: "buy", executed_at: "2025-10-04T10:00:00Z", quantity: 10, price: 100, fees: 0, currency: "TRY" },
      { portfolio_id: "P2", side: "buy", executed_at: "2025-10-04T10:00:00Z", quantity: 5, price: 200, fees: 0, currency: "TRY" },
    ],
    groups: [
      { key: "total", label: "Toplam", kind: "total", portfolioIds: ["P1", "P2"] },
      { key: "p1", label: "Mehmet", kind: "person", portfolioIds: ["P1"] },
    ],
    mvByPortfolio: { P1: 1210, P2: 900 },
    today: "2026-10-04",
    usdtry: [["2025-10-01", 30], ["2026-10-02", 36]], // USD +%20
    goldTryPerGram: [["2025-10-01", 2500], ["2026-10-03", 3500]], // altın +%40
    cpi: { "2025-09": 100, "2026-09": 130 }, // TÜFE +%30
    ...over,
  };
}

describe("computeXirrReport", () => {
  it("TL, reel, USD ve altın bazında para ağırlıklı getiri", () => {
    const r = computeXirrReport(base());
    const p1 = r.rows.find((x) => x.key === "p1")!;
    expect(p1.days).toBe(365);
    expect(p1.invested).toBe(1000);
    expect(p1.profit).toBe(210);
    expect(p1.tl!.annual).toBeCloseTo(0.21, 6);
    expect(p1.tl!.period).toBeCloseTo(0.21, 6);
    // Reel: 1.21 / 1.30 − 1
    expect(p1.real!.annual).toBeCloseTo(1.21 / 1.3 - 1, 6);
    // USD: 1.21 / 1.20 − 1
    expect(p1.usd!.annual).toBeCloseTo(1.21 / 1.2 - 1, 6);
    // Altın: 1.21 / 1.40 − 1 (altına göre kayıp)
    expect(p1.gold!.annual).toBeCloseTo(1.21 / 1.4 - 1, 6);
  });

  it("toplam grup tüm portföylerin akışlarını ve değerini birleştirir", () => {
    const r = computeXirrReport(base());
    const total = r.rows.find((x) => x.key === "total")!;
    expect(total.invested).toBe(2000);
    expect(total.currentMv).toBe(2110);
    expect(total.tl!.annual).toBeCloseTo(0.055, 6);
  });

  it("satışlar pozitif akış, masraflar düşülür", () => {
    const r = computeXirrReport(
      base({
        trades: [
          { portfolio_id: "P1", side: "buy", executed_at: "2025-10-04T10:00:00Z", quantity: 10, price: 100, fees: 10, currency: "TRY" },
          { portfolio_id: "P1", side: "sell", executed_at: "2026-04-04T10:00:00Z", quantity: 5, price: 120, fees: 5, currency: "TRY" },
        ],
        groups: [{ key: "p1", label: "M", kind: "person", portfolioIds: ["P1"] }],
        mvByPortfolio: { P1: 650 },
      }),
    );
    const p1 = r.rows[0];
    expect(p1.invested).toBe(1010);
    expect(p1.withdrawn).toBe(595);
    expect(p1.profit).toBe(650 + 595 - 1010);
  });

  it("TÜFE verisi işlem dönemini kapsamıyorsa reel boş (nominale eşitlenmesin)", () => {
    const r = computeXirrReport(base({ cpi: { "2025-01": 100, "2026-01": 120 } }));
    expect(r.cpiStale).toBe(true);
    expect(r.cpiLatest).toBe("2026-01");
    expect(r.rows.every((x) => x.real === null)).toBe(true);
    expect(r.rows[0].tl).not.toBeNull();
  });

  it("bir akış tarihinde kur verisi yoksa o ölçü boş", () => {
    const r = computeXirrReport(base({ usdtry: [["2026-01-01", 35], ["2026-10-02", 36]] }));
    expect(r.rows.every((x) => x.usd === null)).toBe(true);
    expect(r.rows[0].gold).not.toBeNull();
  });

  it("işlemi olmayan grup atlanır", () => {
    const r = computeXirrReport(
      base({ groups: [{ key: "x", label: "Boş", kind: "person", portfolioIds: ["P9"] }] }),
    );
    expect(r.rows).toHaveLength(0);
  });
});

describe("valueOnOrBefore", () => {
  it("tarihe ≤ en yakın değer", () => {
    const s: Array<[string, number]> = [["2026-01-01", 1], ["2026-01-05", 2]];
    expect(valueOnOrBefore(s, "2025-12-31")).toBeNull();
    expect(valueOnOrBefore(s, "2026-01-03")).toBe(1);
    expect(valueOnOrBefore(s, "2026-02-01")).toBe(2);
  });
});

describe("findUnmatchedSells", () => {
  const tr = (o: Partial<SellCheckTrade>): SellCheckTrade => ({
    id: o.id ?? "t",
    asset_id: o.asset_id ?? "A",
    portfolio_id: o.portfolio_id ?? "P",
    side: o.side ?? "buy",
    executed_at: o.executed_at ?? "2026-07-01T00:00:00Z",
    quantity: o.quantity ?? 1,
    price: o.price ?? 10,
    fees: o.fees ?? 0,
    currency: "TRY",
  });
  const sym = (id: string) => id;
  const pf = (id: string) => id;

  it("alımı hiç olmayan satış ve fazla satış işaretlenir (KTLEV/BINHO örüntüsü)", () => {
    const trades = [
      tr({ id: "b1", asset_id: "BINHO", side: "buy", quantity: 10000, executed_at: "2026-07-01T00:00:00Z" }),
      tr({ id: "s1", asset_id: "BINHO", side: "sell", quantity: 10011, price: 10.11, executed_at: "2026-07-28T00:00:00Z" }),
      tr({ id: "s2", asset_id: "KTLEV", side: "sell", quantity: 220, price: 160.7, executed_at: "2026-07-28T00:00:00Z" }),
    ];
    const out = findUnmatchedSells(trades, () => false, sym, pf);
    expect(out.map((u) => u.symbol)).toEqual(["BINHO", "KTLEV"]);
    expect(out[0].availableQty).toBe(10000);
    expect(out[1].availableQty).toBe(0);
    expect(out[1].proceedsTry).toBeCloseTo(220 * 160.7, 6);
  });

  it("lotu olan ya da yeterli alımı olan satış işaretlenmez", () => {
    const trades = [
      tr({ id: "b1", side: "buy", quantity: 100, executed_at: "2026-07-01T00:00:00Z" }),
      tr({ id: "s1", side: "sell", quantity: 50, executed_at: "2026-07-02T00:00:00Z" }), // lot bekliyor
      tr({ id: "s2", side: "sell", quantity: 80, executed_at: "2026-07-03T00:00:00Z" }), // fazla ama lotu var
    ];
    const out = findUnmatchedSells(trades, (id) => id === "s2", sym, pf);
    expect(out).toHaveLength(0);
  });
});
