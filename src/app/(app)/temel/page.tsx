import { getSymbolIndexMap, getXK100Symbols } from "@/app/(app)/_lib/bist-index-members";

import { TemelClient } from "./temel-client";

export const dynamic = "force-dynamic";

export default async function TemelPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string | string[] }>;
}) {
  const sp = await searchParams;
  const rawSymbol = Array.isArray(sp.symbol) ? sp.symbol[0] : sp.symbol;
  const sym = (rawSymbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  const [symbols, indexMap] = await Promise.all([
    getXK100Symbols(),
    getSymbolIndexMap(),
  ]);

  const info = sym ? indexMap[sym] : undefined;

  // Temel veri (getFundamentals) burada DEĞİL, client'ta çekilir — sunucu→sunucu
  // çağrısı Vercel Deployment Protection nedeniyle 401 dönüyordu.
  return (
    <TemelClient
      symbols={[...symbols].sort()}
      selected={sym}
      name={info?.name ?? sym}
      indices={info?.indices ?? []}
    />
  );
}
