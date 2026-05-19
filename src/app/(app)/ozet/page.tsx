import {
  listAccounts,
  listBeneficiariesLite,
  listCustodyLocations,
  type AccountRow,
  type BeneficiaryLite,
} from "@/app/(app)/hesaplar/actions";
import {
  listAssets,
  listHoldings,
  listPortfolios,
  listTrades,
} from "@/app/(app)/_lib/wealth-actions";
import { getAssetChanges, getAssetRates, getTruncgilUpdateDate } from "@/app/(app)/_lib/asset-rates";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";
import { listTransactionsForReports } from "@/app/(app)/_lib/reports-actions";
import { listBenchmarkPoints, listWealthSnapshots } from "@/app/(app)/_lib/wealth-snapshots-actions";
import { captureDailySnapshot, listDailySnapshots } from "@/app/(app)/_lib/daily-snapshots-actions";
import { AssetCompositionChart } from "@/app/(app)/_components/asset-composition-chart";
import { TotalWealthDisplay } from "@/app/(app)/_components/total-wealth-display";
import { CashflowCard } from "@/app/(app)/_components/cashflow-card";
import { PersonEquityChart } from "@/app/(app)/_components/person-equity-chart";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

interface AssetClassSlice {
  label: string;
  value: number;
  color: string;
}

function classifyAccountClass(currency: string): { key: string; label: string; color: string } {
  if (currency === "TRY") return { key: "cash_try", label: "Nakit (₺)", color: "#4cc9b0" };
  if (["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"].includes(currency))
    return { key: "fx", label: "Döviz", color: "#6ea8fe" };
  if (currency === "XAU_OZ" || currency === "XAU" || currency === "XAG" ||
      ["CEYREK", "YARIM", "TAM", "CUMHURIYET", "ATA", "RESAT", "BILEZIK22", "BILEZIK14", "BILEZIK18"].includes(currency))
    return { key: "metal", label: "Altın & Gümüş", color: "#d4a056" };
  if (["BTC", "ETH", "SOL", "USDT", "BNB"].includes(currency))
    return { key: "crypto", label: "Kripto", color: "#b388f2" };
  return { key: "other", label: "Diğer", color: "#7d8699" };
}

export const dynamic = "force-dynamic";

function tryValueOf(a: AccountRow, fxRates: Record<string, number | undefined>): number {
  if (a.currency === "TRY") return a.balance_try ?? a.opening_balance ?? 0;
  const native = a.balance_native;
  const rate = fxRates[a.currency];
  if (native != null && rate != null) return Number(native) * rate;
  return a.balance_try ?? 0;
}

export default async function OzetPage() {
  const [accounts, custodies, beneficiaries, fxRates, fxChanges, truncgilUpdate, holdings, assets, portfolios, trades, txns, wealthSnapshots, benchmarkPoints] = await Promise.all([
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    getAssetRates(),
    getAssetChanges(),
    getTruncgilUpdateDate(),
    listHoldings(),
    listAssets(),
    listPortfolios(),
    listTrades(),
    listTransactionsForReports(12),
    listWealthSnapshots(),
    listBenchmarkPoints(),
  ]);

  const benMap: Record<string, BeneficiaryLite> = Object.fromEntries(beneficiaries.map((b) => [b.id, b]));

  // Hesap totalleri + custody × beneficiary kırılımı
  const accountTotal = accounts.reduce((s, a) => s + tryValueOf(a, fxRates), 0);

  // Hesap totalleri varlık sınıfına göre — Toplam Servet kartında ayrı sütunlarda
  let cashTotal = 0;
  let fxTotal = 0;
  let metalTotal = 0;
  for (const a of accounts) {
    const v = tryValueOf(a, fxRates);
    const c = classifyAccountClass(a.currency);
    if (c.key === "cash_try") cashTotal += v;
    else if (c.key === "fx") fxTotal += v;
    else if (c.key === "metal") metalTotal += v;
  }

  const byCustody = new Map<
    string,
    { name: string; color: string; total: number; byBen: Map<string, number> }
  >();
  for (const c of custodies) {
    byCustody.set(c.id, { name: c.name, color: c.color ?? "#6ea8fe", total: 0, byBen: new Map() });
  }
  for (const a of accounts) {
    if (!a.custody_id) continue;
    const g = byCustody.get(a.custody_id);
    if (!g) continue;
    const v = tryValueOf(a, fxRates);
    g.total += v;
    const benKey = a.beneficiary_id ?? "__unassigned__";
    g.byBen.set(benKey, (g.byBen.get(benKey) ?? 0) + v);
  }
  const groupedAccounts = Array.from(byCustody.values())
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);

  // Yatırım MV (BIST anlık fiyat ile)
  const assetMap = Object.fromEntries(assets.map((a) => [a.id, a]));
  const bistSymbols = holdings
    .map((h) => assetMap[h.asset_id])
    .filter((a) => !!a && a.asset_class === "equity_tr")
    .map((a) => a!.symbol);
  const quotes = await getStockPrices(bistSymbols);

  const enriched = holdings.map((h) => {
    const asset = assetMap[h.asset_id];
    const quote = asset ? quotes[asset.symbol] : undefined;
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis_try);
    const mv = quote ? qty * quote.price : cost;
    return { ...h, mv, cost, quote };
  });

  const investmentMv = enriched.reduce((s, h) => s + h.mv, 0);

  // Portföy → dominant beneficiary (trade'lerin ilki)
  const portfolioBeneficiary = new Map<string, string>();
  for (const t of trades) {
    if (t.beneficiary_id && !portfolioBeneficiary.has(t.portfolio_id)) {
      portfolioBeneficiary.set(t.portfolio_id, t.beneficiary_id);
    }
  }

  // Kişi bazlı: hesap + yatırım toplamı
  const personTotals = new Map<string, { account: number; investment: number }>();
  const bumpAcc = (key: string, v: number) => {
    const cur = personTotals.get(key) ?? { account: 0, investment: 0 };
    cur.account += v;
    personTotals.set(key, cur);
  };
  const bumpInv = (key: string, v: number) => {
    const cur = personTotals.get(key) ?? { account: 0, investment: 0 };
    cur.investment += v;
    personTotals.set(key, cur);
  };
  for (const a of accounts) {
    bumpAcc(a.beneficiary_id ?? "__unassigned__", tryValueOf(a, fxRates));
  }
  for (const h of enriched) {
    const ben = portfolioBeneficiary.get(h.portfolio_id) ?? "__unassigned__";
    bumpInv(ben, h.mv);
  }
  const personRows = Array.from(personTotals.entries())
    .map(([id, v]) => ({
      id,
      name: id === "__unassigned__" ? "(Atanmamış)" : (benMap[id]?.name ?? "?"),
      color: id === "__unassigned__" ? "#7d8699" : (benMap[id]?.color ?? "#7d8699"),
      account: v.account,
      investment: v.investment,
      total: v.account + v.investment,
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  // Sınıf × kişi kırılımı — KPI altında dağılımı göstermek için
  interface PersonClassEntry {
    id: string;
    name: string;
    color: string;
    value: number;
    dayChange: number;
  }
  const classBreakdown = new Map<string, Map<string, PersonClassEntry>>();
  const bumpClassPerson = (
    classKey: string,
    benId: string | null | undefined,
    value: number,
    dayChange: number,
  ) => {
    const inner = classBreakdown.get(classKey) ?? new Map<string, PersonClassEntry>();
    const id = benId ?? "__unassigned__";
    const ben = benId ? benMap[benId] : null;
    const name = ben?.name ?? "Atanmamış";
    const color = ben?.color ?? "#7d8699";
    const cur = inner.get(id) ?? { id, name, color, value: 0, dayChange: 0 };
    cur.value += value;
    cur.dayChange += dayChange;
    inner.set(id, cur);
    classBreakdown.set(classKey, inner);
  };
  // Bugün TR günü mü kontrolü (üst tarafta hesapladık, tekrar)
  const todayIso2 = new Date().toISOString().slice(0, 10);
  const isTodayUnix = (s: number | null | undefined) =>
    s ? new Date(s * 1000).toISOString().slice(0, 10) === todayIso2 : false;
  // Hesaplar
  for (const a of accounts) {
    const c = classifyAccountClass(a.currency);
    const v = tryValueOf(a, fxRates);
    let dayDelta = 0;
    if (a.currency !== "TRY") {
      const native = a.balance_native;
      const rate = fxRates[a.currency];
      const chgPct = fxChanges[a.currency];
      if (native != null && rate != null && chgPct != null) {
        dayDelta = Number(native) * rate * (chgPct / 100);
      }
    }
    bumpClassPerson(c.key, a.beneficiary_id, v, dayDelta);
  }
  // Yatırım pozisyonları
  for (const h of enriched) {
    const asset = assetMap[h.asset_id];
    if (!asset) continue;
    const benId = portfolioBeneficiary.get(h.portfolio_id) ?? null;
    const quote = h.quote;
    const qty = Number(h.quantity);
    const dayDelta =
      quote && quote.previous_close && isTodayUnix(quote.market_time)
        ? qty * (quote.price - quote.previous_close)
        : 0;
    let classKey = "equity";
    if (asset.asset_class === "metal") classKey = "metal";
    else if (asset.asset_class === "fx") classKey = "fx";
    else if (asset.asset_class === "crypto") classKey = "crypto";
    bumpClassPerson(classKey, benId, h.mv, dayDelta);
  }

  // Sınıf bazında person rows — sıralı, sadece value > 0
  const personRowsByClass = (classKey: string): PersonClassEntry[] => {
    const m = classBreakdown.get(classKey);
    if (!m) return [];
    return Array.from(m.values())
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  // Portföy bazında yatırım dağılımı
  const portfolioGroups = portfolios
    .map((p) => {
      const rows = enriched.filter((h) => h.portfolio_id === p.id);
      const mv = rows.reduce((s, h) => s + h.mv, 0);
      return { name: p.name, count: rows.length, mv };
    })
    .filter((g) => g.mv > 0)
    .sort((a, b) => b.mv - a.mv);

  const grandTotal = accountTotal + investmentMv;

  // Kişi-bazlı hisse MV (snapshot için)
  const equityByPerson: Record<string, number> = {};
  for (const h of enriched) {
    const benId = portfolioBeneficiary.get(h.portfolio_id);
    if (!benId) continue;
    equityByPerson[benId] = (equityByPerson[benId] ?? 0) + h.mv;
  }

  // Günlük snapshot — bugün için yoksa al
  if (grandTotal > 0) {
    await captureDailySnapshot({
      total_wealth: grandTotal,
      cash_try: cashTotal,
      fx_try: fxTotal,
      metal_try: metalTotal,
      equity_mv: investmentMv,
      crypto_try: 0,
      equity_by_person: equityByPerson,
    });
  }
  const dailySnapshots = await listDailySnapshots(180);

  // Varlık sınıfı dağılımı (hesaplar + yatırımlar tek pasta)
  const assetClassMap = new Map<string, AssetClassSlice>();
  const addSlice = (key: string, label: string, color: string, value: number) => {
    if (value <= 0) return;
    const cur = assetClassMap.get(key) ?? { label, color, value: 0 };
    cur.value += value;
    assetClassMap.set(key, cur);
  };
  for (const a of accounts) {
    const c = classifyAccountClass(a.currency);
    addSlice(c.key, c.label, c.color, tryValueOf(a, fxRates));
  }
  for (const h of enriched) {
    const asset = assetMap[h.asset_id];
    if (asset?.asset_class === "equity_tr" || asset?.asset_class === "equity_us") {
      addSlice("equity", "Hisse", "#e26a8f", h.mv);
    } else if (asset?.asset_class === "crypto") {
      addSlice("crypto", "Kripto", "#b388f2", h.mv);
    } else if (asset?.asset_class === "metal") {
      addSlice("metal", "Altın & Gümüş", "#d4a056", h.mv);
    } else if (asset?.asset_class === "fx") {
      addSlice("fx", "Döviz", "#6ea8fe", h.mv);
    } else {
      addSlice("other", "Diğer", "#7d8699", h.mv);
    }
  }
  const assetClassSlices = Array.from(assetClassMap.values()).sort((a, b) => b.value - a.value);

  // Bugünkü Servet Değişimi — varlık sınıfı bazlı TL katkı
  // Hesap (FX/altın/kripto): native × current_rate × change_pct/100
  // Hisse: qty × (current - previous_close)
  // Sınıf bazlı topla; source ve son güncelleme zamanını da tut
  const dayChangeMap = new Map<
    string,
    { label: string; color: string; change: number; value: number; source: string; lastUpdate: string | null }
  >();
  const bumpDay = (
    key: string,
    label: string,
    color: string,
    change: number,
    value: number,
    source: string,
    lastUpdate: string | null,
  ) => {
    const cur = dayChangeMap.get(key) ?? { label, color, change: 0, value: 0, source, lastUpdate };
    cur.change += change;
    cur.value += value;
    // en geç güncel zamanı sakla
    if (lastUpdate && (!cur.lastUpdate || lastUpdate > cur.lastUpdate)) cur.lastUpdate = lastUpdate;
    dayChangeMap.set(key, cur);
  };

  const truncgilSource = "Truncgil · Selling";

  for (const a of accounts) {
    if (a.currency === "TRY") {
      // TRY hesapta günlük değişim 0 (faiz tahakkuku ayrı iş)
      const valueTry = tryValueOf(a, fxRates);
      const cls = classifyAccountClass(a.currency);
      bumpDay(cls.key, cls.label, cls.color, 0, valueTry, "TRY · faiz yok", null);
      continue;
    }
    const native = a.balance_native;
    const rate = fxRates[a.currency];
    const chgPct = fxChanges[a.currency];
    if (native == null || rate == null || chgPct == null) continue;
    const valueTry = Number(native) * rate;
    const dayDelta = valueTry * (chgPct / 100);
    const cls = classifyAccountClass(a.currency);
    bumpDay(cls.key, cls.label, cls.color, dayDelta, valueTry, truncgilSource, truncgilUpdate);
  }

  // Yahoo'nun "regularMarketTime"ı bugün değilse borsa kapalı sayılır
  // (resmi tatil / hafta sonu) — günlük değişim 0 gösterilir, yoksa
  // dünkü kapanış vs. dün-evvelki kapanış farkı (Yahoo'nun verdiği son
  // değişim) yanlışlıkla "bugün" gibi görünür.
  const todayIso = new Date().toISOString().slice(0, 10);
  const isToday = (unixSec: number | null | undefined): boolean => {
    if (!unixSec) return false;
    return new Date(unixSec * 1000).toISOString().slice(0, 10) === todayIso;
  };

  // Hisse meta için Yahoo'nun en geç regularMarketTime'ını al
  let yahooLatestUnix: number | null = null;
  for (const h of enriched) {
    const asset = assetMap[h.asset_id];
    const quote = h.quote;
    if (!asset || !quote || !quote.previous_close) continue;
    const qty = Number(h.quantity);
    // Borsa bugün açık değilse günlük katkı 0
    const marketOpen = isToday(quote.market_time);
    const dayDelta = marketOpen ? qty * (quote.price - quote.previous_close) : 0;
    if (quote.market_time && (!yahooLatestUnix || quote.market_time > yahooLatestUnix)) {
      yahooLatestUnix = quote.market_time;
    }
    if (asset.asset_class === "equity_tr" || asset.asset_class === "equity_us") {
      bumpDay("equity", "Hisse", "#e26a8f", dayDelta, h.mv, "Yahoo Finance · 15dk", null);
    } else if (asset.asset_class === "crypto") {
      bumpDay("crypto", "Kripto", "#b388f2", dayDelta, h.mv, "Yahoo Finance · 15dk", null);
    } else if (asset.asset_class === "metal") {
      bumpDay("metal", "Altın & Gümüş", "#d4a056", dayDelta, h.mv, "Yahoo Finance · 15dk", null);
    }
  }
  const yahooLastUpdate = yahooLatestUnix
    ? new Date(yahooLatestUnix * 1000).toLocaleString("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : null;

  // Hisse satırına yahoo zamanını yaz (yukarıda null geçtim; burada doldur)
  const hisseEntry = dayChangeMap.get("equity");
  if (hisseEntry && yahooLastUpdate) hisseEntry.lastUpdate = yahooLastUpdate;

  // Nakit (TRY hesapları) günlük değişimini daily_snapshots tablosundan hesapla.
  // En son snapshot bugününki (bu sayfa açıldığında upsert oldu). Bir önceki
  // snapshot dünün (veya en son ziyaret edilen günün) kayıttır. Fark = bugünkü
  // nakit değişimi (gelir geldi / gider çıktı / vs).
  const cashEntry = dayChangeMap.get("cash_try");
  if (cashEntry && dailySnapshots.length >= 2) {
    const prev = dailySnapshots[dailySnapshots.length - 2];
    const prevCash = Number(prev.cash_try ?? 0);
    cashEntry.change = cashTotal - prevCash;
    cashEntry.source = `daily_snapshots · ${prev.snapshot_date}'den beri`;
    cashEntry.lastUpdate = prev.snapshot_date;
  }

  const dayChangeRows = Array.from(dayChangeMap.values())
    .filter((r) => r.value > 0)
    .map((r) => ({ ...r, pct: r.value > 0 ? (r.change / r.value) * 100 : 0 }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const totalDayChange = dayChangeRows.reduce((s, r) => s + r.change, 0);

  // YTD nakit akış — Ocak'tan içinde bulunulan aya
  const today = new Date();
  const currentYear = today.getFullYear();
  const monthsCount = today.getMonth() + 1; // Ocak=1, Aralık=12
  const months: Array<{ period: string; inflow: number; outflow: number }> = [];
  for (let i = 0; i < monthsCount; i++) {
    const period = `${currentYear}-${String(i + 1).padStart(2, "0")}`;
    months.push({ period, inflow: 0, outflow: 0 });
  }
  const monthMap = new Map(months.map((m) => [m.period, m]));
  for (const t of txns) {
    const p = t.occurred_on.slice(0, 7);
    const m = monthMap.get(p);
    if (!m) continue;
    if (t.direction === "inflow") m.inflow += Number(t.amount);
    else if (t.direction === "outflow") m.outflow += Number(t.amount);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Özet</div>
          <div className="page-sub">Tüm varlıklarınızın genel görünümü</div>
        </div>
      </div>

      {accounts.length === 0 && enriched.length === 0 ? (
        <div className="empty">
          <div className="title">
            <Icon name="dashboard" size={20} /> Henüz veri yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Önce <b>Hesaplar</b> ya da <b>İşlemler</b> sekmesinden veri ekle.
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div className="card-title">Toplam Servet</div>
              <div className="card-sub" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span>{accounts.length} hesap · {portfolioGroups.length} yatırım portföyü</span>
                <DataFreshness yahooLastUnix={yahooLatestUnix} truncgilDate={truncgilUpdate} />
              </div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <TotalWealthDisplay
                  totalTry={grandTotal}
                  dayChangeTry={totalDayChange}
                  usdRate={fxRates.USD ?? null}
                  eurRate={fxRates.EUR ?? null}
                />
                {dailySnapshots.length >= 2 && (() => {
                  const values = dailySnapshots.map((s) => Number(s.total_wealth));
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min || 1;
                  const width = 280;
                  const height = 90;
                  const stepX = width / (values.length - 1);
                  const points = values.map((v, i) => {
                    const x = i * stepX;
                    const y = height - ((v - min) / range) * height;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  });
                  const path = `M ${points.join(" L ")}`;
                  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
                  const trendUp = values[values.length - 1] >= values[0];
                  const color = trendUp ? "var(--positive)" : "var(--negative)";
                  return (
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, maxWidth: width }}>
                        <defs>
                          <linearGradient id="trendGrad" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d={areaPath} fill="url(#trendGrad)" />
                        <path d={path} stroke={color} strokeWidth={1.5} fill="none" />
                      </svg>
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const equityDay = dayChangeMap.get("equity")?.change ?? 0;
                const metalDay = dayChangeMap.get("metal")?.change ?? 0;
                const fxDay = dayChangeMap.get("fx")?.change ?? 0;
                const cashDay = dayChangeMap.get("cash_try")?.change ?? 0;
                const dayPct = (change: number, value: number) =>
                  value > 0 ? (change / (value - change || value)) * 100 : 0;
                type IconKey = "wealth" | "diamond" | "swap" | "wallet";
                const renderCell = (
                  label: string,
                  value: number,
                  change: number,
                  iconName: IconKey,
                  iconColor: string,
                  classKey: string,
                ) => {
                  const color = change >= 0 ? "var(--positive)" : "var(--negative)";
                  const pct = dayPct(change, value);
                  const breakdown = personRowsByClass(classKey);
                  return (
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: `color-mix(in oklab, ${iconColor} 14%, transparent)`,
                          color: iconColor,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "0 0 auto",
                        }}
                      >
                        <Icon name={iconName} size={16} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="hint" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
                        <div className="tabular" style={{ fontSize: 18, fontWeight: 600 }}>
                          {fmt.trydp(value)}
                        </div>
                        <div className="tabular" style={{ fontSize: 11, color }}>
                          {change >= 0 ? "+" : ""}{fmt.tr(change, 0)} ₺
                          {value > 0 && change !== 0 && (
                            <> · {change >= 0 ? "+" : ""}{pct.toFixed(2)}%</>
                          )}
                        </div>
                        {breakdown.length > 1 && (
                          <div style={{ marginTop: 8, display: "grid", gap: 3 }}>
                            {breakdown.map((p) => {
                              const pColor = p.dayChange >= 0 ? "var(--positive)" : "var(--negative)";
                              const pPct = p.value > 0 ? (p.dayChange / (p.value - p.dayChange || p.value)) * 100 : 0;
                              return (
                                <div
                                  key={p.id}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr auto",
                                    gap: 6,
                                    fontSize: 10,
                                    alignItems: "center",
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                                    <span style={{ width: 5, height: 5, borderRadius: 50, background: p.color, flexShrink: 0 }} />
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {p.name}
                                    </span>
                                  </span>
                                  <span className="tabular" style={{ textAlign: "right" }}>
                                    {fmt.tr(p.value, 0)} ₺
                                    {p.dayChange !== 0 && (
                                      <span style={{ color: pColor, marginLeft: 4 }}>
                                        {" "}
                                        {p.dayChange >= 0 ? "+" : ""}{pPct.toFixed(1)}%
                                      </span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                };
                return (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 16,
                      marginTop: 20,
                      paddingTop: 18,
                      borderTop: "1px solid var(--border-soft)",
                    }}
                  >
                    {renderCell("PORTFÖY", investmentMv, equityDay, "wealth", "#e26a8f", "equity")}
                    {renderCell("ALTIN", metalTotal, metalDay, "diamond", "#d4a056", "metal")}
                    {renderCell("DÖVİZ", fxTotal, fxDay, "swap", "#6ea8fe", "fx")}
                    {renderCell("NAKİT", cashTotal, cashDay, "wallet", "#4cc9b0", "cash_try")}
                  </div>
                );
              })()}
            </div>
          </div>

          <div>
            {groupedAccounts.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Kurum Bazlı Hesap Dağılımı</div>
                </div>
                <div style={{ padding: "12px 0" }}>
                  {groupedAccounts.map((g) => {
                    const pct = accountTotal > 0 ? (g.total / accountTotal) * 100 : 0;
                    const benRows = Array.from(g.byBen.entries())
                      .map(([id, v]) => ({
                        id,
                        name: id === "__unassigned__" ? "(Atanmamış)" : (benMap[id]?.name ?? "?"),
                        color: id === "__unassigned__" ? "#7d8699" : (benMap[id]?.color ?? "#7d8699"),
                        value: v,
                      }))
                      .filter((b) => b.value > 0)
                      .sort((a, b) => b.value - a.value);
                    return (
                      <div key={g.name} style={{ padding: "8px 20px 10px" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto 60px",
                            gap: 12,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 50, background: g.color }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                          </div>
                          <div className="tabular" style={{ fontWeight: 600, fontSize: 13 }}>
                            {fmt.trydp(g.total)}
                          </div>
                          <div className="hint tabular" style={{ textAlign: "right" }}>
                            %{pct.toFixed(1)}
                          </div>
                        </div>
                        {benRows.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 6,
                              marginLeft: 20,
                            }}
                          >
                            {benRows.map((b) => (
                              <span
                                key={b.id}
                                style={{
                                  fontSize: 11,
                                  color: "var(--muted)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 50,
                                    background: b.color,
                                  }}
                                />
                                {b.name}{" "}
                                <span className="tabular" style={{ color: "var(--fg-soft)" }}>
                                  {fmt.tr(b.value, 0)} ₺
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {personRows.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div className="card-title">Kişi Bazlı Toplam Servet</div>
              </div>
              <table className="dg">
                <thead>
                  <tr>
                    <th>Kişi</th>
                    <th className="num">Hesaplar</th>
                    <th className="num">Portföy</th>
                    <th className="num">Toplam</th>
                    <th className="num">Bugün</th>
                    <th className="num" style={{ width: 80 }}>Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {personRows.map((p) => {
                    const grandPct = grandTotal > 0 ? (p.total / grandTotal) * 100 : 0;
                    // Kişinin günlük değişimi = tüm sınıflarda toplanan dayChange
                    let pDayChange = 0;
                    for (const [, inner] of classBreakdown) {
                      const e = inner.get(p.id);
                      if (e) pDayChange += e.dayChange;
                    }
                    const dayOpen = p.total - pDayChange;
                    const pDayPct = dayOpen > 0 ? (pDayChange / dayOpen) * 100 : 0;
                    const dColor = pDayChange >= 0 ? "var(--positive)" : "var(--negative)";
                    return (
                      <tr key={p.id}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 50, background: p.color }} />
                            {p.name}
                          </span>
                        </td>
                        <td className="num tabular">{fmt.tr(p.account, 0)} ₺</td>
                        <td className="num tabular">{fmt.tr(p.investment, 0)} ₺</td>
                        <td className="num tabular" style={{ fontWeight: 600 }}>
                          {fmt.tr(p.total, 0)} ₺
                        </td>
                        <td className="num tabular" style={{ color: pDayChange !== 0 ? dColor : "var(--muted)", fontWeight: 600 }}>
                          {pDayChange === 0
                            ? "—"
                            : `${pDayChange >= 0 ? "+" : ""}${fmt.tr(pDayChange, 0)} ₺`}
                          {pDayChange !== 0 && (
                            <div className="hint" style={{ fontSize: 10, color: dColor }}>
                              {pDayChange >= 0 ? "+" : ""}{pDayPct.toFixed(2)}%
                            </div>
                          )}
                        </td>
                        <td className="num tabular hint">%{grandPct.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Aylık nakit akış — Recharts + 4 KPI */}
          <div style={{ marginTop: 16 }}>
            <CashflowCard months={months} badgeText={`${currentYear} YTD`} />
          </div>

          {/* Varlık sınıfı dağılımı — tek başına altta */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="card-title">Varlık Sınıfı Dağılımı</div>
            </div>
            <div style={{ padding: "12px 0" }}>
              {assetClassSlices.length === 0 ? (
                <div className="empty"><div>Veri yok</div></div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      height: 14,
                      margin: "0 20px 14px",
                      borderRadius: 7,
                      overflow: "hidden",
                    }}
                  >
                    {assetClassSlices.map((s) => {
                      const pct = (s.value / grandTotal) * 100;
                      return (
                        <div
                          key={s.label}
                          title={`${s.label}: ${fmt.tr(s.value, 0)} ₺ · %${pct.toFixed(1)}`}
                          style={{ background: s.color, width: `${pct}%` }}
                        />
                      );
                    })}
                  </div>
                  {assetClassSlices.map((s) => {
                    const pct = (s.value / grandTotal) * 100;
                    return (
                      <div
                        key={s.label}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto 60px",
                          gap: 12,
                          padding: "6px 20px",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 50, background: s.color }} />
                          <span style={{ fontSize: 13 }}>{s.label}</span>
                        </div>
                        <div className="tabular" style={{ fontWeight: 500, fontSize: 13 }}>
                          {fmt.trydp(s.value)}
                        </div>
                        <div className="hint tabular" style={{ textAlign: "right" }}>
                          %{pct.toFixed(1)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Tarihsel grafikler — daily_snapshots */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="card-title">Varlık Kompozisyonu &amp; Trend</div>
              <div className="card-sub">
                Son 6 ay · stacked area · {dailySnapshots.length} günlük snapshot
              </div>
            </div>
            <div style={{ padding: "16px 12px 12px" }}>
              <AssetCompositionChart rows={dailySnapshots} />
            </div>
          </div>

          {beneficiaries.length > 0 && dailySnapshots.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div className="card-title">Kişi Bazlı Hisse Portföyü Tarihsel</div>
                <div className="card-sub">son 6 ay · sadece hisse MV</div>
              </div>
              <div style={{ padding: "16px 12px 12px" }}>
                <PersonEquityChart
                  rows={dailySnapshots}
                  persons={beneficiaries
                    .filter((b) => dailySnapshots.some(
                      (s) => Number((s.equity_by_person as Record<string, number>)[b.id] ?? 0) > 0,
                    ))
                    .map((b) => ({
                      id: b.id,
                      name: b.name,
                      color: b.color ?? "#7d8699",
                    }))}
                />
              </div>
            </div>
          )}

          {/* Geçmiş Yıllar — sondan bir önceki */}
          {wealthSnapshots.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-head">
                <div className="card-title">Geçmiş Yıllar — Servet Büyümesi</div>
              </div>
              <table className="dg">
                <thead>
                  <tr>
                    <th>Dönem</th>
                    <th className="num">Toplam Servet</th>
                    <th className="num">Değişim (₺)</th>
                    <th className="num">YoY %</th>
                  </tr>
                </thead>
                <tbody>
                  {wealthSnapshots.map((s, i) => {
                    const prev = i > 0 ? Number(wealthSnapshots[i - 1].total_try) : null;
                    // Aktif yıl için snapshot eski olabilir — anlık grandTotal kullan
                    const snapYear = String(s.period).slice(0, 4);
                    const isCurrentYear = snapYear === String(currentYear);
                    const cur = isCurrentYear ? grandTotal : Number(s.total_try);
                    const diff = prev != null ? cur - prev : null;
                    const yoy = prev && prev > 0 ? (diff! / prev) * 100 : null;
                    const pos = (yoy ?? 0) >= 0;
                    const color = pos ? "var(--positive)" : "var(--negative)";
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>
                          {s.period}
                          {isCurrentYear && (
                            <span className="hint" style={{ marginLeft: 6, fontSize: 10, fontWeight: 400 }}>
                              · anlık
                            </span>
                          )}
                        </td>
                        <td className="num tabular" style={{ fontWeight: 600 }}>
                          {fmt.trydp(cur)}
                        </td>
                        <td className="num tabular" style={{ color: diff != null ? color : "var(--muted)" }}>
                          {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${fmt.tr(diff, 0)} ₺`}
                        </td>
                        <td className="num tabular" style={{ color: yoy != null ? color : "var(--muted)", fontWeight: 600 }}>
                          {yoy == null ? "—" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(2)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Reel Getiri — EN SON */}
          {wealthSnapshots.length >= 2 && benchmarkPoints.length > 0 && (() => {
            const byCodeByYear = new Map<string, Map<string, number>>();
            const codeName = new Map<string, string>();
            for (const p of benchmarkPoints) {
              const yr = p.as_of.slice(0, 4);
              if (!byCodeByYear.has(p.code)) byCodeByYear.set(p.code, new Map());
              const m = byCodeByYear.get(p.code)!;
              const existing = m.get(yr);
              if (existing == null || p.as_of >= (Array.from(m.keys()).find((k) => k === yr) ?? "")) {
                m.set(yr, Number(p.value));
              }
              codeName.set(p.code, p.name);
            }
            const codes = Array.from(codeName.keys()).filter((c) => c !== "CPI_TR");

            const yoyRows: Array<{
              year: string;
              portfolio: number | null;
              bench: Record<string, number | null>;
            }> = [];
            for (let i = 1; i < wealthSnapshots.length; i++) {
              const cur = wealthSnapshots[i];
              const prev = wealthSnapshots[i - 1];
              const yr = cur.period.slice(0, 4);
              const prevYr = prev.period.slice(0, 4);
              const portYoY = Number(prev.total_try) > 0
                ? ((Number(cur.total_try) - Number(prev.total_try)) / Number(prev.total_try)) * 100
                : null;
              const benchYoY: Record<string, number | null> = {};
              for (const c of codes) {
                const cv = byCodeByYear.get(c)?.get(yr);
                const pv = byCodeByYear.get(c)?.get(prevYr);
                benchYoY[c] = cv != null && pv != null && pv > 0 ? ((cv - pv) / pv) * 100 : null;
              }
              yoyRows.push({ year: yr, portfolio: portYoY, bench: benchYoY });
            }

            return (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-head">
                  <div className="card-title">Reel Getiri — Portföy vs Benchmark</div>
                </div>
                <table className="dg">
                  <thead>
                    <tr>
                      <th>Yıl</th>
                      <th className="num">Portföy</th>
                      {codes.map((c) => (
                        <th key={c} className="num">{codeName.get(c) ?? c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {yoyRows.map((r) => {
                      const port = r.portfolio;
                      const portColor =
                        port == null ? "var(--muted)" : port >= 0 ? "var(--positive)" : "var(--negative)";
                      return (
                        <tr key={r.year}>
                          <td style={{ fontWeight: 600 }}>{r.year}</td>
                          <td className="num tabular" style={{ color: portColor, fontWeight: 600 }}>
                            {port == null ? "—" : `${port >= 0 ? "+" : ""}${port.toFixed(2)}%`}
                          </td>
                          {codes.map((c) => {
                            const b = r.bench[c];
                            if (b == null || port == null) {
                              return <td key={c} className="num tabular hint">—</td>;
                            }
                            const excess = port - b;
                            const color = excess >= 0 ? "var(--positive)" : "var(--negative)";
                            return (
                              <td key={c} className="num tabular" style={{ color }}>
                                <div style={{ fontSize: 12 }}>{b >= 0 ? "+" : ""}{b.toFixed(1)}%</div>
                                <div className="hint" style={{ fontSize: 10, color }}>
                                  fark {excess >= 0 ? "+" : ""}{excess.toFixed(1)}%
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

/** Veri kaynaklarının son güncelleme zamanlarını "X dk önce" şeklinde gösterir. */
function DataFreshness({
  yahooLastUnix,
  truncgilDate,
}: {
  yahooLastUnix: number | null;
  truncgilDate: string | null | undefined;
}) {
  // Server component bir kez çalışır; Date.now() server-side deterministic
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const yahooDate = yahooLastUnix ? new Date(yahooLastUnix * 1000) : null;
  const truncDate = truncgilDate ? new Date(truncgilDate) : null;
  const fmtRel = (d: Date | null) => {
    if (!d) return null;
    const ms = now - d.getTime();
    if (ms < 0) return "az önce";
    const min = Math.floor(ms / 60000);
    if (min < 1) return "az önce";
    if (min < 60) return `${min} dk önce`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} sa önce`;
    const day = Math.floor(hr / 24);
    return `${day} gün önce`;
  };
  const fmtTime = (d: Date | null) =>
    d
      ? d.toLocaleString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        })
      : null;
  const items: Array<{ label: string; time: string; rel: string }> = [];
  const yt = fmtTime(yahooDate);
  const yr = fmtRel(yahooDate);
  if (yt && yr) items.push({ label: "Yahoo", time: yt, rel: yr });
  const tt = fmtTime(truncDate);
  const tr = fmtRel(truncDate);
  if (tt && tr) items.push({ label: "Truncgil", time: tt, rel: tr });
  if (items.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", gap: 10, fontSize: 11, color: "var(--muted)" }}>
      {items.map((i) => (
        <span key={i.label} title={i.time}>
          {i.label} · {i.rel}
        </span>
      ))}
    </span>
  );
}
