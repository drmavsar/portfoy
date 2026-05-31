// Sprint-5.6 PR-A — Benchmark series candidate listesi.
//
// User EVDS validation doc'unu doldurmadan PR-A başladığı için, her seri
// için 3 aday EVDS series code'u burada listeli. series-validator runtime'da
// her birini dener, hangisi veri döndürürse onu kullanır.
//
// Kullanıcı sonradan doc'u doldurursa ya da test sonucu net olursa, bu
// listenin ilk elemanı kalır (validator zaten hızlıca doğru olanı seçer).

import type { BenchmarkSeriesCode } from "./types";

export interface BenchmarkSeriesCandidate {
  code: BenchmarkSeriesCode;
  description: string;
  /** Öncelik sıralı EVDS series code adayları. */
  candidates: string[];
  /** false → PR-A başarısızlıkta KPPF fallback kullanılır. */
  required: boolean;
  /** "avg" | "last" | "first" — EVDS aggregation hint. */
  aggregation?: "avg" | "last" | "first";
  /** Birim notu (kuruş ise /100 — PR-A bunu otomatik hesaplar mı? Şimdilik manuel). */
  unitNote?: string;
}

export const BENCHMARK_CANDIDATES: BenchmarkSeriesCandidate[] = [
  {
    code: "XU100",
    description: "BIST 100 Endeksi Kapanış",
    candidates: ["TP.MK.F.BIST100", "TP.BIST100", "BIST.YHM.BST100"],
    required: true,
    aggregation: "last",
  },
  {
    code: "XAUTRY",
    description: "Gram altın TRY (kapanış)",
    candidates: ["TP.MK.F.GA", "TP.MK.CUM.YTL", "TP.AB.B6"],
    required: true,
    aggregation: "last",
    unitNote: "Eğer kuruş cinsindense /100 yapılmalı — PR-A sonrası unit-check",
  },
  {
    code: "USDTRY",
    description: "USD/TRY döviz alış",
    candidates: ["TP.DK.USD.A.YTL", "TP.DK.USD.A", "TP.DK.USD.S.YTL"],
    required: true,
    aggregation: "last",
  },
  {
    code: "EURTRY",
    description: "EUR/TRY döviz alış",
    candidates: ["TP.DK.EUR.A.YTL", "TP.DK.EUR.A", "TP.DK.EUR.S.YTL"],
    required: true,
    aggregation: "last",
  },
  {
    code: "TLREF",
    description: "Türk Lirası Gecelik Referans Faiz Oranı",
    candidates: ["TP.TLREF", "TP.PR.MT01", "TP.GECELIK.TLREF"],
    required: false,
    aggregation: "last",
  },
];

export function findCandidate(code: BenchmarkSeriesCode): BenchmarkSeriesCandidate | null {
  return BENCHMARK_CANDIDATES.find((c) => c.code === code) ?? null;
}
