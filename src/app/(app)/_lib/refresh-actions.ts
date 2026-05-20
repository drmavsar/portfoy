"use server";

import { revalidateTag, revalidatePath } from "next/cache";

/**
 * Piyasa verisi cache'ini manuel temizle — Yahoo (stock-prices) + Truncgil
 * (asset-rates) tag'leri stale işaretlenir, sonraki render'da taze çekilir.
 *
 * NOT: Yahoo'nun kendi feed gecikmesini (15-20 dk) aşamaz; sadece bizim
 * Next.js fetch cache katmanını (5-15 dk) atlar.
 */
export async function refreshMarketData(): Promise<{ ok: boolean }> {
  revalidateTag("stock-prices", "max");
  revalidateTag("asset-rates", "max");
  revalidatePath("/yatirimlar");
  revalidatePath("/ozet");
  revalidatePath("/tarama");
  revalidatePath("/radar");
  return { ok: true };
}
