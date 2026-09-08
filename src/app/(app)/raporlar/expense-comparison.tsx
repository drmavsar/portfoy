"use client";

import { useState } from "react";
import type { RawTxn } from "@/app/(app)/_lib/reports-actions";
import type { CategoryRow } from "@/app/(app)/ayarlar/actions";
import type { BeneficiaryLite } from "@/app/(app)/hesaplar/actions";
import { csvCell } from "@/components/grid/model";
import { expenseMatrix, previousPeriod, type ComparisonCell, type ComparisonMode } from "./expense-comparison-model";
import "./expense-comparison.css";

interface Props { txns: RawTxn[]; categories: CategoryRow[]; beneficiaries: BeneficiaryLite[]; from: string; to: string }
export function ExpenseComparison({ txns, categories, beneficiaries, from, to }: Props) {
  const currencies = [...new Set(txns.filter(t => t.direction === "outflow").map(t => t.currency))].sort();
  const [chosenCurrency, setCurrency] = useState("");
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies.includes("TRY") ? "TRY" : currencies[0] ?? "TRY";
  const [mode, setMode] = useState<ComparisonMode>("period");
  const [people, setPeople] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState("");
  const previous = previousPeriod({ from, to }, mode);
  const peopleMap = Object.fromEntries(beneficiaries.map(p => [p.id, p.name]));
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const personName = (id: string) => id === "__none__" ? "Atanmamış" : peopleMap[id] ?? `Kişi (${id.slice(0, 8)})`;
  const categoryName = (id: string) => id === "__none__" ? "Kategorisiz" : categoryMap[id] ?? `Kategori (${id.slice(0, 8)})`;
  const personOptions = [...new Set(txns.filter(t => t.direction === "outflow").map(t => t.beneficiary_id ?? "__none__"))].sort((a, b) => personName(a).localeCompare(personName(b), "tr"));
  const categoryOptions = [...new Set(txns.filter(t => t.direction === "outflow").map(t => t.category_id ?? "__none__"))].sort((a, b) => categoryName(a).localeCompare(categoryName(b), "tr"));
  const matrix = previous ? expenseMatrix(txns, { from, to }, previous, currency, people, category) : null;
  const persons = matrix?.personIds.sort((a, b) => personName(a).localeCompare(personName(b), "tr")) ?? [];
  const cats = matrix?.categoryIds.sort((a, b) => categoryName(a).localeCompare(categoryName(b), "tr")) ?? [];
  const money = (n: number) => n.toLocaleString("tr-TR", { style: "currency", currency });
  const cell = (value: ComparisonCell) => <><strong>{money(value.current)}</strong><small>Önceki: {money(value.previous)}</small><small style={{ color: value.delta > 0 ? "var(--negative)" : value.delta < 0 ? "var(--positive)" : "var(--muted)" }}>Fark: {money(value.delta)} · {value.percent == null ? value.current === 0 ? "—" : "Yeni harcama" : `${value.percent > 0 ? "+" : ""}${value.percent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`}</small></>;
  const exportRows = (): (string | number | null)[][] => {
    if (!matrix || !previous) return [];
    const metrics = (v: ComparisonCell) => [v.current, v.previous, v.delta, v.percent];
    const headings = [...persons.map(personName), "Toplam"].flatMap(name => [name, `${name} önceki`, `${name} fark`, `${name} değişim %`]);
    return [
      ["Seçili dönem", from, to], ["Önceki dönem", previous.from, previous.to], ["Para birimi", currency],
      ["Kişi filtresi", people.length ? people.map(personName).join(", ") : "Tümü"], ["Kategori filtresi", category ? categoryName(category) : "Tümü"],
      ["Gider türü", ...headings],
      ...cats.map(c => [categoryName(c), ...persons.flatMap(p => metrics(matrix.get(c, p))), ...metrics(matrix.get(c, null))]),
      ["Toplam", ...persons.flatMap(p => metrics(matrix.get(null, p))), ...metrics(matrix.get(null, null))],
    ];
  };
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(exportRows()), "Gider karşılaştırması");
      XLSX.writeFile(book, `gider-karsilastirma-${from}-${to}-${currency}.xlsx`);
      setNotice("Excel dosyası hazırlandı.");
    } catch { setNotice("Excel hazırlanamadı. CSV olarak tekrar deneyebilirsiniz."); }
  };
  const exportCsv = () => {
    const data = exportRows().map(row => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `gider-karsilastirma-${from}-${to}-${currency}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="card expense-comparison" aria-label="Kişi ve gider türü karşılaştırması">
    <div className="card-head"><div className="card-title">Kişi × Gider Türü</div></div>
    <div className="comparison-controls">
      <label>Para birimi <select value={currency} onChange={e => setCurrency(e.target.value)}>{(currencies.length ? currencies : ["TRY"]).map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Karşılaştırma <select value={mode} onChange={e => setMode(e.target.value as ComparisonMode)}><option value="period">Önceki eşit süre</option><option value="month">Önceki ayın aynı tarihleri</option></select></label>
      <label>Gider türü <select value={category} onChange={e => setCategory(e.target.value)}><option value="">Tümü</option>{categoryOptions.map(c => <option key={c} value={c}>{categoryName(c)}</option>)}</select></label>
      <button className="btn btn-sm" disabled={!matrix || !cats.length} onClick={exportExcel}>Excel indir</button>
      <button className="btn btn-sm" disabled={!matrix || !cats.length} onClick={exportCsv}>CSV indir</button>
    </div>
    <fieldset className="comparison-controls"><legend>Kişiler · seçim yoksa tümü</legend>{personOptions.map(p => <label key={p}><input type="checkbox" checked={people.includes(p)} onChange={() => setPeople(old => old.includes(p) ? old.filter(id => id !== p) : [...old, p])} />{personName(p)}</label>)}<button className="btn btn-sm" onClick={() => { setPeople([]); setCategory(""); }}>Filtreleri temizle</button></fieldset>
    {!previous ? <p role="alert" className="comparison-note">Geçerli bir başlangıç ve bitiş tarihi seçin.</p> : <>
      <p className="comparison-note">Seçili: {from} → {to} · Önceki: {previous.from} → {previous.to} · {currency}</p>
      {previous.to >= from && <p className="comparison-note">Bu tarih aralığında dönemler kısmen örtüşüyor; ortak günler iki döneme de dahildir.</p>}
      {!cats.length ? <p className="empty">Bu filtrelerde iki dönemde de gider kaydı yok.</p> : <div className="comparison-scroll"><table><caption>Seçili ve önceki dönemin kişi bazında giderleri ({currency})</caption><thead><tr><th scope="col">Gider türü</th>{persons.map(p => <th scope="col" key={p}>{personName(p)}</th>)}<th scope="col">Toplam</th></tr></thead><tbody>{cats.map(c => <tr key={c}><th scope="row">{categoryName(c)}</th>{persons.map(p => <td key={p}>{cell(matrix!.get(c, p))}</td>)}<td>{cell(matrix!.get(c, null))}</td></tr>)}</tbody><tfoot><tr><th scope="row">Toplam</th>{persons.map(p => <td key={p}>{cell(matrix!.get(null, p))}</td>)}<td>{cell(matrix!.get(null, null))}</td></tr></tfoot></table></div>}
    </>}
    <p className="comparison-note">Fark = seçili dönem − önceki dönem. Harcama artışı kırmızı, azalışı yeşil gösterilir. Önceki tutar sıfırsa yüzde hesaplanmaz. Transferler dahil değildir. Bu filtreler yalnızca karşılaştırma tablosunu etkiler.</p>
    {notice && <p role="status" className="comparison-note">{notice}</p>}
  </section>;
}
