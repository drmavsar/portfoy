/* ============================================================
   Sample data — Türkçe örnek hane + portföy verileri.
   Üretim Supabase'den gelecek; bu modül UI'yi geliştirmek
   ve demo göstermek için kullanılır.
   ============================================================ */

export interface Person {
  id: string;
  name: string;
  role: "self" | "household" | "son" | "parents" | "spouse";
  color: string;
}

export const PEOPLE: Person[] = [
  { id: "mehmet", name: "Mehmet", role: "self", color: "#6ea8fe" },
  { id: "ev", name: "Ev / Ortak", role: "household", color: "#4cc9b0" },
  { id: "aburak", name: "Ahmet Burak", role: "son", color: "#d4a056" },
  { id: "salih", name: "Salih", role: "son", color: "#b388f2" },
  { id: "ebeveyn", name: "Anne / Baba", role: "parents", color: "#e26a8f" },
];

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const CATS: Category[] = [
  { id: "market", name: "Market", icon: "🛒", color: "#4cc9b0" },
  { id: "fatura", name: "Fatura", icon: "⚡", color: "#d29922" },
  { id: "kira", name: "Kira", icon: "🏠", color: "#6ea8fe" },
  { id: "egitim", name: "Eğitim", icon: "🎓", color: "#b388f2" },
  { id: "ulasim", name: "Ulaşım", icon: "🚌", color: "#a4cc4c" },
  { id: "saglik", name: "Sağlık", icon: "⚕", color: "#e26a8f" },
  { id: "restoran", name: "Restoran", icon: "🍽", color: "#d4a056" },
  { id: "abone", name: "Abonelik", icon: "🔁", color: "#6ea8fe" },
  { id: "giyim", name: "Giyim", icon: "👕", color: "#4cc9b0" },
  { id: "hediye", name: "Hediye", icon: "🎁", color: "#b388f2" },
  { id: "yatirim", name: "Yatırım", icon: "📈", color: "#2ea043" },
  { id: "akaryakit", name: "Akaryakıt", icon: "⛽", color: "#f85149" },
  { id: "ev", name: "Ev Eşyası", icon: "🛋", color: "#6ea8fe" },
  { id: "gelir", name: "Gelir", icon: "💰", color: "#2ea043" },
  { id: "diger", name: "Diğer", icon: "•", color: "#7d8699" },
];

export interface Account {
  id: string;
  name: string;
  kind: "bank" | "card" | "broker" | "crypto" | "safe";
  currency: string;
  balance?: number;
  limit?: number;
  owed?: number;
  last4?: string;
  custody?: string;
  statement_day?: number;
  due_day?: number;
}

export const ACCOUNTS: Account[] = [
  { id: "gbbva", name: "Garanti BBVA Vadesiz", kind: "bank", currency: "TRY", balance: 142800, last4: "****", custody: "Garanti BBVA" },
  { id: "gbbva-usd", name: "Garanti BBVA USD", kind: "bank", currency: "USD", balance: 8420, last4: "****", custody: "Garanti BBVA" },
  { id: "isbank", name: "İş Bankası Vadeli", kind: "bank", currency: "TRY", balance: 380000, last4: "****", custody: "İş Bankası" },
  { id: "cc-m", name: "Bonus Platinum (Mehmet)", kind: "card", currency: "TRY", limit: 180000, statement_day: 8, due_day: 28, owed: 42850, last4: "4471" },
  { id: "cc-ab", name: "Ek Kart — Ahmet Burak", kind: "card", currency: "TRY", limit: 35000, statement_day: 8, due_day: 28, owed: 11240, last4: "8902" },
  { id: "midas-m", name: "Midas — Ana", kind: "broker", currency: "TRY", balance: 0, custody: "Midas" },
  { id: "midas-ab", name: "Midas — Ahmet Burak", kind: "broker", currency: "TRY", balance: 0, custody: "Midas" },
  { id: "gkripto", name: "Garanti Kripto", kind: "crypto", currency: "TRY", balance: 0, custody: "Garanti Kripto" },
  { id: "kasa", name: "Ev Kasası (Fiziki)", kind: "safe", currency: "TRY", balance: 0, custody: "Kasa" },
];

export interface RecurringIncome {
  id: string;
  name: string;
  amount: number;
  day: number;
  account: string;
}
export const RECURRING_INCOME: RecurringIncome[] = [
  { id: "maas", name: "Maaş — EKU", amount: 84500, day: 5, account: "gbbva" },
  { id: "kira", name: "Kira — Beylikdüzü", amount: 28000, day: 1, account: "isbank" },
  { id: "emekli", name: "Emekli Maaşı", amount: 16800, day: 25, account: "gbbva" },
];

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  day: number;
  cat: string;
  ben: string;
}
export const RECURRING_EXP: RecurringExpense[] = [
  { id: "enerjisa", name: "Enerjisa — Elektrik", amount: 1840, day: 12, cat: "fatura", ben: "ev" },
  { id: "igdas", name: "İGDAŞ — Doğalgaz", amount: 2380, day: 15, cat: "fatura", ben: "ev" },
  { id: "iski", name: "İSKİ — Su", amount: 420, day: 18, cat: "fatura", ben: "ev" },
  { id: "tt", name: "Türk Telekom Fiber", amount: 799, day: 22, cat: "fatura", ben: "ev" },
  { id: "spotify", name: "Spotify Family", amount: 149, day: 3, cat: "abone", ben: "ev" },
  { id: "netflix", name: "Netflix Premium", amount: 389, day: 9, cat: "abone", ben: "ev" },
  { id: "aidat", name: "Site Aidatı", amount: 3200, day: 5, cat: "fatura", ben: "ev" },
  { id: "iyte-yurt", name: "İYTE Yurt — Ahmet Burak", amount: 4800, day: 10, cat: "egitim", ben: "aburak" },
];

export const KPIS = {
  netWorth: 4_842_180,
  netWorthDeltaDay: 18_420,
  netWorthDeltaMonth: 92_140,
  netWorthDeltaMonthPct: 1.94,
  netWorthDeltaYearPct: 38.2,
  netWorthYearAgo: 3_503_010,

  cashflowMonth: {
    income: 132_580,
    expense: 78_440,
    savings: 54_140,
    savingsPctChangeMoM: 12.4,
  },

  cashflowYear: {
    income: 1_582_000,
    expense: 942_000,
    savings: 640_000,
    incomePrevYear: 1_240_000,
    expensePrevYear: 738_000,
    savingsPrevYear: 502_000,
  },

  portfolioRealYTD: 14.8,
  portfolioNominalYTD: 38.2,
  cpiYTD: 22.1,
  benchmarks: [
    { name: "BIST100", ytd: 27.4 },
    { name: "USD", ytd: 31.2 },
    { name: "Altın", ytd: 42.6 },
    { name: "TÜFE", ytd: 22.1 },
  ],

  cardDebt: 54_090,
  cardDueDate: "28.05.2026",
  cardLimitPct: 25.1,

  // Bugünkü portföy değişimi
  todayPortfolioDelta: 24_180,
  todayPortfolioDeltaPct: 0.51,
};

function genSpark(start: number, end: number, n = 30, vol = 0.012): number[] {
  const arr: number[] = [];
  let v = start;
  const drift = (end - start) / n;
  for (let i = 0; i < n; i++) {
    v += drift + (Math.sin(i * 1.7) * vol + (Math.random() - 0.5) * vol) * start;
    arr.push(v);
  }
  arr[n - 1] = end;
  return arr;
}
export const NET_WORTH_SPARK = genSpark(4_750_040, 4_842_180, 30, 0.006);

export const MONTHS_TR = ["Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara", "Oca", "Şub", "Mar", "Nis", "May"];

export const CASHFLOW_12 = MONTHS_TR.map((m, i) => {
  const income = 122000 + Math.round(Math.sin(i * 0.7) * 6000 + i * 1200);
  const expense = 64000 + Math.round(Math.cos(i * 0.5) * 5000 + (i === 4 ? 12000 : 0) + (i === 8 ? 9000 : 0));
  return { month: m, income, expense, net: income - expense };
});

// Yıllar arası kıyas
export const YEARLY_COMPARE = [
  { year: "2023", income: 845_000, expense: 540_000, net: 305_000 },
  { year: "2024", income: 1_080_000, expense: 692_000, net: 388_000 },
  { year: "2025", income: 1_240_000, expense: 738_000, net: 502_000 },
  { year: "2026 (YTD)", income: 668_000, expense: 412_000, net: 256_000 },
];

export const BEN_SPEND = [
  { id: "ev", label: "Ev / Ortak", amount: 31_240, pct: 39.8 },
  { id: "mehmet", label: "Mehmet", amount: 14_680, pct: 18.7 },
  { id: "aburak", label: "Ahmet Burak", amount: 18_920, pct: 24.1 },
  { id: "salih", label: "Salih", amount: 8_400, pct: 10.7 },
  { id: "ebeveyn", label: "Anne / Baba", amount: 5_200, pct: 6.7 },
];

export const ALLOCATION = [
  { id: "hisse", label: "BIST Hisse", value: 1_624_300, color: "#6ea8fe" },
  { id: "usd", label: "USD Mevduat", value: 720_500, color: "#4cc9b0" },
  { id: "altin", label: "Altın", value: 612_400, color: "#d4a056" },
  { id: "eur", label: "EUR Mevduat", value: 384_200, color: "#a4cc4c" },
  { id: "kripto", label: "Kripto", value: 281_400, color: "#b388f2" },
  { id: "fon", label: "Yatırım Fonu", value: 189_700, color: "#e26a8f" },
  { id: "tahvil", label: "Tahvil/Eurobond", value: 142_600, color: "#f08a8a" },
  { id: "nakit", label: "Nakit (TRY)", value: 887_080, color: "#7d8699" },
];

export const TOP_WEEK = [
  { date: "13.05", merchant: "Migros 5M", cat: "market", ben: "ev", amount: 2840 },
  { date: "12.05", merchant: "OPET Petrol", cat: "akaryakit", ben: "mehmet", amount: 2200 },
  { date: "11.05", merchant: "Hepsiburada — Laptop Şarj", cat: "egitim", ben: "aburak", amount: 1690 },
  { date: "11.05", merchant: "Eczane Kerem", cat: "saglik", ben: "ebeveyn", amount: 1240 },
  { date: "10.05", merchant: "Lokanta Hünkar", cat: "restoran", ben: "mehmet", amount: 980 },
];

export interface Holding {
  sym: string;
  name: string;
  klass: "BIST" | "FX" | "Altın" | "Kripto" | "Fon";
  sub: string; // beneficiary id (Mehmet / Ahmet Burak / Salih / ...)
  custody: string;
  qty: number;
  wac: number;
  last: number;
  prev?: number; // dünkü kapanış — bugünkü K/Z için
  ccy: string;
  sector: string;
  w52h: number;
  w52l: number;
  sparkDir: 1 | -1;
}

export const HOLDINGS: Holding[] = [
  { sym: "ASELS", name: "Aselsan", klass: "BIST", sub: "mehmet", custody: "Midas", qty: 1200, wac: 72.30, last: 84.55, prev: 81.92, ccy: "TRY", sector: "Savunma", w52h: 88.20, w52l: 41.80, sparkDir: 1 },
  { sym: "THYAO", name: "Türk Hava Yolları", klass: "BIST", sub: "mehmet", custody: "Midas", qty: 800, wac: 284.50, last: 319.20, prev: 313.50, ccy: "TRY", sector: "Ulaştırma", w52h: 342.0, w52l: 180.0, sparkDir: 1 },
  { sym: "SISE", name: "Şişe Cam", klass: "BIST", sub: "mehmet", custody: "Midas", qty: 2000, wac: 42.80, last: 39.40, prev: 39.95, ccy: "TRY", sector: "Sanayi", w52h: 51.20, w52l: 33.60, sparkDir: -1 },
  { sym: "BIMAS", name: "BİM Mağazalar", klass: "BIST", sub: "mehmet", custody: "Garanti BBVA", qty: 400, wac: 412.00, last: 438.50, prev: 439.60, ccy: "TRY", sector: "Perakende", w52h: 460.0, w52l: 310.0, sparkDir: 1 },
  { sym: "EREGL", name: "Ereğli Demir Çelik", klass: "BIST", sub: "mehmet", custody: "Garanti BBVA", qty: 3500, wac: 48.60, last: 52.80, prev: 51.60, ccy: "TRY", sector: "Sanayi", w52h: 58.40, w52l: 34.20, sparkDir: 1 },
  { sym: "USD", name: "Dolar (USD)", klass: "FX", sub: "mehmet", custody: "Garanti BBVA", qty: 18500, wac: 28.40, last: 38.92, prev: 38.84, ccy: "TRY", sector: "Döviz", w52h: 39.10, w52l: 28.30, sparkDir: 1 },
  { sym: "EUR", name: "Euro (EUR)", klass: "FX", sub: "mehmet", custody: "Garanti BBVA", qty: 9000, wac: 32.60, last: 42.69, prev: 42.40, ccy: "TRY", sector: "Döviz", w52h: 42.90, w52l: 31.40, sparkDir: 1 },
  { sym: "XAU", name: "Gram Altın", klass: "Altın", sub: "mehmet", custody: "Kasa", qty: 180, wac: 1820.0, last: 3402.0, prev: 3388.5, ccy: "TRY", sector: "Emtia", w52h: 3450.0, w52l: 1840.0, sparkDir: 1 },
  { sym: "XAU-K", name: "Cumhuriyet Altını", klass: "Altın", sub: "mehmet", custody: "Kasa", qty: 24, wac: 13200, last: 24840, prev: 24760, ccy: "TRY", sector: "Emtia", w52h: 25200, w52l: 13400, sparkDir: 1 },
  { sym: "BTC", name: "Bitcoin", klass: "Kripto", sub: "mehmet", custody: "Garanti Kripto", qty: 0.42, wac: 1820000, last: 2480000, prev: 2436000, ccy: "TRY", sector: "Kripto", w52h: 2520000, w52l: 1240000, sparkDir: 1 },
  // Ahmet Burak
  { sym: "TUPRS", name: "Tüpraş", klass: "BIST", sub: "aburak", custody: "Midas", qty: 120, wac: 148.00, last: 172.40, prev: 170.20, ccy: "TRY", sector: "Enerji", w52h: 184.0, w52l: 110.0, sparkDir: 1 },
  { sym: "FROTO", name: "Ford Otosan", klass: "BIST", sub: "aburak", custody: "Midas", qty: 80, wac: 780.0, last: 842.0, prev: 836.5, ccy: "TRY", sector: "Otomotiv", w52h: 920.0, w52l: 620.0, sparkDir: 1 },
  { sym: "ETH", name: "Ethereum", klass: "Kripto", sub: "aburak", custody: "Garanti Kripto", qty: 1.8, wac: 68000, last: 92400, prev: 91200, ccy: "TRY", sector: "Kripto", w52h: 102000, w52l: 48000, sparkDir: 1 },
  // Salih
  { sym: "KOZAL", name: "Koza Altın", klass: "BIST", sub: "salih", custody: "Midas", qty: 60, wac: 28.20, last: 34.80, prev: 34.22, ccy: "TRY", sector: "Madencilik", w52h: 38.40, w52l: 19.80, sparkDir: 1 },
  { sym: "XAU-S", name: "Gram Altın (Salih)", klass: "Altın", sub: "salih", custody: "Kasa", qty: 12, wac: 2840, last: 3402, prev: 3388.5, ccy: "TRY", sector: "Emtia", w52h: 3450.0, w52l: 1840.0, sparkDir: 1 },
];

// İşlemler (hisse alım/satım defteri)
export interface Trade {
  id: string;
  date: string;
  sym: string;
  sub: string; // beneficiary
  custody: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fees: number;
  notes?: string;
}

export const TRADES: Trade[] = [
  { id: "t1", date: "14.05.2026", sym: "ASELS", sub: "mehmet", custody: "Midas", side: "buy", qty: 200, price: 82.40, fees: 24.5 },
  { id: "t2", date: "12.05.2026", sym: "THYAO", sub: "mehmet", custody: "Midas", side: "sell", qty: 100, price: 318.50, fees: 31.8, notes: "Kısmi kar realize" },
  { id: "t3", date: "08.05.2026", sym: "TUPRS", sub: "aburak", custody: "Midas", side: "buy", qty: 40, price: 168.20, fees: 8.4 },
  { id: "t4", date: "06.05.2026", sym: "EREGL", sub: "mehmet", custody: "Garanti BBVA", side: "buy", qty: 500, price: 49.20, fees: 14.8 },
  { id: "t5", date: "03.05.2026", sym: "BTC", sub: "mehmet", custody: "Garanti Kripto", side: "buy", qty: 0.05, price: 2_380_000, fees: 595 },
  { id: "t6", date: "28.04.2026", sym: "KOZAL", sub: "salih", custody: "Midas", side: "buy", qty: 30, price: 28.40, fees: 4.3 },
  { id: "t7", date: "22.04.2026", sym: "USD", sub: "mehmet", custody: "Garanti BBVA", side: "buy", qty: 2000, price: 32.18, fees: 0 },
  { id: "t8", date: "18.04.2026", sym: "BIMAS", sub: "mehmet", custody: "Garanti BBVA", side: "buy", qty: 100, price: 421.00, fees: 12.6 },
  { id: "t9", date: "15.04.2026", sym: "ETH", sub: "aburak", custody: "Garanti Kripto", side: "sell", qty: 0.4, price: 88_400, fees: 88.4 },
  { id: "t10", date: "12.04.2026", sym: "FROTO", sub: "aburak", custody: "Midas", side: "buy", qty: 40, price: 768.00, fees: 15.4 },
];

export const SCREENER = [
  { sym: "ASELS", name: "Aselsan", sector: "Savunma", comp: 92, tech: 94, fund: 88, rs: 89, dist52h: -4.1, volSurprise: 2.4, last: 84.55, chg: 3.2, flags: ["BREAKOUT", "SECTOR_LEADER"] },
  { sym: "THYAO", name: "Türk Hava Yolları", sector: "Ulaştırma", comp: 88, tech: 91, fund: 82, rs: 86, dist52h: -6.7, volSurprise: 1.8, last: 319.20, chg: 1.8, flags: ["SECTOR_LEADER"] },
  { sym: "TUPRS", name: "Tüpraş", sector: "Enerji", comp: 86, tech: 84, fund: 89, rs: 81, dist52h: -7.0, volSurprise: 1.4, last: 172.40, chg: 0.6, flags: ["DIVERGENCE"] },
  { sym: "FROTO", name: "Ford Otosan", sector: "Otomotiv", comp: 84, tech: 86, fund: 81, rs: 84, dist52h: -8.5, volSurprise: 1.2, last: 842.00, chg: 1.1, flags: [] },
  { sym: "KCHOL", name: "Koç Holding", sector: "Holding", comp: 82, tech: 79, fund: 86, rs: 76, dist52h: -3.2, volSurprise: 1.6, last: 184.30, chg: 0.4, flags: ["BREAKOUT"] },
  { sym: "BIMAS", name: "BİM Mağazalar", sector: "Perakende", comp: 81, tech: 78, fund: 85, rs: 74, dist52h: -4.7, volSurprise: 0.9, last: 438.50, chg: -0.2, flags: [] },
  { sym: "EREGL", name: "Ereğli Demir", sector: "Sanayi", comp: 78, tech: 82, fund: 73, rs: 79, dist52h: -10.0, volSurprise: 2.8, last: 52.80, chg: 2.4, flags: ["VOLUME_SURGE"] },
  { sym: "KOZAL", name: "Koza Altın", sector: "Madencilik", comp: 76, tech: 84, fund: 64, rs: 88, dist52h: -9.4, volSurprise: 1.5, last: 34.80, chg: 1.7, flags: ["DIVERGENCE"] },
  { sym: "TCELL", name: "Turkcell", sector: "Telekom", comp: 74, tech: 71, fund: 78, rs: 72, dist52h: -5.8, volSurprise: 0.7, last: 92.10, chg: 0.3, flags: [] },
  { sym: "GARAN", name: "Garanti BBVA", sector: "Banka", comp: 72, tech: 68, fund: 79, rs: 70, dist52h: -8.2, volSurprise: 0.6, last: 124.40, chg: -0.4, flags: [] },
  { sym: "AKBNK", name: "Akbank", sector: "Banka", comp: 70, tech: 66, fund: 76, rs: 68, dist52h: -9.5, volSurprise: 0.5, last: 72.20, chg: -0.6, flags: [] },
  { sym: "SAHOL", name: "Sabancı Holding", sector: "Holding", comp: 69, tech: 71, fund: 67, rs: 73, dist52h: -7.3, volSurprise: 0.8, last: 98.60, chg: 0.7, flags: [] },
  { sym: "SISE", name: "Şişe Cam", sector: "Sanayi", comp: 64, tech: 60, fund: 71, rs: 62, dist52h: -23.0, volSurprise: 0.5, last: 39.40, chg: -1.4, flags: ["BASE_FORMING"] },
  { sym: "KRDMD", name: "Kardemir", sector: "Sanayi", comp: 62, tech: 66, fund: 56, rs: 71, dist52h: -12.5, volSurprise: 1.9, last: 28.40, chg: 1.1, flags: [] },
  { sym: "PETKM", name: "Petkim", sector: "Kimya", comp: 60, tech: 58, fund: 64, rs: 60, dist52h: -14.0, volSurprise: 0.6, last: 19.84, chg: 0.2, flags: [] },
];

export const SECTORS_1M = [
  { code: "XSVNM", name: "Savunma", chg: 18.4 },
  { code: "XULAS", name: "Ulaştırma", chg: 12.1 },
  { code: "XHOLD", name: "Holding", chg: 8.6 },
  { code: "XGIDA", name: "Gıda", chg: 6.2 },
  { code: "XKMYA", name: "Kimya", chg: 3.1 },
  { code: "XBANK", name: "Banka", chg: 1.2 },
  { code: "XELKT", name: "Elektrik", chg: -1.4 },
  { code: "XINSA", name: "İnşaat", chg: -3.6 },
  { code: "XGMYO", name: "GMYO", chg: -5.2 },
];

export const CORR_SYMS = ["ASELS", "THYAO", "SISE", "BIMAS", "USD", "XAU", "BTC"];
export const CORR = [
  [1.00, 0.62, 0.34, 0.41, -0.18, -0.22, 0.05],
  [0.62, 1.00, 0.28, 0.36, -0.12, -0.20, 0.08],
  [0.34, 0.28, 1.00, 0.22, -0.08, -0.14, 0.02],
  [0.41, 0.36, 0.22, 1.00, -0.21, -0.10, 0.00],
  [-0.18, -0.12, -0.08, -0.21, 1.00, 0.61, 0.34],
  [-0.22, -0.20, -0.14, -0.10, 0.61, 1.00, 0.18],
  [0.05, 0.08, 0.02, 0.00, 0.34, 0.18, 1.00],
];

export interface Tx {
  date: string;
  acc: string;
  merchant: string;
  amount: number;
  dir: "in" | "out";
  cat: string;
  ben: string;
  conf: number;
  inst: string | null;
}

export const TX_BASE: Tx[] = [
  { date: "15.05.2026", acc: "cc-m", merchant: "MIGROS JET 5M ATAŞEHIR", amount: 1240.50, dir: "out", cat: "market", ben: "ev", conf: 99, inst: null },
  { date: "15.05.2026", acc: "cc-ab", merchant: "A101 IYTE GULBAHCE", amount: 184.20, dir: "out", cat: "market", ben: "aburak", conf: 99, inst: null },
  { date: "14.05.2026", acc: "cc-m", merchant: "OPET KOZYATAGI", amount: 2200.00, dir: "out", cat: "akaryakit", ben: "mehmet", conf: 97, inst: null },
  { date: "14.05.2026", acc: "cc-m", merchant: "HEPSIBURADA — LAPTOP SARJ", amount: 1690.00, dir: "out", cat: "egitim", ben: "aburak", conf: 74, inst: null },
  { date: "13.05.2026", acc: "cc-ab", merchant: "IZBAN AYLIK", amount: 385.00, dir: "out", cat: "ulasim", ben: "aburak", conf: 99, inst: null },
  { date: "13.05.2026", acc: "cc-m", merchant: "ENERJISA OTOMATIK ODEME", amount: 1842.30, dir: "out", cat: "fatura", ben: "ev", conf: 99, inst: null },
  { date: "12.05.2026", acc: "cc-m", merchant: "ECZANE KEREM KADIKOY", amount: 1240.00, dir: "out", cat: "saglik", ben: "ebeveyn", conf: 62, inst: null },
  { date: "12.05.2026", acc: "cc-m", merchant: "STARBUCKS BAGDAT CD", amount: 198.00, dir: "out", cat: "restoran", ben: "mehmet", conf: 95, inst: null },
  { date: "11.05.2026", acc: "gbbva", merchant: "MAAS — EKU TEKNOLOJI", amount: 84500.00, dir: "in", cat: "gelir", ben: "mehmet", conf: 100, inst: null },
  { date: "10.05.2026", acc: "cc-m", merchant: "TURK TELEKOM FATURA", amount: 799.00, dir: "out", cat: "fatura", ben: "ev", conf: 99, inst: null },
  { date: "09.05.2026", acc: "cc-m", merchant: "IKEA KARTAL TAKSIT 1/6", amount: 4380.00, dir: "out", cat: "ev", ben: "ev", conf: 88, inst: "1/6" },
  { date: "08.05.2026", acc: "cc-ab", merchant: "BURGER KING IYTE", amount: 240.00, dir: "out", cat: "restoran", ben: "aburak", conf: 99, inst: null },
  { date: "07.05.2026", acc: "cc-m", merchant: "NETFLIX.COM", amount: 389.00, dir: "out", cat: "abone", ben: "ev", conf: 99, inst: null },
];

export interface Rule {
  id: string;
  prio: number;
  name: string;
  match: string;
  action: string;
  hits: number;
  last: string;
}

export const RULES: Rule[] = [
  { id: "r1", prio: 1, name: "İYTE bölgesi → Ahmet Burak", match: 'merchant LIKE "%IYTE%"', action: "beneficiary = Ahmet Burak", hits: 142, last: "12.05.2026" },
  { id: "r2", prio: 2, name: "Migros / A101 / BIM → Market", match: "merchant IN (MIGROS, A101, BIM, CARREFOUR)", action: "category = Market", hits: 248, last: "15.05.2026" },
  { id: "r3", prio: 3, name: "Enerjisa otomatik fatura", match: 'merchant LIKE "ENERJISA%"', action: "category = Fatura · transfer = false", hits: 12, last: "13.05.2026" },
  { id: "r4", prio: 4, name: "Eczane → Anne / Baba", match: 'merchant LIKE "ECZ%" AND amount > 800', action: "beneficiary = Anne / Baba", hits: 6, last: "12.05.2026" },
  { id: "r5", prio: 5, name: "Netflix / Spotify / BluTV abonelik", match: "merchant IN (NETFLIX, SPOTIFY, BLUTV)", action: "category = Abonelik · beneficiary = Ev", hits: 18, last: "07.05.2026" },
  { id: "r6", prio: 6, name: "Maaş gelir transferi", match: 'description LIKE "%MAAS%" AND dir = in', action: "category = Gelir · beneficiary = Mehmet", hits: 11, last: "11.05.2026" },
];

export const KAP_STREAM = [
  { time: "14:32", sym: "ASELS", title: "Genel Müdür değişikliği — Yönetim Kurulu kararı", polarity: "neutral", summary: "Yeni Genel Müdür ataması açıklandı. Operasyonel etkisi sınırlı." },
  { time: "13:18", sym: "THYAO", title: "Nisan 2026 Trafik Sonuçları", polarity: "positive", summary: "Yolcu sayısı YoY +%14, doluluk %84. Konsensüs üstü." },
  { time: "11:45", sym: "TUPRS", title: "Genel Kurul — Temettü ödemesi", polarity: "positive", summary: "Brüt 24,80 ₺/lot temettü açıklandı. Verim ~%14." },
  { time: "10:02", sym: "EREGL", title: "Hammadde fiyatları — Bilgilendirme", polarity: "neutral", summary: "Demir cevheri kontrat fiyatları güncel verildi." },
  { time: "09:14", sym: "BIMAS", title: "Aylık satış güncellemesi", polarity: "positive", summary: "Mağaza-kıyasında satış %22 reel büyüme." },
] as const;

export const TWEETS = [
  { handle: "@btcompass", verified: true, time: "2s", sym: "ASELS", text: "Aselsan teknik kırılım: 84,55 günlük direnci hacimle geçti. Sonraki hedef 96 bandı." },
  { handle: "@piyasayorum", verified: true, time: "14d", sym: "THYAO", text: "THYAO trafik raporu beklenti üzeri — doluluk geçen yılı geçti, yaz dönemine güçlü giriş." },
  { handle: "@analizci_TR", verified: false, time: "42d", sym: "TUPRS", text: "TUPRS temettü verimi BIST ortalamasının 3 katı. Defansif pozisyon için klasik aday." },
  { handle: "@borsadan", verified: true, time: "1s", sym: "KOZAL", text: "Altın yükselişiyle KOZAL son 5 günde hacimde uyandı. RS skoru iyiye gidiyor." },
];

export const CAT_SPEND_YEAR = [
  { id: "market", pct: 28.4, amount: 268_400 },
  { id: "fatura", pct: 14.2, amount: 134_100 },
  { id: "kira", pct: 12.8, amount: 120_500 },
  { id: "egitim", pct: 11.6, amount: 109_300 },
  { id: "akaryakit", pct: 7.4, amount: 69_800 },
  { id: "restoran", pct: 6.8, amount: 64_200 },
  { id: "saglik", pct: 4.9, amount: 46_200 },
  { id: "ulasim", pct: 4.2, amount: 39_500 },
  { id: "abone", pct: 3.1, amount: 29_200 },
  { id: "diger", pct: 6.6, amount: 62_300 },
];

export const REAL_VS_NOM = {
  labels: ["Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara", "Oca", "Şub", "Mar", "Nis", "May"],
  port: [100, 104.2, 108.1, 113.8, 117.4, 121.9, 125.6, 130.4, 133.0, 134.6, 135.9, 138.2],
  cpi: [100, 102.0, 104.2, 106.5, 108.1, 110.0, 112.1, 114.4, 116.2, 118.5, 120.7, 122.1],
  usd: [100, 103.4, 106.8, 110.2, 114.6, 117.9, 121.4, 124.8, 126.2, 128.4, 130.1, 131.2],
  xau: [100, 106.0, 110.8, 116.4, 121.2, 127.8, 132.4, 136.5, 138.4, 140.2, 141.6, 142.6],
  bist: [100, 101.4, 104.6, 107.8, 110.4, 113.2, 116.6, 119.4, 121.8, 124.4, 126.1, 127.4],
};
