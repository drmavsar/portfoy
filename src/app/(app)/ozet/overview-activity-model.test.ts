import { expect, it } from "vitest";
import { overviewActivity } from "./overview-activity-model";
import type { RawTxn } from "@/app/(app)/_lib/reports-actions";
const row = (patch: Partial<RawTxn>): RawTxn => ({ occurred_on: "2026-09-08", direction: "outflow", amount: 10, currency: "TRY", category_id: null, beneficiary_id: null, description: null, merchant_raw: null, ...patch });
it("totals the whole period while limiting recent rows to eight", () => {
  const result = overviewActivity(Array.from({ length: 10 }, (_, i) => row({ occurred_on: `2026-09-${String(i + 1).padStart(2, "0")}` })), "2026-09-01", "2026-09-10", "");
  expect(result.recent).toHaveLength(8);
  expect(result.recent[0].occurred_on).toBe("2026-09-10");
  expect(result.count).toBe(10);
  expect(result.totals[0].expense).toBe(100);
});
it("filters person/date, excludes transfers and keeps currency totals separate", () => {
  const result = overviewActivity([row({ amount: 0.1 }), row({ amount: 0.2 }), row({ direction: "inflow", amount: 1 }), row({ currency: "USD", amount: 2 }), row({ direction: "transfer", amount: 100 }), row({ beneficiary_id: "other", amount: 200 }), row({ occurred_on: "2026-09-09", amount: 300 })], "2026-09-01", "2026-09-08", "__none__");
  expect(result.count).toBe(4);
  expect(result.totals).toEqual([{ currency: "TRY", income: 1, expense: 0.3, net: 0.7 }, { currency: "USD", income: 0, expense: 2, net: -2 }]);
});
