import { beforeEach, describe, expect, it, vi } from "vitest";
const { client, configured } = vi.hoisted(() => ({ client: { from: vi.fn() }, configured: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
vi.mock("@/app/(app)/ayarlar/actions", () => ({ isSupabaseConfigured: configured }));
import { listTransactions } from "./cashflow-actions";

describe("complete cashflow grid dataset", () => {
  beforeEach(() => { vi.clearAllMocks(); configured.mockResolvedValue(true); });
  it("reads beyond both default and custom API caps, with stable ordering", async () => {
    const all = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) }));
    const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const method of [query.select, query.eq, query.is, query.order]) method.mockReturnValue(query);
    query.range.mockImplementation(async (from: number) => ({ data: all.slice(from, from + 200), count: all.length, error: null }));
    client.from.mockReturnValue(query);
    expect(await listTransactions("outflow")).toHaveLength(1201);
    expect(query.range).toHaveBeenCalledTimes(7);
    expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
  });
  it("fails instead of reporting partial records as complete totals", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const method of [query.select, query.eq, query.is, query.order]) method.mockReturnValue(query);
    query.range.mockResolvedValueOnce({ data: [{ id: "a" }], count: 2, error: null })
      .mockResolvedValueOnce({ data: null, count: null, error: { message: "offline" } });
    client.from.mockReturnValue(query);
    await expect(listTransactions("outflow")).rejects.toThrow("tamamı yüklenemedi");
  });
});
