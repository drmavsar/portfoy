import { describe, expect, it } from "vitest";

import {
  summarizeSnapshotForList,
  todaySnapshotDate,
  type SnapshotRow,
} from "./snapshot-list-helpers";

function snap(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    id: "s1",
    user_id: "u1",
    persona_id: "p1",
    portfolio_id: "pf1",
    snapshot_date: "2026-05-31",
    as_of: "2026-05-31T12:00:00Z",
    top_n: 10,
    rebalance_days: 90,
    strategy: "equal_weight",
    rebalance_band_pct: 0.05,
    total_market_value_try: 100000,
    target_funds: [],
    current_positions: [],
    diffs: [],
    sell_dry_runs: [],
    summary: {},
    data_quality_flags: [],
    notes: null,
    created_at: "2026-05-31T12:00:00Z",
    updated_at: "2026-05-31T12:00:00Z",
    ...overrides,
  };
}

describe("summarizeSnapshotForList", () => {
  it("Boş diffs → action_counts hepsi 0", () => {
    const r = summarizeSnapshotForList(snap());
    expect(r.action_counts).toEqual({ EKLEME: 0, AZALTMA: 0, TUT: 0 });
    expect(r.flag_counts).toEqual({ info: 0, warn: 0, critical: 0 });
    expect(r.has_notes).toBe(false);
  });

  it("Diffs sayıları doğru saçılır", () => {
    const r = summarizeSnapshotForList(
      snap({
        diffs: [
          { action: "EKLEME" },
          { action: "EKLEME" },
          { action: "AZALTMA" },
          { action: "TUT" },
          { action: "TUT" },
          { action: "TUT" },
        ],
      }),
    );
    expect(r.action_counts).toEqual({ EKLEME: 2, AZALTMA: 1, TUT: 3 });
  });

  it("Flags sayıları doğru saçılır", () => {
    const r = summarizeSnapshotForList(
      snap({
        data_quality_flags: [
          { level: "info" },
          { level: "warn" },
          { level: "warn" },
          { level: "critical" },
        ],
      }),
    );
    expect(r.flag_counts).toEqual({ info: 1, warn: 2, critical: 1 });
  });

  it("Summary'den net_cash_need ve estimated_tax çekilir", () => {
    const r = summarizeSnapshotForList(
      snap({
        summary: {
          net_cash_need_try: 5000,
          total_tax_try: 350.5,
        },
      }),
    );
    expect(r.net_cash_need_try).toBe(5000);
    expect(r.estimated_tax_try).toBe(350.5);
  });

  it("Bozuk jsonb (string/array değil) → defansif default'lar", () => {
    const r = summarizeSnapshotForList(
      snap({
        diffs: "bozuk-string" as unknown as object,
        summary: null as unknown as object,
        data_quality_flags: 42 as unknown as object,
      }),
    );
    expect(r.action_counts).toEqual({ EKLEME: 0, AZALTMA: 0, TUT: 0 });
    expect(r.net_cash_need_try).toBe(0);
    expect(r.estimated_tax_try).toBe(0);
    expect(r.flag_counts).toEqual({ info: 0, warn: 0, critical: 0 });
  });

  it("Geçersiz action / level değerleri sayılmaz", () => {
    const r = summarizeSnapshotForList(
      snap({
        diffs: [{ action: "AL" }, { action: "SAT" }, { action: "EKLEME" }],
        data_quality_flags: [{ level: "fatal" }, { level: "info" }],
      }),
    );
    expect(r.action_counts).toEqual({ EKLEME: 1, AZALTMA: 0, TUT: 0 });
    expect(r.flag_counts).toEqual({ info: 1, warn: 0, critical: 0 });
  });

  it("Notes whitespace → has_notes false", () => {
    expect(summarizeSnapshotForList(snap({ notes: "" })).has_notes).toBe(false);
    expect(summarizeSnapshotForList(snap({ notes: "   " })).has_notes).toBe(false);
    expect(summarizeSnapshotForList(snap({ notes: "  ok  " })).has_notes).toBe(true);
  });

  it("total_market_value_try string olarak gelirse Number'a çevrilir", () => {
    const r = summarizeSnapshotForList(
      snap({ total_market_value_try: "12345.67" as unknown as number }),
    );
    expect(r.total_market_value_try).toBe(12345.67);
  });
});

describe("todaySnapshotDate", () => {
  it("YYYY-MM-DD format, local TZ", () => {
    const d = new Date(2026, 4, 31, 14, 30); // May 31, 2026 local
    expect(todaySnapshotDate(d)).toBe("2026-05-31");
  });

  it("Pad zero", () => {
    const d = new Date(2026, 0, 5); // Jan 5
    expect(todaySnapshotDate(d)).toBe("2026-01-05");
  });
});
