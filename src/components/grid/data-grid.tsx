"use client";

import { Fragment, useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { csvCell, filterAndSort, groupRows, type Group, type SortRule, type ValueColumn } from "./model";
import "./grid.css";
import { z } from "zod";

export interface GridColumn<T> extends ValueColumn<T> {
  title: string;
  render?: (row: T) => ReactNode;
  groupable?: boolean;
  numeric?: boolean;
  width?: number;
}
interface Settings {
  groups: string[];
  hidden: string[];
  order: string[];
  pinned: string[];
  widths: Record<string, number>;
  compact: boolean;
  sort: SortRule[];
}
const settingsSchema = z.object({
  groups: z.array(z.string()), hidden: z.array(z.string()), order: z.array(z.string()), pinned: z.array(z.string()),
  widths: z.record(z.string(), z.number().min(80).max(600)), compact: z.boolean(),
  sort: z.array(z.object({ id: z.string(), desc: z.boolean() })),
});
const viewSchema = z.object({ settings: settingsSchema, filters: z.record(z.string(), z.string()) });
const storedSchema = z.object({ version: z.literal(2), settings: settingsSchema, views: z.record(z.string(), viewSchema) });
type SavedView = z.infer<typeof viewSchema>;
interface Props<T> {
  rows: T[];
  columns: GridColumn<T>[];
  rowId: (row: T) => string;
  storageKey: string;
  summary: (rows: T[]) => ReactNode;
  groupingEnabled?: boolean;
  actions?: (row: T) => ReactNode;
  onFilteredRows?: (rows: T[]) => void;
}

export function DataGrid<T>({ rows, columns, rowId, storageKey, summary, actions, onFilteredRows, groupingEnabled = true }: Props<T>) {
  const defaults: Settings = { groups: [], hidden: [], order: columns.map(c => c.id), pinned: [], widths: {}, compact: false, sort: [{ id: columns[0].id, desc: true }] };
  const [settings, setSettings] = useState(defaults);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [ready, setReady] = useState(false);
  const [views, setViews] = useState<Record<string, SavedView>>({});
  const [viewName, setViewName] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const parsed = storedSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
      if (parsed.success) {
        // Browser-only preferences must be restored after the server HTML hydrates.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings(parsed.data.settings);
        setViews(parsed.data.views);
      }
    } catch { /* Storage is optional. */ }
    setReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 2, settings, views })); }
    catch { /* Private browsing / quota: grid still works. */ }
  }, [settings, views, ready, storageKey]);

  const filtered = filterAndSort(rows, columns, filters, settings.sort);
  // Notify parent only when the actual row membership/order changes.
  const filteredKey = filtered.map(rowId).join(",");
  useEffect(() => { onFilteredRows?.(filtered); }, [filteredKey, rows, onFilteredRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = groupRows(filtered, columns, groupingEnabled ? settings.groups : []);
  const ordered = [...settings.order, ...columns.map(c => c.id).filter(id => !settings.order.includes(id))]
    .map(id => columns.find(c => c.id === id)).filter((c): c is GridColumn<T> => !!c && !settings.hidden.includes(c.id));
  const visible = [...ordered.filter(c => settings.pinned.includes(c.id)), ...ordered.filter(c => !settings.pinned.includes(c.id))];
  const selectedRows = filtered.filter(r => selected.has(rowId(r)));
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil((groups.length || filtered.length) / pageSize));
  const activePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(activePage * pageSize, (activePage + 1) * pageSize);
  const update = (patch: Partial<Settings>) => { setSettings(s => ({ ...s, ...patch })); setPage(0); };
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const width = (c: GridColumn<T>) => settings.widths[c.id] ?? c.width ?? 160;
  const cellStyle = (c: GridColumn<T>): CSSProperties => ({
    width: width(c), minWidth: width(c), maxWidth: width(c),
    ...(settings.pinned.includes(c.id) ? { position: "sticky", left: 44 + visible.slice(0, visible.indexOf(c)).filter(x => settings.pinned.includes(x.id)).reduce((s, x) => s + width(x), 0), zIndex: 1, background: "var(--surface)" } : {}),
  });
  const sort = (id: string, multi: boolean) => {
    const current = settings.sort.find(s => s.id === id);
    const next = current ? (current.desc ? null : { id, desc: true }) : { id, desc: false };
    update({ sort: [...(multi ? settings.sort.filter(s => s.id !== id) : []), ...(next ? [next] : [])] });
  };
  const exportCsv = () => {
    const data = [visible.map(c => csvCell(c.title)).join(";"), ...filtered.map(r => visible.map(c => csvCell(c.value(r))).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "filtreli-kayitlar.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([visible.map(c => c.title), ...filtered.map(row => visible.map(c => c.value(row)))]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Filtreli kayıtlar");
      XLSX.writeFile(book, "filtreli-kayitlar.xlsx");
    } catch { setNotice("Excel dosyası hazırlanamadı. CSV olarak tekrar deneyebilirsiniz."); }
  };
  const renderRow = (row: T) => <tr key={rowId(row)} aria-selected={selected.has(rowId(row))}>
    <td><input type="checkbox" aria-label={`Kaydı seç: ${columns[0].value(row)}`} checked={selected.has(rowId(row))} onChange={() => toggle(rowId(row))} /></td>
    {visible.map(c => <td key={c.id} style={cellStyle(c)} className={c.numeric ? "num tabular" : ""}>{c.render ? c.render(row) : c.value(row) ?? "—"}</td>)}
    {actions && <td>{actions(row)}</td>}
  </tr>;
  const renderGroup = (group: Group<T>, depth = 0): ReactNode => <Fragment key={group.key}>
    <tr className="shared-grid-group"><td colSpan={visible.length + 1 + (actions ? 1 : 0)}>
      <div style={{ paddingLeft: depth * 20 }} className="shared-grid-group-content">
        <button className="btn btn-sm" aria-expanded={!closed.has(group.key)} onClick={() => setClosed(prev => { const n = new Set(prev); if (n.has(group.key)) n.delete(group.key); else n.add(group.key); return n; })}>
          {closed.has(group.key) ? "▸" : "▾"} {group.label}
        </button><span className="hint">{group.rows.length} kayıt</span><strong>{summary(group.rows)}</strong>
      </div>
    </td></tr>
    {!closed.has(group.key) && (group.children.length ? group.children.map(g => renderGroup(g, depth + 1)) : group.rows.map(renderRow))}
  </Fragment>;

  return <section className={`shared-grid ${settings.compact ? "is-compact" : ""}`} aria-label="Kayıt tablosu">
    <div className="shared-grid-toolbar">
      {groupingEnabled && <><label>Grupla <select value="" onChange={e => { update({ groups: [...settings.groups, e.target.value] }); setClosed(new Set()); }}>
        <option value="">Alan ekle…</option>{columns.filter(c => c.groupable && !settings.groups.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select></label>
      {settings.groups.map((id, i) => <button className="btn btn-sm" key={id} onClick={() => update({ groups: settings.groups.filter(x => x !== id) })}>{i + 1}. {columns.find(c => c.id === id)?.title} ×</button>)}
      <button className="btn btn-sm" onClick={() => setClosed(new Set())}>Grupları aç</button>
      <button className="btn btn-sm" onClick={() => { const keys: string[] = []; const visit = (gs: Group<T>[]) => gs.forEach(g => { keys.push(g.key); visit(g.children); }); visit(groups); setClosed(new Set(keys)); }}>Grupları kapat</button></>}
      <button className="btn btn-sm" onClick={exportCsv}>CSV indir</button>
      <button className="btn btn-sm" onClick={exportExcel}>Excel indir</button>
      <label><input type="checkbox" checked={settings.compact} onChange={e => update({ compact: e.target.checked })} /> Sıkışık</label>
    </div>
    <details className="shared-grid-options"><summary>Sütunlar ve kayıtlı görünümler</summary>
      <div className="shared-grid-toolbar">
        <input aria-label="Görünüm adı" placeholder="Görünüm adı" value={viewName} onChange={e => setViewName(e.target.value)} maxLength={60} />
        <button className="btn btn-sm" disabled={!viewName.trim()} onClick={() => { setViews(v => ({ ...v, [viewName.trim()]: { settings, filters } })); setNotice(groupingEnabled ? "Sütunlar, gruplama ve sütun filtreleri bu tarayıcıda kaydedildi. Tarih aralığı ayrıca seçilir." : "Sütunlar ve sütun filtreleri bu tarayıcıda kaydedildi. Tarih aralığı ayrıca seçilir."); }}>Görünümü kaydet</button>
        <select aria-label="Kayıtlı görünüm" value="" onChange={e => { const view = views[e.target.value]; if (!view) return; update(view.settings); setFilters(view.filters); setClosed(new Set()); setViewName(e.target.value); }}><option value="">Görünüm yükle…</option>{Object.keys(views).map(n => <option key={n}>{n}</option>)}</select>
        <button className="btn btn-sm" disabled={!views[viewName]} onClick={() => setViews(v => { const next = { ...v }; delete next[viewName]; return next; })}>Görünümü sil</button>
        <button className="btn btn-sm" onClick={() => { setSettings(defaults); setFilters({}); setClosed(new Set()); setPage(0); }}>Varsayılana dön</button>
        <span role="status">{notice}</span>
      </div>
      {settings.order.map((id, index) => { const c = columns.find(x => x.id === id); if (!c) return null; return <div className="shared-grid-toolbar" key={id}>
        <label><input type="checkbox" checked={!settings.hidden.includes(id)} disabled={!settings.hidden.includes(id) && visible.length === 1} onChange={e => update({ hidden: e.target.checked ? settings.hidden.filter(x => x !== id) : [...settings.hidden, id] })} /> {c.title}</label>
        <label><input type="checkbox" checked={settings.pinned.includes(id)} onChange={e => update({ pinned: e.target.checked ? [...settings.pinned, id] : settings.pinned.filter(x => x !== id) })} /> Sabitle</label>
        <label>Genişlik <input type="number" min={80} max={600} step={10} value={width(c)} onChange={e => update({ widths: { ...settings.widths, [id]: Math.max(80, Math.min(600, Number(e.target.value))) } })} /></label>
        <button className="btn btn-sm" disabled={index === 0} aria-label={`${c.title} sola taşı`} onClick={() => { const order = [...settings.order]; [order[index - 1], order[index]] = [order[index], order[index - 1]]; update({ order }); }}>←</button>
        <button className="btn btn-sm" disabled={index === settings.order.length - 1} aria-label={`${c.title} sağa taşı`} onClick={() => { const order = [...settings.order]; [order[index + 1], order[index]] = [order[index], order[index + 1]]; update({ order }); }}>→</button>
      </div>; })}
    </details>
    <div className="shared-grid-toolbar"><span>{filtered.length} filtreli kayıt / {rows.length} kayıt · Çoklu sıralama: Shift + sütun başlığı</span>
      {Object.entries(filters).filter(([,v]) => v).map(([id,v]) => <button key={id} className="btn btn-sm" onClick={() => setFilters(f => ({ ...f, [id]: "" }))}>{columns.find(c => c.id === id)?.title}: {v} ×</button>)}
      <button className="btn btn-sm" onClick={() => { setFilters({}); setPage(0); }}>Filtreleri temizle</button>
    </div>
    <div className="shared-grid-scroll" tabIndex={0} aria-label="Kaydırılabilir kayıtlar">
      <table className="dg"><thead><tr><th><input type="checkbox" aria-label="Filtrelenen tüm kayıtları seç" checked={filtered.length > 0 && selectedRows.length === filtered.length} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(rowId)) : new Set())} /></th>
        {visible.map(c => { const s = settings.sort.find(x => x.id === c.id); return <th key={c.id} style={cellStyle(c)} aria-sort={s ? s.desc ? "descending" : "ascending" : "none"}>
          <button className="shared-grid-sort" onClick={e => sort(c.id, e.shiftKey)}>{c.title} {s ? `${s.desc ? "▼" : "▲"}${settings.sort.indexOf(s) + 1}` : "↕"}</button>
          <input aria-label={`${c.title} filtresi`} placeholder="Filtrele…" value={filters[c.id] ?? ""} onChange={e => { setFilters(f => ({ ...f, [c.id]: e.target.value })); setPage(0); }} />
        </th>; })}{actions && <th>İşlemler</th>}</tr></thead>
        <tbody>{groups.length ? groups.slice(activePage * pageSize, (activePage + 1) * pageSize).map(g => renderGroup(g)) : pageItems.map(renderRow)}
          {!filtered.length && <tr><td colSpan={visible.length + 1 + (actions ? 1 : 0)}>Bu filtrelerde kayıt yok.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="shared-grid-footer" aria-live="polite"><div><strong>Filtrelenen toplam ({filtered.length} kayıt): {summary(filtered)}</strong>
      {selectedRows.length > 0 && <div>Seçilen {selectedRows.length} kayıt: {summary(selectedRows)} <button className="btn btn-sm" onClick={() => setSelected(new Set())}>Seçimi temizle</button></div>}</div>
      <div><button className="btn btn-sm" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Önceki</button> {activePage + 1} / {pageCount} <button className="btn btn-sm" disabled={activePage + 1 >= pageCount} onClick={() => setPage(activePage + 1)}>Sonraki</button></div>
    </div>
  </section>;
}
