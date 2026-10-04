"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import { csvCell } from "@/components/grid/model";
import { Icon } from "@/components/ui/icon";
import {
  MONTHS_SHORT,
  facetOptions,
  filterLedger,
  groupLedger,
  primaryCurrency,
  sortLedger,
  windowGroups,
  type LedgerSort,
} from "./model";
import "./ledger.css";

export interface LedgerFacet<T> {
  id: string;
  label: string;
  value: (row: T) => string;
  /** Filtre açılır listesinde göster */
  filter?: boolean;
  /** "Grupla" seçeneklerinde göster */
  group?: boolean;
  /** Satırın alt bilgisinde tıklanabilir etiket olarak göster */
  meta?: boolean;
  /** Alt bilgideki görünüm (ör. renk noktası); yoksa değer */
  render?: (row: T) => ReactNode;
}

export interface LedgerExportColumn<T> {
  title: string;
  value: (row: T) => string | number | null;
}

interface Props<T> {
  rows: T[];
  rowId: (row: T) => string;
  /** "YYYY-MM-DD" */
  date: (row: T) => string;
  amount: (row: T) => number;
  currency: (row: T) => string;
  searchText: (row: T) => string;
  title: (row: T) => ReactNode;
  value: (row: T) => ReactNode;
  /** Alt bilgiye eklenen serbest metin (not vb.) */
  extra?: (row: T) => ReactNode;
  facets: LedgerFacet<T>[];
  summary: (rows: T[]) => ReactNode;
  groupSummary?: (rows: T[]) => ReactNode;
  exportColumns: LedgerExportColumn<T>[];
  exportName: string;
  storageKey: string;
  actions?: (row: T) => ReactNode;
  onFilteredRows?: (rows: T[]) => void;
  searchPlaceholder?: string;
}

const PAGE = 100;
const SORTS: Array<[LedgerSort, string]> = [
  ["date-desc", "Yeni → eski"],
  ["date-asc", "Eski → yeni"],
  ["amount-desc", "Tutar: büyük → küçük"],
  ["amount-asc", "Tutar: küçük → büyük"],
];

export function Ledger<T>(p: Props<T>) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState("");
  const [sort, setSort] = useState<LedgerSort>("date-desc");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Gruplama ve sıralama tercihi tarayıcıda kalır; filtreler her açılışta temiz.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(p.storageKey) ?? "null") as { group?: unknown; sort?: unknown } | null;
      if (saved && typeof saved.group === "string") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGroupBy(saved.group);
      }
      if (saved && SORTS.some(([k]) => k === saved.sort)) setSort(saved.sort as LedgerSort);
    } catch {
      /* depolama yoksa varsayılanlar */
    }
    setHydrated(true);
  }, [p.storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(p.storageKey, JSON.stringify({ group: groupBy, sort }));
    } catch {
      /* gizli mod / kota */
    }
  }, [hydrated, groupBy, sort, p.storageKey]);

  const filterFacets = p.facets.filter((f) => f.filter);
  const groupFacets = p.facets.filter((f) => f.group);
  const metaFacets = p.facets.filter((f) => f.meta);
  const options = useMemo(
    () => Object.fromEntries(filterFacets.map((f) => [f.id, facetOptions(p.rows, f.value)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.rows, p.facets],
  );

  const acc = { date: p.date, amount: p.amount };
  const filtered = sortLedger(filterLedger(p.rows, p.searchText, query, filterFacets, selected), acc, sort);
  const validGroup = groupBy === "day" || groupBy === "month" || groupFacets.some((f) => f.id === groupBy) ? groupBy : "";
  // Pay çubuğu baskın para biriminde: birkaç USD kaydı TL kırılımını gizlemesin
  const primary = primaryCurrency(filtered, p.currency);
  const groups = validGroup
    ? groupLedger(filtered, acc, validGroup, groupFacets, sort, (r) => (p.currency(r) === primary ? Math.abs(p.amount(r)) : 0))
    : [];
  const totalWeight = groups.reduce((s, g) => s + g.weight, 0);
  const mixedCurrency = new Set(filtered.map(p.currency)).size > 1;

  const filteredKey = filtered.map(p.rowId).join(",");
  const { onFilteredRows } = p;
  // Üst karttaki "filtreli toplam" ile aynı kümeyi paylaş
  useEffect(() => {
    onFilteredRows?.(filtered);
  }, [filteredKey, onFilteredRows]); // eslint-disable-line react-hooks/exhaustive-deps

  const win = validGroup
    ? windowGroups(groups, closed, limit)
    : { items: [], hidden: Math.max(0, filtered.length - limit) };
  const flatRows = validGroup ? [] : filtered.slice(0, limit);

  const activeFilters = filterFacets.filter((f) => selected[f.id]);
  // Tek seçenekli alanın filtresi anlamsız (seçiliyse kaldırılabilsin diye kalır)
  const visibleFacets = filterFacets.filter((f) => (options[f.id]?.length ?? 0) > 1 || selected[f.id]);
  const resetPaging = () => setLimit(PAGE);
  const pick = (id: string, v: string) => {
    setSelected((s) => ({ ...s, [id]: v }));
    resetPaging();
  };
  const clearAll = () => {
    setSelected({});
    setQuery("");
    resetPaging();
  };

  const exportCsv = () => {
    const lines = [
      p.exportColumns.map((c) => csvCell(c.title)).join(";"),
      ...filtered.map((r) => p.exportColumns.map((c) => csvCell(c.value(r))).join(";")),
    ];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.exportName}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet([
        p.exportColumns.map((c) => c.title),
        ...filtered.map((r) => p.exportColumns.map((c) => c.value(r))),
      ]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Kayıtlar");
      XLSX.writeFile(book, `${p.exportName}.xlsx`);
    } catch {
      setNotice("Excel dosyası hazırlanamadı; CSV deneyebilirsin.");
    }
  };

  const thisYear = new Date().getFullYear().toString();
  const renderRow = (r: T) => {
    const d = p.date(r);
    return (
      <li key={p.rowId(r)} className="ledger-row">
        <div className="ledger-date" aria-label={d}>
          <b>{d.slice(8, 10)}</b>
          <span>
            {MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}
            {d.slice(0, 4) !== thisYear ? ` ${d.slice(2, 4)}` : ""}
          </span>
        </div>
        <div className="ledger-main">
          <div className="ledger-title">{p.title(r)}</div>
          <div className="ledger-meta">
            {metaFacets.map((f) => (
              <button
                key={f.id}
                type="button"
                title={`${f.label}: ${f.value(r)} — bu değere göre süz`}
                onClick={() => (f.filter ? pick(f.id, f.value(r)) : setQuery(f.value(r)))}
              >
                {f.render ? f.render(r) : f.value(r)}
              </button>
            ))}
            {p.extra?.(r)}
          </div>
        </div>
        <div className="ledger-end">
          <div className="ledger-value">{p.value(r)}</div>
          {p.actions && <div className="ledger-actions">{p.actions(r)}</div>}
        </div>
      </li>
    );
  };

  const allClosed = groups.length > 0 && groups.every((g) => closed.has(g.key));

  return (
    <section className="ledger" aria-label="Kayıt listesi">
      <div className="ledger-toolbar">
        <label className="search ledger-search">
          <Icon name="search" size={12} />
          <input
            type="search"
            value={query}
            placeholder={p.searchPlaceholder ?? "Ara…"}
            aria-label="Kayıtlarda ara"
            onChange={(e) => {
              setQuery(e.target.value);
              resetPaging();
            }}
          />
        </label>
        {visibleFacets.length > 0 && (
          <button
            type="button"
            className={`btn btn-sm ledger-filter-toggle ${activeFilters.length ? "btn-prim" : ""}`}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Icon name="filter" size={12} /> Filtre{activeFilters.length ? ` (${activeFilters.length})` : ""}
          </button>
        )}
        <div className={`ledger-facets ${showFilters ? "is-open" : ""}`}>
          {visibleFacets.map((f) => {
            const opts = options[f.id] ?? [];
            const missing = selected[f.id] && !opts.some((o) => o.value === selected[f.id]);
            return (
              <select
                key={f.id}
                className={`ledger-select ${selected[f.id] ? "is-active" : ""}`}
                aria-label={`${f.label} filtresi`}
                value={selected[f.id] ?? ""}
                onChange={(e) => pick(f.id, e.target.value)}
              >
                <option value="">{f.label}: tümü</option>
                {missing && <option value={selected[f.id]}>{selected[f.id]} (0)</option>}
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.value} ({o.count})
                  </option>
                ))}
              </select>
            );
          })}
        </div>
        <div className="ledger-tools">
          <select
            className="ledger-select"
            aria-label="Grupla"
            value={validGroup}
            onChange={(e) => {
              setGroupBy(e.target.value);
              setClosed(new Set());
              resetPaging();
            }}
          >
            <option value="">Gruplama yok</option>
            <option value="day">Güne göre</option>
            <option value="month">Aya göre</option>
            {groupFacets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} bazında
              </option>
            ))}
          </select>
          <select
            className="ledger-select"
            aria-label="Sırala"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as LedgerSort);
              resetPaging();
            }}
          >
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={exportCsv} disabled={!filtered.length} title="Filtrelenmiş kayıtları CSV indir">
            <Icon name="download" size={12} /> CSV
          </button>
          <button type="button" className="btn btn-sm" onClick={exportExcel} disabled={!filtered.length} title="Filtrelenmiş kayıtları Excel indir">
            <Icon name="download" size={12} /> Excel
          </button>
        </div>
      </div>

      <div className="ledger-summary" aria-live="polite">
        <span>
          <strong>{filtered.length}</strong> kayıt
          {filtered.length !== p.rows.length && <> / {p.rows.length}</>}
        </span>
        <strong className="ledger-summary-total">{p.summary(filtered)}</strong>
        {(activeFilters.length > 0 || query) && (
          <span className="ledger-chips">
            {query && (
              <button type="button" className="chip" onClick={() => setQuery("")}>
                “{query}” ×
              </button>
            )}
            {activeFilters.map((f) => (
              <button key={f.id} type="button" className="chip chip-acc" onClick={() => pick(f.id, "")}>
                {f.label}: {selected[f.id]} ×
              </button>
            ))}
            <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll}>
              Temizle
            </button>
          </span>
        )}
        {validGroup && groups.length > 1 && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginLeft: "auto" }}
            onClick={() => setClosed(allClosed ? new Set() : new Set(groups.map((g) => g.key)))}
          >
            {allClosed ? "Grupları aç" : "Grupları kapat"}
          </button>
        )}
        {notice && <span role="status">{notice}</span>}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="title">Kayıt yok</div>
          <div>{p.rows.length ? "Aramayı ya da filtreleri gevşet." : "Bu dönemde kayıt bulunmuyor."}</div>
        </div>
      ) : (
        <ul className="ledger-list">
          {validGroup
            ? win.items.map(({ group, rows, hidden }) => {
                const open = !closed.has(group.key);
                const share = totalWeight > 0 ? group.weight / totalWeight : null;
                return (
                  <Fragment key={group.key}>
                    <li className="ledger-group">
                      <button
                        type="button"
                        className="ledger-group-toggle"
                        aria-expanded={open}
                        onClick={() =>
                          setClosed((s) => {
                            const n = new Set(s);
                            if (n.has(group.key)) n.delete(group.key);
                            else n.add(group.key);
                            return n;
                          })
                        }
                      >
                        <span aria-hidden>{open ? "▾" : "▸"}</span>
                        <span className="ledger-group-label">{group.label}</span>
                        <span className="ledger-count">{group.rows.length}</span>
                      </button>
                      {share != null && groups.length > 1 && (
                        <span
                          className="ledger-share"
                          title={mixedCurrency ? `Filtrelenmiş ${primary} tutarları içindeki pay` : "Filtrelenmiş toplam içindeki pay"}
                        >
                          <span className="bar">
                            <span style={{ width: `${Math.max(1, share * 100)}%` }} />
                          </span>
                          <span className="hint tabular">%{Math.round(share * 100)}</span>
                        </span>
                      )}
                      <span className="ledger-group-total">{(p.groupSummary ?? p.summary)(group.rows)}</span>
                    </li>
                    {open && rows.map(renderRow)}
                    {open && hidden > 0 && rows.length > 0 && (
                      <li className="ledger-hidden hint">… bu grupta {hidden} kayıt daha</li>
                    )}
                  </Fragment>
                );
              })
            : flatRows.map(renderRow)}
        </ul>
      )}

      {win.hidden > 0 && (
        <div className="ledger-more">
          <button type="button" className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
            {Math.min(PAGE, win.hidden)} kayıt daha göster
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLimit(filtered.length)}>
            Tümünü göster ({win.hidden})
          </button>
        </div>
      )}
    </section>
  );
}
