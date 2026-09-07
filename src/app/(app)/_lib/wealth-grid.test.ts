import { beforeEach, describe, expect, it, vi } from "vitest";
const { client, configured } = vi.hoisted(() => ({ client: { from: vi.fn() }, configured: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/app/(app)/ayarlar/actions", () => ({ isSupabaseConfigured: configured }));
import { listHoldings, listTrades } from "./wealth-actions";

describe("investment grid complete datasets", () => {
  beforeEach(() => { vi.clearAllMocks(); configured.mockResolvedValue(true); });
  function mockPages(all: object[], fail = false) {
    const query = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query);
    query.range.mockImplementation(async (from: number) => ({ data: all.slice(from, from + 200), count: all.length, error: fail && from > 0 ? { message: "offline" } : null }));
    client.from.mockReturnValue(query);
    return query;
  }
  it("loads older trades beyond the old 500 limit and smaller API caps", async () => {
    const q = mockPages(Array.from({ length: 1201 }, (_, i) => ({ id: String(i) })));
    expect(await listTrades()).toHaveLength(1201);
    expect(q.range).toHaveBeenCalledTimes(7);
    expect(q.order).toHaveBeenCalledWith("id", { ascending: true });
  });
  it("loads holdings using stable portfolio and asset ordering", async () => {
    const q = mockPages(Array.from({ length: 1001 }, (_, i) => ({ portfolio_id: "p", asset_id: String(i) })));
    expect(await listHoldings()).toHaveLength(1001);
    expect(q.order).toHaveBeenCalledWith("portfolio_id", { ascending: true });
    expect(q.order).toHaveBeenCalledWith("asset_id", { ascending: true });
  });
  it("rejects partial totals if a later page fails", async () => {
    mockPages(Array.from({ length: 501 }, (_, i) => ({ id: String(i) })), true);
    await expect(listTrades()).rejects.toThrow("tamamı yüklenemedi");
  });
});
