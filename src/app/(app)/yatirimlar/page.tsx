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

export const dynamic = "force-dynamic";

interface Group {
  portfolio: PortfolioRow;
  rows: HoldingRow[];
  total: number;
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

  // Portföy bazında grupla, grup içinde maliyet azalan
  const groups: Group[] = portfolios
    .map((p) => {
      const rows = holdings
        .filter((h) => h.portfolio_id === p.id)
        .sort((a, b) => Number(b.cost_basis_try) - Number(a.cost_basis_try));
      const total = rows.reduce((s, h) => s + Number(h.cost_basis_try), 0);
      return { portfolio: p, rows, total };
    })
    .filter((g) => g.rows.length > 0)
    // büyük portföy önde
    .sort((a, b) => b.total - a.total);

  const totalCost = groups.reduce((s, g) => s + g.total, 0);
  const positionCount = groups.reduce((s, g) => s + g.rows.length, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Yatırımlar</div>
          <div className="page-sub">Pozisyonlar · ortalama maliyet (WAC) · K/Z piyasa sprintinde.</div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <div className="title">
            <Icon name="wealth" size={20} /> Henüz pozisyon yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            <b>İşlemler</b> sekmesinden bir alım yap (örn. ASELS 200 adet 81,20 ₺) →
            otomatik pozisyon oluşur, WAC hesaplanır.
          </div>
        </div>
      ) : (
        <>
          <div className="grid-base grid-3" style={{ marginBottom: 18, gap: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>POZİSYON SAYISI</div>
              <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>
                {positionCount}{" "}
                <span className="hint" style={{ fontSize: 12, fontWeight: 400 }}>
                  · {groups.length} portföy
                </span>
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>TOPLAM MALİYET</div>
              <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>
                {fmt.trydp(totalCost)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>ANLIK DEĞER</div>
              <div
                className="tabular"
                style={{ fontSize: 16, fontWeight: 500, color: "var(--muted)" }}
              >
                Piyasa veri sprintinde
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            {groups.map((g) => {
              const share = totalCost > 0 ? (g.total / totalCost) * 100 : 0;
              return (
                <div key={g.portfolio.id} className="card">
                  <div className="card-head">
                    <div className="card-title">{g.portfolio.name}</div>
                    <div className="card-sub">{g.rows.length} pozisyon</div>
                    <div
                      className="tabular"
                      style={{ marginLeft: "auto", fontWeight: 700, fontSize: 16 }}
                    >
                      {fmt.trydp(g.total)}
                      <span className="hint" style={{ marginLeft: 8, fontWeight: 400, fontSize: 11 }}>
                        · %{share.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <table className="dg">
                    <thead>
                      <tr>
                        <th>Sembol</th>
                        <th>Sınıf</th>
                        <th className="num">Adet</th>
                        <th className="num">WAC (₺)</th>
                        <th className="num">Maliyet (₺)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((h) => {
                        const a = assetMap[h.asset_id];
                        return (
                          <tr key={`${h.portfolio_id}-${h.asset_id}`}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{a?.symbol ?? "?"}</div>
                              {a && <div className="hint">{a.name}</div>}
                            </td>
                            <td>
                              <span className="chip chip-sm">{a?.asset_class ?? "?"}</span>
                            </td>
                            <td className="num tabular">{fmt.tr(Number(h.quantity), 4)}</td>
                            <td className="num tabular">{fmt.tr(Number(h.wac_try), 2)}</td>
                            <td className="num tabular" style={{ fontWeight: 600 }}>
                              {fmt.tr(Number(h.cost_basis_try), 2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td colSpan={4} className="hint" style={{ textAlign: "right", fontWeight: 600 }}>
                          {g.portfolio.name} Toplam
                        </td>
                        <td className="num tabular" style={{ fontWeight: 700 }}>
                          {fmt.tr(g.total, 2)} ₺
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
            Anlık fiyatlar (BIST + döviz + altın + kripto) ve gerçekleşmemiş K/Z
            <b> Piyasa Veri sprintinde</b> gelecek. borsa-api ve TCMB entegre edilecek.
          </div>
        </>
      )}
    </div>
  );
}
