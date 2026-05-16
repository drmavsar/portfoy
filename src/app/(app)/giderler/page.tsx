"use client";

import { useState } from "react";

import { FilterRail } from "@/app/(app)/_components/filter-rail";
import { CatChip, PersonChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmt } from "@/lib/finance/fmt";
import { ACCOUNTS, BANKS, EXPENSE_RECORDS, KPIS, TOP_YEAR } from "@/lib/sample/data";

import { ImportModal } from "./import-modal";

export default function GiderlerPage() {
  const records = EXPENSE_RECORDS;
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Giderler</div>
          <div className="page-sub">Tek odak: gider kayıtları + ekstre yükleme.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-prim" onClick={() => setImportOpen(true)}>
            <Icon name="upload" size={14} /> Ekstre Yükle
          </button>
          <button className="btn"><Icon name="plus" size={14} /> Yeni Gider</button>
        </div>
      </div>

      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard
          label="Bu Ay Gider"
          value={fmt.try(KPIS.cashflowMonth.expense)}
          delta={fmt.pct(-3.4)}
          deltaPos={false}
          deltaLabel="−2.700 ₺ ↓"
          spark={[72, 76, 75, 79, 78, 80, 78]}
          sparkColor="var(--negative)"
        />
        <KpiCard label="Bu Yıl Gider (YTD)" value={fmt.try(384_000)} delta={fmt.pct(19.1)} deltaLabel="enflasyon altı" />
        <KpiCard label="YoY %" value={fmt.pct(19.1)} deltaLabel="2025 → 2024" />
        <KpiCard label="En Pahalı Kategori" value="Market" delta="22.280 ₺" deltaLabel="bu ay" />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Yıl Boyunca En Büyük 5 Gider</div>
          <div className="card-sub">2026 · tek seferlik</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)" }}>
          {TOP_YEAR.map((t, i) => (
            <div key={i} style={{ padding: "14px 16px", borderRight: i < 4 ? "1px solid var(--border-soft)" : "none" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{t.date}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{t.merchant}</div>
              <div className="row gap-8" style={{ marginTop: 6 }}>
                <CatChip id={t.cat} size="sm" />
                <PersonChip id={t.ben} size="sm" />
              </div>
              <div className="tabular" style={{ fontSize: 18, fontWeight: 700, marginTop: 8, color: "var(--negative)" }}>
                −{fmt.k(t.amount)} ₺
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "240px 1fr", gap: 18, alignItems: "start" }}>
        <FilterRail kind="expense" />

        <div className="card">
          <div className="card-head">
            <div className="card-title">Gider Kayıtları</div>
            <div className="card-sub">{records.length} kayıt · son 30 gün</div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <div className="search" style={{ width: 200 }}>
                <Icon name="search" size={12} />
                <input placeholder="Merchant veya hashtag" />
              </div>
              <button className="btn btn-sm"><Icon name="download" size={12} /></button>
            </div>
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Tarih</th>
                <th>Merchant</th>
                <th>Kategori</th>
                <th>Kişi</th>
                <th>Hesap</th>
                <th>Etiketler</th>
                <th className="num">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const acc = ACCOUNTS.find((a) => a.id === r.acc);
                const bank = acc ? BANKS.find((b) => b.id === acc.bank) : null;
                return (
                  <tr key={i}>
                    <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{r.date}</td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{r.desc}</td>
                    <td><CatChip id={r.cat} /></td>
                    <td><PersonChip id={r.ben} /></td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>{bank?.short ?? "—"}</td>
                    <td>
                      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                        {r.tags.map((t) => (
                          <span key={t} className="tag">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="num tabular" style={{ fontWeight: 600 }}>−{fmt.tr(r.amount, 2)} ₺</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
