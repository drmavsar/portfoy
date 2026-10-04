/* ============================================================
   Vergi yılı görünümü — saf hesap çekirdeği ("use server" YOK).

   Bir takvim yılı ve kişi için:
   - Alım-satım kazançları (FIFO gerçekleşen lotlar) vergi türüne göre:
       BIST hisse  → geçici 67, %0 stopaj, beyan yok
       HSYF        → %0 stopaj, beyan yok
       Stopajlı fon→ lot bazlı stopaj + yıl içi zarar mahsubu tahmini
   - Kâr payı (temettü): brüte çevirme, %50 istisna, beyan sınırı (GVK 86/1-c)
   - Konut kira geliri: istisna, götürü gider (%15), tahmini vergi (GVK 103)
   Tutarlar tahmindir; kesin beyan için mali müşavir.
   ============================================================ */

import {
  dividendWithholdingRate,
  progressiveIncomeTax,
  taxParamsFor,
  type TrTaxYearParams,
} from "@/lib/finance/tr-tax-params";

export interface TaxLot {
  closed_at: string;
  asset_symbol: string;
  asset_class: string;
  portfolio_id: string;
  beneficiary_id: string | null;
  proceeds_try: number;
  cost_basis_try: number;
  realized_pnl_try: number;
  withholding_try: number;
  applied_tax_kind: string | null;
  applied_tax_rate: number | null;
  manual_tax_override: boolean;
}

export interface TaxIncome {
  /** "YYYY-MM-DD" */
  occurred_on: string;
  /** Hesaba geçen (net) tutar, TRY */
  amount: number;
  kind: "dividend" | "rent";
  beneficiary_id: string | null;
}

export type TradingBucketKey = "BIST_HISSE" | "FON_HSYF" | "FON_STOPAJLI" | "FON_BELIRSIZ" | "DIGER";

export interface TradingBucket {
  key: TradingBucketKey;
  label: string;
  rule: string;
  lots: number;
  proceeds: number;
  cost: number;
  gains: number;
  losses: number;
  net: number;
  /** Lot bazında hesaplanan/kesilen stopaj (zarar mahsubu yok) */
  withholdingLot: number;
  /** Yıl içi aynı portföy ve oranda zarar mahsubu sonrası tahmini stopaj */
  withholdingNetted: number;
}

export interface SymbolPnl {
  symbol: string;
  bucket: TradingBucketKey;
  proceeds: number;
  net: number;
}

export interface DividendSummary {
  count: number;
  netReceived: number;
  gross: number;
  withheld: number;
  /** Brütün yarısı (GVK 22/2 istisnası sonrası) */
  declarablePart: number;
  threshold: number | null;
  mustDeclare: boolean | null;
}

export interface RentSummary {
  count: number;
  received: number;
  /** Cari yılda yıl sonu tahmini (kalan aylar son kirayla); geçmiş yılda = received */
  annualBasis: number;
  projected: boolean;
  istisna: number | null;
  eligible: boolean;
  taxableAfterIstisna: number;
  gotururGider: number;
  matrah: number;
  estTax: number | null;
  mustDeclare: boolean | null;
}

export interface TaxYearReport {
  year: number;
  params: TrTaxYearParams | null;
  /** Yıl henüz bitmedi */
  partialYear: boolean;
  buckets: TradingBucket[];
  tradingTotals: { proceeds: number; net: number; withholdingLot: number; withholdingNetted: number };
  symbols: SymbolPnl[];
  dividend: DividendSummary;
  rent: RentSummary;
  /** Beyan gerektiren kalemler (kısa açıklama) */
  declarations: string[];
}

const BUCKET_META: Record<TradingBucketKey, { label: string; rule: string }> = {
  BIST_HISSE: {
    label: "BIST hisse senedi",
    rule: "Geçici 67 · %0 stopaj · beyan yok",
  },
  FON_HSYF: {
    label: "Hisse senedi yoğun fon",
    rule: "%0 stopaj · beyan yok",
  },
  FON_STOPAJLI: {
    label: "Stopajlı fon",
    rule: "Stopaj nihai vergi · beyan yok",
  },
  FON_BELIRSIZ: {
    label: "Fon (oran belirsiz)",
    rule: "Döviz/serbest fon vb. · aracı kurum kesintisine bak",
  },
  DIGER: {
    label: "Diğer",
    rule: "Geçici 67 dışında · varlık türüne bağlı",
  },
};

const BUCKET_ORDER: TradingBucketKey[] = ["BIST_HISSE", "FON_HSYF", "FON_STOPAJLI", "FON_BELIRSIZ", "DIGER"];

export function bucketOf(lot: Pick<TaxLot, "asset_class" | "applied_tax_kind" | "applied_tax_rate">): TradingBucketKey {
  if (lot.asset_class === "equity_tr") return "BIST_HISSE";
  if (lot.asset_class === "fund") {
    if (lot.applied_tax_kind === "HSYF_0_STOPAJ") return "FON_HSYF";
    if (lot.applied_tax_rate != null) return lot.applied_tax_rate > 0 ? "FON_STOPAJLI" : "FON_HSYF";
    return "FON_BELIRSIZ";
  }
  return "DIGER";
}

/** Kategori adından vergi açısından gelir türü (temettü / kira). */
export function taxIncomeKindForCategory(name: string): TaxIncome["kind"] | null {
  const n = name.toLocaleLowerCase("tr-TR").replace(/â/g, "a");
  if (n.includes("temettü") || n.includes("kar payı")) return "dividend";
  if (n.includes("kira geliri") || n === "kira") return "rent";
  return null;
}

function emptyBucket(key: TradingBucketKey): TradingBucket {
  return {
    key,
    ...BUCKET_META[key],
    lots: 0,
    proceeds: 0,
    cost: 0,
    gains: 0,
    losses: 0,
    net: 0,
    withholdingLot: 0,
    withholdingNetted: 0,
  };
}

export interface TaxYearInput {
  year: number;
  /** "YYYY-MM-DD" (İstanbul) */
  today: string;
  lots: TaxLot[];
  incomes: TaxIncome[];
  /** null = tüm kişiler */
  beneficiaryId: string | null;
  /** Ücret + sermaye iratları toplamı üst sınırı aşıyorsa false */
  konutIstisnaEligible: boolean;
}

export function computeTaxYearReport(input: TaxYearInput): TaxYearReport {
  const { year, today } = input;
  const params = taxParamsFor(year);
  const prefix = String(year);
  const forPerson = (b: string | null) => input.beneficiaryId == null || b === input.beneficiaryId;
  const partialYear = today.slice(0, 4) === prefix;

  // ---- Alım-satım --------------------------------------------------------
  const buckets = new Map<TradingBucketKey, TradingBucket>();
  const symbols = new Map<string, SymbolPnl>();
  // Stopajlı fonlarda zarar mahsubu: aynı portföy (≈ aracı kurum) ve oran
  const netGroups = new Map<string, { pnl: number; rate: number }>();

  for (const l of input.lots) {
    if (!l.closed_at.startsWith(prefix) || !forPerson(l.beneficiary_id)) continue;
    const key = bucketOf(l);
    const b = buckets.get(key) ?? emptyBucket(key);
    const pnl = Number(l.realized_pnl_try);
    const wht = Number(l.withholding_try);
    b.lots += 1;
    b.proceeds += Number(l.proceeds_try);
    b.cost += Number(l.cost_basis_try);
    if (pnl >= 0) b.gains += pnl;
    else b.losses += -pnl;
    b.net += pnl;
    b.withholdingLot += wht;
    if (key === "FON_STOPAJLI" && !l.manual_tax_override && l.applied_tax_rate != null) {
      const gk = `${l.portfolio_id}|${l.applied_tax_rate}`;
      const g = netGroups.get(gk) ?? { pnl: 0, rate: Number(l.applied_tax_rate) };
      g.pnl += pnl;
      netGroups.set(gk, g);
    } else {
      // Manuel girilen (kesilmiş) stopaj ve %0/oransız lotlar olduğu gibi
      b.withholdingNetted += wht;
    }
    buckets.set(key, b);

    const s = symbols.get(l.asset_symbol) ?? { symbol: l.asset_symbol, bucket: key, proceeds: 0, net: 0 };
    s.proceeds += Number(l.proceeds_try);
    s.net += pnl;
    symbols.set(l.asset_symbol, s);
  }
  if (netGroups.size > 0) {
    const b = buckets.get("FON_STOPAJLI") ?? emptyBucket("FON_STOPAJLI");
    for (const g of netGroups.values()) b.withholdingNetted += Math.max(0, g.pnl) * g.rate;
    buckets.set("FON_STOPAJLI", b);
  }
  const bucketList = BUCKET_ORDER.filter((k) => buckets.has(k)).map((k) => buckets.get(k)!);
  const tradingTotals = bucketList.reduce(
    (a, b) => ({
      proceeds: a.proceeds + b.proceeds,
      net: a.net + b.net,
      withholdingLot: a.withholdingLot + b.withholdingLot,
      withholdingNetted: a.withholdingNetted + b.withholdingNetted,
    }),
    { proceeds: 0, net: 0, withholdingLot: 0, withholdingNetted: 0 },
  );

  // ---- Kâr payı ----------------------------------------------------------
  const divs = input.incomes.filter(
    (i) => i.kind === "dividend" && i.occurred_on.startsWith(prefix) && forPerson(i.beneficiary_id),
  );
  let divNet = 0;
  let divGross = 0;
  for (const d of divs) {
    const r = dividendWithholdingRate(d.occurred_on);
    divNet += d.amount;
    divGross += d.amount / (1 - r);
  }
  const declarablePart = divGross / 2;
  const dividend: DividendSummary = {
    count: divs.length,
    netReceived: divNet,
    gross: divGross,
    withheld: divGross - divNet,
    declarablePart,
    threshold: params?.tevkifatliIratBeyanSiniri ?? null,
    mustDeclare: params && divs.length > 0 ? declarablePart > params.tevkifatliIratBeyanSiniri : divs.length > 0 ? null : false,
  };

  // ---- Konut kira geliri -------------------------------------------------
  const rents = input.incomes.filter(
    (i) => i.kind === "rent" && i.occurred_on.startsWith(prefix) && forPerson(i.beneficiary_id),
  );
  const received = rents.reduce((s, r) => s + r.amount, 0);
  let annualBasis = received;
  let projected = false;
  if (partialYear && rents.length > 0) {
    // Kira bir sonraki artışa kadar sabittir: son tahsilat ayının tutarı ×
    // kalan ay. (Ortalama, yıl içi kira artışından sonra eksik tahmin eder;
    // bugünün ayını baz almak bu ayın kirası henüz gelmemişken yanıltır.)
    const lastMonth = Math.max(...rents.map((r) => Number(r.occurred_on.slice(5, 7))));
    const lastMonthAmount = rents
      .filter((r) => Number(r.occurred_on.slice(5, 7)) === lastMonth)
      .reduce((s, r) => s + r.amount, 0);
    const remaining = 12 - lastMonth;
    if (remaining > 0) {
      annualBasis = received + lastMonthAmount * remaining;
      projected = true;
    }
  }
  const istisna = params ? (input.konutIstisnaEligible ? params.konutKiraIstisna : 0) : null;
  const rentMustDeclare =
    rents.length === 0 ? false : istisna == null ? null : input.konutIstisnaEligible ? annualBasis > istisna : annualBasis > 0;
  const taxableAfterIstisna = istisna == null ? 0 : Math.max(0, annualBasis - istisna);
  const gotururGider = taxableAfterIstisna * 0.15;
  const matrah = taxableAfterIstisna - gotururGider;
  const rent: RentSummary = {
    count: rents.length,
    received,
    annualBasis,
    projected,
    istisna,
    eligible: input.konutIstisnaEligible,
    taxableAfterIstisna,
    gotururGider,
    matrah,
    estTax: params && rentMustDeclare ? progressiveIncomeTax(matrah, params) : params ? 0 : null,
    mustDeclare: rentMustDeclare,
  };

  // ---- Beyan özeti -------------------------------------------------------
  const declarations: string[] = [];
  if (rent.mustDeclare) declarations.push("Konut kira geliri (GMSİ)");
  if (dividend.mustDeclare) declarations.push("Kâr payı (MSİ) — beyan sınırını aşıyor");

  return {
    year,
    params,
    partialYear,
    buckets: bucketList,
    tradingTotals,
    symbols: [...symbols.values()].sort((a, b) => a.net - b.net),
    dividend,
    rent,
    declarations,
  };
}
