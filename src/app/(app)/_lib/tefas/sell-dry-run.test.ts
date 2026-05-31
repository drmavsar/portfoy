import { describe, expect, it } from "vitest";

import type { TaxResolverFn, RawBuyLot } from "./fifo-processor";
import { simulateSell } from "./sell-dry-run";

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

const resolveAs = (snap: ReturnType<TaxResolverFn>): TaxResolverFn => () => snap;

describe("simulateSell — happy path", () => {
  it("HSYF kâr → withholding 0, net = proceeds", () => {
    const r = simulateSell({
      fund_code: "HSYF",
      sell_quantity: 100,
      estimated_unit_price_try: 3.0,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy({ price: 2.0, quantity: 100 })],
      resolveTax: resolveAs(HSYF),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dry_run.fund_code).toBe("HSYF");
    expect(r.dry_run.estimated_proceeds_try).toBe(300);
    expect(r.dry_run.estimated_realized_pnl_try).toBe(100);
    expect(r.dry_run.estimated_withholding_try).toBe(0);
    expect(r.dry_run.estimated_net_proceeds_try).toBe(300);
    expect(r.dry_run.applied_tax_kind).toBe("HSYF_0_STOPAJ");
    expect(r.dry_run.applied_tax_rate).toBe(0);
  });

  it("GENEL_17_5 kâr → withholding = pnl * 0.175", () => {
    const r = simulateSell({
      fund_code: "GEN",
      sell_quantity: 100,
      estimated_unit_price_try: 3.0,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy({ price: 2.0, quantity: 100 })],
      resolveTax: resolveAs(GENEL),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dry_run.estimated_realized_pnl_try).toBe(100);
    expect(r.dry_run.estimated_withholding_try).toBe(17.5);
    expect(r.dry_run.estimated_net_proceeds_try).toBe(300 - 17.5);
  });

  it("Zarar → withholding 0 (rate > 0 olsa bile)", () => {
    const r = simulateSell({
      fund_code: "LOSS",
      sell_quantity: 100,
      estimated_unit_price_try: 1.5,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy({ price: 2.0, quantity: 100 })],
      resolveTax: resolveAs(GENEL),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dry_run.estimated_realized_pnl_try).toBe(-50);
    expect(r.dry_run.estimated_withholding_try).toBe(0);
    expect(r.dry_run.estimated_net_proceeds_try).toBe(150);
  });

  it("Parçalı lot tüketimi (3 lot) → lots_consumed=3", () => {
    const r = simulateSell({
      fund_code: "MULTI",
      sell_quantity: 250,
      estimated_unit_price_try: 3.0,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [
        buy({ trade_id: "b1", executed_at: "2026-01-10T00:00:00Z", quantity: 100, price: 1.8 }),
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100, price: 2.0 }),
        buy({ trade_id: "b3", executed_at: "2026-03-10T00:00:00Z", quantity: 100, price: 2.2 }),
      ],
      resolveTax: resolveAs(GENEL),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dry_run.lots_consumed).toBe(3);
    expect(r.dry_run.sell_quantity).toBe(250);
  });
});

describe("simulateSell — defansif", () => {
  it("sell_quantity 0 → error", () => {
    const r = simulateSell({
      fund_code: "X",
      sell_quantity: 0,
      estimated_unit_price_try: 3,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy()],
      resolveTax: resolveAs(HSYF),
    });
    expect(r.ok).toBe(false);
  });

  it("estimated_unit_price 0 → error", () => {
    const r = simulateSell({
      fund_code: "X",
      sell_quantity: 100,
      estimated_unit_price_try: 0,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy()],
      resolveTax: resolveAs(HSYF),
    });
    expect(r.ok).toBe(false);
  });

  it("Buy lot yok → error", () => {
    const r = simulateSell({
      fund_code: "X",
      sell_quantity: 100,
      estimated_unit_price_try: 3,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [],
      resolveTax: resolveAs(HSYF),
    });
    expect(r.ok).toBe(false);
  });

  it("Yetersiz açık pozisyon → error", () => {
    const r = simulateSell({
      fund_code: "X",
      sell_quantity: 200,
      estimated_unit_price_try: 3,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy({ quantity: 100 })],
      resolveTax: resolveAs(HSYF),
    });
    expect(r.ok).toBe(false);
  });

  it("prior_consumed_qty kalanı düşer (yetersiz olur)", () => {
    const r = simulateSell({
      fund_code: "X",
      sell_quantity: 50,
      estimated_unit_price_try: 3,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [buy({ quantity: 100, prior_consumed_qty: 80 })], // available=20
      resolveTax: resolveAs(HSYF),
    });
    expect(r.ok).toBe(false); // 50 > 20 available
  });
});

describe("simulateSell — DB yan etki yok", () => {
  it("simulateSell çalıştırılır, ConsumedLot snapshot'ı döner, dış DB call yok", () => {
    // Sahte resolveTax çağrı sayacı: gerçekten lot bazlı çağrılıyor mu?
    let callCount = 0;
    const resolver: TaxResolverFn = (acquired, sold) => {
      callCount++;
      expect(acquired).toBeDefined();
      expect(sold).toBeDefined();
      return GENEL;
    };
    const r = simulateSell({
      fund_code: "X",
      sell_quantity: 200,
      estimated_unit_price_try: 3,
      estimated_executed_at: "2026-05-15T10:00:00Z",
      buys: [
        buy({ trade_id: "b1", executed_at: "2026-01-10T00:00:00Z", quantity: 100 }),
        buy({ trade_id: "b2", executed_at: "2026-02-10T00:00:00Z", quantity: 100 }),
      ],
      resolveTax: resolver,
    });
    expect(r.ok).toBe(true);
    // Her lot için resolveTax çağrıldı (lots_consumed=2)
    expect(callCount).toBe(2);
  });
});
