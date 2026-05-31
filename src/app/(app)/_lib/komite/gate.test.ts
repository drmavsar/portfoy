import { describe, expect, it } from "vitest";

import { LIQ_FLOOR_TRY } from "./constants";
import { computeGate } from "./gate";
import type { ActiveFlag } from "./types";

function flags(...f: ActiveFlag[]): ActiveFlag[] {
  return f;
}

describe("computeGate", () => {
  it("temiz sembol → multiplier 1, karantina yok, tier ok", () => {
    const g = computeGate({ flags: [], adtv: 100_000_000 });
    expect(g.multiplier).toBe(1);
    expect(g.quarantine).toBe(false);
    expect(g.tier).toBe("ok");
    expect(g.reasons).toHaveLength(0);
  });

  it("VBTS → multiplier 0, karantina, tier hard", () => {
    const g = computeGate({ flags: flags({ kind: "vbts", severity: 3 }), adtv: 1e9 });
    expect(g.multiplier).toBe(0);
    expect(g.quarantine).toBe(true);
    expect(g.tier).toBe("hard");
    expect(g.reasons[0].label).toContain("VBTS");
  });

  it("açığa satış yasağı (ban) → 0.2 + karantina", () => {
    const g = computeGate({ flags: flags({ kind: "ban", severity: 2 }), adtv: 1e9 });
    expect(g.multiplier).toBeCloseTo(0.2);
    expect(g.quarantine).toBe(true);
    expect(g.tier).toBe("soft");
  });

  it("SPK severity'e göre çarpan: sev1=0.3, sev2=0.2, sev3=0.1 + karantina", () => {
    expect(computeGate({ flags: flags({ kind: "spk", severity: 1 }), adtv: 1e9 }).multiplier).toBeCloseTo(0.3);
    expect(computeGate({ flags: flags({ kind: "spk", severity: 2 }), adtv: 1e9 }).multiplier).toBeCloseTo(0.2);
    const g3 = computeGate({ flags: flags({ kind: "spk", severity: 3 }), adtv: 1e9 });
    expect(g3.multiplier).toBeCloseTo(0.1);
    expect(g3.quarantine).toBe(true);
  });

  it("finansal bozulma (fin) → cap 0.5, karantina YOK", () => {
    const g = computeGate({ flags: flags({ kind: "fin", severity: 3 }), adtv: 1e9 });
    expect(g.multiplier).toBeCloseTo(0.5);
    expect(g.quarantine).toBe(false);
  });

  it("aşırı volatilite (vol) → cap 0.7, karantina YOK", () => {
    const g = computeGate({ flags: flags({ kind: "vol", severity: 1 }), adtv: 1e9 });
    expect(g.multiplier).toBeCloseTo(0.7);
    expect(g.quarantine).toBe(false);
  });

  it("manuel bayrak severity → tavan 0.7/0.5/0.3; note etikete yansır", () => {
    expect(computeGate({ flags: flags({ kind: "manual", severity: 1 }), adtv: 1e9 }).multiplier).toBeCloseTo(0.7);
    expect(computeGate({ flags: flags({ kind: "manual", severity: 3 }), adtv: 1e9 }).multiplier).toBeCloseTo(0.3);
    const g = computeGate({ flags: flags({ kind: "manual", severity: 2, note: "dava riski" }), adtv: 1e9 });
    expect(g.reasons[0].label).toContain("dava riski");
  });

  it("düşük likidite → otomatik 0 gate (multiplier 0)", () => {
    const g = computeGate({ flags: [], adtv: LIQ_FLOOR_TRY - 1 });
    expect(g.multiplier).toBe(0);
    expect(g.tier).toBe("hard");
    expect(g.reasons[0].kind).toBe("liq");
  });

  it("likidite tam tabanda → gate yok", () => {
    const g = computeGate({ flags: [], adtv: LIQ_FLOOR_TRY });
    expect(g.multiplier).toBe(1);
  });

  it("adtv null → likidite kapısı uygulanmaz", () => {
    const g = computeGate({ flags: [], adtv: null });
    expect(g.multiplier).toBe(1);
    expect(g.reasons).toHaveLength(0);
  });

  it("çoklu bayrak → EN SIKI (min) çarpan kazanır", () => {
    const g = computeGate({
      flags: flags({ kind: "vol", severity: 1 }, { kind: "fin", severity: 2 }, { kind: "vbts", severity: 3 }),
      adtv: 1e9,
    });
    expect(g.multiplier).toBe(0); // vbts kazanır
    expect(g.quarantine).toBe(true);
    expect(g.reasons).toHaveLength(3);
  });

  it("severity aralık dışı → 1..3'e clamp", () => {
    const g = computeGate({ flags: flags({ kind: "manual", severity: 9 }), adtv: 1e9 });
    expect(g.multiplier).toBeCloseTo(0.3); // sev=3 gibi davranır
  });
});
