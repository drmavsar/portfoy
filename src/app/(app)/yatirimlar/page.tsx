import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import {
  listAssets,
  listHoldings,
  listPortfolios,
  listTrades,
  type AssetRow,
  type HoldingRow,
  type PortfolioRow,
} from "@/app/(app)/_lib/wealth-actions";
import { getStockPrices, getStockTechnicals, type StockQuote, type StockTechnicals } from "@/app/(app)/_lib/stock-prices";
import { buildTradePlan, type TradePlan } from "@/app/(app)/_lib/trade-plan";
import {
  auditPortfolio,
  sectorBreakdown,
  topPositionsBreakdown,
  type PortfolioWarning,
} from "@/app/(app)/_lib/portfolio-risk";
import { listBeneficiariesLite } from "@/app/(app)/hesaplar/actions";

export const dynamic = "force-dynamic";

interface EnrichedHolding extends HoldingRow {
  asset: AssetRow | undefined;
  quote: StockQuote | undefined;
  tech: StockTechnicals | undefined;
  plan: TradePlan | undefined;
  market_value: number;
  pnl: number;
  pnl_pct: number | null;
  day_change_try: number;
  day_pnl_pct: number | null;
}

function qtyDecimals(assetClass: string | undefined, symbol: string | undefined): number {
  if (assetClass === "crypto") {
    if (symbol === "BTC") return 8;
    return 4;
  }
  if (assetClass === "metal") return 2;
  return 0;
}

interface Group {
  portfolio: PortfolioRow;
  rows: EnrichedHolding[];
  cost: number;
  mv: number;
  pnl: number;
  pnl_pct: number | null;
  day_change: number;
  day_change_pct: number | null;
  beneficiary_id: string | null;
}

interface PersonSummary {
  id: string;
  name: string;
  color: string;
  mv: number;
  cost: number;
  pnl: number;
  pnl_pct: number | null;
  day_change: number;
  day_change_pct: number | null;
}

export default async function YatirimlarPage() {
  const [holdings, assets, portfolios, trades, beneficiaries] = await Promise.all([
    listHoldings(),
    listAssets(),
    listPortfolios(),
    listTrades(),
    listBeneficiariesLite(),
  ]);

  const assetMap: Record<string, AssetRow> = Object.fromEntries(
    assets.map((a) => [a.id, a]),
  );
  const benMap = Object.fromEntries(beneficiaries.map((b) => [b.id, b]));

  const bistSymbols = holdings
    .map((h) => assetMap[h.asset_id])
    .filter((a): a is AssetRow => !!a && a.asset_class === "equity_tr")
    .map((a) => a.symbol);
  const [quotes, technicals] = await Promise.all([
    getStockPrices(bistSymbols),
    getStockTechnicals(bistSymbols),
  ]);

  const enriched: EnrichedHolding[] = holdings.map((h) => {
    const asset = assetMap[h.asset_id];
    const quote = asset ? quotes[asset.symbol] : undefined;
    const tech = asset ? technicals[asset.symbol] : undefined;
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis_try);
    const mv = quote ? qty * quote.price : cost;
    const pnl = mv - cost;
    const pnl_pct = cost > 0 ? (pnl / cost) * 100 : null;
    const day_change_try =
      quote && quote.previous_close
        ? qty * (quote.price - quote.previous_close)
        : 0;
    const day_open = mv - day_change_try;
    const day_pnl_pct = day_open > 0 ? (day_change_try / day_open) * 100 : null;
    const wac = Number(h.wac_try);
    const plan =
      quote && tech && tech.atr14 && wac > 0
        ? buildTradePlan(wac, quote.price, tech.atr14, tech.high_52w, tech.ma20)
        : undefined;
    return {
      ...h,
      asset,
      quote,
      tech,
      plan,
      market_value: mv,
      pnl,
      pnl_pct,
      day_change_try,
      day_pnl_pct,
    };
  });

  // Portfolio → dominant beneficiary (ilk trade)
  const portfolioBeneficiary = new Map<string, string>();
  for (const t of trades) {
    if (t.beneficiary_id && !portfolioBeneficiary.has(t.portfolio_id)) {
      portfolioBeneficiary.set(t.portfolio_id, t.beneficiary_id);
    }
  }

  const groups: Group[] = portfolios
    .map((p) => {
      const rows = enriched
        .filter((h) => h.portfolio_id === p.id)
        .sort((a, b) => b.market_value - a.market_value);
      const cost = rows.reduce((s, h) => s + Number(h.cost_basis_try), 0);
      const mv = rows.reduce((s, h) => s + h.market_value, 0);
      const pnl = mv - cost;
      const pnl_pct = cost > 0 ? (pnl / cost) * 100 : null;
      const day_change = rows.reduce((s, h) => s + h.day_change_try, 0);
      const day_open = mv - day_change;
      const day_change_pct = day_open > 0 ? (day_change / day_open) * 100 : null;
      return {
        portfolio: p,
        rows,
        cost,
        mv,
        pnl,
        pnl_pct,
        day_change,
        day_change_pct,
        beneficiary_id: portfolioBeneficiary.get(p.id) ?? null,
      };
    })
    .filter((g) => g.rows.length > 0)
    .sort((a, b) => b.mv - a.mv);

  // Kişi bazlı özet
  const personMap = new Map<string, PersonSummary>();
  for (const g of groups) {
    if (!g.beneficiary_id) continue;
    const ben = benMap[g.beneficiary_id];
    if (!ben) continue;
    const cur = personMap.get(g.beneficiary_id) ?? {
      id: g.beneficiary_id,
      name: ben.name,
      color: ben.color ?? "#7d8699",
      mv: 0,
      cost: 0,
      pnl: 0,
      pnl_pct: null,
      day_change: 0,
      day_change_pct: null,
    };
    cur.mv += g.mv;
    cur.cost += g.cost;
    cur.pnl += g.pnl;
    cur.day_change += g.day_change;
    personMap.set(g.beneficiary_id, cur);
  }
  for (const p of personMap.values()) {
    p.pnl_pct = p.cost > 0 ? (p.pnl / p.cost) * 100 : null;
    const dayOpen = p.mv - p.day_change;
    p.day_change_pct = dayOpen > 0 ? (p.day_change / dayOpen) * 100 : null;
  }
  const personCards = Array.from(personMap.values()).sort((a, b) => b.mv - a.mv);

  const totalCost = groups.reduce((s, g) => s + g.cost, 0);
  const totalMv = groups.reduce((s, g) => s + g.mv, 0);
  const totalPnl = totalMv - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : null;
  const totalDayChange = groups.reduce((s, g) => s + g.day_change, 0);
  const totalDayOpen = totalMv - totalDayChange;
  const totalDayChangePct = totalDayOpen > 0 ? (totalDayChange / totalDayOpen) * 100 : null;
  const quotedCount = enriched.filter((h) => h.quote).length;

  // Risk audit — pozisyon başına sektör + benim
  const assetSectorMap = Object.fromEntries(assets.map((a) => [a.id, a.sector ?? null]));
  const riskInputs = enriched.map((h) => {
    const group = groups.find((g) => g.portfolio.id === h.portfolio_id);
    const benId = group?.beneficiary_id ?? null;
    return {
      symbol: h.asset?.symbol ?? "?",
      sector: assetSectorMap[h.asset_id] ?? null,
      beneficiary_id: benId,
      beneficiary_name: benId ? benMap[benId]?.name ?? null : null,
      mv: h.market_value,
      plan: h.plan,
    };
  });
  const warnings: PortfolioWarning[] = auditPortfolio(riskInputs, totalMv);
  const topPositions = topPositionsBreakdown(riskInputs, totalMv, 5);
  const sectorStats = sectorBreakdown(riskInputs, totalMv);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Portföy</div>
          <div className="page-sub">
            Kişi bazlı pozisyon · WAC + anlık fiyat + K/Z · {quotedCount}/{enriched.length} sembol Yahoo Finance&apos;tan
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
          <div
            className="grid-base"
            style={{
              marginBottom: 18,
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {personCards.map((p) => (
              <PortfolioStatCard
                key={p.id}
                title={`${p.name}'in Portföyü`}
                accentColor={p.color}
                mv={p.mv}
                pnl={p.pnl}
                pnl_pct={p.pnl_pct}
                day_change={p.day_change}
                day_change_pct={p.day_change_pct}
              />
            ))}
            <PortfolioStatCard
              title="Toplam Portföy"
              accentColor="var(--accent)"
              mv={totalMv}
              pnl={totalPnl}
              pnl_pct={totalPnlPct}
              day_change={totalDayChange}
              day_change_pct={totalDayChangePct}
              highlight
            />
          </div>

          {/* Risk overlay — uyarılar + konsantrasyon özetleri */}
          <RiskOverlay
            warnings={warnings}
            topPositions={topPositions}
            sectorStats={sectorStats}
          />

          <div style={{ display: "grid", gap: 18 }}>
            {groups.map((g) => {
              const share = totalMv > 0 ? (g.mv / totalMv) * 100 : 0;
              const ownerName = g.beneficiary_id
                ? benMap[g.beneficiary_id]?.name ?? null
                : null;
              return (
                <div key={g.portfolio.id} className="card">
                  <div className="card-head">
                    <div className="card-title">
                      {g.portfolio.name}
                      {ownerName && (
                        <span className="hint" style={{ marginLeft: 8, fontSize: 12, fontWeight: 400 }}>
                          · {ownerName}
                        </span>
                      )}
                    </div>
                    <div className="card-sub">
                      {g.rows.length} pozisyon · %{share.toFixed(1)} pay
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 700, fontSize: 16 }}>
                        {fmt.trydp(g.mv)}
                      </div>
                      <div
                        className="tabular hint"
                        style={{
                          fontSize: 11,
                          color: g.day_change >= 0 ? "var(--positive)" : "var(--negative)",
                        }}
                      >
                        Bugün {g.day_change >= 0 ? "+" : ""}{fmt.tr(g.day_change, 0)} ₺
                        {g.day_change_pct != null && (
                          <> · {g.day_change >= 0 ? "+" : ""}{g.day_change_pct.toFixed(2)}%</>
                        )}
                      </div>
                      {g.pnl_pct != null && (
                        <div
                          className="tabular hint"
                          style={{
                            fontSize: 11,
                            color: g.pnl >= 0 ? "var(--positive)" : "var(--negative)",
                          }}
                        >
                          Top. {g.pnl >= 0 ? "+" : ""}{fmt.tr(g.pnl, 0)} ₺ · {g.pnl >= 0 ? "+" : ""}{g.pnl_pct.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <table className="dg">
                    <thead>
                      <tr>
                        <th>Sembol</th>
                        <th className="num">Son</th>
                        <th className="num">Günlük %</th>
                        <th className="num">Günlük K/Z</th>
                        <th className="num">Adet</th>
                        <th className="num">WAC</th>
                        <th className="num">Değer</th>
                        <th className="num">Top. K/Z</th>
                        <th className="num">Plan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((h) => {
                        const sign = h.pnl >= 0 ? "+" : "";
                        const color = h.pnl >= 0 ? "var(--positive)" : "var(--negative)";
                        const dailyPctColor =
                          h.quote?.change_pct == null
                            ? "var(--muted)"
                            : h.quote.change_pct >= 0
                              ? "var(--positive)"
                              : "var(--negative)";
                        const dailyTryColor =
                          h.day_change_try >= 0 ? "var(--positive)" : "var(--negative)";
                        return (
                          <tr key={`${h.portfolio_id}-${h.asset_id}`}>
                            <td>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {h.asset?.external_url ? (
                                  <a
                                    href={h.asset.external_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "inherit", textDecoration: "none", borderBottom: "1px dotted var(--muted)" }}
                                  >
                                    {h.asset.symbol}
                                  </a>
                                ) : (
                                  h.asset?.symbol ?? "?"
                                )}
                              </div>
                              {h.asset && <div className="hint">{h.asset.name}</div>}
                            </td>
                            <td className="num tabular">
                              {h.quote ? fmt.tr(h.quote.price, 2) : "—"}
                            </td>
                            <td className="num tabular" style={{ color: dailyPctColor }}>
                              {h.quote?.change_pct != null
                                ? `${h.quote.change_pct >= 0 ? "+" : ""}${h.quote.change_pct.toFixed(2)}%`
                                : "—"}
                            </td>
                            <td className="num tabular" style={{ color: dailyTryColor }}>
                              {h.day_change_try !== 0
                                ? `${h.day_change_try >= 0 ? "+" : ""}${fmt.tr(h.day_change_try, 0)}`
                                : "—"}
                              {h.day_pnl_pct != null && h.day_change_try !== 0 && (
                                <div className="hint" style={{ fontSize: 10, color: dailyTryColor }}>
                                  {h.day_pnl_pct >= 0 ? "+" : ""}{h.day_pnl_pct.toFixed(2)}%
                                </div>
                              )}
                            </td>
                            <td className="num tabular">
                              {fmt.tr(Number(h.quantity), qtyDecimals(h.asset?.asset_class, h.asset?.symbol))}
                            </td>
                            <td className="num tabular">{fmt.tr(Number(h.wac_try), 2)}</td>
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
                            <td className="num">
                              {h.plan ? (
                                <PlanCell plan={h.plan} />
                              ) : (
                                <span className="hint" style={{ fontSize: 11 }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td colSpan={6} className="hint" style={{ textAlign: "right", fontWeight: 600 }}>
                          {g.portfolio.name} Toplam
                        </td>
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
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>

          <div
            className="hint"
            style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8, lineHeight: 1.6 }}
          >
            Fiyat kaynağı: Yahoo Finance (BIST · 15 dk gecikmeli) · 5 dk cache.<br />
            <b>Plan kolonu</b>: T1 = current + 2 × ATR14, T2 = current + 4 × ATR14, S1 = current − 1.5 × ATR14,
            S2 = max(WAC × 0.95, current − 2.5 × ATR14). Sağlık rozeti: Stop Altı / Maliyet Altı / Stop Yakın
            / Hedef Yakın / Extended (MA20 +%10 üstü) / Sağlıklı. Tooltip için kolon üstüne hover.
          </div>
        </>
      )}
    </div>
  );
}

function RiskOverlay({
  warnings,
  topPositions,
  sectorStats,
}: {
  warnings: PortfolioWarning[];
  topPositions: ReturnType<typeof topPositionsBreakdown>;
  sectorStats: ReturnType<typeof sectorBreakdown>;
}) {
  if (warnings.length === 0 && topPositions.length === 0 && sectorStats.length === 0) {
    return null;
  }
  return (
    <div
      className="grid-base"
      style={{
        gap: 16,
        marginBottom: 18,
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      }}
    >
      {/* Uyarılar */}
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <Icon name="bolt" size={14} />
          <div className="hint" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
            RİSK UYARILARI
          </div>
          <span
            className="hint"
            style={{ marginLeft: "auto", fontSize: 11 }}
          >
            {warnings.length}
          </span>
        </div>
        {warnings.length === 0 ? (
          <div className="hint" style={{ fontSize: 12, padding: "8px 0" }}>
            Aktif uyarı yok. Portföy sağlık göstergeleri normal.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {warnings.slice(0, 8).map((w, i) => (
              <WarningRow key={i} w={w} />
            ))}
          </div>
        )}
      </div>

      {/* En büyük 5 pozisyon */}
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <Icon name="wealth" size={14} />
          <div className="hint" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
            EN BÜYÜK 5 POZİSYON
          </div>
        </div>
        {topPositions.length === 0 ? (
          <div className="hint" style={{ fontSize: 12 }}>Veri yok</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {topPositions.map((p) => (
              <ConcentrationRow key={p.label} stat={p} warnThreshold={25} />
            ))}
          </div>
        )}
      </div>

      {/* Sektör dağılımı (top 5) */}
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <Icon name="screener" size={14} />
          <div className="hint" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
            SEKTÖR DAĞILIMI
          </div>
        </div>
        {sectorStats.length === 0 ? (
          <div className="hint" style={{ fontSize: 12 }}>Sektör verisi yok</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {sectorStats.slice(0, 5).map((s) => (
              <ConcentrationRow key={s.label} stat={s} warnThreshold={40} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WarningRow({ w }: { w: PortfolioWarning }) {
  const color =
    w.severity === "critical"
      ? "var(--negative)"
      : w.severity === "warn"
        ? "var(--warning)"
        : "var(--muted)";
  const bg =
    w.severity === "critical"
      ? "var(--negative-soft)"
      : w.severity === "warn"
        ? "var(--warning-soft)"
        : "transparent";
  return (
    <div
      style={{
        background: bg,
        padding: "8px 10px",
        borderRadius: 6,
        borderLeft: `3px solid ${color}`,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: 600, color, marginBottom: 2 }}>{w.title}</div>
      <div style={{ color: "var(--fg-soft)" }}>{w.message}</div>
      {w.symbols && w.symbols.length > 0 && (
        <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
          {w.symbols.slice(0, 8).join(" · ")}
          {w.symbols.length > 8 ? ` +${w.symbols.length - 8}` : ""}
        </div>
      )}
    </div>
  );
}

function ConcentrationRow({
  stat,
  warnThreshold,
}: {
  stat: { label: string; value: number; pct: number };
  warnThreshold: number;
}) {
  const over = stat.pct > warnThreshold;
  const barColor = over ? "var(--warning)" : "var(--accent)";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 8, alignItems: "center" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 12 }}>
          <span style={{ fontWeight: over ? 600 : 400, color: over ? "var(--warning)" : "var(--fg)" }}>
            {stat.label}
          </span>
          <span className="tabular hint" style={{ fontSize: 11 }}>
            {fmt.tr(stat.value, 0)} ₺
          </span>
        </div>
        <div
          style={{
            height: 5,
            background: "var(--surface-2)",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, stat.pct)}%`,
              background: barColor,
            }}
          />
        </div>
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: over ? "var(--warning)" : "var(--muted)",
          textAlign: "right",
        }}
      >
        %{stat.pct.toFixed(1)}
      </div>
    </div>
  );
}

function PlanCell({ plan }: { plan: TradePlan }) {
  // Tooltip mesajı tüm detayı içerir; hücre kompakt rozet + T1/S1 mesafesi
  const tooltip = [
    `Sağlık: ${plan.health_label}`,
    `T1: ${fmt.tr(plan.t1, 2)} (+${plan.delta_t1_pct.toFixed(1)}%) · RR ${plan.rr1.toFixed(2)}`,
    `T2: ${fmt.tr(plan.t2, 2)} (+${plan.delta_t2_pct.toFixed(1)}%) · RR ${plan.rr2.toFixed(2)}`,
    `S1: ${fmt.tr(plan.s1, 2)} (${plan.delta_s1_pct.toFixed(1)}%)`,
    `S2: ${fmt.tr(plan.s2, 2)} (${plan.delta_s2_pct.toFixed(1)}%)`,
    plan.high_52w_distance_pct != null
      ? `52W high'a uzaklık: ${plan.high_52w_distance_pct.toFixed(1)}%`
      : null,
    plan.ma20_extension_pct != null
      ? `MA20 extension: ${plan.ma20_extension_pct >= 0 ? "+" : ""}${plan.ma20_extension_pct.toFixed(1)}%`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div title={tooltip} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: plan.health_color,
          background: `color-mix(in srgb, ${plan.health_color} 12%, transparent)`,
          padding: "2px 7px",
          borderRadius: 100,
          whiteSpace: "nowrap",
        }}
      >
        {plan.health_label}
      </span>
      <div className="tabular hint" style={{ fontSize: 10, lineHeight: 1.3 }}>
        T1 +{plan.delta_t1_pct.toFixed(1)}% · S1 {plan.delta_s1_pct.toFixed(1)}%
      </div>
    </div>
  );
}

function PortfolioStatCard({
  title,
  accentColor,
  mv,
  pnl,
  pnl_pct,
  day_change,
  day_change_pct,
  highlight,
}: {
  title: string;
  accentColor: string;
  mv: number;
  pnl: number;
  pnl_pct: number | null;
  day_change: number;
  day_change_pct: number | null;
  highlight?: boolean;
}) {
  const dayColor = day_change >= 0 ? "var(--positive)" : "var(--negative)";
  const pnlColor = pnl >= 0 ? "var(--positive)" : "var(--negative)";
  return (
    <div
      className="card"
      style={{
        padding: 16,
        border: highlight ? `1px solid ${accentColor}` : undefined,
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 50,
            background: accentColor,
            flexShrink: 0,
          }}
        />
        <div className="hint" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
          {title.toUpperCase()}
        </div>
      </div>
      <div className="tabular" style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        {fmt.trydp(mv)}
      </div>
      <div
        className="tabular"
        style={{ fontSize: 12, fontWeight: 600, color: dayColor, marginBottom: 2 }}
      >
        Bugün {day_change >= 0 ? "+" : ""}
        {fmt.tr(day_change, 0)} ₺
        {day_change_pct != null && (
          <>
            {" · "}
            {day_change >= 0 ? "+" : ""}
            {day_change_pct.toFixed(2)}%
          </>
        )}
      </div>
      {pnl_pct != null && (
        <div
          className="tabular"
          style={{ fontSize: 12, fontWeight: 600, color: pnlColor }}
        >
          Top. {pnl >= 0 ? "+" : ""}
          {fmt.tr(pnl, 0)} ₺
          {" · "}
          {pnl >= 0 ? "+" : ""}
          {pnl_pct.toFixed(2)}%
        </div>
      )}
    </div>
  );
}
