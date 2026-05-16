import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import {
  listAssets,
  listHoldings,
  listPortfolios,
} from "@/app/(app)/_lib/wealth-actions";

export const dynamic = "force-dynamic";

export default async function YatirimlarPage() {
  const [holdings, assets, portfolios] = await Promise.all([
    listHoldings(),
    listAssets(),
    listPortfolios(),
  ]);

  const assetMap = Object.fromEntries(assets.map((a) => [a.id, a]));
  const portfolioMap = Object.fromEntries(portfolios.map((p) => [p.id, p]));

  const totalCost = holdings.reduce((s, h) => s + Number(h.cost_basis_try), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Yatırımlar</div>
          <div className="page-sub">Pozisyonlar · ortalama maliyet (WAC) · K/Z piyasa sprintinde.</div>
        </div>
      </div>

      {holdings.length === 0 ? (
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
                {holdings.length}
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

          <div className="card">
            <div className="card-head">
              <div className="card-title">Pozisyonlar</div>
              <div className="card-sub">v_holdings_wac (Supabase view) · WAC otomatik</div>
            </div>
            <table className="dg">
              <thead>
                <tr>
                  <th>Sembol</th>
                  <th>Sınıf</th>
                  <th>Portföy</th>
                  <th className="num">Adet</th>
                  <th className="num">WAC (₺)</th>
                  <th className="num">Maliyet (₺)</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const a = assetMap[h.asset_id];
                  const p = portfolioMap[h.portfolio_id];
                  return (
                    <tr key={`${h.portfolio_id}-${h.asset_id}`}>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{a?.symbol ?? "?"}</div>
                        {a && <div className="hint">{a.name}</div>}
                      </td>
                      <td>
                        <span className="chip chip-sm">{a?.asset_class ?? "?"}</span>
                      </td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{p?.name ?? "—"}</td>
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
                  <td colSpan={5} className="hint" style={{ textAlign: "right", fontWeight: 600 }}>
                    Toplam Maliyet
                  </td>
                  <td className="num tabular" style={{ fontWeight: 700 }}>
                    {fmt.tr(totalCost, 2)} ₺
                  </td>
                </tr>
              </tfoot>
            </table>
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
