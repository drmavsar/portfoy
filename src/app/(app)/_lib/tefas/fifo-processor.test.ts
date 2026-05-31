import { describe, expect, it } from "vitest";

import { processFifoSell, type RawBuyLot, type RawSellInput, type TaxResolverFn } from "./fifo-processor";

const buy = (overrides: Partial<RawBuyLot> = {}): RawBuyLot => ({
  trade_id: overrides.trade_id ?? "buy-1",
  executed_at: overrides.executed_at ?? "2026-01-15T10:00:00Z",
  quantity: overrides.quantity ?? 100,
  price: overrides.price ?? 2.0,
  fees: overrides.fees ?? 0,
  currency: overrides.currency ?? "TRY",
  fx_rate_to_try: overrides.fx_rate_to_try ?? 1,
  prior_consumed_qty: overrides.prior_consumed_qty ?? 0,
});

const sell = (overrides: Partial<RawSellInput> = {}): RawSellInput => ({
  trade_id: overrides.trade_id ?? "sell-1",
  executed_at: overrides.executed_at ?? "2026-05-15T10:00:00Z",
  quantity: overrides.quantity ?? 50,
  price: overrides.price ?? 3.0,
  fees: overrides.fees ?? 0,
  taxes: overrides.taxes ?? 0,
  currency: overrides.currency ?? "TRY",
  fx_rate_to_try: overrides.fx_rate_to_try ?? 1,
});

const HSYF: ReturnType<TaxResolverFn> = {
  kind: "HSYF_0_STOPAJ",
  rate: 0,
  confidence: "HIGH",
  source: "TAX_KIND_DEFAULT",
  rule_id: "rule-hsyf",
};
const GENEL: ReturnType<TaxResolverFn> = {
  kind: "GENEL_17_5",
  rate: 0.175,
  confidence: "HIGH",
  source: "TAX_KIND_DEFAULT",
  rule_id: "rule-genel",
};
const BELIRSIZ: ReturnType<TaxResolverFn> = {
  kind: "BELIRSIZ",
  rate: null,
  confidence: "LOW",
  source: "NONE",
  rule_id: null,
};

const resolveAs = (snap: ReturnType<TaxResolverFn>): TaxResolverFn => () => snap;

describe("processFifoSell — FIFO matching", () => {
  it("Tek buy lot tam tüketim → ok", () => {
    const r = processFifoSell(
      sell({ quantity: 100, price: 3.0 }),
      [buy({ trade_id: "b1", quantity: 100, price: 2.0 })],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots).toHaveLength(1);
    expect(r.lots[0].buy_trade_id).toBe("b1");
    expect(r.lots[0].quantity).toBe(100);
    expect(r.lots[0].cost_basis_try).toBe(200);
    expect(r.lots[0].proceeds_try).toBe(300);
    expect(r.lots[0].realized_pnl_try).toBe(100);
  });

  it("Parçalı consume: 1 buy 100, sell 30 → consumed 30", () => {
    const r = processFifoSell(
      sell({ quantity: 30, price: 3.0 }),
      [buy({ trade_id: "b1", quantity: 100, price: 2.0 })],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].quantity).toBe(30);
    expect(r.lots[0].cost_basis_try).toBe(60);
    expect(r.lots[0].proceeds_try).toBe(90);
    expect(r.lots[0].realized_pnl_try).toBe(30);
  });

  it("3 buy lot + sell parçalı kapsama → FIFO sırayla 3 lot kapatır", () => {
    const r = processFifoSell(
      sell({ quantity: 250, price: 3.0 }),
      [
        buy({ trade_id: "b1", executed_at: "2026-01-10T00:00:00Z", quantity: 100, price: 1.8 }),
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.0 }),
        buy({ trade_id: "b3", executed_at: "2026-03-10T00:00:00Z", quantity: 100, price: 2.2 }),
      ],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots).toHaveLength(3);
    expect(r.lots[0].buy_trade_id).toBe("b1");
    expect(r.lots[0].quantity).toBe(100);
    expect(r.lots[1].buy_trade_id).toBe("b2");
    expect(r.lots[1].quantity).toBe(100);
    expect(r.lots[2].buy_trade_id).toBe("b3");
    expect(r.lots[2].quantity).toBe(50);
    expect(r.total_consumed_qty).toBe(250);
  });

  it("prior_consumed_qty önceki sell'lerce tüketileni atlar", () => {
    const r = processFifoSell(
      sell({ quantity: 50, price: 3.0 }),
      [
        buy({ trade_id: "b1", quantity: 100, prior_consumed_qty: 70 }), // available=30
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.5 }),
      ],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots).toHaveLength(2);
    expect(r.lots[0].buy_trade_id).toBe("b1");
    expect(r.lots[0].quantity).toBe(30);
    expect(r.lots[1].buy_trade_id).toBe("b2");
    expect(r.lots[1].quantity).toBe(20);
  });

  it("Yetersiz pozisyon → red", () => {
    const r = processFifoSell(
      sell({ quantity: 200 }),
      [buy({ quantity: 100 })],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/yetersiz/i);
  });

  it("Hiç buy yok → red", () => {
    const r = processFifoSell(sell(), [], resolveAs(GENEL));
    expect(r.ok).toBe(false);
  });
});

describe("processFifoSell — fees allocation", () => {
  it("Buy fees consumed oranında cost basis'e eklenir", () => {
    // buy 100 @2 + fees 50 → unit cost = 2 + 0.5 = 2.5
    // sell 40: cost = 40 * 2 + 50 * (40/100) = 80 + 20 = 100
    const r = processFifoSell(
      sell({ quantity: 40, price: 3.0 }),
      [buy({ quantity: 100, price: 2.0, fees: 50 })],
      resolveAs(HSYF),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].cost_basis_try).toBe(100);
  });

  it("Sell fees lot'lara qty-oranında dağıtılır", () => {
    // sell 200 @3, fees 60 → b1 (100/200)=30, b2 (100/200)=30
    const r = processFifoSell(
      sell({ quantity: 200, price: 3.0, fees: 60 }),
      [
        buy({ trade_id: "b1", executed_at: "2026-01-10T00:00:00Z", quantity: 100, price: 2.0 }),
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.0 }),
      ],
      resolveAs(HSYF),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].fees_allocated_try).toBe(30);
    expect(r.lots[1].fees_allocated_try).toBe(30);
    expect(r.lots[0].proceeds_try).toBe(270); // 100*3 - 30
    expect(r.lots[1].proceeds_try).toBe(270);
    expect(r.total_fees_allocated_try).toBe(60);
  });
});

describe("processFifoSell — stopaj kuralı", () => {
  it("HSYF (rate=0) → withholding=0", () => {
    const r = processFifoSell(
      sell({ quantity: 100, price: 3.0 }),
      [buy({ quantity: 100, price: 2.0 })],
      resolveAs(HSYF),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].applied_tax_kind).toBe("HSYF_0_STOPAJ");
    expect(r.lots[0].withholding_try).toBe(0);
    expect(r.lots[0].tax_basis_try).toBe(0);
  });

  it("GENEL_17_5 kâr → withholding = pnl * 0.175", () => {
    const r = processFifoSell(
      sell({ quantity: 100, price: 3.0 }),
      [buy({ quantity: 100, price: 2.0 })],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].realized_pnl_try).toBe(100);
    expect(r.lots[0].tax_basis_try).toBe(100);
    expect(r.lots[0].withholding_try).toBe(17.5);
  });

  it("Zarar lot → withholding=0 (rate>0 olsa bile)", () => {
    const r = processFifoSell(
      sell({ quantity: 100, price: 1.5 }),
      [buy({ quantity: 100, price: 2.0 })],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].realized_pnl_try).toBe(-50);
    expect(r.lots[0].tax_basis_try).toBe(0);
    expect(r.lots[0].withholding_try).toBe(0);
  });

  it("BELIRSIZ (rate=null) → withholding=0, confidence LOW", () => {
    const r = processFifoSell(
      sell({ quantity: 100, price: 3.0 }),
      [buy({ quantity: 100, price: 2.0 })],
      resolveAs(BELIRSIZ),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].applied_tax_kind).toBe("BELIRSIZ");
    expect(r.lots[0].withholding_try).toBe(0);
    expect(r.lots[0].tax_confidence).toBe("LOW");
  });

  it("Tax resolver lot bazlı: 2 lot farklı buy date → 2 farklı snapshot", () => {
    const resolver: TaxResolverFn = (acquired) => {
      // 2025'te alınanlar HSYF, 2026'da alınanlar GENEL gibi farzedelim
      return acquired.startsWith("2025") ? HSYF : GENEL;
    };
    const r = processFifoSell(
      sell({ quantity: 200, price: 3.0 }),
      [
        buy({ trade_id: "old", executed_at: "2025-06-10T00:00:00Z", quantity: 100, price: 2.0 }),
        buy({ trade_id: "new", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.0 }),
      ],
      resolver,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].applied_tax_kind).toBe("HSYF_0_STOPAJ");
    expect(r.lots[0].withholding_try).toBe(0);
    expect(r.lots[1].applied_tax_kind).toBe("GENEL_17_5");
    expect(r.lots[1].withholding_try).toBe(17.5);
  });
});

describe("processFifoSell — manuel taxes override", () => {
  it("sell.taxes > 0 → sistem hesaplaması bypass, flag true", () => {
    const r = processFifoSell(
      sell({ quantity: 100, price: 3.0, taxes: 25 }),
      [buy({ quantity: 100, price: 2.0 })],
      resolveAs(GENEL), // normalde 17.5 olurdu
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].manual_tax_override).toBe(true);
    expect(r.lots[0].withholding_try).toBe(25); // GENEL 17.5 değil, 25
  });

  it("Manuel override sell birden çok lot'a oransal dağıtır", () => {
    const r = processFifoSell(
      sell({ quantity: 200, price: 3.0, taxes: 40 }),
      [
        buy({ trade_id: "b1", executed_at: "2026-01-10T00:00:00Z", quantity: 100, price: 2.0 }),
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.0 }),
      ],
      resolveAs(HSYF),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].withholding_try).toBe(20);
    expect(r.lots[1].withholding_try).toBe(20);
    expect(r.lots[0].manual_tax_override).toBe(true);
  });
});

describe("processFifoSell — holding period", () => {
  it("days = floor((sell - buy) / 86400000)", () => {
    const r = processFifoSell(
      sell({ executed_at: "2026-05-15T10:00:00Z", quantity: 50, price: 3 }),
      [
        buy({
          trade_id: "b1",
          executed_at: "2026-01-15T10:00:00Z",
          quantity: 100,
          price: 2,
        }),
      ],
      resolveAs(HSYF),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lots[0].holding_period_days).toBe(120);
  });
});

describe("processFifoSell — defansif kontroller", () => {
  it("Sell quantity 0 → red", () => {
    const r = processFifoSell(sell({ quantity: 0 }), [buy()], resolveAs(GENEL));
    expect(r.ok).toBe(false);
  });

  it("Sell price 0 → red", () => {
    const r = processFifoSell(sell({ price: 0 }), [buy()], resolveAs(GENEL));
    expect(r.ok).toBe(false);
  });

  it("Buy executed_at sell'den sonra ise tüketilmez", () => {
    const r = processFifoSell(
      sell({ executed_at: "2026-01-01T00:00:00Z", quantity: 50, price: 3 }),
      [
        buy({
          trade_id: "future",
          executed_at: "2026-03-01T00:00:00Z",
          quantity: 100,
          price: 2,
        }),
      ],
      resolveAs(HSYF),
    );
    expect(r.ok).toBe(false);
  });
});

describe("processFifoSell — totals", () => {
  it("Toplam alanları lot'ların toplamı", () => {
    const r = processFifoSell(
      sell({ quantity: 150, price: 3.0, fees: 30 }),
      [
        buy({ trade_id: "b1", executed_at: "2026-01-10T00:00:00Z", quantity: 100, price: 2.0 }),
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.5 }),
      ],
      resolveAs(GENEL),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total_consumed_qty).toBe(150);
    const sumPnl = r.lots.reduce((s, l) => s + l.realized_pnl_try, 0);
    expect(Math.abs(r.total_realized_pnl_try - sumPnl)).toBeLessThan(0.01);
    const sumWht = r.lots.reduce((s, l) => s + l.withholding_try, 0);
    expect(Math.abs(r.total_withholding_try - sumWht)).toBeLessThan(0.01);
  });
});
