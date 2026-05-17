import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import {
  listAssets,
  listHoldings,
  listPortfolios,
  type AssetRow,
  type HoldingRow,
  type PortfolioRow,
} from "@/app/(app)/_lib/wealth-actions";
import { getStockPrices, type StockQuote } from "@/app/(app)/_lib/stock-prices";

export const dynamic = "force-dynamic";

interface EnrichedHolding extends HoldingRow {
  asset: AssetRow | undefined;
  quote: StockQuote | undefined;
  market_value: number;
  pnl: number;
  pnl_pct: number | null;
}

interface Group {
  portfolio: PortfolioRow;
  rows: EnrichedHolding[];
  cost: number;
  mv: number;
  pnl: number;
  pnl_pct: number | null;
}

export default async function YatirimlarPage() {
  const [holdings, assets, portfolios] = await Promise.all([
    listHoldings(),
    listAssets(),
    listPortfolios(),
  ]);

  const assetMap: Record<string, AssetRow> = Object.fromEntries(
    assets.map((a) => [a.id, a]),
  );

  // BIST hisseleri için anlık fiyat çek
  const bistSymbols = holdings
    .map((h) => assetMap[h.asset_id])
    .filter((a): a is AssetRow => !!a && a.asset_class === "equity_tr")
    .map((a) => a.symbol);

  const quotes = await getStockPrices(bistSymbols);

  // Holding'leri zenginleştir
  const enriched: EnrichedHolding[] = holdings.map((h) => {
    const asset = assetMap[h.asset_id];
    const quote = asset ? quotes[asset.symbol] : undefined;
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis_try);
    const mv = quote ? qty * quote.price : cost;
    const pnl = mv - cost;
    const pnl_pct = cost > 0 ? (pnl / cost) * 100 : null;
    return { ...h, asset, quote, market_value: mv, pnl, pnl_pct };
  });

  // Portföy bazında grupla, maliyet azalan
  const groups: Group[] = portfolios
    .map((p) => {
      const rows = enriched
        .filter((h) => h.portfolio_id === p.id)
        .sort((a, b) => b.market_value - a.market_value);
      const cost = rows.reduce((s, h) => s + Number(h.cost_basis_try), 0);
      const mv = rows.reduce((s, h) => s + h.market_value, 0);
      const pnl = mv - cost;
      const pnl_pct = cost > 0 ? (pnl / cost) * 100 : null;
      return { portfolio: p, rows, cost, mv, pnl, pnl_pct };
    })
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => b.mv - a.mv);

  const totalCost = groups.reduce((s, g) => s + g.cost, 0);
  const totalMv = groups.reduce((s, g) => s + g.mv, 0);
  const totalPnl = totalMv - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const positionCount = groups.reduce((s, g) => s + g.rows.length, 0);

  const quotedCount = enriched.filter((h) => h.quote).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Yatırımlar</div>
          <div className="page-sub">
            Anlık fiyat + WAC + gerçekleşmemiş K/Z · {quotedCount}/{enriched.length} sembol Yahoo Finance'tan
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <div className="title">
            <Icon name="wealth" size={20} /> Henüz pozisyon yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            <b>İşlemler</b> sekmesinden bir alım yap → otomatik pozisyon oluşur, WAC hesaplanır.
          </div>
        </div>
      ) : (
        <>
          <div className="grid-base grid-4" style={{ marginBottom: 18, gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>POZİSYON</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>
                {positionCount}
                <span className="hint" style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                  · {groups.length} portföy
                </span>
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>TOPLAM MALİYET</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>
                {fmt.trydp(totalCost)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>ANLIK DEĞER</div>
              <div className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>
                {fmt.trydp(totalMv)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>K/Z</div>
              <div
                className="tabular"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: totalPnl >= 0 ? "var(--positive)" : "var(--negative)",
                }}
              >
                {totalPnl >= 0 ? "+" : ""}
                {fmt.trydp(totalPnl)}
              </div>
              {totalPnlPct != null && (
                <div
                  className="hint tabular"
                  style={{
                    fontSize: 11,
                    color: totalPnl >= 0 ? "var(--positive)" : "var(--negative)",
                  }}
                >
                  {totalPnl >= 0 ? "+" : ""}
                  {totalPnlPct.toFixed(2)}%
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            {groups.map((g) => {
              const share = totalMv > 0 ? (g.mv / totalMv) * 100 : 0;
              return (
                <div key={g.portfolio.id} className="card">
                  <div className="card-head">
                    <div className="card-title">{g.portfolio.name}</div>
                    <div className="card-sub">
                      {g.rows.length} pozisyon · %{share.toFixed(1)} pay
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 700, fontSize: 16 }}>
                        {fmt.trydp(g.mv)}
                      </div>
                      {g.pnl_pct != null && (
                        <div
                          className="tabular hint"
                          style={{
                            fontSize: 11,
                            color: g.pnl >= 0 ? "var(--positive)" : "var(--negative)",
                          }}
                        >
                          {g.pnl >= 0 ? "+" : ""}
                          {fmt.tr(g.pnl, 0)} ₺ · {g.pnl >= 0 ? "+" : ""}
                          {g.pnl_pct.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <table className="dg">
                    <thead>
                      <tr>
                        <th>Sembol</th>
                        <th className="num">Adet</th>
                        <th className="num">WAC</th>
                        <th className="num">Son</th>
                        <th className="num">Günlük</th>
                        <th className="num">Maliyet</th>
                        <th className="num">Değer</th>
                        <th className="num">K/Z</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((h) => {
                        const sign = h.pnl >= 0 ? "+" : "";
                        const color = h.pnl >= 0 ? "var(--positive)" : "var(--negative)";
                        const dailyColor = h.quote?.change_pct == null
                          ? "var(--muted)"
                          : h.quote.change_pct >= 0
                            ? "var(--positive)"
                            : "var(--negative)";
                        return (
                          <tr key={`${h.portfolio_id}-${h.asset_id}`}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {h.asset?.symbol ?? "?"}
                              </div>
                              {h.asset && <div className="hint">{h.asset.name}</div>}
                            </td>
                            <td className="num tabular">{fmt.tr(Number(h.quantity), 4)}</td>
                            <td className="num tabular">{fmt.tr(Number(h.wac_try), 2)}</td>
                            <td className="num tabular">
                              {h.quote ? `${fmt.tr(h.quote.price, 2)}` : "—"}
                            </td>
                            <td className="num tabular" style={{ color: dailyColor }}>
                              {h.quote?.change_pct != null
                                ? `${h.quote.change_pct >= 0 ? "+" : ""}${h.quote.change_pct.toFixed(2)}%`
                                : "—"}
                            </td>
                            <td className="num tabular">{fmt.tr(Number(h.cost_basis_try), 0)}</td>
                            <td className="num tabular" style={{ fontWeight: 600 }}>
                              {fmt.tr(h.market_value, 0)}
                            </td>
                            <td className="num tabular" style={{ color, fontWeight: 600 }}>
                              {sign}
                              {fmt.tr(h.pnl, 0)}
                              {h.pnl_pct != null && (
                                <div className="hint" style={{ fontSize: 10, color }}>
                                  {sign}
                                  {h.pnl_pct.toFixed(1)}%
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td colSpan={5} className="hint" style={{ textAlign: "right", fontWeight: 600 }}>
                          {g.portfolio.name} Toplam
                        </td>
                        <td className="num tabular">{fmt.tr(g.cost, 0)}</td>
                        <td className="num tabular" style={{ fontWeight: 700 }}>
                          {fmt.tr(g.mv, 0)}
                        </td>
                        <td
                          className="num tabular"
                          style={{
                            fontWeight: 700,
                            color: g.pnl >= 0 ? "var(--positive)" : "var(--negative)",
                          }}
                        >
                          {g.pnl >= 0 ? "+" : ""}
                          {fmt.tr(g.pnl, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>

          <div
            className="hint"
            style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8 }}
          >
            Fiyat kaynağı: Yahoo Finance (BIST · 15 dk gecikmeli) · 5 dk cache. Altın/kripto
            sonraki adımda eklenecek.
          </div>
        </>
      )}
    </div>
  );
}
