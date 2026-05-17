import { listAssets, type AssetRow } from "@/app/(app)/_lib/wealth-actions";
import { getBistIndices } from "@/app/(app)/_lib/market-indices";
import { getStockPricesExtended, type StockQuoteExt } from "@/app/(app)/_lib/stock-prices";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

type Mover = { asset: AssetRow; quote: StockQuoteExt };

function MoversCard({
  title,
  rows,
  getter,
  pos,
}: {
  title: string;
  rows: Mover[];
  getter: (q: StockQuoteExt) => number | null;
  pos: boolean;
}) {
  const filtered = rows.filter((r) => {
    const v = getter(r.quote);
    return v != null && (pos ? v > 0 : v < 0);
  });
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title" style={{ fontSize: 13 }}>{title}</div>
      </div>
      {filtered.length === 0 ? (
        <div className="empty" style={{ padding: "16px 14px" }}><div>—</div></div>
      ) : (
        <table className="dg">
          <tbody>
            {filtered.map((r) => {
              const v = getter(r.quote) ?? 0;
              const color = v >= 0 ? "var(--positive)" : "var(--negative)";
              return (
                <tr key={r.asset.symbol}>
                  <td style={{ fontSize: 12, padding: "6px 12px" }}>
                    {r.asset.external_url ? (
                      <a
                        href={r.asset.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit", textDecoration: "none", fontWeight: 600, borderBottom: "1px dotted var(--muted)" }}
                      >
                        {r.asset.symbol}
                      </a>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{r.asset.symbol}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--muted)", padding: "6px 8px" }}>
                    {r.asset.name}
                  </td>
                  <td className="num tabular" style={{ color, fontWeight: 600, fontSize: 12, padding: "6px 12px" }}>
                    {v >= 0 ? "+" : ""}{v.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const [assets, indices] = await Promise.all([listAssets(), getBistIndices()]);

  const bistSymbols = assets
    .filter((a) => a.asset_class === "equity_tr")
    .map((a) => a.symbol);
  const quotes = await getStockPricesExtended(bistSymbols);

  const stockRows = assets
    .filter((a) => a.asset_class === "equity_tr" && quotes[a.symbol])
    .map((a) => ({
      asset: a,
      quote: quotes[a.symbol],
    }))
    .sort((a, b) => (b.quote.change_pct ?? 0) - (a.quote.change_pct ?? 0));

  // Günlük en çok artan/azalan (top 5)
  const dayGainers = [...stockRows].sort((a, b) => (b.quote.change_pct ?? 0) - (a.quote.change_pct ?? 0)).slice(0, 5);
  const dayLosers = [...stockRows].sort((a, b) => (a.quote.change_pct ?? 0) - (b.quote.change_pct ?? 0)).slice(0, 5);
  const weekGainers = [...stockRows].sort((a, b) => (b.quote.week_change_pct ?? 0) - (a.quote.week_change_pct ?? 0)).slice(0, 5);
  const weekLosers = [...stockRows].sort((a, b) => (a.quote.week_change_pct ?? 0) - (b.quote.week_change_pct ?? 0)).slice(0, 5);
  const monthGainers = [...stockRows].sort((a, b) => (b.quote.month_change_pct ?? 0) - (a.quote.month_change_pct ?? 0)).slice(0, 5);
  const monthLosers = [...stockRows].sort((a, b) => (a.quote.month_change_pct ?? 0) - (b.quote.month_change_pct ?? 0)).slice(0, 5);

  const xu100 = indices.main.find((m) => m.symbol === "XU100");
  const xu030 = indices.main.find((m) => m.symbol === "XU030");

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Piyasa Radarı</div>
          <div className="page-sub">
            BIST endeksleri · sektör rotasyonu · hisse listesi · Yahoo Finance (15 dk gecikme)
          </div>
        </div>
      </div>

      {/* Ana endeksler */}
      <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18 }}>
        {[xu100, xu030].map((idx) =>
          idx ? (
            <div key={idx.symbol} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {idx.symbol}
                </span>
                <span style={{ fontSize: 13, color: "var(--fg-soft)" }}>{idx.label}</span>
              </div>
              <div
                className="tabular"
                style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}
              >
                {fmt.tr(idx.price, 2)}
              </div>
              {idx.change_pct != null && (
                <div
                  className="tabular"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: idx.change_pct >= 0 ? "var(--positive)" : "var(--negative)",
                  }}
                >
                  {idx.change_pct >= 0 ? "▲" : "▼"} {Math.abs(idx.change_pct).toFixed(2)}% bugün
                </div>
              )}
            </div>
          ) : null,
        )}
      </div>

      {/* Sektör rotasyonu */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Sektör Rotasyonu</div>
          <div className="card-sub">günlük değişim · azalan sıralı</div>
        </div>
        {indices.sectors.length === 0 ? (
          <div className="empty"><div>Sektör endeksleri çekilemedi.</div></div>
        ) : (
          <table className="dg">
            <thead>
              <tr>
                <th>Endeks</th>
                <th>Sektör</th>
                <th className="num">Son</th>
                <th className="num">Günlük</th>
                <th style={{ width: "30%" }}>Görsel</th>
              </tr>
            </thead>
            <tbody>
              {indices.sectors.map((s) => {
                const chg = s.change_pct ?? 0;
                const pos = chg >= 0;
                const color = pos ? "var(--positive)" : "var(--negative)";
                const maxAbs = Math.max(
                  ...indices.sectors.map((x) => Math.abs(x.change_pct ?? 0)),
                  1,
                );
                const pct = (Math.abs(chg) / maxAbs) * 100;
                return (
                  <tr key={s.symbol}>
                    <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                      {s.symbol}
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</td>
                    <td className="num tabular">{fmt.tr(s.price, 0)}</td>
                    <td className="num tabular" style={{ color, fontWeight: 600 }}>
                      {pos ? "+" : ""}
                      {chg.toFixed(2)}%
                    </td>
                    <td>
                      <div
                        style={{
                          height: 6,
                          background: color,
                          borderRadius: 3,
                          width: `${Math.max(4, pct)}%`,
                          marginLeft: pos ? 0 : "auto",
                          opacity: 0.7,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Movers — günlük / haftalık / aylık ikilileri */}
      {stockRows.length > 0 && (
        <div className="grid-base grid-3" style={{ gap: 16, marginBottom: 18 }}>
          <MoversCard title="Günlük En Çok Artan"  rows={dayGainers}  getter={(q) => q.change_pct} pos />
          <MoversCard title="Haftalık En Çok Artan" rows={weekGainers} getter={(q) => q.week_change_pct} pos />
          <MoversCard title="Aylık En Çok Artan"   rows={monthGainers} getter={(q) => q.month_change_pct} pos />
          <MoversCard title="Günlük En Çok Azalan" rows={dayLosers}    getter={(q) => q.change_pct} pos={false} />
          <MoversCard title="Haftalık En Çok Azalan" rows={weekLosers} getter={(q) => q.week_change_pct} pos={false} />
          <MoversCard title="Aylık En Çok Azalan"  rows={monthLosers}  getter={(q) => q.month_change_pct} pos={false} />
        </div>
      )}

      {/* Tüm hisseler */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Hisse Listesi (Tüm)</div>
          <div className="card-sub">
            {stockRows.length} sembol · günlük değişim azalan sıralı
          </div>
        </div>
        {stockRows.length === 0 ? (
          <div className="empty">
            <div className="title">Hisse fiyatı çekilemedi</div>
            <div>Yahoo Finance servisi yanıt vermiyor.</div>
          </div>
        ) : (
          <table className="dg">
            <thead>
              <tr>
                <th>Sembol</th>
                <th>Ad</th>
                <th className="num">Son</th>
                <th className="num">Günlük</th>
                <th className="num">Haftalık</th>
                <th className="num">Aylık</th>
                <th>Sektör</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map((r) => {
                const d = r.quote.change_pct ?? 0;
                const w = r.quote.week_change_pct;
                const m = r.quote.month_change_pct;
                const pctColor = (v: number | null) =>
                  v == null ? "var(--muted)" : v >= 0 ? "var(--positive)" : "var(--negative)";
                const pctText = (v: number | null) =>
                  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
                return (
                  <tr key={r.asset.symbol}>
                    <td>
                      {r.asset.external_url ? (
                        <a
                          href={r.asset.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "inherit", textDecoration: "none", fontWeight: 600, borderBottom: "1px dotted var(--muted)" }}
                        >
                          {r.asset.symbol}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{r.asset.symbol}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.asset.name}</td>
                    <td className="num tabular">{fmt.tr(r.quote.price, 2)} ₺</td>
                    <td className="num tabular" style={{ color: pctColor(d), fontWeight: 600 }}>{pctText(d)}</td>
                    <td className="num tabular" style={{ color: pctColor(w) }}>{pctText(w)}</td>
                    <td className="num tabular" style={{ color: pctColor(m) }}>{pctText(m)}</td>
                    <td style={{ fontSize: 11, color: "var(--muted)" }}>{r.asset.sector ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div
        className="hint"
        style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8 }}
      >
        <Icon name="screener" size={12} /> Veri kaynağı: Yahoo Finance (BIST · 15 dk gecikmeli) ·
        5 dk cache. KAP duyuruları, hisse arama ve screener filtreleri sonraki sprintte.
      </div>
    </div>
  );
}
