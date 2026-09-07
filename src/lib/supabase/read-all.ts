interface Page<T> { data: T[] | null; count: number | null; error: unknown }

/** Do not present a partial dataset as a complete financial total. */
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, key: (row: T) => string): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (;;) {
    const result = await page(rows.length, rows.length + 499);
    if (result.error) throw new Error("Kayıtların tamamı yüklenemedi. Lütfen yeniden deneyin.");
    const batch = result.data ?? [];
    for (const row of batch) {
      const id = key(row);
      if (seen.has(id)) throw new Error("Kayıtlar yüklenirken değişti. Lütfen yeniden deneyin.");
      seen.add(id);
      rows.push(row);
    }
    if (result.count != null && rows.length >= result.count) return rows;
    if (!batch.length) {
      if (result.count != null && rows.length < result.count) throw new Error("Kayıtların tamamı yüklenemedi. Lütfen yeniden deneyin.");
      return rows;
    }
  }
}
