import {
  listAccounts,
  listCustodyLocations,
  type AccountRow,
} from "@/app/(app)/hesaplar/actions";
import {
  listAssets,
  listHoldings,
  listPortfolios,
} from "@/app/(app)/_lib/wealth-actions";
import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

export const dynamic = "force-dynamic";

function tryValueOf(a: AccountRow, fxRates: Record<string, number | undefined>): number {
  if (a.currency === "TRY") return a.balance_try ?? a.opening_balance ?? 0;
  const native = a.balance_native;
  const rate = fxRates[a.currency];
  if (native != null && rate != null) return Number(native) * rate;
  return a.balance_try ?? 0;
}

export default async function OzetPage() {
  const [accounts, custodies, fxRates, holdings, assets, portfolios] = await Promise.all([
    listAccounts(),
    listCustodyLocations(),
    getAssetRates(),
    listHoldings(),
    listAssets(),
    listPortfolios(),
  ]);

  // Hesap totalleri
  const accountTotal = accounts.reduce((s, a) => s + tryValueOf(a, fxRates), 0);

  const byCustody = new Map<string, { name: string; color: string; total: number }>();
  for (const c of custodies) {
    byCustody.set(c.id, { name: c.name, color: c.color ?? "#6ea8fe", total: 0 });
  }
  for (const a of accounts) {
    if (!a.custody_id) continue;
    const g = byCustody.get(a.custody_id);
    if (!g) continue;
    g.total += tryValueOf(a, fxRates);
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
                </div>
                <div style={{ padding: "12px 0" }}>
                  {groupedAccounts.map((g) => {
                    const pct = accountTotal > 0 ? (g.total / accountTotal) * 100 : 0;
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
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 50,
                              background: g.color,
                            }}
                          />
                          <span style={{ fontSize: 13 }}>{g.name}</span>
                        </div>
                        <div className="tabular" style={{ fontWeight: 500, fontSize: 13 }}>
                          {fmt.trydp(g.total)}
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

          <div
            className="hint"
            style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8 }}
          >
            Gelir-gider trendi, varlık sınıfı dağılımı, korelasyon haritası gibi zengin widget'lar
            ilerleyen sprint'lerde gelecek.
          </div>
        </>
      )}
    </div>
  );
}
