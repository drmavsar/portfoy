import { getSymbolIndexMap, getXK100Symbols } from "@/app/(app)/_lib/bist-index-members";
import { getFundamentals, type FundamentalsResult } from "@/app/(app)/_lib/fundamentals";

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

  const result: FundamentalsResult | null = sym ? await getFundamentals(sym) : null;
  const info = sym ? indexMap[sym] : undefined;

  return (
    <TemelClient
      symbols={[...symbols].sort()}
      selected={sym}
      name={info?.name ?? sym}
      indices={info?.indices ?? []}
      result={result}
    />
  );
}
