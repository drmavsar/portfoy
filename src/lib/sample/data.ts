/* ============================================================
   Sample data v2 — claude/design çıktısı + brief v2 sayıları
   ============================================================ */

export interface Person {
  id: string;
  name: string;
  role: "self" | "household" | "son" | "parent" | "spouse";
  color: string;
}

// "Ben" başta, Anne/Baba ayrı
export const PEOPLE: Person[] = [
  { id: "ben", name: "Ben", role: "self", color: "#6ea8fe" },
  { id: "aburak", name: "Ahmet Burak", role: "son", color: "#d4a056" },
  { id: "salih", name: "Salih", role: "son", color: "#b388f2" },
  { id: "anne", name: "Anne", role: "parent", color: "#e26a8f" },
  { id: "baba", name: "Baba", role: "parent", color: "#4cc9b0" },
  { id: "ev", name: "Ev / Ortak", role: "household", color: "#a4cc4c" },
];

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income";
}

export const CATS: Category[] = [
  { id: "market", name: "Market", icon: "🛒", color: "#4cc9b0", kind: "expense" },
  { id: "fatura", name: "Fatura", icon: "⚡", color: "#d29922", kind: "expense" },
  { id: "kira", name: "Kira", icon: "🏠", color: "#6ea8fe", kind: "expense" },
  { id: "egitim", name: "Eğitim", icon: "🎓", color: "#b388f2", kind: "expense" },
  { id: "ulasim", name: "Ulaşım", icon: "🚌", color: "#a4cc4c", kind: "expense" },
  { id: "saglik", name: "Sağlık", icon: "⚕", color: "#e26a8f", kind: "expense" },
  { id: "restoran", name: "Restoran", icon: "🍽", color: "#d4a056", kind: "expense" },
  { id: "abone", name: "Abonelik", icon: "🔁", color: "#6ea8fe", kind: "expense" },
  { id: "giyim", name: "Giyim", icon: "👕", color: "#4cc9b0", kind: "expense" },
  { id: "hediye", name: "Hediye", icon: "🎁", color: "#b388f2", kind: "expense" },
  { id: "akaryakit", name: "Akaryakıt", icon: "⛽", color: "#f85149", kind: "expense" },
  { id: "ev", name: "Ev Eşyası", icon: "🛋", color: "#6ea8fe", kind: "expense" },
  { id: "tatil", name: "Tatil", icon: "🏖", color: "#d4a056", kind: "expense" },
  { id: "diger", name: "Diğer", icon: "•", color: "#7d8699", kind: "expense" },
  { id: "maas", name: "Maaş", icon: "💼", color: "#2ea043", kind: "income" },
  { id: "kira-gel", name: "Kira Geliri", icon: "🔑", color: "#4cc9b0", kind: "income" },
  { id: "emekli", name: "Emekli Maaşı", icon: "🪪", color: "#6ea8fe", kind: "income" },
  { id: "ikramiye", name: "Emekli İkramiyesi", icon: "✨", color: "#d4a056", kind: "income" },
  { id: "prim", name: "Prim", icon: "🎯", color: "#a4cc4c", kind: "income" },
  { id: "temettu", name: "Temettü", icon: "📈", color: "#b388f2", kind: "income" },
];

export interface Bank {
  id: string;
  name: string;
  color: string;
  short: string;
  isPerson?: boolean;
  isPhysical?: boolean;
}

export const BANKS: Bank[] = [
  { id: "garanti", name: "Garanti BBVA", color: "#0a8a4d", short: "GAR" },
  { id: "isbank", name: "İş Bankası", color: "#1d3a8a", short: "İŞB" },
  { id: "aburak-b", name: "Ahmet Burak", color: "#d4a056", short: "AB", isPerson: true },
  { id: "midas", name: "Midas", color: "#6ea8fe", short: "MDS" },
  { id: "gkripto", name: "Garanti Kripto", color: "#b388f2", short: "GKR" },
  { id: "kasa", name: "Ev (Fiziki)", color: "#d4a056", short: "KSA", isPhysical: true },
];

export type SubType = "vadesiz" | "vadeli" | "dolar" | "euro" | "altin" | "yatirim" | "kripto";

export interface Account {
  id: string;
  bank: string;
  name: string;
  subtype: SubType;
  ccy: string;
  iban: string;
  balance_try: number;
  raw: { v: number; ccy: string } | null;
  owner: string;
}

export const ACCOUNTS: Account[] = [
  // Garanti (3.761.082,53 ₺)
  { id: "g-vad", bank: "garanti", name: "Vadesiz", subtype: "vadesiz", ccy: "TRY", iban: "TR45 0006 2000 1234 0006 2987 65", balance_try: 142_800, raw: null, owner: "ben" },
  { id: "g-tl-vad", bank: "garanti", name: "TL Vadeli", subtype: "vadeli", ccy: "TRY", iban: "TR45 0006 2000 1234 0006 2987 70", balance_try: 1_280_000, raw: null, owner: "ben" },
  { id: "g-usd", bank: "garanti", name: "Dolar Mevduat", subtype: "dolar", ccy: "USD", iban: "TR45 0006 2000 1234 0091 2987 80", balance_try: 720_500, raw: { v: 18505, ccy: "USD" }, owner: "ben" },
  { id: "g-eur", bank: "garanti", name: "Euro Mevduat", subtype: "euro", ccy: "EUR", iban: "TR45 0006 2000 1234 0098 2987 90", balance_try: 384_200, raw: { v: 9000, ccy: "EUR" }, owner: "ben" },
  { id: "g-altin", bank: "garanti", name: "Altın Hesap", subtype: "altin", ccy: "XAU", iban: "TR45 0006 2000 1234 0099 2987 11", balance_try: 612_400, raw: { v: 180, ccy: "gr" }, owner: "ben" },
  { id: "g-yat", bank: "garanti", name: "Yatırım Hesabı", subtype: "yatirim", ccy: "TRY", iban: "TR45 0006 2000 1234 0095 2987 22", balance_try: 621_182.53, raw: null, owner: "ben" },
  // İş Bankası
  { id: "i-vad", bank: "isbank", name: "Vadesiz", subtype: "vadesiz", ccy: "TRY", iban: "TR98 0006 4000 0011 2345 6789 01", balance_try: 20_000, raw: null, owner: "ben" },
  // Ahmet Burak (ABA prefix)
  { id: "ab-vad", bank: "aburak-b", name: "ABA Vadesiz", subtype: "vadesiz", ccy: "TRY", iban: "TR12 0006 2000 1234 0044 3832 70", balance_try: 88_240, raw: null, owner: "aburak" },
  { id: "ab-usd", bank: "aburak-b", name: "ABA Dolar", subtype: "dolar", ccy: "USD", iban: "TR12 0006 2000 1234 0048 3832 71", balance_try: 142_840, raw: { v: 3670, ccy: "USD" }, owner: "aburak" },
  { id: "ab-altin", bank: "aburak-b", name: "ABA Altın", subtype: "altin", ccy: "XAU", iban: "TR12 0006 2000 1234 0049 3832 72", balance_try: 78_280, raw: { v: 23, ccy: "gr" }, owner: "aburak" },
  { id: "ab-yat", bank: "aburak-b", name: "ABA Yatırım (Midas)", subtype: "yatirim", ccy: "TRY", iban: "—", balance_try: 134_472.70, raw: null, owner: "aburak" },
  // Midas
  { id: "m-yat", bank: "midas", name: "Yatırım Hesabı", subtype: "yatirim", ccy: "TRY", iban: "—", balance_try: 129_011.28, raw: null, owner: "ben" },
  // Garanti Kripto
  { id: "gk-bt", bank: "gkripto", name: "BTC", subtype: "kripto", ccy: "BTC", iban: "—", balance_try: 1_041_600, raw: { v: 0.42, ccy: "BTC" }, owner: "ben" },
  { id: "gk-eth", bank: "gkripto", name: "ETH", subtype: "kripto", ccy: "ETH", iban: "—", balance_try: 166_320, raw: { v: 1.8, ccy: "ETH" }, owner: "aburak" },
];

export interface GoldItem {
  id: string;
  kind: "gold24k" | "ceyrek" | "cumhuriyet" | "bilezik";
  label: string;
  count: number;
  unit_price: number;
  beneficiary: string;
  notes?: string;
}

export const GOLD_PRICES = { gold24k: 3402, ceyrek: 5710, cumhuriyet: 24840, bilezik: 3210 };
export const GOLD_ITEMS: GoldItem[] = [
  { id: "g1", kind: "gold24k", label: "Gram Altın (24K)", count: 96, unit_price: GOLD_PRICES.gold24k, beneficiary: "ben", notes: "külçe + gram" },
  { id: "g2", kind: "ceyrek", label: "Çeyrek Altın", count: 38, unit_price: GOLD_PRICES.ceyrek, beneficiary: "ev", notes: "düğün + hediye" },
  { id: "g3", kind: "cumhuriyet", label: "Cumhuriyet Altını", count: 6, unit_price: GOLD_PRICES.cumhuriyet, beneficiary: "ben", notes: "kasa" },
  { id: "g4", kind: "bilezik", label: "Bilezik (gr karşılık)", count: 16, unit_price: GOLD_PRICES.bilezik, beneficiary: "anne", notes: "18 ayar — hesaplanmış gr" },
];

export const FX_QUOTES = [
  { pair: "USD/TRY", last: 38.92, chg: +0.18, chgPct: +0.46 },
  { pair: "EUR/TRY", last: 42.69, chg: -0.04, chgPct: -0.09 },
  { pair: "GRA/TRY", last: 3402.00, chg: +14.00, chgPct: +0.41 },
  { pair: "BTC/USD", last: 63840, chg: -340, chgPct: -0.53 },
  { pair: "XU100", last: 11248, chg: +24, chgPct: +0.21 },
];

export interface Holding {
  sym: string;
  name: string;
  klass: "BIST" | "FX" | "Altın" | "Kripto";
  sub: string;
  custody: string;
  qty: number;
  wac: number;
  last: number;
  ccy: string;
  sector: string;
  w52h: number;
  w52l: number;
  chgDay: number;
  sparkDir: 1 | -1;
}

export const HOLDINGS: Holding[] = [
  { sym: "ASELS", name: "Aselsan", klass: "BIST", sub: "ben", custody: "Garanti BBVA", qty: 1200, wac: 72.30, last: 84.55, ccy: "TRY", sector: "Savunma", w52h: 88.20, w52l: 41.80, chgDay: +3.2, sparkDir: 1 },
  { sym: "BIMAS", name: "BİM Mağazalar", klass: "BIST", sub: "ben", custody: "Garanti BBVA", qty: 400, wac: 412.00, last: 438.50, ccy: "TRY", sector: "Perakende", w52h: 460.0, w52l: 310.0, chgDay: -0.2, sparkDir: 1 },
  { sym: "EREGL", name: "Ereğli Demir", klass: "BIST", sub: "ben", custody: "Garanti BBVA", qty: 3500, wac: 48.60, last: 52.80, ccy: "TRY", sector: "Sanayi", w52h: 58.40, w52l: 34.20, chgDay: +2.4, sparkDir: 1 },
  { sym: "THYAO", name: "Türk Hava Yolları", klass: "BIST", sub: "ben", custody: "Midas", qty: 800, wac: 284.50, last: 319.20, ccy: "TRY", sector: "Ulaştırma", w52h: 342.0, w52l: 180.0, chgDay: +1.8, sparkDir: 1 },
  { sym: "SISE", name: "Şişe Cam", klass: "BIST", sub: "ben", custody: "Midas", qty: 2000, wac: 42.80, last: 39.40, ccy: "TRY", sector: "Sanayi", w52h: 51.20, w52l: 33.60, chgDay: -1.4, sparkDir: -1 },
  { sym: "TUPRS", name: "Tüpraş", klass: "BIST", sub: "aburak", custody: "Midas", qty: 120, wac: 148.00, last: 172.40, ccy: "TRY", sector: "Enerji", w52h: 184.0, w52l: 110.0, chgDay: +0.6, sparkDir: 1 },
  { sym: "FROTO", name: "Ford Otosan", klass: "BIST", sub: "aburak", custody: "Midas", qty: 80, wac: 780.0, last: 842.0, ccy: "TRY", sector: "Otomotiv", w52h: 920.0, w52l: 620.0, chgDay: +1.1, sparkDir: 1 },
  { sym: "KOZAL", name: "Koza Altın", klass: "BIST", sub: "salih", custody: "Midas", qty: 60, wac: 28.20, last: 34.80, ccy: "TRY", sector: "Madencilik", w52h: 38.40, w52l: 19.80, chgDay: +1.7, sparkDir: 1 },
  { sym: "BTC", name: "Bitcoin", klass: "Kripto", sub: "ben", custody: "Garanti Kripto", qty: 0.42, wac: 1_820_000, last: 2_480_000, ccy: "TRY", sector: "Kripto", w52h: 2_520_000, w52l: 1_240_000, chgDay: -0.5, sparkDir: 1 },
  { sym: "ETH", name: "Ethereum", klass: "Kripto", sub: "aburak", custody: "Garanti Kripto", qty: 1.8, wac: 68_000, last: 92_400, ccy: "TRY", sector: "Kripto", w52h: 102_000, w52l: 48_000, chgDay: +1.4, sparkDir: 1 },
];

interface Mover {
  sym: string;
  name: string;
  sub: string;
  qty: number;
  wac: number;
  last: number;
  plToday: number;
  plTotal: number;
  plPct: number;
  chgDay: number;
}

function buildMovers(): { winners: Mover[]; losers: Mover[] } {
  const enrich = (h: Holding): Mover => ({
    sym: h.sym, name: h.name, sub: h.sub, qty: h.qty, wac: h.wac, last: h.last,
    plToday: h.qty * h.last * (h.chgDay / 100),
    plTotal: h.qty * (h.last - h.wac),
    plPct: ((h.last - h.wac) / h.wac) * 100,
    chgDay: h.chgDay,
  });
  const winners = HOLDINGS.filter((h) => h.chgDay >= 0).map(enrich).sort((a, b) => b.plToday - a.plToday).slice(0, 3);
  const losers = HOLDINGS.filter((h) => h.chgDay < 0).map(enrich).sort((a, b) => a.plToday - b.plToday).slice(0, 3);
  return { winners, losers };
}
export const TODAY_MOVERS = buildMovers();

export const BANK_TOTALS: Record<string, number> = ACCOUNTS.reduce((acc, a) => {
  acc[a.bank] = (acc[a.bank] ?? 0) + a.balance_try;
  return acc;
}, {} as Record<string, number>);
export const GOLD_TOTAL = GOLD_ITEMS.reduce((s, g) => s + g.count * g.unit_price, 0);
export const PORTFOLIO_TOTAL = Object.values(BANK_TOTALS).reduce((s, v) => s + v, 0) + GOLD_TOTAL;

export const KPIS = {
  netWorth: PORTFOLIO_TOTAL,
  netWorthDeltaDay: 18_420,
  netWorthDeltaDayPct: 0.36,
  netWorthDeltaMonth: 92_140,
  netWorthDeltaMonthPct: 1.94,

  portfolioToday: TODAY_MOVERS.winners.reduce((s, w) => s + w.plToday, 0) + TODAY_MOVERS.losers.reduce((s, l) => s + l.plToday, 0),
  portfolioTodayPct: 1.4,

  cashflowMonth: {
    income: 132_580,
    expense: 78_440,
    savings: 54_140,
    savingsPctChangeMoM: 12.4,
  },
  portfolioRealYTD: 14.8,
  portfolioNominalYTD: 38.2,
  cpiYTD: 22.1,
  benchmarks: [
    { name: "BIST100", ytd: 27.4 },
    { name: "USD", ytd: 31.2 },
    { name: "XAU", ytd: 42.6 },
    { name: "TÜFE", ytd: 22.1 },
  ],
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
export const NET_WORTH_SPARK = genSpark(4_750_040, PORTFOLIO_TOTAL, 30, 0.006);

export const MONTHS_TR = ["Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara", "Oca", "Şub", "Mar", "Nis", "May"];
export const CASHFLOW_12 = MONTHS_TR.map((m, i) => {
  const income = 122000 + Math.round(Math.sin(i * 0.7) * 6000 + i * 1200);
  const expense = 64000 + Math.round(Math.cos(i * 0.5) * 5000 + (i === 4 ? 12000 : 0) + (i === 8 ? 9000 : 0));
  return { month: m, income, expense, net: income - expense };
});

export const YEARLY = [
  { year: 2023, income: 980_000, expense: 612_000, net: 368_000 },
  { year: 2024, income: 1_240_000, expense: 742_000, net: 498_000 },
  { year: 2025, income: 1_512_000, expense: 884_000, net: 628_000 },
  { year: 2026, income: 648_000, expense: 384_000, net: 264_000, ytd: true },
];

export const BEN_SPEND = [
  { id: "ev", label: "Ev / Ortak", amount: 31_240, pct: 39.8 },
  { id: "ben", label: "Ben", amount: 14_680, pct: 18.7 },
  { id: "aburak", label: "Ahmet Burak", amount: 18_920, pct: 24.1 },
  { id: "salih", label: "Salih", amount: 8_400, pct: 10.7 },
  { id: "anne", label: "Anne", amount: 3_200, pct: 4.1 },
  { id: "baba", label: "Baba", amount: 2_000, pct: 2.6 },
];

export const ALLOCATION = [
  { id: "hisse", label: "BIST Hisse", value: 1_624_300, color: "#6ea8fe" },
  { id: "usd", label: "USD Mevduat", value: 863_340, color: "#4cc9b0" },
  { id: "altin", label: "Altın", value: 1_433_757, color: "#d4a056" },
  { id: "eur", label: "EUR Mevduat", value: 384_200, color: "#a4cc4c" },
  { id: "kripto", label: "Kripto", value: 1_207_920, color: "#b388f2" },
  { id: "nakit", label: "Nakit (TRY)", value: 162_800, color: "#7d8699" },
];

export const TOP_WEEK = [
  { date: "13.05", merchant: "Migros 5M", cat: "market", ben: "ev", amount: 2840 },
  { date: "12.05", merchant: "OPET Petrol", cat: "akaryakit", ben: "ben", amount: 2200 },
  { date: "11.05", merchant: "Hepsiburada — Laptop Şarj", cat: "egitim", ben: "aburak", amount: 1690 },
  { date: "11.05", merchant: "Eczane Kerem", cat: "saglik", ben: "anne", amount: 1240 },
  { date: "10.05", merchant: "Lokanta Hünkar", cat: "restoran", ben: "ben", amount: 980 },
];

export const TOP_YEAR = [
  { date: "14.02.2026", merchant: "İYTE Yurt Yıllık Ödeme", cat: "egitim", ben: "aburak", amount: 28_400 },
  { date: "09.05.2026", merchant: "IKEA Kartal — Mobilya", cat: "ev", ben: "ev", amount: 26_280 },
  { date: "22.03.2026", merchant: "Anne Diş Tedavisi", cat: "saglik", ben: "anne", amount: 18_600 },
  { date: "08.01.2026", merchant: "OTO Servis — BMW", cat: "akaryakit", ben: "ben", amount: 14_200 },
  { date: "04.04.2026", merchant: "Tatil Antalya 4 gün", cat: "tatil", ben: "ev", amount: 12_800 },
];

export interface IncomeRecord {
  date: string;
  desc: string;
  cat: string;
  ben: string;
  acc: string;
  src: "manuel" | "ekstre" | "sistem";
  amount: number;
  recur?: boolean;
}
export const INCOME_RECORDS: IncomeRecord[] = [
  { date: "01.05.2026", desc: "Kira — Beylikdüzü", cat: "kira-gel", ben: "ben", acc: "i-vad", src: "manuel", amount: 28000, recur: true },
  { date: "05.05.2026", desc: "Maaş — EKU", cat: "maas", ben: "ben", acc: "g-vad", src: "ekstre", amount: 84500, recur: true },
  { date: "25.04.2026", desc: "Emekli Maaşı — SGK", cat: "emekli", ben: "ben", acc: "g-vad", src: "ekstre", amount: 16800, recur: true },
  { date: "18.04.2026", desc: "ASELS Temettü", cat: "temettu", ben: "ben", acc: "m-yat", src: "sistem", amount: 8400 },
  { date: "10.04.2026", desc: "Prim — Q1 Performans", cat: "prim", ben: "ben", acc: "g-vad", src: "ekstre", amount: 42000 },
  { date: "01.04.2026", desc: "Kira — Beylikdüzü", cat: "kira-gel", ben: "ben", acc: "i-vad", src: "manuel", amount: 28000, recur: true },
  { date: "05.04.2026", desc: "Maaş — EKU", cat: "maas", ben: "ben", acc: "g-vad", src: "ekstre", amount: 84500, recur: true },
  { date: "25.03.2026", desc: "Emekli Maaşı — SGK", cat: "emekli", ben: "ben", acc: "g-vad", src: "ekstre", amount: 16800, recur: true },
  { date: "14.02.2026", desc: "Emekli İkramiyesi (Bayram)", cat: "ikramiye", ben: "ben", acc: "g-vad", src: "ekstre", amount: 18000 },
  { date: "11.02.2026", desc: "TUPRS Temettü", cat: "temettu", ben: "aburak", acc: "ab-yat", src: "sistem", amount: 2976 },
];

export interface ExpenseRecord {
  date: string;
  desc: string;
  cat: string;
  ben: string;
  acc: string;
  tags: string[];
  amount: number;
}
export const EXPENSE_RECORDS: ExpenseRecord[] = [
  { date: "15.05.2026", desc: "MIGROS JET 5M ATAŞEHIR", cat: "market", ben: "ev", acc: "g-vad", tags: ["#market", "#aydan-aya"], amount: 1240.50 },
  { date: "15.05.2026", desc: "A101 IYTE GULBAHCE", cat: "market", ben: "aburak", acc: "ab-vad", tags: ["#market", "#oğul"], amount: 184.20 },
  { date: "14.05.2026", desc: "OPET KOZYATAGI", cat: "akaryakit", ben: "ben", acc: "g-vad", tags: ["#araba"], amount: 2200.00 },
  { date: "14.05.2026", desc: "HEPSIBURADA - LAPTOP SARJ", cat: "egitim", ben: "aburak", acc: "g-vad", tags: ["#üniversite"], amount: 1690.00 },
  { date: "13.05.2026", desc: "IZBAN AYLIK", cat: "ulasim", ben: "aburak", acc: "ab-vad", tags: ["#abonman"], amount: 385.00 },
  { date: "13.05.2026", desc: "ENERJISA OTOMATIK", cat: "fatura", ben: "ev", acc: "g-vad", tags: ["#zorunlu", "#fatura"], amount: 1842.30 },
  { date: "12.05.2026", desc: "ECZANE KEREM KADIKOY", cat: "saglik", ben: "anne", acc: "g-vad", tags: ["#anne-baba"], amount: 1240.00 },
  { date: "12.05.2026", desc: "STARBUCKS BAGDAT CD", cat: "restoran", ben: "ben", acc: "g-vad", tags: [], amount: 198.00 },
  { date: "10.05.2026", desc: "TURK TELEKOM FATURA", cat: "fatura", ben: "ev", acc: "g-vad", tags: ["#gsm", "#fatura"], amount: 799.00 },
  { date: "09.05.2026", desc: "IKEA KARTAL TAKSIT 1/6", cat: "ev", ben: "ev", acc: "g-vad", tags: ["#mobilya", "#taksit"], amount: 4380.00 },
  { date: "08.05.2026", desc: "BURGER KING IYTE", cat: "restoran", ben: "aburak", acc: "ab-vad", tags: ["#fast-food"], amount: 240.00 },
  { date: "07.05.2026", desc: "NETFLIX.COM", cat: "abone", ben: "ev", acc: "g-vad", tags: ["#abone", "#aydan-aya"], amount: 389.00 },
  { date: "06.05.2026", desc: "BIM SARIYER", cat: "market", ben: "ev", acc: "g-vad", tags: ["#market"], amount: 428.30 },
  { date: "04.05.2026", desc: "CARREFOURSA ETILER", cat: "market", ben: "ev", acc: "g-vad", tags: ["#market"], amount: 892.40 },
];

export interface Trade {
  date: string;
  sym: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  comm: number;
  ben: string;
  custody: string;
  note: string;
  realize: number | null;
}
export const TRADES: Trade[] = [
  { date: "12.05.2026", sym: "ASELS", side: "BUY", qty: 200, price: 81.20, comm: 8.20, ben: "ben", custody: "Midas", note: "momentum ekleme", realize: null },
  { date: "08.05.2026", sym: "THYAO", side: "BUY", qty: 60, price: 312.00, comm: 12.40, ben: "ben", custody: "Midas", note: "trafik raporu öncesi", realize: null },
  { date: "21.04.2026", sym: "SISE", side: "SELL", qty: 500, price: 41.20, comm: 4.80, ben: "ben", custody: "Midas", note: "stop", realize: -800 },
  { date: "18.04.2026", sym: "TUPRS", side: "BUY", qty: 20, price: 168.00, comm: 1.40, ben: "aburak", custody: "Midas", note: "temettü beklentisi", realize: null },
  { date: "09.04.2026", sym: "BTC", side: "BUY", qty: 0.05, price: 2_400_000, comm: 0, ben: "ben", custody: "Garanti Kripto", note: "DCA", realize: null },
  { date: "02.04.2026", sym: "KOZAL", side: "BUY", qty: 20, price: 31.40, comm: 0.30, ben: "salih", custody: "Midas", note: "altın hedge", realize: null },
  { date: "14.03.2026", sym: "EREGL", side: "BUY", qty: 500, price: 49.20, comm: 4.10, ben: "ben", custody: "Garanti BBVA", note: "", realize: null },
  { date: "04.03.2026", sym: "BIMAS", side: "SELL", qty: 100, price: 442.00, comm: 8.80, ben: "ben", custody: "Garanti BBVA", note: "kâr realizasyonu", realize: 3000 },
  { date: "12.02.2026", sym: "ASELS", side: "BUY", qty: 300, price: 71.40, comm: 11.20, ben: "ben", custody: "Midas", note: "", realize: null },
  { date: "20.01.2026", sym: "ETH", side: "BUY", qty: 0.8, price: 78_000, comm: 0, ben: "aburak", custody: "Garanti Kripto", note: "DCA", realize: null },
];

export const KAP_STREAM = [
  { time: "14:32", sym: "ASELS", title: "Genel Müdür değişikliği — Yönetim Kurulu kararı", polarity: "neutral" as const, summary: "Yeni Genel Müdür ataması açıklandı. Operasyonel etkisi sınırlı." },
  { time: "13:18", sym: "THYAO", title: "Nisan 2026 Trafik Sonuçları", polarity: "positive" as const, summary: "Yolcu sayısı YoY +%14, doluluk %84. Konsensüs üstü." },
  { time: "11:45", sym: "TUPRS", title: "Genel Kurul — Temettü ödemesi", polarity: "positive" as const, summary: "Brüt 24,80 ₺/lot temettü. Verim ~%14." },
  { time: "10:02", sym: "EREGL", title: "Hammadde fiyatları — Bilgilendirme", polarity: "neutral" as const, summary: "Demir cevheri kontrat fiyatları güncel verildi." },
  { time: "09:14", sym: "BIMAS", title: "Aylık satış güncellemesi", polarity: "positive" as const, summary: "Mağaza-kıyasında satış %22 reel büyüme." },
];

export const TWEETS = [
  { handle: "@btcompass", verified: true, time: "2s", sym: "ASELS", text: "Aselsan teknik kırılım: 84,55 günlük direnci hacimle geçti. Sonraki hedef 96 bandı." },
  { handle: "@piyasayorum", verified: true, time: "14d", sym: "THYAO", text: "THYAO trafik raporu beklenti üzeri — doluluk geçen yılı geçti, yaz dönemine güçlü giriş." },
  { handle: "@analizci_TR", verified: false, time: "42d", sym: "TUPRS", text: "TUPRS temettü verimi BIST ortalamasının 3 katı. Defansif pozisyon için klasik aday." },
  { handle: "@borsadan", verified: true, time: "1s", sym: "KOZAL", text: "Altın yükselişiyle KOZAL son 5 günde hacimde uyandı. RS skoru iyiye gidiyor." },
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

export const REAL_VS_NOM = {
  labels: ["Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara", "Oca", "Şub", "Mar", "Nis", "May"],
  port: [100, 104.2, 108.1, 113.8, 117.4, 121.9, 125.6, 130.4, 133.0, 134.6, 135.9, 138.2],
  cpi: [100, 102.0, 104.2, 106.5, 108.1, 110.0, 112.1, 114.4, 116.2, 118.5, 120.7, 122.1],
  usd: [100, 103.4, 106.8, 110.2, 114.6, 117.9, 121.4, 124.8, 126.2, 128.4, 130.1, 131.2],
  xau: [100, 106.0, 110.8, 116.4, 121.2, 127.8, 132.4, 136.5, 138.4, 140.2, 141.6, 142.6],
  bist: [100, 101.4, 104.6, 107.8, 110.4, 113.2, 116.6, 119.4, 121.8, 124.4, 126.1, 127.4],
};

function buildDaily90(): { labels: string[]; nakit: number[]; doviz: number[]; altin: number[]; hisse: number[]; kripto: number[] } {
  const days = 90;
  const out: ReturnType<typeof buildDaily90> = { labels: [], nakit: [], doviz: [], altin: [], hisse: [], kripto: [] };
  for (let i = 0; i < days; i++) {
    const t = i / days;
    out.labels.push(`G${i + 1}`);
    out.nakit.push(140000 + 30000 * Math.sin(i * 0.1));
    out.doviz.push(980000 + 250000 * t + 40000 * Math.sin(i * 0.13));
    out.altin.push(1200000 + 350000 * t + 60000 * Math.cos(i * 0.09));
    out.hisse.push(1200000 + 500000 * t + 80000 * Math.sin(i * 0.2));
    out.kripto.push(700000 + 480000 * t + 120000 * Math.sin(i * 0.4));
  }
  return out;
}
export const ASSET_COMP_DAILY = buildDaily90();

function buildPersonHist(): { labels: string[]; ben: number[]; aburak: number[]; salih: number[] } {
  const days = 90;
  const out: ReturnType<typeof buildPersonHist> = { labels: [], ben: [], aburak: [], salih: [] };
  for (let i = 0; i < days; i++) {
    const t = i / days;
    out.labels.push(`G${i + 1}`);
    out.ben.push(3_400_000 + 380_000 * t + 90_000 * Math.sin(i * 0.18));
    out.aburak.push(380_000 + 80_000 * t + 20_000 * Math.sin(i * 0.22));
    out.salih.push(84_000 + 18_000 * t + 4_000 * Math.sin(i * 0.16));
  }
  return out;
}
export const PERSON_PORT_HIST = buildPersonHist();

export const RECURRING_INCOME = [
  { id: "maas", name: "Maaş — EKU", amount: 84500, day: 5, acc: "g-vad" },
  { id: "kira", name: "Kira — Beylikdüzü", amount: 28000, day: 1, acc: "i-vad" },
  { id: "emekli", name: "Emekli Maaşı", amount: 16800, day: 25, acc: "g-vad" },
];

export const RULES = [
  { id: "r1", prio: 1, name: "İYTE bölgesi → Ahmet Burak", match: 'merchant LIKE "%IYTE%"', action: "beneficiary = Ahmet Burak", hits: 142, last: "12.05.2026" },
  { id: "r2", prio: 2, name: "Market merchants → Market", match: "merchant IN (MIGROS, A101, BIM, CARREFOUR)", action: "category = Market", hits: 248, last: "15.05.2026" },
  { id: "r3", prio: 3, name: "Enerjisa otomatik fatura", match: 'merchant LIKE "ENERJISA%"', action: "category = Fatura · transfer = false", hits: 12, last: "13.05.2026" },
  { id: "r4", prio: 4, name: "Eczane → Anne", match: 'merchant LIKE "ECZ%" AND amount > 800', action: "beneficiary = Anne", hits: 6, last: "12.05.2026" },
  { id: "r5", prio: 5, name: "Netflix/Spotify abonelik", match: "merchant IN (NETFLIX, SPOTIFY, BLUTV)", action: "category = Abonelik · beneficiary = Ev", hits: 18, last: "07.05.2026" },
  { id: "r6", prio: 6, name: "Maaş gelir transferi", match: 'description LIKE "%MAAS%" AND dir = in', action: "category = Maaş · beneficiary = Ben", hits: 11, last: "05.05.2026" },
];

export const DRAFT = {
  filename: "garanti-bonus-platinum-05-2026.csv",
  uploaded: "15.05.2026 09:14",
  range: "08.04.2026 — 12.05.2026",
  total: 78, auto: 64, review: 14, ignored: 0,
  card: "Bonus Platinum (Ben) ****4471",
};

export interface DraftRow {
  id: number;
  date: string;
  desc: string;
  amount: number;
  dir: "out";
  sugCat: string;
  sugBen: string;
  conf: number;
  status: "auto" | "review" | "ignored";
  rule?: string;
  inst?: string;
}

export const DRAFT_ROWS: DraftRow[] = [
  { id: 1, date: "12.05", desc: "MIGROS JET 5M ATASEHIR", amount: 1240.50, dir: "out", sugCat: "market", sugBen: "ev", conf: 99, status: "auto" },
  { id: 2, date: "12.05", desc: "A101 IYTE GULBAHCE", amount: 184.20, dir: "out", sugCat: "market", sugBen: "aburak", conf: 99, status: "auto", rule: "merchant ~ IYTE → Ahmet Burak" },
  { id: 3, date: "11.05", desc: "OPET KOZYATAGI", amount: 2200.00, dir: "out", sugCat: "akaryakit", sugBen: "ben", conf: 97, status: "auto" },
  { id: 4, date: "11.05", desc: "HB - LAPTOP SARJ ALETI 65W", amount: 1690.00, dir: "out", sugCat: "egitim", sugBen: "aburak", conf: 74, status: "review" },
  { id: 5, date: "10.05", desc: "ECZ. KEREM KADIKOY", amount: 1240.00, dir: "out", sugCat: "saglik", sugBen: "anne", conf: 62, status: "review" },
  { id: 6, date: "10.05", desc: "IZBAN AYLIK ABONMAN", amount: 385.00, dir: "out", sugCat: "ulasim", sugBen: "aburak", conf: 99, status: "auto" },
  { id: 7, date: "09.05", desc: "IKEA KARTAL", amount: 26280.00, dir: "out", sugCat: "ev", sugBen: "ev", conf: 88, status: "review", inst: "1/6 (4380,00 ₺)" },
  { id: 8, date: "09.05", desc: "BIM SARIYER", amount: 428.30, dir: "out", sugCat: "market", sugBen: "ev", conf: 99, status: "auto" },
];

export const INCOME_BY_CAT_MONTH = [
  { id: "maas", label: "Maaş", value: 84500, color: "#2ea043" },
  { id: "kira-gel", label: "Kira Geliri", value: 28000, color: "#4cc9b0" },
  { id: "emekli", label: "Emekli", value: 16800, color: "#6ea8fe" },
  { id: "temettu", label: "Temettü", value: 3280, color: "#b388f2" },
];

export const EXPENSE_BY_CAT_MONTH = [
  { id: "market", label: "Market", value: 22280, color: "#4cc9b0" },
  { id: "fatura", label: "Fatura", value: 11140, color: "#d29922" },
  { id: "kira", label: "Kira/Aidat", value: 10040, color: "#6ea8fe" },
  { id: "egitim", label: "Eğitim", value: 9100, color: "#b388f2" },
  { id: "akaryakit", label: "Akaryakıt", value: 5810, color: "#f85149" },
  { id: "restoran", label: "Restoran", value: 5340, color: "#d4a056" },
  { id: "saglik", label: "Sağlık", value: 3840, color: "#e26a8f" },
  { id: "ulasim", label: "Ulaşım", value: 3290, color: "#a4cc4c" },
  { id: "diger", label: "Diğer", value: 7600, color: "#7d8699" },
];
