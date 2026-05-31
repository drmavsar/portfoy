// Sprint-5.6 PR-A — Benchmark Framework ortak tipler.

export type BenchmarkSeriesCode =
  | "XU100"
  | "XAUTRY"
  | "USDTRY"
  | "EURTRY"
  | "TLREF";

export interface BenchmarkPoint {
  /** YYYY-MM-DD */
  as_of: string;
  /** Numerik değer (XU100 puan, XAU TRY, USD/EUR TRY kuru, TLREF %/yıl) */
  value: number;
}

export type FundStatus = "active" | "delisted" | "suspended" | "new_listing";

export interface FundStatusEntry {
  fund_code: string;
  effective_from: string;        // YYYY-MM-DD
  effective_to: string | null;
  status: FundStatus;
  reason: string | null;
}
