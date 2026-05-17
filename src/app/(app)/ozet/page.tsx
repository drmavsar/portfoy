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
import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";
import { listTransactionsForReports } from "@/app/(app)/_lib/reports-actions";
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
  const [accounts, custodies, beneficiaries, fxRates, holdings, assets, portfolios, trades, txns] = await Promise.all([
    listAccounts(),
    listCustodyLocations(),
    listBeneficiariesLite(),
    getAssetRates(),
    listHoldings(),
    listAssets(),
    listPortfolios(),
    listTrades(),
    listTransactionsForReports(12),
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
    return { ...h, mv, cost };
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
