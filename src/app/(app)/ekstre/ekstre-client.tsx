"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";

import type { CategoryRow } from "@/app/(app)/ayarlar/actions";
import type { AccountRow, BeneficiaryLite } from "@/app/(app)/hesaplar/actions";

import {
  commitStatementRows,
  parseStatementXls,
  type StatementPreviewRow,
} from "./actions";

interface Props {
  configured: boolean;
  accounts: AccountRow[];
  beneficiaries: BeneficiaryLite[];
  categories: CategoryRow[];
}

interface EditableRow extends StatementPreviewRow {
  selected: boolean;
  category_id: string | null;
}

interface ParsedResult {
  card_last4?: string;
  period_start?: string;
  period_end?: string;
  rows: EditableRow[];
  skipped: number;
}

const inp: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "6px 8px",
  borderRadius: 6,
  fontSize: 12,
  outline: "none",
  width: "100%",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function formatTl(n: number): string {
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`;
}

export function EkstreClient({
  configured,
  accounts,
  beneficiaries,
  categories,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [beneficiaryId, setBeneficiaryId] = useState<string>("");
  const [commitInfo, setCommitInfo] = useState<string | null>(null);

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories],
  );

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setAccountId("");
    setBeneficiaryId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onUpload = () => {
    if (!file) return;
    setError(null);
    setCommitInfo(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const r = await parseStatementXls(fd);
      if (!r.ok) {
        setError(r.error ?? "Parse hatası.");
        return;
      }
      const rows: EditableRow[] = (r.rows ?? []).map((row) => ({
        ...row,
        selected: !row.is_transfer,
        category_id: row.suggested_category_id,
      }));
      setResult({
        card_last4: r.card_last4,
        period_start: r.period_start,
        period_end: r.period_end,
        rows,
        skipped: r.skipped_count ?? 0,
      });
      if (r.card_last4) {
        const match = accounts.find((a) =>
          `${a.name} ${a.iban ?? ""}`.includes(r.card_last4 as string),
        );
        if (match) setAccountId(match.id);
      }
    });
  };

  const toggleRow = (i: number) => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r, idx) =>
              idx === i ? { ...r, selected: !r.selected } : r,
            ),
          }
        : prev,
    );
  };

  const setCat = (i: number, cat: string | null) => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r, idx) =>
              idx === i ? { ...r, category_id: cat } : r,
            ),
          }
        : prev,
    );
  };

  const selectAll = (only: "expense" | "all" | "none") => {
    setResult((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => ({
              ...r,
              selected:
                only === "none"
                  ? false
                  : only === "expense"
                    ? !r.is_transfer
                    : true,
            })),
          }
        : prev,
    );
  };

  const submit = () => {
    if (!result || !accountId) return;
    const rows = result.rows
      .filter((r) => r.selected)
      .map((r) => ({
        occurred_on: r.occurred_on,
        merchant_raw: r.merchant_raw,
        etiket: r.etiket,
        amount: r.amount,
        direction: r.direction,
        is_transfer: r.is_transfer,
        category_id: r.category_id,
        hash_dedupe: r.hash_dedupe,
      }));
    if (rows.length === 0) {
      setError("Hiç işlem seçilmedi.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await commitStatementRows({
        rows,
        account_id: accountId,
        beneficiary_id: beneficiaryId || null,
        source_name: file?.name ?? null,
      });
      if (!r.ok) {
        setError(r.error ?? "Kayıt hatası.");
        return;
      }
      setCommitInfo(
        `${r.inserted ?? 0} işlem eklendi · ${r.duplicates ?? 0} mükerrer atlandı.`,
      );
      reset();
    });
  };

  const selectedRows = result?.rows.filter((r) => r.selected) ?? [];
  const selectedCount = selectedRows.length;
  const selectedExpenseTotal = selectedRows
    .filter((r) => !r.is_transfer)
    .reduce((s, r) => s + r.amount, 0);
  const selectedTransferTotal = selectedRows
    .filter((r) => r.is_transfer)
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">Ekstre Yükle</div>
          <div className="page-sub">
            Kredi kartı ekstresi (.xls) yükle, satırları gözden geçir, gider olarak ekle.
          </div>
        </div>
      </div>

      {!configured && (
        <div
          className="card card-pad"
          style={{
            background: "var(--warning-soft)",
            color: "var(--warning)",
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          Supabase yapılandırılmamış. Yükleme pasif.
        </div>
      )}

      {commitInfo && (
        <div
          className="card card-pad"
          style={{
            background: "var(--positive-soft)",
            color: "var(--positive)",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {commitInfo}
        </div>
      )}

      {!result && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Dosya Seç</div>
            <div className="card-sub">Garanti BBVA · Ekstre İşlemleri TL</div>
          </div>
          <div className="card-pad" style={{ display: "grid", gap: 10 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!configured || busy}
              style={{ fontSize: 13 }}
            />
            {file && (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-prim"
                onClick={onUpload}
                disabled={!configured || busy || !file}
              >
                <Icon name="upload" size={12} /> {busy ? "Okunuyor…" : "Önizle"}
              </button>
              {file && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={busy}
                >
                  Temizle
                </button>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                lineHeight: 1.5,
                paddingTop: 4,
                borderTop: "1px solid var(--border-soft)",
              }}
            >
              Pozitif tutarlar (Cep Şube Ödeme, kart ödemesi vb.) transfer kabul edilir
              ve varsayılan olarak <b>seçili gelmez</b>. Negatif tutarlar gider olarak işaretlenir.
              Aynı işlem tekrar yüklenirse hash ile mükerrer engellenir.
            </div>
            {error && (
              <div style={{ color: "var(--negative)", fontSize: 12 }}>{error}</div>
            )}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-head">
              <div className="card-title">Önizleme</div>
              <div className="card-sub">
                {result.rows.length} satır
                {result.skipped > 0 ? ` · ${result.skipped} atlandı` : ""}
              </div>
            </div>
            <div
              className="card-pad"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
              }}
            >
              <Stat
                label="Kart"
                value={result.card_last4 ? `**** ${result.card_last4}` : "—"}
              />
              <Stat
                label="Dönem"
                value={
                  result.period_start && result.period_end
                    ? `${result.period_start} → ${result.period_end}`
                    : "—"
                }
              />
              <Stat label="Seçili" value={`${selectedCount} / ${result.rows.length}`} />
              <Stat
                label="Gider toplamı"
                value={formatTl(selectedExpenseTotal)}
              />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <div
              className="card-pad"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <select
                style={inp}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Hesap seç…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.iban ? ` · ${a.iban}` : ""}
                  </option>
                ))}
              </select>
              <select
                style={inp}
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
              >
                <option value="">Kişi (opsiyonel)…</option>
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn"
                  onClick={reset}
                  disabled={busy}
                  title="Vazgeç"
                >
                  <Icon name="x" size={12} /> Vazgeç
                </button>
                <button
                  className="btn btn-prim"
                  onClick={submit}
                  disabled={
                    !configured || busy || !accountId || selectedCount === 0
                  }
                >
                  <Icon name="check" size={12} /> {selectedCount} işlemi ekle
                </button>
              </div>
            </div>
            {selectedTransferTotal > 0 && (
              <div
                style={{
                  padding: "0 14px 10px",
                  fontSize: 11,
                  color: "var(--muted)",
                }}
              >
                Seçili transferler: {formatTl(selectedTransferTotal)} (gider sayılmaz, kayıt
                <code style={{ margin: "0 4px" }}>is_transfer=true</code>olarak gider.)
              </div>
            )}
            {error && (
              <div
                style={{
                  padding: "8px 14px",
                  color: "var(--negative)",
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">İşlemler</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => selectAll("expense")}
                  disabled={busy}
                >
                  Sadece giderler
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => selectAll("all")}
                  disabled={busy}
                >
                  Tümü
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => selectAll("none")}
                  disabled={busy}
                >
                  Hiçbiri
                </button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr
                    style={{
                      color: "var(--muted)",
                      background: "var(--surface-2)",
                    }}
                  >
                    <th style={{ padding: "8px 10px", textAlign: "left", width: 32 }}></th>
                    <th style={{ padding: "8px 10px", textAlign: "left", width: 92 }}>
                      Tarih
                    </th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>İşlem</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", width: 130 }}>
                      Etiket
                    </th>
                    <th style={{ padding: "8px 10px", textAlign: "left", width: 170 }}>
                      Kategori
                    </th>
                    <th style={{ padding: "8px 10px", textAlign: "right", width: 110 }}>
                      Tutar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr
                      key={r.hash_dedupe}
                      style={{
                        borderTop: "1px solid var(--border-soft)",
                        opacity: r.selected ? 1 : 0.45,
                        background: r.is_transfer
                          ? "color-mix(in srgb, var(--positive) 5%, transparent)"
                          : undefined,
                      }}
                    >
                      <td style={{ padding: "6px 10px" }}>
                        <input
                          type="checkbox"
                          checked={r.selected}
                          onChange={() => toggleRow(i)}
                        />
                      </td>
                      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                        {r.occurred_on}
                      </td>
                      <td style={{ padding: "6px 10px" }}>{r.merchant_raw}</td>
                      <td
                        style={{
                          padding: "6px 10px",
                          color: "var(--muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.etiket || "—"}
                      </td>
                      <td style={{ padding: "6px 10px" }}>
                        {r.is_transfer ? (
                          <span style={{ color: "var(--muted)", fontSize: 11 }}>
                            transfer (kart ödemesi)
                          </span>
                        ) : (
                          <select
                            style={inp}
                            value={r.category_id ?? ""}
                            onChange={(e) =>
                              setCat(i, e.target.value || null)
                            }
                          >
                            <option value="">— kategori yok —</option>
                            {expenseCats.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.icon ?? "·"} {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "6px 10px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          color: r.is_transfer
                            ? "var(--positive)"
                            : "var(--fg)",
                          fontWeight: 600,
                        }}
                      >
                        {r.is_transfer ? "+" : "−"}
                        {formatTl(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
