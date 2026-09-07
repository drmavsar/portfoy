"use client";

import { useMemo, useState, useTransition } from "react";

import { DataGrid, type GridColumn } from "@/components/grid/data-grid";
import { moneyTotals } from "@/components/grid/model";
import { quantityTotals } from "@/components/grid/investment-summary";

import { Icon } from "@/components/ui/icon";
import { ModalPortal } from "@/components/ui/modal-portal";
import { fmt } from "@/lib/finance/fmt";

import type { BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";
import {
  type AssetRow,
  type PortfolioRow,
  type TradeRow,
  createTrade,
  deleteTrade,
  updateTrade,
} from "@/app/(app)/_lib/wealth-actions";

const inp: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  width: "100%",
};

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}

function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function qtyDecimals(assetClass: string | undefined, symbol: string | undefined): number {
  if (assetClass === "crypto") return symbol === "BTC" ? 8 : 4;
  if (assetClass === "metal") return 2;
  if (assetClass === "fund") return 6; // TEFAS pay adetleri kesirli (~6 hane)
  return 0;
}

type RangeKey = "month" | "ytd" | "last30" | "last90" | "all" | "custom";

function tradeAmount(t: TradeRow): number {
  const gross = Number(t.quantity) * Number(t.price);
  const fees = Number(t.fees);
  return t.side === "buy" ? gross + fees : gross - fees;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function rangeBounds(key: RangeKey, customFrom: string, customTo: string): { from: string; to: string } | null {
  const today = todayIso();
  if (key === "all") return null;
  if (key === "month") {
    const now = new Date();
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: today };
  }
  if (key === "ytd") return { from: `${new Date().getFullYear()}-01-01`, to: today };
  if (key === "last30") return { from: addDays(today, -29), to: today };
  if (key === "last90") return { from: addDays(today, -89), to: today };
  if (key === "custom") {
    if (!customFrom || !customTo) return null;
    return { from: customFrom, to: customTo };
  }
  return null;
}

interface Props {
  initialTrades: TradeRow[];
  assets: AssetRow[];
  portfolios: PortfolioRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  configured: boolean;
}

export function IslemlerClient({
  initialTrades,
  assets,
  portfolios,
  custodies,
  beneficiaries,
  configured,
}: Props) {
  const [trades, setTrades] = useState<TradeRow[]>(initialTrades);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TradeRow | null>(null);
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>("ytd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");


  const assetMap = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a])), [assets]);
  const custodyMap = useMemo(() => Object.fromEntries(custodies.map((c) => [c.id, c])), [custodies]);
  const benMap = useMemo(() => Object.fromEntries(beneficiaries.map((b) => [b.id, b])), [beneficiaries]);

  const periodRows = useMemo(() => {
    const bounds = rangeBounds(range, customFrom, customTo);
    let out = trades;
    if (bounds) {
      out = out.filter((t) => {
        const d = t.executed_at.slice(0, 10);
        return d >= bounds.from && d <= bounds.to;
      });
    }
    if (sideFilter !== "all") out = out.filter((t) => t.side === sideFilter);

    return out;
  }, [trades, range, customFrom, customTo, sideFilter]);
  const [gridRows, setGridRows] = useState<TradeRow[] | null>(null);
  const filtered = gridRows ?? periodRows;
  const totalGross = moneyTotals(filtered, t => Number(t.quantity) * Number(t.price), t => t.currency);
  const portfolioMap = Object.fromEntries(portfolios.map(p => [p.id, p.name]));
  const columns: GridColumn<TradeRow>[] = [
    { id: "date", title: "Tarih", value: t => t.executed_at, render: t => fmtDate(t.executed_at), width: 120 },
    { id: "symbol", title: "Sembol", value: t => assetMap[t.asset_id]?.symbol ?? t.asset_id, groupable: true, render: t => <span title={assetMap[t.asset_id]?.name}>{assetMap[t.asset_id]?.symbol ?? "?"}</span> },
    { id: "portfolio", title: "Portföy", value: t => portfolioMap[t.portfolio_id] ?? "Atanmamış", groupable: true },
    { id: "side", title: "Yön", value: t => t.side === "buy" ? "Alış" : "Satış", groupable: true },
    { id: "qty", title: "Adet", value: t => Number(t.quantity), numeric: true, render: t => fmt.tr(Number(t.quantity), qtyDecimals(assetMap[t.asset_id]?.asset_class, assetMap[t.asset_id]?.symbol)) },
    { id: "price", title: "Fiyat", value: t => Number(t.price), numeric: true, render: t => fmt.tr(Number(t.price), assetMap[t.asset_id]?.asset_class === "fund" ? 6 : 2) },
    { id: "fees", title: "Komisyon", value: t => Number(t.fees), numeric: true },
    { id: "amount", title: "Tutar", value: tradeAmount, numeric: true, render: t => moneyTotals([t], tradeAmount, t => t.currency) },
    { id: "currency", title: "Para Birimi", value: t => t.currency, groupable: true },
    { id: "person", title: "Kişi", value: t => t.beneficiary_id ? benMap[t.beneficiary_id]?.name ?? "Atanmamış" : "Atanmamış", groupable: true },
    { id: "custody", title: "Kurum", value: t => t.custody_id ? custodyMap[t.custody_id]?.name ?? "Atanmamış" : "Atanmamış", groupable: true },
    { id: "notes", title: "Not", value: t => t.notes },
  ];
  const tradeSummary = (rows: TradeRow[]) => <span>
    Alış: {moneyTotals(rows.filter(t => t.side === "buy"), tradeAmount, t => t.currency)} · Satış: {moneyTotals(rows.filter(t => t.side === "sell"), tradeAmount, t => t.currency)} · Komisyon: {moneyTotals(rows, t => Number(t.fees), t => t.currency)}
    <br />Net adet (alış − satış): {quantityTotals(rows, t => t.asset_id, t => assetMap[t.asset_id]?.symbol ?? t.asset_id, t => Number(t.quantity) * (t.side === "buy" ? 1 : -1))}
  </span>;

  const symbolSummary = useMemo(() => {
    interface Row {
      asset_id: string;
      currency: string;
      symbol: string;
      name: string;
      asset_class: string;
      buyQty: number;
      buyGross: number;
      sellQty: number;
      sellGross: number;
    }
    const map = new Map<string, Row>();
    for (const t of filtered) {
      const a = assetMap[t.asset_id];
      if (!a) continue;
      const key = JSON.stringify([t.asset_id, t.currency]);
      let row = map.get(key);
      if (!row) {
        row = {
          asset_id: t.asset_id,
          currency: t.currency,
          symbol: a.symbol,
          name: a.name,
          asset_class: a.asset_class,
          buyQty: 0,
          buyGross: 0,
          sellQty: 0,
          sellGross: 0,
        };
        map.set(key, row);
      }
      const qty = Number(t.quantity);
      const gross = qty * Number(t.price);
      const fees = Number(t.fees);
      if (t.side === "buy") {
        row.buyQty += qty;
        row.buyGross += gross + fees;
      } else {
        row.sellQty += qty;
        row.sellGross += gross - fees;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.symbol.localeCompare(b.symbol, "tr"),
    );
  }, [filtered, assetMap]);

  const summaryTotals = useMemo(() => {
    let buyGross = 0;
    let sellGross = 0;
    let realized = 0;
    let realizedBasis = 0;
    for (const r of symbolSummary) {
      buyGross += r.buyGross;
      sellGross += r.sellGross;
      if (r.buyQty > 0 && r.sellQty > 0) {
        const buyWac = r.buyGross / r.buyQty;
        realized += r.sellGross - r.sellQty * buyWac;
        realizedBasis += r.sellQty * buyWac;
      }
    }
    return { buyGross, sellGross, realized, realizedBasis, singleCurrency: new Set(symbolSummary.map(r => r.currency)).size === 1 };
  }, [symbolSummary]);

  const remove = (id: string) => {
    setError(null);
    setTrades((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const r = await deleteTrade(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  const onSaved = (row: TradeRow, isEdit: boolean) => {
    if (isEdit) {
      setTrades((prev) => prev.map((t) => (t.id === row.id ? row : t)));
      setEditing(null);
    } else {
      setTrades((prev) => [row, ...prev]);
      setModalOpen(false);
    }
  };

  const canCreate = configured;
  const rangePresets: Array<[RangeKey, string]> = [
    ["month", "Bu Ay"],
    ["ytd", "YTD"],
    ["last30", "Son 30"],
    ["last90", "Son 90"],
    ["all", "Tümü"],
    ["custom", "Özel"],
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">İşlemler</div>
          <div className="page-sub">Al/sat defteri. Her işlem bir lot oluşturur, WAC otomatik hesaplanır.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-prim" onClick={() => setModalOpen(true)} disabled={!canCreate}>
            <Icon name="plus" size={14} /> Yeni İşlem
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{ padding: 10, marginBottom: 12, background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 6, fontSize: 12 }}>
          Supabase yapılandırılmamış.
        </div>
      )}
      {portfolios.length === 0 && configured && (
        <div style={{ padding: 12, marginBottom: 12, background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 6, fontSize: 12 }}>
          <b>Default portföy yok.</b> SQL Editor&apos;da bir kez{" "}
          <code style={{ background: "var(--surface)", padding: "1px 4px", borderRadius: 3 }}>
            select public.bootstrap_user_defaults();
          </code>{" "}
          çalıştır.
        </div>
      )}
      {assets.length === 0 && configured && (
        <div style={{ padding: 12, marginBottom: 12, background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 6, fontSize: 12 }}>
          <b>Asset master tablosu boş.</b> setup-all.sql&apos;in seed/0002 bölümünü çalıştır.
        </div>
      )}
      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>{error}</div>
      )}

      <div className="grid-base grid-3" style={{ marginBottom: 18, gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>TOPLAM İŞLEM</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>
            {trades.length}
            <span className="hint" style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
              · {filtered.length} filtreli
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>FİLTRELİ BRÜT HACİM</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>{totalGross}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>YÖN FİLTRESİ</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "buy", "sell"] as const).map((k) => (
              <button key={k} className={`btn btn-sm ${sideFilter === k ? "btn-prim" : ""}`} onClick={() => setSideFilter(k)}>
                {k === "all" ? "Tümü" : k === "buy" ? "Alış" : "Satış"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="card-title">İşlem Defteri</div>
          <div className="card-sub">{filtered.length} / {trades.length}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {rangePresets.map(([k, label]) => (
              <button key={k} className={`btn btn-sm ${range === k ? "btn-prim" : ""}`} onClick={() => setRange(k)}>
                {label}
              </button>
            ))}
            {range === "custom" && (
              <>
                <input type="date" style={{ ...inp, width: 140, padding: "4px 8px" }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
                <input type="date" style={{ ...inp, width: 140, padding: "4px 8px" }} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </>
            )}
          </div>
        </div>

        <DataGrid rows={periodRows} columns={columns} rowId={t => t.id} storageKey="portfolio-trades-grid-v1" summary={tradeSummary} onFilteredRows={setGridRows}
          actions={t => <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" onClick={() => setEditing(t)} disabled={!configured || busy} title="Düzenle"><Icon name="edit" size={12} /></button>
            <button className="icon-btn" onClick={() => remove(t.id)} disabled={!configured || busy} title="Sil"><Icon name="trash" size={12} /></button>
          </div>} />
      </div>

      {symbolSummary.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div className="card-title">Sembol Bazlı Özet</div>
            <div className="card-sub">Filtreli dönem · {symbolSummary.length} sembol</div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Sembol</th>
                <th className="num">Alış Adet</th>
                <th className="num">Alış Ort.</th>
                <th className="num">Alış Tutar</th>
                <th className="num">Satış Adet</th>
                <th className="num">Satış Ort.</th>
                <th className="num">Satış Tutar</th>
                <th className="num">Kar/Zarar</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {symbolSummary.map((r) => {
                const buyWac = r.buyQty > 0 ? r.buyGross / r.buyQty : null;
                const sellWac = r.sellQty > 0 ? r.sellGross / r.sellQty : null;
                const hasBoth = r.buyQty > 0 && r.sellQty > 0;
                const pnl = hasBoth ? r.sellGross - r.sellQty * (buyWac as number) : null;
                const basis = hasBoth ? r.sellQty * (buyWac as number) : null;
                const pct = pnl != null && basis != null && basis !== 0 ? (pnl / basis) * 100 : null;
                const qtyD = qtyDecimals(r.asset_class, r.symbol);
                const pnlColor = pnl == null ? undefined : pnl >= 0 ? "var(--positive)" : "var(--negative)";
                return (
                  <tr key={JSON.stringify([r.asset_id, r.currency])}>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.symbol} · {r.currency}</div>
                      <div className="hint">{r.name}</div>
                    </td>
                    <td className="num tabular">
                      {r.buyQty > 0 ? fmt.tr(r.buyQty, qtyD) : <span className="hint">—</span>}
                    </td>
                    <td className="num tabular hint">
                      {buyWac != null ? `${fmt.tr(buyWac, 2)} ${r.currency}` : "—"}
                    </td>
                    <td className="num tabular">
                      {r.buyQty > 0 ? moneyTotals([r], () => r.buyGross, r => r.currency) : <span className="hint">—</span>}
                    </td>
                    <td className="num tabular">
                      {r.sellQty > 0 ? fmt.tr(r.sellQty, qtyD) : <span className="hint">—</span>}
                    </td>
                    <td className="num tabular hint">
                      {sellWac != null ? `${fmt.tr(sellWac, 2)} ${r.currency}` : "—"}
                    </td>
                    <td className="num tabular">
                      {r.sellQty > 0 ? moneyTotals([r], () => r.sellGross, r => r.currency) : <span className="hint">—</span>}
                    </td>
                    <td className="num tabular" style={{ color: pnlColor, fontWeight: 600 }}>
                      {pnl != null ? moneyTotals([r], () => pnl, r => r.currency) : <span className="hint">—</span>}
                    </td>
                    <td className="num tabular" style={{ color: pnlColor, fontWeight: 600 }}>
                      {pct != null ? fmt.pct(pct, 2) : <span className="hint">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ fontWeight: 700 }}>Toplam</td>
                <td />
                <td />
                <td className="num tabular" style={{ fontWeight: 700 }}>
                  {moneyTotals(symbolSummary, r => r.buyGross, r => r.currency)}
                </td>
                <td />
                <td />
                <td className="num tabular" style={{ fontWeight: 700 }}>
                  {moneyTotals(symbolSummary, r => r.sellGross, r => r.currency)}
                </td>
                <td
                  className="num tabular"
                  style={{
                    fontWeight: 700,
                    color:
                      summaryTotals.realized === 0
                        ? undefined
                        : summaryTotals.realized > 0
                        ? "var(--positive)"
                        : "var(--negative)",
                  }}
                >
                  {summaryTotals.realizedBasis > 0
                    ? moneyTotals(symbolSummary.filter(r => r.buyQty > 0 && r.sellQty > 0), r => r.sellGross - r.sellQty * r.buyGross / r.buyQty, r => r.currency)
                    : "—"}
                </td>
                <td
                  className="num tabular"
                  style={{
                    fontWeight: 700,
                    color:
                      summaryTotals.realized === 0
                        ? undefined
                        : summaryTotals.realized > 0
                        ? "var(--positive)"
                        : "var(--negative)",
                  }}
                >
                  {summaryTotals.realizedBasis > 0
                    && summaryTotals.singleCurrency
                    ? fmt.pct((summaryTotals.realized / summaryTotals.realizedBasis) * 100, 2)
                    : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
          <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--muted)", borderTop: "1px solid var(--border-soft)" }}>
            Kar/Zarar hesabı, seçili dönemdeki alış ortalaması ile satış tutarı arasındaki farka dayanır. Dönem
            dışındaki eski alışlar dikkate alınmaz — bu nedenle yalnızca satış olan sembollerde kar/zarar boş bırakılır.
          </div>
        </div>
      )}

      {modalOpen && (
        <TradeModal
          assets={assets}
          portfolios={portfolios}
          custodies={custodies}
          beneficiaries={beneficiaries}
          onClose={() => setModalOpen(false)}
          onSaved={(row) => onSaved(row, false)}
        />
      )}
      {editing && (
        <TradeModal
          assets={assets}
          portfolios={portfolios}
          custodies={custodies}
          beneficiaries={beneficiaries}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => onSaved(row, true)}
        />
      )}
    </div>
  );
}

function TradeModal({
  assets,
  portfolios,
  custodies,
  beneficiaries,
  initial,
  onClose,
  onSaved,
}: {
  assets: AssetRow[];
  portfolios: PortfolioRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  initial?: TradeRow;
  onClose: () => void;
  onSaved: (row: TradeRow) => void;
}) {
  const isEdit = !!initial;
  const [portfolioId, setPortfolioId] = useState(initial?.portfolio_id ?? portfolios[0]?.id ?? "");
  const [assetId, setAssetId] = useState(initial?.asset_id ?? assets[0]?.id ?? "");
  const [side, setSide] = useState<"buy" | "sell">(initial?.side ?? "buy");
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [fees, setFees] = useState(initial ? String(initial.fees) : "0");
  const [date, setDate] = useState(initial ? toDateInput(initial.executed_at) : new Date().toISOString().slice(0, 10));
  const [custodyId, setCustodyId] = useState(initial?.custody_id ?? "");
  const [beneficiaryId, setBeneficiaryId] = useState(initial?.beneficiary_id ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const gross = (Number(quantity) || 0) * (Number(price) || 0) + (Number(fees) || 0);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = isEdit
        ? await updateTrade({
            id: initial.id,
            portfolio_id: portfolioId,
            custody_id: custodyId || null,
            asset_id: assetId,
            beneficiary_id: beneficiaryId || null,
            side,
            executed_at: `${date}T00:00:00Z`,
            quantity: Number(quantity),
            price: Number(price),
            fees: Number(fees) || 0,
            notes: notes || null,
          })
        : await createTrade({
            portfolio_id: portfolioId,
            custody_id: custodyId || null,
            asset_id: assetId,
            beneficiary_id: beneficiaryId || null,
            side,
            executed_at: `${date}T00:00:00Z`,
            quantity: Number(quantity),
            price: Number(price),
            fees: Number(fees) || 0,
            notes: notes || null,
          });
      if (r.ok) onSaved(r.row);
      else setError(r.error);
    });
  };

  return (
    <ModalPortal>
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="wealth" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{isEdit ? "İşlemi Düzenle" : "Yeni İşlem"}</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          {(portfolios.length === 0 || assets.length === 0) && !isEdit && (
            <div style={{ padding: 10, background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 6, fontSize: 12 }}>
              {portfolios.length === 0 && <div><b>Portföy yok.</b> SQL&apos;de: <code>select public.bootstrap_user_defaults();</code></div>}
              {assets.length === 0 && <div><b>Sembol listesi boş.</b> setup-all.sql&apos;in seed bölümünü çalıştır.</div>}
            </div>
          )}

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Portföy</Lbl>
              <select style={inp} value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
                {portfolios.length === 0 && <option value="">— Portföy yok —</option>}
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Kurum</Lbl>
              <select style={inp} value={custodyId} onChange={(e) => setCustodyId(e.target.value)}>
                <option value="">— Seçme —</option>
                {custodies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Sembol</Lbl>
              <select style={inp} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                {assets.length === 0 && <option value="">— Sembol yok —</option>}
                {assets.map((a) => <option key={a.id} value={a.id}>{a.symbol} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <Lbl>Yön</Lbl>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={`btn ${side === "buy" ? "btn-prim" : ""}`} style={{ flex: 1, background: side === "buy" ? "var(--positive-soft)" : undefined, color: side === "buy" ? "var(--positive)" : undefined }} onClick={() => setSide("buy")} type="button">ALIŞ</button>
                <button className={`btn ${side === "sell" ? "btn-prim" : ""}`} style={{ flex: 1, background: side === "sell" ? "var(--negative-soft)" : undefined, color: side === "sell" ? "var(--negative)" : undefined }} onClick={() => setSide("sell")} type="button">SATIŞ</button>
              </div>
            </div>
          </div>

          <div className="grid-base grid-3" style={{ gap: 14 }}>
            <div>
              <Lbl>Adet</Lbl>
              <input type="number" step="0.0001" style={inp} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Lbl>Fiyat (₺)</Lbl>
              <input type="number" step="0.01" style={inp} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Lbl>Komisyon (₺)</Lbl>
              <input type="number" step="0.01" style={inp} value={fees} onChange={(e) => setFees(e.target.value)} />
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Tarih</Lbl>
              <input type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Lbl>Kişi</Lbl>
              <select style={inp} value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)}>
                <option value="">— Seçme —</option>
                {beneficiaries.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Lbl>Not (opsiyonel)</Lbl>
            <input style={inp} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {gross > 0 && (
            <div style={{ padding: 10, background: "var(--surface-2)", borderRadius: 6, fontSize: 12, display: "flex", gap: 12 }}>
              <span className="hint">Brüt:</span>
              <span className="tabular" style={{ fontWeight: 600 }}>{fmt.try(gross)}</span>
            </div>
          )}
          {error && <div style={{ color: "var(--negative)", fontSize: 12 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-soft)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy}>İptal</button>
          <button className="btn btn-prim" onClick={submit} disabled={busy || !quantity || !price || !portfolioId || !assetId}>
            {busy ? "Kaydediliyor…" : (isEdit ? "Güncelle" : "Kaydet")}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
