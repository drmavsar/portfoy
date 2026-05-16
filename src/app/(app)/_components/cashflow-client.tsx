"use client";

import { useMemo, useState, useTransition } from "react";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";
import type { CategoryRow } from "@/app/(app)/ayarlar/actions";
import {
  type TransactionRow,
  type TxnDirection,
  createTransaction,
  deleteTransaction,
} from "@/app/(app)/_lib/cashflow-actions";
import { Icon } from "@/components/ui/icon";
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
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isInflow = direction === "inflow";
  const sign = isInflow ? "+" : "-";
  const color = isInflow ? "var(--positive)" : "var(--negative)";

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

  const remove = (id: string) => {
    setError(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const r = await deleteTransaction(id, direction);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  const onCreated = (row: TransactionRow) => {
    setRows((prev) => [row, ...prev]);
    setModalOpen(false);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">{title}</div>
          <div className="page-sub">{subtitle}</div>
        </div>
        <div className="page-actions">
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

      {accounts.length === 0 && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "var(--surface-2)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          Önce <b>Hesaplar</b> sekmesinden bir hesap ekle.
        </div>
      )}

      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div className="grid-base grid-3" style={{ marginBottom: 18, gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>
            BU AY {isInflow ? "GELİR" : "GİDER"}
          </div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color }}>
            {sign}
            {fmt.try(monthSum)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>
            BU YIL (YTD)
          </div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700, color }}>
            {sign}
            {fmt.try(ytdSum)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>
            KAYIT SAYISI
          </div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>{rows.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">{isInflow ? "Gelir Kayıtları" : "Gider Kayıtları"}</div>
          <div className="card-sub">{rows.length} kayıt</div>
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            <div className="title">Henüz kayıt yok</div>
            <div>
              Sağ üstteki &quot;{isInflow ? "Yeni Gelir" : "Yeni Gider"}&quot; ile ilk kaydını
              ekle.
            </div>
          </div>
        ) : (
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Tarih</th>
                <th>Açıklama</th>
                <th>Kategori</th>
                <th>Kişi</th>
                <th>Hesap</th>
                <th className="num">Tutar</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const acc = accMap[r.account_id];
                const cust = custodyOf(r.account_id);
                const cat = r.category_id ? catMap[r.category_id] : null;
                const ben = r.beneficiary_id ? benMap[r.beneficiary_id] : null;
                return (
                  <tr key={r.id}>
                    <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {fmtDate(r.occurred_on)}
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.description ?? "—"}</div>
                      {r.notes && <div className="hint" style={{ marginTop: 2 }}>{r.notes}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {cat ? (
                        <span>
                          {cat.icon ?? ""} {cat.name}
                        </span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {ben ? (
                        <span>
                          <span
                            style={{
                              display: "inline-block",
                              width: 8,
                              height: 8,
                              borderRadius: 50,
                              background: ben.color ?? "#7d8699",
                              marginRight: 6,
                              verticalAlign: "middle",
                            }}
                          />
                          {ben.name}
                        </span>
                      ) : (
                        <span className="hint">—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {cust && acc ? `${cust.name} / ${acc.name}` : acc?.name ?? "—"}
                    </td>
                    <td
                      className="num tabular"
                      style={{ color, fontWeight: 600 }}
                    >
                      {sign}
                      {fmt.tr(Number(r.amount), 2)} ₺
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        onClick={() => remove(r.id)}
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
        <TransactionModal
          direction={direction}
          accounts={accounts}
          custodies={custodies}
          beneficiaries={beneficiaries}
          categories={categories.filter((c) => c.kind === (isInflow ? "income" : "expense"))}
          onClose={() => setModalOpen(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

function TransactionModal({
  direction,
  accounts,
  custodies,
  beneficiaries,
  categories,
  onClose,
  onCreated,
}: {
  direction: TxnDirection;
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  categories: CategoryRow[];
  onClose: () => void;
  onCreated: (row: TransactionRow) => void;
}) {
  const isInflow = direction === "inflow";
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
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
      const r = await createTransaction({
        account_id: accountId,
        occurred_on: date,
        direction,
        amount: amt,
        description,
        category_id: categoryId || null,
        beneficiary_id: beneficiaryId || null,
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
          <Icon name="cashflow" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {isInflow ? "Yeni Gelir" : "Yeni Gider"}
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
              <input
                type="date"
                style={inp}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Lbl>Tutar (₺)</Lbl>
              <input
                type="number"
                step="0.01"
                style={inp}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
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
            <select
              style={inp}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{accountLabel(a)}</option>
              ))}
            </select>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Kategori</Lbl>
              <select
                style={inp}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">— Seçme —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ?? ""} {c.name}
                  </option>
                ))}
              </select>
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
            <input
              style={inp}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

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
          <button className="btn btn-prim" onClick={submit} disabled={busy || !amount.trim()}>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
