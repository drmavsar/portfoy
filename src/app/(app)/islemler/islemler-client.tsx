"use client";

import { useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

import type { BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";
import {
  type AssetRow,
  type PortfolioRow,
  type TradeRow,
  createTrade,
  deleteTrade,
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
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const assetMap = useMemo(
    () => Object.fromEntries(assets.map((a) => [a.id, a])),
    [assets],
  );
  const custodyMap = useMemo(
    () => Object.fromEntries(custodies.map((c) => [c.id, c])),
    [custodies],
  );
  const benMap = useMemo(
    () => Object.fromEntries(beneficiaries.map((b) => [b.id, b])),
    [beneficiaries],
  );

  const filtered = sideFilter === "all" ? trades : trades.filter((t) => t.side === sideFilter);

  const totalGross = filtered.reduce(
    (s, t) => s + Number(t.quantity) * Number(t.price) + Number(t.fees),
    0,
  );

  const remove = (id: string) => {
    setError(null);
    setTrades((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      const r = await deleteTrade(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  const canCreate = configured;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">İşlemler</div>
          <div className="page-sub">Al/sat defteri. Her işlem bir lot oluşturur, WAC otomatik hesaplanır.</div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-prim"
            onClick={() => setModalOpen(true)}
            disabled={!canCreate}
          >
            <Icon name="plus" size={14} /> Yeni İşlem
          </button>
        </div>
      </div>

      {!configured && (
        <div
          style={{
            padding: 10,
            marginBottom: 12,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          Supabase yapılandırılmamış.
        </div>
      )}
      {portfolios.length === 0 && configured && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <b>Default portföy yok.</b> SQL Editor'da bir kez{" "}
          <code style={{ background: "var(--surface)", padding: "1px 4px", borderRadius: 3 }}>
            select public.bootstrap_user_defaults();
          </code>{" "}
          çalıştır → &quot;Ana Portföy&quot; otomatik oluşur.
        </div>
      )}
      {assets.length === 0 && configured && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          <b>Asset master tablosu boş.</b> setup-all.sql'in seed/0002 bölümünü çalıştırdığından
          emin ol (BIST hisseleri + döviz + altın + kripto).
        </div>
      )}
      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div className="grid-base grid-3" style={{ marginBottom: 18, gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>TOPLAM İŞLEM</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>{trades.length}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>BRÜT HACİM</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>
            {fmt.try(totalGross)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>FİLTRE</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["all", "buy", "sell"] as const).map((k) => (
              <button
                key={k}
                className={`btn btn-sm ${sideFilter === k ? "btn-prim" : ""}`}
                onClick={() => setSideFilter(k)}
              >
                {k === "all" ? "Tümü" : k === "buy" ? "Alış" : "Satış"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">İşlem Defteri</div>
          <div className="card-sub">{filtered.length} kayıt</div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            <div className="title">Henüz işlem yok</div>
            <div>Sağ üstteki &quot;Yeni İşlem&quot; ile ilk alım-satımını ekle.</div>
          </div>
        ) : (
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Sembol</th>
                <th style={{ width: 60 }}>Yön</th>
                <th className="num">Adet</th>
                <th className="num">Fiyat</th>
                <th className="num">Komisyon</th>
                <th>Kişi</th>
                <th>Kurum</th>
                <th>Not</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const a = assetMap[t.asset_id];
                const c = t.custody_id ? custodyMap[t.custody_id] : null;
                const b = t.beneficiary_id ? benMap[t.beneficiary_id] : null;
                const isBuy = t.side === "buy";
                return (
                  <tr key={t.id}>
                    <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {fmtDate(t.executed_at)}
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a?.symbol ?? "?"}</div>
                      {a && <div className="hint">{a.name}</div>}
                    </td>
                    <td>
                      <span
                        className="chip chip-sm"
                        style={{
                          background: isBuy ? "var(--positive-soft)" : "var(--negative-soft)",
                          color: isBuy ? "var(--positive)" : "var(--negative)",
                        }}
                      >
                        {isBuy ? "ALIŞ" : "SATIŞ"}
                      </span>
                    </td>
                    <td className="num tabular">{fmt.tr(Number(t.quantity), 4)}</td>
                    <td className="num tabular">{fmt.tr(Number(t.price), 2)} ₺</td>
                    <td className="num tabular hint">{Number(t.fees) > 0 ? fmt.tr(Number(t.fees), 2) : "—"}</td>
                    <td style={{ fontSize: 12 }}>
                      {b ? (
                        <span>
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: 50,
                              background: b.color ?? "#7d8699",
                              marginRight: 6,
                              verticalAlign: "middle",
                            }}
                          />
                          {b.name}
                        </span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{c?.name ?? "—"}</td>
                    <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 220 }}>
                      {t.notes ?? "—"}
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        onClick={() => remove(t.id)}
                        disabled={!configured || busy}
                        title="Sil"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <TradeModal
          assets={assets}
          portfolios={portfolios}
          custodies={custodies}
          beneficiaries={beneficiaries}
          onClose={() => setModalOpen(false)}
          onCreated={(row) => {
            setTrades((prev) => [row, ...prev]);
            setModalOpen(false);
          }}
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
  onClose,
  onCreated,
}: {
  assets: AssetRow[];
  portfolios: PortfolioRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  onClose: () => void;
  onCreated: (row: TradeRow) => void;
}) {
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [custodyId, setCustodyId] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const gross = (Number(quantity) || 0) * (Number(price) || 0) + (Number(fees) || 0);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await createTrade({
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
      if (r.ok) onCreated(r.row);
      else setError(r.error);
    });
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="wealth" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Yeni İşlem</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          {(portfolios.length === 0 || assets.length === 0) && (
            <div
              style={{
                padding: 10,
                background: "var(--warning-soft)",
                color: "var(--warning)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              {portfolios.length === 0 && (
                <div>
                  <b>Portföy yok.</b> SQL'de:{" "}
                  <code>select public.bootstrap_user_defaults();</code>
                </div>
              )}
              {assets.length === 0 && (
                <div>
                  <b>Sembol listesi boş.</b> setup-all.sql'in seed bölümünü çalıştır.
                </div>
              )}
            </div>
          )}

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Portföy</Lbl>
              <select style={inp} value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
                {portfolios.length === 0 && <option value="">— Portföy yok —</option>}
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Kurum</Lbl>
              <select style={inp} value={custodyId} onChange={(e) => setCustodyId(e.target.value)}>
                <option value="">— Seçme —</option>
                {custodies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Sembol</Lbl>
              <select style={inp} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                {assets.length === 0 && <option value="">— Sembol yok —</option>}
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} — {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Yön</Lbl>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`btn ${side === "buy" ? "btn-prim" : ""}`}
                  style={{ flex: 1, background: side === "buy" ? "var(--positive-soft)" : undefined, color: side === "buy" ? "var(--positive)" : undefined }}
                  onClick={() => setSide("buy")}
                  type="button"
                >
                  ALIŞ
                </button>
                <button
                  className={`btn ${side === "sell" ? "btn-prim" : ""}`}
                  style={{ flex: 1, background: side === "sell" ? "var(--negative-soft)" : undefined, color: side === "sell" ? "var(--negative)" : undefined }}
                  onClick={() => setSide("sell")}
                  type="button"
                >
                  SATIŞ
                </button>
              </div>
            </div>
          </div>

          <div className="grid-base grid-3" style={{ gap: 14 }}>
            <div>
              <Lbl>Adet</Lbl>
              <input
                type="number"
                step="0.0001"
                style={inp}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Lbl>Fiyat (₺)</Lbl>
              <input
                type="number"
                step="0.01"
                style={inp}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Lbl>Komisyon (₺)</Lbl>
              <input
                type="number"
                step="0.01"
                style={inp}
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Tarih</Lbl>
              <input
                type="date"
                style={inp}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Lbl>Kişi</Lbl>
              <select
                style={inp}
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
              >
                <option value="">— Seçme —</option>
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Lbl>Not (opsiyonel)</Lbl>
            <input style={inp} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {gross > 0 && (
            <div
              style={{
                padding: 10,
                background: "var(--surface-2)",
                borderRadius: 6,
                fontSize: 12,
                display: "flex",
                gap: 12,
              }}
            >
              <span className="hint">Brüt:</span>
              <span className="tabular" style={{ fontWeight: 600 }}>
                {fmt.try(gross)}
              </span>
            </div>
          )}
          {error && <div style={{ color: "var(--negative)", fontSize: 12 }}>{error}</div>}
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn" onClick={onClose} disabled={busy}>İptal</button>
          <button
            className="btn btn-prim"
            onClick={submit}
            disabled={busy || !quantity || !price || !portfolioId || !assetId}
          >
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
