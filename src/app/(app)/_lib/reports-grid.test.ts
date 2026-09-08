import { beforeEach, expect, it, vi } from "vitest";
const { client, configured } = vi.hoisted(() => ({ client: { from: vi.fn() }, configured: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/app/(app)/ayarlar/actions", () => ({ isSupabaseConfigured: configured }));
vi.mock("@/app/(app)/_lib/tefas/realized-lots-processor", () => ({ processSellTrade: vi.fn() }));
import { listTransactionsForReports } from "./reports-actions";
beforeEach(() => { vi.clearAllMocks(); configured.mockResolvedValue(true); });
function query(fail = false) {
  const all = Array.from({ length: 1101 }, (_, i) => ({ id: String(i) }));
  const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), gte: vi.fn(), order: vi.fn(), range: vi.fn() };
  for (const method of [q.select, q.eq, q.is, q.gte, q.order]) method.mockReturnValue(q);
  q.range.mockImplementation(async (from: number) => ({ data: all.slice(from, from + 200), count: all.length, error: fail && from > 0 ? { message: "offline" } : null }));
  client.from.mockReturnValue(q);
  return q;
}
it("loads full comparison history beyond API caps without a date cutoff", async () => {
  const q = query();
  expect(await listTransactionsForReports(null)).toHaveLength(1101);
  expect(q.gte).not.toHaveBeenCalled();
  expect(q.is).toHaveBeenCalledWith("deleted_at", null);
  expect(q.eq).toHaveBeenCalledWith("is_transfer", false);
  expect(q.eq).toHaveBeenCalledWith("status", "committed");
  expect(q.order).toHaveBeenCalledWith("id", { ascending: true });
});
it("fails instead of returning misleading partial comparisons", async () => {
  query(true);
  await expect(listTransactionsForReports(null)).rejects.toThrow("tamamı yüklenemedi");
});
