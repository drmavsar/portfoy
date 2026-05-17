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
import { getAssetChanges, getAssetRates } from "@/app/(app)/_lib/asset-rates";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";
import { listTransactionsForReports } from "@/app/(app)/_lib/reports-actions";
import { listBenchmarkPoints, listWealthSnapshots } from "@/app/(app)/_lib/wealth-snapshots-actions";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

const MONTH_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  return `${MONTH_TR[Number(m) - 1]} ${y.slice(2)}`;
}

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
  const [accounts, custodies, beneficiaries, fxRates, fxChanges, holdings, assets, portfolios, trades, txns, wealthSnapshots, benchmarkPoints] = await Promise.all([
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    getAssetRates(),
    getAssetChanges(),
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
  const portfolioMap = Object.fromEntries(portfolios.map((p) => [p.id, p]));
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
  const investmentCost = enriched.reduce((s, h) => s + h.cost, 0);
  const investmentPnl = investmentMv - investmentCost;

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
  // Sınıf bazlı topla
  const dayChangeMap = new Map<string, { label: string; color: string; change: number; value: number }>();
  const bumpDay = (key: string, label: string, color: string, change: number, value: number) => {
    const cur = dayChangeMap.get(key) ?? { label, color, change: 0, value: 0 };
    cur.change += change;
    cur.value += value;
    dayChangeMap.set(key, cur);
  };

  for (const a of accounts) {
    if (a.currency === "TRY") continue; // TRY'de günlük değişim yok
    const native = a.balance_native;
    const rate = fxRates[a.currency];
    const chgPct = fxChanges[a.currency];
    if (native == null || rate == null || chgPct == null) continue;
    const valueTry = Number(native) * rate;
    const dayDelta = valueTry * (chgPct / 100);
    const cls = classifyAccountClass(a.currency);
    bumpDay(cls.key, cls.label, cls.color, dayDelta, valueTry);
  }

  for (const h of enriched) {
    const asset = assetMap[h.asset_id];
    const quote = h.quote;
    if (!asset || !quote || !quote.previous_close) continue;
    const qty = Number(h.quantity);
    const dayDelta = qty * (quote.price - quote.previous_close);
    if (asset.asset_class === "equity_tr" || asset.asset_class === "equity_us") {
      bumpDay("equity", "Hisse", "#e26a8f", dayDelta, h.mv);
    } else if (asset.asset_class === "crypto") {
      bumpDay("crypto", "Kripto", "#b388f2", dayDelta, h.mv);
    } else if (asset.asset_class === "metal") {
      bumpDay("metal", "Altın & Gümüş", "#d4a056", dayDelta, h.mv);
    }
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
  const maxMonthVal = Math.max(
    ...months.map((m) => Math.max(m.inflow, m.outflow)),
    1,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Özet</div>
          <div className="page-sub">Servet ve nakit akış genel görünümü.</div>
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
              <div className="card-sub">
                {accounts.length} hesap · {portfolioGroups.length} yatırım portföyü
              </div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div
                className="tabular"
                style={{ fontSize: 36, fontWeight: 700, color: "var(--accent)" }}
              >
                {fmt.trydp(grandTotal)}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border-soft)",
                }}
              >
                <div>
                  <div className="hint" style={{ fontSize: 11, marginBottom: 4 }}>HESAPLAR</div>
                  <div className="tabular" style={{ fontSize: 18, fontWeight: 600 }}>
                    {fmt.trydp(accountTotal)}
                  </div>
                  <div className="hint" style={{ fontSize: 11 }}>
                    Nakit · döviz · altın · kripto
                  </div>
                </div>
                <div>
                  <div className="hint" style={{ fontSize: 11, marginBottom: 4 }}>YATIRIMLAR (MV)</div>
                  <div className="tabular" style={{ fontSize: 18, fontWeight: 600 }}>
                    {fmt.trydp(investmentMv)}
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: 11,
                      color: investmentPnl >= 0 ? "var(--positive)" : "var(--negative)",
                    }}
                  >
                    K/Z: {investmentPnl >= 0 ? "+" : ""}{fmt.tr(investmentPnl, 0)} ₺
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bugünkü Servet Değişimi — Toplam Servet hemen altında */}
          {dayChangeRows.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-head">
                <div className="card-title">Bugünkü Servet Değişimi</div>
                <div className="card-sub">varlık sınıfı bazlı katkı · anlık piyasa</div>
                <div
                  className="tabular"
                  style={{
                    marginLeft: "auto",
                    fontSize: 22,
                    fontWeight: 700,
                    color: totalDayChange >= 0 ? "var(--positive)" : "var(--negative)",
                  }}
                >
                  {totalDayChange >= 0 ? "+" : ""}
                  {fmt.tr(totalDayChange, 0)} ₺
                </div>
              </div>
              <table className="dg">
                <thead>
                  <tr>
                    <th>Varlık Sınıfı</th>
                    <th className="num">Değer</th>
                    <th className="num">Bugün (₺)</th>
                    <th className="num">Bugün %</th>
                    <th style={{ width: "30%" }}>Katkı</th>
                  </tr>
                </thead>
                <tbody>
                  {dayChangeRows.map((r) => {
                    const color = r.change >= 0 ? "var(--positive)" : "var(--negative)";
                    const maxAbs = Math.max(
                      ...dayChangeRows.map((x) => Math.abs(x.change)),
                      1,
                    );
                    const widthPct = (Math.abs(r.change) / maxAbs) * 100;
                    return (
                      <tr key={r.label}>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 50, background: r.color }} />
                            {r.label}
                          </span>
                        </td>
                        <td className="num tabular hint">{fmt.trydp(r.value)}</td>
                        <td className="num tabular" style={{ color, fontWeight: 600 }}>
                          {r.change >= 0 ? "+" : ""}{fmt.tr(r.change, 0)} ₺
                        </td>
                        <td className="num tabular" style={{ color }}>
                          {r.pct >= 0 ? "+" : ""}{r.pct.toFixed(2)}%
                        </td>
                        <td>
                          <div
                            style={{
                              height: 8,
                              background: color,
                              borderRadius: 4,
                              width: `${Math.max(4, widthPct)}%`,
                              marginLeft: r.change >= 0 ? 0 : "auto",
                              opacity: 0.7,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div
                className="hint"
                style={{ padding: "10px 16px", borderTop: "1px solid var(--border-soft)", fontSize: 11 }}
              >
                Hisse: anlık fiyat − önceki kapanış. Döviz/Altın/Kripto: Truncgil günlük %
                değişimi. Bazı semboller için günlük veri yoksa sınıf toplamına dahil edilmez.
              </div>
            </div>
          )}

          <div className="grid-base grid-2" style={{ gap: 16, alignItems: "start" }}>
            {groupedAccounts.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Kurum Bazlı Hesap Dağılımı</div>
                  <div className="card-sub">altında kişi kırılımı</div>
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

            {portfolioGroups.length > 0 && (
              <div className="card">
                <div className="card-head">
                  <div className="card-title">Yatırım Portföy Dağılımı</div>
                </div>
                <div style={{ padding: "12px 0" }}>
                  {portfolioGroups.map((g) => {
                    const pct = investmentMv > 0 ? (g.mv / investmentMv) * 100 : 0;
                    return (
                      <div
                        key={g.name}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto 60px",
                          gap: 12,
                          padding: "8px 20px",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ fontSize: 13 }}>
                          {g.name}
                          <span className="hint" style={{ marginLeft: 8 }}>
                            · {g.count} pozisyon
                          </span>
                        </div>
                        <div className="tabular" style={{ fontWeight: 500, fontSize: 13 }}>
                          {fmt.trydp(g.mv)}
                        </div>
                        <div className="hint tabular" style={{ textAlign: "right" }}>
                          %{pct.toFixed(1)}
                        </div>
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
                <div className="card-sub">hesap + yatırım MV</div>
              </div>
              <table className="dg">
                <thead>
                  <tr>
                    <th>Kişi</th>
                    <th className="num">Hesaplar</th>
                    <th className="num">Yatırımlar</th>
                    <th className="num">Toplam</th>
                    <th className="num" style={{ width: 80 }}>Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {personRows.map((p) => {
                    const grandPct = grandTotal > 0 ? (p.total / grandTotal) * 100 : 0;
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
                        <td className="num tabular hint">%{grandPct.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Yıl-bazlı geçmiş servet karşılaştırması */}
          {wealthSnapshots.length > 0 && (() => {
            const maxVal = Math.max(...wealthSnapshots.map((s) => Number(s.total_try)), 1);
            return (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-head">
                  <div className="card-title">Geçmiş Yıllar — Servet Büyümesi</div>
                  <div className="card-sub">YoY % değişim</div>
                </div>
                <table className="dg">
                  <thead>
                    <tr>
                      <th>Dönem</th>
                      <th className="num">Toplam Servet</th>
                      <th className="num">Değişim (₺)</th>
                      <th className="num">YoY %</th>
                      <th style={{ width: "30%" }}>Görsel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wealthSnapshots.map((s, i) => {
                      const prev = i > 0 ? Number(wealthSnapshots[i - 1].total_try) : null;
                      const cur = Number(s.total_try);
                      const diff = prev != null ? cur - prev : null;
                      const yoy = prev && prev > 0 ? (diff! / prev) * 100 : null;
                      const widthPct = (cur / maxVal) * 100;
                      const pos = (yoy ?? 0) >= 0;
                      const color = pos ? "var(--positive)" : "var(--negative)";
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.period}</td>
                          <td className="num tabular" style={{ fontWeight: 600 }}>
                            {fmt.trydp(cur)}
                          </td>
                          <td className="num tabular" style={{ color: diff != null ? color : "var(--muted)" }}>
                            {diff == null ? "—" : `${diff >= 0 ? "+" : ""}${fmt.tr(diff, 0)} ₺`}
                          </td>
                          <td className="num tabular" style={{ color: yoy != null ? color : "var(--muted)", fontWeight: 600 }}>
                            {yoy == null ? "—" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(2)}%`}
                          </td>
                          <td>
                            <div
                              style={{
                                height: 8,
                                background: "var(--accent)",
                                borderRadius: 4,
                                width: `${widthPct}%`,
                                opacity: 0.6,
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Reel Getiri: Portföy YoY vs benchmark YoY karşılaştırması */}
          {wealthSnapshots.length >= 2 && benchmarkPoints.length > 0 && (() => {
            // Her benchmark code için yıl sonu (Aralık veya en sonki) değerini al
            const byCodeByYear = new Map<string, Map<string, number>>();
            const codeName = new Map<string, string>();
            for (const p of benchmarkPoints) {
              const yr = p.as_of.slice(0, 4);
              if (!byCodeByYear.has(p.code)) byCodeByYear.set(p.code, new Map());
              const m = byCodeByYear.get(p.code)!;
              // Her yıl için en geç tarihli değeri kullan
              const existing = m.get(yr);
              if (existing == null || p.as_of >= (Array.from(m.keys()).find((k) => k === yr) ?? "")) {
                m.set(yr, Number(p.value));
              }
              codeName.set(p.code, p.name);
            }
            const codes = Array.from(codeName.keys()).filter((c) => c !== "CPI_TR");

            // Yıl çiftleri için YoY hesabı
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
                  <div className="card-sub">
                    YoY % · pozitif fark = benchmark&apos;ı geçtin, negatif = altında kaldın
                  </div>
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
                <div
                  className="hint"
                  style={{ padding: "10px 16px", borderTop: "1px solid var(--border-soft)", fontSize: 11 }}
                >
                  Her hücrede üst satır benchmark&apos;ın yıllık % değişimi, alt satır portföyünün
                  benchmark&apos;a göre farkı (excess return). Pozitif yeşil = senin yılın daha iyi.
                </div>
              </div>
            );
          })()}

          {/* 12 ay nakit akış + varlık sınıfı dağılımı yan yana */}
          <div className="grid-base grid-2" style={{ gap: 16, marginTop: 16, alignItems: "start" }}>
            <div className="card">
              <div className="card-head">
                <div className="card-title">Aylık Nakit Akış (YTD)</div>
                <div className="card-sub">{currentYear} yılı · yeşil gelir, kırmızı gider</div>
              </div>
              <div style={{ padding: "20px 24px 24px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${months.length}, 1fr)`,
                    gap: 6,
                    alignItems: "end",
                    height: 160,
                  }}
                >
                  {months.map((b) => {
                    const inH = (b.inflow / maxMonthVal) * 100;
                    const outH = (b.outflow / maxMonthVal) * 100;
                    return (
                      <div
                        key={b.period}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          height: "100%",
                          justifyContent: "flex-end",
                          position: "relative",
                        }}
                      >
                        <div style={{ display: "flex", gap: 2, height: "100%", alignItems: "flex-end" }}>
                          <div
                            title={`Gelir ${fmt.tr(b.inflow, 0)} ₺`}
                            style={{
                              width: 8,
                              height: `${inH}%`,
                              background: "var(--positive)",
                              borderRadius: "2px 2px 0 0",
                              minHeight: b.inflow > 0 ? 2 : 0,
                            }}
                          />
                          <div
                            title={`Gider ${fmt.tr(b.outflow, 0)} ₺`}
                            style={{
                              width: 8,
                              height: `${outH}%`,
                              background: "var(--negative)",
                              borderRadius: "2px 2px 0 0",
                              minHeight: b.outflow > 0 ? 2 : 0,
                            }}
                          />
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 9,
                            color: "var(--muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {monthLabel(b.period).slice(0, 3)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div className="card-title">Varlık Sınıfı Dağılımı</div>
                <div className="card-sub">hesap + yatırım MV birleşik</div>
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
          </div>
        </>
      )}
    </div>
  );
}
