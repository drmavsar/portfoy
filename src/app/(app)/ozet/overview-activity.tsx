"use client";

import Link from "next/link";
import { useState } from "react";
import type { RawTxn } from "@/app/(app)/_lib/reports-actions";
import type { BeneficiaryLite } from "@/app/(app)/hesaplar/actions";
import { overviewActivity } from "./overview-activity-model";
import "./overview-activity.css";

export function OverviewActivity({ rows, people, today }: { rows: RawTxn[]; people: BeneficiaryLite[]; today: string }) {
  const [period, setPeriod] = useState("month");
  const [person, setPerson] = useState("");
  const from = period === "month" ? today.slice(0, 7) + "-01" : new Date(Date.parse(today + "T00:00:00Z") - 29 * 86400000).toISOString().slice(0, 10);
  const activity = overviewActivity(rows, from, today, person);
  const names = Object.fromEntries(people.map(p => [p.id, p.name]));
  const money = (n: number, currency: string) => n.toLocaleString("tr-TR", { style: "currency", currency });
  const total = (field: "income" | "expense" | "net") => activity.totals.map(t => money(t[field], t.currency)).join(" · ") || "—";
  return <section className="card overview-activity" aria-label="Günlük nakit özeti">
    <div className="card-head"><div className="card-title">Nakit Hareketleri</div><div className="overview-controls">
      <label>Dönem <select value={period} onChange={e => setPeriod(e.target.value)}><option value="month">Bu ay</option><option value="30">Son 30 gün</option></select></label>
      <label>Kişi <select value={person} onChange={e => setPerson(e.target.value)}><option value="">Tümü</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="__none__">Atanmamış</option></select></label>
    </div></div>
    <p className="hint overview-note">{from} → {today} · {activity.count} kayıt · Seçimler yalnızca bu bölümü etkiler.</p>
    <div className="overview-kpis">
      <Link href="/gelirler"><span>Gelir</span><strong>{total("income")}</strong><small>Gelir kayıtlarına git →</small></Link>
      <Link href="/giderler"><span>Gider</span><strong>{total("expense")}</strong><small>Gider kayıtlarına git →</small></Link>
      <Link href="/raporlar"><span>Net nakit akışı</span><strong>{total("net")}</strong><small>Raporlara git →</small></Link>
    </div>
    <div className="overview-recent"><table><caption>Son {activity.recent.length} hareket · seçili dönemdeki {activity.count} kayıttan</caption><thead><tr><th>Tarih</th><th>Açıklama</th><th>Kişi</th><th>Tür</th><th>Tutar</th></tr></thead><tbody>
      {activity.recent.map((r, i) => <tr key={`${r.occurred_on}-${i}`}><td>{r.occurred_on.slice(0, 10).split("-").reverse().join(".")}</td><td>{r.description ?? r.merchant_raw ?? "Açıklama yok"}</td><td>{r.beneficiary_id ? names[r.beneficiary_id] ?? "Kişi kaydı bulunamadı" : "Atanmamış"}</td><td>{r.direction === "inflow" ? "Gelir" : "Gider"}</td><td className={r.direction === "inflow" ? "positive" : "negative"}>{money(Number(r.amount) * (r.direction === "inflow" ? 1 : -1), r.currency)}</td></tr>)}
      {!activity.count && <tr><td colSpan={5}>Bu kişi ve dönem için gelir/gider kaydı bulunamadı.</td></tr>}
    </tbody></table></div>
    <p className="hint overview-note">Transferler dahil değildir. Tutarlar para birimine göre ayrıdır. Bağlantılar ilgili modülü açar; buradaki kişi ve dönem seçimi diğer ekranlara taşınmaz.</p>
  </section>;
}
