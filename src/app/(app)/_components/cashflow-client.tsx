"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";
import type { CategoryRow } from "@/app/(app)/ayarlar/actions";
import {
  type TransactionRow,
  type TxnDirection,
  createTransaction,
  deleteTransaction,
  undoDeleteTransaction,
  updateTransaction,
} from "@/app/(app)/_lib/cashflow-actions";
import { Icon } from "@/components/ui/icon";
import { ModalPortal } from "@/components/ui/modal-portal";
import { fmt } from "@/lib/finance/fmt";

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
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

type RangeKey = "month" | "ytd" | "last30" | "last90" | "all" | "custom";
type SortCol = "date" | "desc" | "cat" | "ben" | "acc" | "amount";
type SortDir = "asc" | "desc";

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
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: today };
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
  direction: TxnDirection;
  title: string;
  subtitle: string;
  initialRows: TransactionRow[];
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  categories: CategoryRow[];
  configured: boolean;
}

export function CashflowClient({
  direction,
  title,
  subtitle,
  initialRows,
  accounts,
  custodies,
  beneficiaries,
  categories,
  configured,
}: Props) {
  const [rows, setRows] = useState<TransactionRow[]>(initialRows);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{ row: TransactionRow; expiresAt: number } | null>(null);

  // Filtre
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Sıralama
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const isInflow = direction === "inflow";
  const sign = isInflow ? "+" : "-";
  const color = isInflow ? "var(--positive)" : "var(--negative)";

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );
  const benMap = useMemo(
    () => Object.fromEntries(beneficiaries.map((b) => [b.id, b])),
    [beneficiaries],
  );
  const accMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const custodyOf = (accId: string) => {
    const a = accMap[accId];
    if (!a?.custody_id) return null;
    return custodies.find((c) => c.id === a.custody_id) ?? null;
  };

  // KPI'lar — toplam veri seti üzerinden (filtreden bağımsız)
  const monthSum = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return rows
      .filter((r) => r.occurred_on.startsWith(ym))
      .reduce((s, r) => s + Number(r.amount), 0);
  }, [rows]);

  const ytdSum = useMemo(() => {
    const y = new Date().getFullYear().toString();
    return rows
      .filter((r) => r.occurred_on.startsWith(y))
      .reduce((s, r) => s + Number(r.amount), 0);
  }, [rows]);

  // Filtre + sıralama
  const filteredRows = useMemo(() => {
    const bounds = rangeBounds(range, customFrom, customTo);
    let out = rows;
    if (bounds) {
      out = out.filter((r) => r.occurred_on >= bounds.from && r.occurred_on <= bounds.to);
    }

    const cmpString = (a: string, b: string) => a.localeCompare(b, "tr");

    const sorted = [...out].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "date":
          cmp = cmpString(a.occurred_on, b.occurred_on);
          break;
        case "desc":
          cmp = cmpString(a.description ?? "", b.description ?? "");
          break;
        case "cat": {
          const an = a.category_id ? catMap[a.category_id]?.name ?? "" : "";
          const bn = b.category_id ? catMap[b.category_id]?.name ?? "" : "";
          cmp = cmpString(an, bn);
          break;
        }
        case "ben": {
          const an = a.beneficiary_id ? benMap[a.beneficiary_id]?.name ?? "" : "";
          const bn = b.beneficiary_id ? benMap[b.beneficiary_id]?.name ?? "" : "";
          cmp = cmpString(an, bn);
          break;
        }
        case "acc": {
          const aa = accMap[a.account_id]?.name ?? "";
          const ba = accMap[b.account_id]?.name ?? "";
          cmp = cmpString(aa, ba);
          break;
        }
        case "amount":
          cmp = Number(a.amount) - Number(b.amount);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [rows, range, customFrom, customTo, sortCol, sortDir, accMap, benMap, catMap]);

  const filteredSum = useMemo(
    () => filteredRows.reduce((s, r) => s + Number(r.amount), 0),
    [filteredRows],
  );

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir(col === "date" || col === "amount" ? "desc" : "asc");
    }
  };

  const remove = (id: string) => {
    setError(null);
    const target = rows.find((r) => r.id === id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const r = await deleteTransaction(id, direction);
      if (!r.ok) {
        setError(r.error ?? "Silinemedi.");
        // Geri ekle (DB hatası varsa UI değişikliği geri al)
        if (target) setRows((prev) => [target, ...prev]);
        return;
      }
      // Toast: 30 sn'lik undo penceresi
      if (target) {
        setUndoToast({ row: target, expiresAt: Date.now() + 30_000 });
      }
    });
  };

  const undoDelete = () => {
    const t = undoToast;
    if (!t) return;
    setUndoToast(null);
    setRows((prev) => [t.row, ...prev]);
    startTransition(async () => {
      const r = await undoDeleteTransaction(t.row.id, direction);
      if (!r.ok) {
        setError(r.error ?? "Geri alınamadı.");
        // UI'den çıkar
        setRows((prev) => prev.filter((x) => x.id !== t.row.id));
      }
    });
  };

  const onCreated = (row: TransactionRow) => {
    setRows((prev) => [row, ...prev]);
    setModalOpen(false);
  };
  const onUpdated = (row: TransactionRow) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    setEditing(null);
  };

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
          <div className="page-title">{title}</div>
          <div className="page-sub">{subtitle}</div>
        </div>
        <div className="page-actions">
          {!isInflow && (
            <Link
              href="/ekstre"
              className="btn"
              style={{ textDecoration: "none" }}
              aria-disabled={!configured}
            >
              <Icon name="upload" size={14} /> Ekstre Yükle
            </Link>
          )}
          <button
            className="btn btn-prim"
            onClick={() => setModalOpen(true)}
            disabled={!configured || accounts.length === 0}
          >
            <Icon name="plus" size={14} /> {isInflow ? "Yeni Gelir" : "Yeni Gider"}
          </button>
        </div>
      </div>

      {!configured && (
        <div style={{ padding: 10, marginBottom: 12, background: "var(--warning-soft)", color: "var(--warning)", borderRadius: 6, fontSize: 12 }}>
          Supabase yapılandırılmamış.
        </div>
      )}
      {accounts.length === 0 && (
        <div style={{ padding: 12, marginBottom: 12, background: "var(--surface-2)", borderRadius: 6, fontSize: 12, color: "var(--muted)" }}>
          Önce <b>Hesaplar</b> sekmesinden bir hesap ekle.
        </div>
      )}
      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>{error}</div>
      )}

      <div className="grid-base grid-3" style={{ marginBottom: 18, gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>BU AY {isInflow ? "GELİR" : "GİDER"}</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color }}>{sign}{fmt.try(monthSum)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>BU YIL (YTD)</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color }}>{sign}{fmt.try(ytdSum)}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>FİLTRELİ TOPLAM</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color }}>{sign}{fmt.try(filteredSum)}</div>
          <div className="hint" style={{ fontSize: 11 }}>{filteredRows.length} kayıt</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="card-title">{isInflow ? "Gelir Kayıtları" : "Gider Kayıtları"}</div>
          <div className="card-sub">
            {filteredRows.length} / {rows.length}
            {rows.length >= 5000 && (
              <span
                title="Sunucu limiti dolu — eski kayıtlar gözükmüyor olabilir. Tarih filtresi kullan."
                style={{ marginLeft: 6, color: "var(--warning)", fontWeight: 600 }}
              >
                · limit
              </span>
            )}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {rangePresets.map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm ${range === k ? "btn-prim" : ""}`}
                onClick={() => setRange(k)}
              >
                {label}
              </button>
            ))}
            {range === "custom" && (
              <>
                <input
                  type="date"
                  style={{ ...inp, width: 140, padding: "4px 8px" }}
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
                <input
                  type="date"
                  style={{ ...inp, width: 140, padding: "4px 8px" }}
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </>
            )}
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="empty">
            <div className="title">Bu filtrede kayıt yok</div>
            <div>
              {rows.length === 0
                ? <>Sağ üstteki &quot;{isInflow ? "Yeni Gelir" : "Yeni Gider"}&quot; ile ilk kaydını ekle.</>
                : <>Filtre aralığını genişlet veya &quot;Tümü&quot;yü dene.</>}
            </div>
          </div>
        ) : (
          <table className="dg">
            <thead>
              <tr>
                <SortHeader col="date" label="Tarih" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} style={{ width: 100 }} />
                <SortHeader col="desc" label="Açıklama" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader col="cat" label="Kategori" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader col="ben" label="Kişi" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader col="acc" label="Hesap" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader col="amount" label="Tutar" sortCol={sortCol} sortDir={sortDir} onToggle={toggleSort} num />
                <th style={{ width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
                const acc = accMap[r.account_id];
                const cust = custodyOf(r.account_id);
                const cat = r.category_id ? catMap[r.category_id] : null;
                const ben = r.beneficiary_id ? benMap[r.beneficiary_id] : null;
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{fmtDate(r.occurred_on)}</td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.description ?? "—"}</div>
                      {r.notes && <div className="hint" style={{ marginTop: 2 }}>{r.notes}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {cat ? <span>{cat.icon ?? ""} {cat.name}</span> : <span className="hint">—</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {ben ? (
                        <span>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 50, background: ben.color ?? "#7d8699", marginRight: 6, verticalAlign: "middle" }} />
                          {ben.name}
                        </span>
                      ) : <span className="hint">—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {cust && acc ? `${cust.name} / ${acc.name}` : acc?.name ?? "—"}
                    </td>
                    <td className="num tabular" style={{ color, fontWeight: 600 }}>
                      {sign}{fmt.tr(Number(r.amount), 2)} ₺
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="icon-btn"
                          onClick={() => setEditing(r)}
                          disabled={!configured || busy}
                          title="Düzenle"
                        >
                          <Icon name="edit" size={12} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => remove(r.id)}
                          disabled={!configured || busy}
                          title="Sil"
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <TransactionModal
          direction={direction}
          accounts={accounts}
          custodies={custodies}
          beneficiaries={beneficiaries}
          categories={categories.filter((c) => c.kind === (isInflow ? "income" : "expense"))}
          onClose={() => setModalOpen(false)}
          onSaved={onCreated}
        />
      )}
      {editing && (
        <TransactionModal
          direction={direction}
          accounts={accounts}
          custodies={custodies}
          beneficiaries={beneficiaries}
          categories={categories.filter((c) => c.kind === (isInflow ? "income" : "expense"))}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={onUpdated}
        />
      )}

      {undoToast && (
        <UndoToast
          row={undoToast.row}
          expiresAt={undoToast.expiresAt}
          onUndo={undoDelete}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  );
}

function UndoToast({
  row,
  expiresAt,
  onUndo,
  onDismiss,
}: {
  row: TransactionRow;
  expiresAt: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(30_000);
  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      return r;
    };
    tick();
    const t = setInterval(() => {
      if (tick() <= 0) {
        clearInterval(t);
        onDismiss();
      }
    }, 200);
    return () => clearInterval(t);
  }, [expiresAt, onDismiss]);

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1000,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        minWidth: 280,
        fontSize: 13,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>İşlem silindi</div>
        <div className="hint" style={{ fontSize: 11 }}>
          {row.description ?? row.occurred_on} · {Math.ceil(remaining / 1000)} sn
        </div>
      </div>
      <button className="btn btn-sm btn-prim" onClick={onUndo}>
        Geri al
      </button>
      <button
        className="icon-btn"
        onClick={onDismiss}
        aria-label="Kapat"
        title="Kapat"
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

function SortHeader({
  col,
  label,
  sortCol,
  sortDir,
  onToggle,
  num,
  style,
}: {
  col: SortCol;
  label: string;
  sortCol: SortCol;
  sortDir: SortDir;
  onToggle: (c: SortCol) => void;
  num?: boolean;
  style?: React.CSSProperties;
}) {
  const active = sortCol === col;
  return (
    <th
      className={num ? "num" : ""}
      style={{ ...style, cursor: "pointer", userSelect: "none" }}
      onClick={() => onToggle(col)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3, fontSize: 9 }}>
          {active ? (sortDir === "asc" ? "▲" : "▼") : "▲▼"}
        </span>
      </span>
    </th>
  );
}

function TransactionModal({
  direction,
  accounts,
  custodies,
  beneficiaries,
  categories,
  initial,
  onClose,
  onSaved,
}: {
  direction: TxnDirection;
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  categories: CategoryRow[];
  initial?: TransactionRow;
  onClose: () => void;
  onSaved: (row: TransactionRow) => void;
}) {
  const isInflow = direction === "inflow";
  const isEdit = !!initial;
  const [accountId, setAccountId] = useState(initial?.account_id ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [beneficiaryId, setBeneficiaryId] = useState(initial?.beneficiary_id ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(initial?.occurred_on ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accountLabel = (a: AccountRow) => {
    const c = custodies.find((x) => x.id === a.custody_id);
    return c ? `${c.name} — ${a.name}` : a.name;
  };

  const submit = () => {
    setError(null);
    if (!accountId) {
      setError("Hesap seç.");
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      setError("Tutar pozitif olmalı.");
      return;
    }
    startTransition(async () => {
      const r = isEdit
        ? await updateTransaction({
            id: initial.id,
            direction,
            account_id: accountId,
            occurred_on: date,
            amount: amt,
            description,
            category_id: categoryId || null,
            beneficiary_id: beneficiaryId || null,
            notes: notes || null,
          })
        : await createTransaction({
            account_id: accountId,
            occurred_on: date,
            direction,
            amount: amt,
            description,
            category_id: categoryId || null,
            beneficiary_id: beneficiaryId || null,
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
          <Icon name="cashflow" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {isEdit ? (isInflow ? "Geliri Düzenle" : "Gideri Düzenle") : (isInflow ? "Yeni Gelir" : "Yeni Gider")}
          </span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Tarih</Lbl>
              <input type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Lbl>Tutar (₺)</Lbl>
              <input type="number" step="0.01" style={inp} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <div>
            <Lbl>Açıklama</Lbl>
            <input
              style={inp}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isInflow ? "ör. Maaş — Mayıs" : "ör. MIGROS Ataşehir"}
            />
          </div>

          <div>
            <Lbl>Hesap</Lbl>
            <select style={inp} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{accountLabel(a)}</option>
              ))}
            </select>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Kategori</Lbl>
              <select style={inp} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— Seçme —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon ?? ""} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Kişi</Lbl>
              <select style={inp} value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)}>
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

          {error && <div style={{ color: "var(--negative)", fontSize: 12 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-soft)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy}>İptal</button>
          <button className="btn btn-prim" onClick={submit} disabled={busy || !amount.trim()}>
            {busy ? "Kaydediliyor…" : (isEdit ? "Güncelle" : "Kaydet")}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
