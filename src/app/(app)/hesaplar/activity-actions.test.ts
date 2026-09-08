import { expect, it, vi } from "vitest";
const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
import { listAccountActivity } from "./activity-actions";
it("scopes both ledgers to the requested account and excludes deleted/uncommitted cashflow", async () => {
  const queries = ["transactions", "trades"].map(() => {
    const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const method of [q.select, q.eq, q.is, q.order]) method.mockReturnValue(q);
    q.range.mockResolvedValue({ data: [], count: 0, error: null });
    return q;
  });
  client.from.mockImplementation((table: string) => queries[table === "transactions" ? 0 : 1]);
  expect(await listAccountActivity("account-a")).toEqual({ transactions: [], trades: [] });
  for (const q of queries) expect(q.eq).toHaveBeenCalledWith("account_id", "account-a");
  expect(queries[0].eq).toHaveBeenCalledWith("status", "committed");
  expect(queries[0].is).toHaveBeenCalledWith("deleted_at", null);
});
