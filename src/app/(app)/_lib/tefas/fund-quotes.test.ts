import { describe, expect, it } from "vitest";

import { buildFundQuotes, fundQuotesAsStockQuotes, loadFundQuotes } from "./fund-quotes";

describe("buildFundQuotes", () => {
  it("picks the latest and previous NAV per fund regardless of row order", () => {
    const quotes = buildFundQuotes([
      { fund_code: "RBT", as_of: "2026-11-23", nav: "7.222201" },
      { fund_code: "KZL", as_of: "2026-11-24", nav: 25.467439 },
      { fund_code: "RBT", as_of: "2026-11-24", nav: "7.229291" },
      { fund_code: "RBT", as_of: "2026-11-20", nav: "7.202286" },
      { fund_code: "KZL", as_of: "2026-11-23", nav: 24.825281 },
    ]);
    const rbt = quotes.find((q) => q.fund_code === "RBT")!;
    expect(rbt.as_of).toBe("2026-11-24");
    expect(rbt.nav).toBeCloseTo(7.229291, 6);
    expect(rbt.previous_nav).toBeCloseTo(7.222201, 6);
    expect(rbt.change_pct).toBeCloseTo(((7.229291 - 7.222201) / 7.222201) * 100, 8);
    const kzl = quotes.find((q) => q.fund_code === "KZL")!;
    expect(kzl.nav).toBeCloseTo(25.467439, 6);
  });

  it("ignores non-positive NAVs and leaves previous null for a single row", () => {
    const quotes = buildFundQuotes([
      { fund_code: "X", as_of: "2026-11-24", nav: 0 },
      { fund_code: "X", as_of: "2026-11-23", nav: "1.5" },
    ]);
    expect(quotes).toEqual([
      { fund_code: "X", as_of: "2026-11-23", nav: 1.5, previous_nav: null, change_pct: null },
    ]);
  });
});

describe("fundQuotesAsStockQuotes", () => {
  it("maps NAV to price and previous NAV to previous close", () => {
    const map = fundQuotesAsStockQuotes([
      { fund_code: "RBT", as_of: "2026-11-24", nav: 7.2, previous_nav: 7.1, change_pct: 1.4 },
    ]);
    expect(map.RBT).toMatchObject({ symbol: "RBT", price: 7.2, previous_close: 7.1, currency: "TRY", source: "tefas" });
  });
});

describe("loadFundQuotes", () => {
  it("returns an empty list without querying when there are no codes", async () => {
    const supabase = { from: () => { throw new Error("should not query"); } };
    await expect(loadFundQuotes(supabase, [])).resolves.toEqual([]);
  });

  it("reads paged rows for the requested codes", async () => {
    const calls: Array<{ codes: string[]; since: string }> = [];
    const rows = [
      { fund_code: "RBT", as_of: "2026-11-24", nav: "7.229291" },
      { fund_code: "RBT", as_of: "2026-11-23", nav: "7.222201" },
    ];
    const builder = {
      codes: [] as string[],
      since: "",
      select() { return this; },
      in(_col: string, codes: string[]) { this.codes = codes; return this; },
      gte(_col: string, since: string) { this.since = since; return this; },
      order() { return this; },
      range(from: number) {
        calls.push({ codes: this.codes, since: this.since });
        return Promise.resolve({ data: from === 0 ? rows : [], count: rows.length, error: null });
      },
    };
    const supabase = { from: () => builder };
    const quotes = await loadFundQuotes(supabase, ["RBT", "RBT"], new Date("2026-11-25T12:00:00Z"));
    expect(calls[0]).toEqual({ codes: ["RBT"], since: "2026-10-11" });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].nav).toBeCloseTo(7.229291, 6);
  });
});
