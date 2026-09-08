"use client";

import { useMemo, useState } from "react";
import { DataGrid, type GridColumn } from "@/components/grid/data-grid";
import { moneyTotals } from "@/components/grid/model";

export interface ActivityRow {
  id: string; date: string; kind: string; description: string; category: string;
  person: string; amount: number; currency: string; notes: string | null;
}
const columns: GridColumn<ActivityRow>[] = [
  { id: "date", title: "Tarih", value: r => r.date, render: r => r.date.split("-").reverse().join(".") },
  { id: "kind", title: "Hareket Türü", value: r => r.kind, groupable: true },
  { id: "description", title: "Açıklama / Sembol", value: r => r.description, width: 260 },
  { id: "category", title: "Kategori", value: r => r.category, groupable: true },
  { id: "person", title: "Kişi", value: r => r.person, groupable: true },
  { id: "amount", title: "Tutar", value: r => r.amount, numeric: true, render: r => moneyTotals([r], r => r.amount, r => r.currency) },
  { id: "currency", title: "Para Birimi", value: r => r.currency, groupable: true },
  { id: "notes", title: "Not", value: r => r.notes },
];
function summary(rows: ActivityRow[]) {
  return ["Gelir", "Gider", "Alış", "Satış", "Transfer"].filter(kind => rows.some(r => r.kind === kind)).map(kind => `${kind}: ${moneyTotals(rows.filter(r => r.kind === kind), r => r.amount, r => r.currency)}`).join(" · ") || "—";
}
export function ActivityGrid({ rows, accountId }: { rows: ActivityRow[]; accountId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalid = Boolean(from && to && from > to);
  const periodRows = useMemo(() => invalid ? [] : rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to)), [rows, from, to, invalid]);
  return <div className="card"><div className="card-head" style={{ flexWrap: "wrap", gap: 12 }}><div className="card-title">Hesap Hareketleri</div>
    <label>Başlangıç <input type="date" value={from} onInput={e => setFrom(e.currentTarget.value)} /></label>
    <label>Bitiş <input type="date" value={to} onInput={e => setTo(e.currentTarget.value)} /></label>
    <button className="btn btn-sm" onClick={() => { setFrom(""); setTo(""); }}>Tüm dönem</button>
  </div>{invalid && <p role="alert" style={{ padding: 14 }}>Başlangıç tarihi bitiş tarihinden sonra olamaz.</p>}
    <DataGrid rows={periodRows} columns={columns} rowId={r => r.id} storageKey={`account-activity-grid-${accountId}`} summary={summary} />
  </div>;
}
