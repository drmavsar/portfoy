// Benchmark karşılaştırma — paylaşılan tipler ve sabitler (server olmayan modül).
// "use server" dosyaları yalnızca async fonksiyon export edebildiği için
// sabitler ve tipler burada tutulur.

export const BENCH_CODES = ["XAUTRY", "USDTRY", "EURTRY", "XU100"] as const;
export type BenchCode = (typeof BENCH_CODES)[number];

export const BENCH_META: Record<BenchCode, { label: string; unit: string }> = {
  XAUTRY: { label: "Gram Altın", unit: "gr" },
  USDTRY: { label: "USD", unit: "$" },
  EURTRY: { label: "EUR", unit: "€" },
  XU100: { label: "BIST 100", unit: "puan" },
};

export interface BenchResult {
  code: BenchCode;
  /** Aynı nakit akışı benchmark'a uygulansaydı kalan pozisyonun bugünkü TL değeri. */
  finalValue: number;
  /** finalValue − netInvested. */
  profit: number;
  /** Benchmark getirisi − gerçek getiri (TL). Pozitif = benchmark daha iyiydi. */
  vsActual: number;
}

export interface SymbolCompare {
  asset_id: string;
  symbol: string;
  name: string;
  buyTry: number;
  sellTry: number;
  netInvested: number;
  currentQty: number;
  currentMv: number;
  actualProfit: number;
  priced: boolean; // güncel fiyat bulundu mu
  benches: BenchResult[];
}

export interface BenchmarkCompareResult {
  symbols: SymbolCompare[];
  total: Omit<SymbolCompare, "asset_id" | "symbol" | "name" | "priced">;
  asOf: string; // en güncel benchmark tarihi
  tradeCount: number;
}
