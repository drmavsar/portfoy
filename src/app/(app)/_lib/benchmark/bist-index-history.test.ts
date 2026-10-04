import { describe, expect, it } from "vitest";

import { parseBistHistoryPoints } from "./bist-index-history";

describe("parseBistHistoryPoints", () => {
  it("ts (seans açılışı, UTC) İstanbul gününe çevrilir; eksik/bozuk kapanış atlanır", () => {
    const pts = parseBistHistoryPoints(
      {
        status: "ok",
        series: {
          XU100: {
            // 2026-07-17, 2026-07-20, 2026-07-21 06:00 UTC (09:00 TR)
            ts: [1784268000, 1784527200, 1784613600, 1784700000],
            close: [13981.05, 14070.98, null, 0],
          },
        },
      },
      "XU100",
    );
    expect(pts).toEqual([
      { as_of: "2026-07-17", value: 13981.05 },
      { as_of: "2026-07-20", value: 14070.98 },
    ]);
  });

  it("hatalı yanıt ya da sembol yoksa boş", () => {
    expect(parseBistHistoryPoints({ status: "error" }, "XU100")).toEqual([]);
    expect(parseBistHistoryPoints({ status: "ok", series: {} }, "XU100")).toEqual([]);
  });
});
