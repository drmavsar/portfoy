import { RefreshButton } from "@/app/(app)/_components/refresh-button";
import {
  getSymbolIndexMap,
  getXK100Symbols,
  type IndexBadge,
} from "@/app/(app)/_lib/bist-index-members";
import { getBistIndices } from "@/app/(app)/_lib/market-indices";
import { getStockPricesExtended, type StockQuoteExt } from "@/app/(app)/_lib/stock-prices";
import { listAssets, listHoldings } from "@/app/(app)/_lib/wealth-actions";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

type Mover = {
  symbol: string;
  name: string;
  external_url: string | null;
  owned: boolean;
  indices: IndexBadge[];
  quote: StockQuoteExt;
};

function Sparkline({
  values,
  color,
  width = 130,
  height = 30,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) {
    return <span className="hint">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const last = values[values.length - 1];
  const lastX = (values.length - 1) * stepX;
  const lastY = height - ((last - min) / range) * height;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={path} stroke={color} strokeWidth={1.5} fill="none" />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}

function OwnedDot() {
  return (
    <span title="Portföyünde" style={{ marginLeft: 5, color: "var(--positive)", fontSize: 9 }}>
      ●
    </span>
  );
}

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
                <tr key={r.symbol}>
                  <td style={{ fontSize: 12, padding: "6px 12px" }}>
                    {r.external_url ? (
                      <a
                        href={r.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit", textDecoration: "none", fontWeight: 600, borderBottom: "1px dotted var(--muted)" }}
                      >
                        {r.symbol}
                      </a>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                    )}
                    {r.owned && <OwnedDot />}
                  </td>
                  <td style={{ fontSize: 11, color: "var(--muted)", padding: "6px 8px" }}>
                    {r.name}
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
  const [assets, indices, bistSymbols, symbolIndexMap, holdings] = await Promise.all([
    listAssets(),
    getBistIndices(),
    getXK100Symbols(),
    getSymbolIndexMap(),
    listHoldings(),
  ]);

  // Hisse listesi piyasa geneli — BIST 100 üye listesi taranır (sadece
  // portföydeki hisseler değil). Böylece yeni yukarı-trend adayları yakalanır.
  const quotes = await getStockPricesExtended(bistSymbols);

  const assetMap = new Map(
    assets.filter((a) => a.asset_class === "equity_tr").map((a) => [a.symbol, a]),
  );

  // "Portföyünde" ● işareti gerçek pozisyona dayanır — assets satırının
  // varlığına değil. assets master artık tüm BIST 100'ü kapsadığı için
  // ownership yalnız net adedi > 0 olan holding'lerden türetilir.
  const assetIdToSymbol = new Map(assets.map((a) => [a.id, a.symbol]));
  const ownedSymbols = new Set(
    holdings
      .filter((h) => h.quantity > 0)
      .map((h) => assetIdToSymbol.get(h.asset_id))
      .filter((s): s is string => !!s),
  );

  const stockRows: Mover[] = bistSymbols
    .filter((sym) => quotes[sym])
    .map((sym) => {
      const a = assetMap.get(sym);
      const info = symbolIndexMap[sym];
      return {
        symbol: sym,
        name: a?.name ?? info?.name ?? sym,
        external_url: a?.external_url ?? null,
        owned: ownedSymbols.has(sym),
        indices: info?.indices ?? [],
        quote: quotes[sym],
      };
    })
    .sort((a, b) => (b.quote.change_pct ?? 0) - (a.quote.change_pct ?? 0));

  // Günlük / haftalık / aylık en çok artan/azalan (top 5)
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
            BIST 100 piyasa geneli · en çok hareket edenler · sektör rotasyonu · Yahoo Finance (15 dk gecikme)
          </div>
        </div>
        <div className="page-actions">
          <RefreshButton />
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
          <div className="card-sub">son ay trend + günlük değişim · günlük azalan sıralı</div>
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
                <th className="num">Ay %</th>
                <th style={{ width: 140 }}>Son 1 Ay</th>
              </tr>
            </thead>
            <tbody>
              {indices.sectors.map((s) => {
                const chg = s.change_pct ?? 0;
                const pos = chg >= 0;
                const color = pos ? "var(--positive)" : "var(--negative)";
                const closes = s.closes_1mo;
                const monthPct = closes.length > 1
                  ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100
                  : null;
                const monthColor =
                  monthPct == null
                    ? "var(--muted)"
                    : monthPct >= 0
                      ? "var(--positive)"
                      : "var(--negative)";
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
                    <td className="num tabular" style={{ color: monthColor }}>
                      {monthPct == null ? "—" : `${monthPct >= 0 ? "+" : ""}${monthPct.toFixed(1)}%`}
                    </td>
                    <td>
                      <Sparkline values={closes} color={monthColor} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Top Movers — günlük / haftalık / aylık ikilileri (BIST 100 geneli) */}
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

      {/* BIST 100 hisse listesi */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">BIST 100 Hisse Listesi</div>
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
                <th>Endeksler</th>
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
                const shownIdx = r.indices.slice(0, 5);
                const extraIdx = r.indices.length - shownIdx.length;
                return (
                  <tr key={r.symbol}>
                    <td>
                      {r.external_url ? (
                        <a
                          href={r.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "inherit", textDecoration: "none", fontWeight: 600, borderBottom: "1px dotted var(--muted)" }}
                        >
                          {r.symbol}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                      )}
                      {r.owned && <OwnedDot />}
                    </td>
                    <td style={{ fontSize: 13 }}>{r.name}</td>
                    <td className="num tabular">{fmt.tr(r.quote.price, 2)} ₺</td>
                    <td className="num tabular" style={{ color: pctColor(d), fontWeight: 600 }}>{pctText(d)}</td>
                    <td className="num tabular" style={{ color: pctColor(w) }}>{pctText(w)}</td>
                    <td className="num tabular" style={{ color: pctColor(m) }}>{pctText(m)}</td>
                    <td style={{ fontSize: 10 }}>
                      {r.indices.length > 0 ? (
                        <span
                          title={r.indices.map((x) => `${x.code} — ${x.name}`).join("\n")}
                          style={{ color: "var(--muted)" }}
                        >
                          {shownIdx.map((x) => x.code).join(", ")}
                          {extraIdx > 0 ? ` +${extraIdx}` : ""}
                        </span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
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
        <Icon name="screener" size={12} /> Liste BIST 100 piyasa geneli — <b>●</b> işareti
        portföyündeki hisseleri gösterir. Fiyatlar Yahoo Finance (BIST · 15 dk gecikmeli, 10 dk
        cache); endeks üyeliği Borsa İstanbul CSV. Endeks hücresine gelince tam liste görünür.
      </div>
    </div>
  );
}
