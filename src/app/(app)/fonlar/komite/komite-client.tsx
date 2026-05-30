"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type {
  Fund,
  FundCategory,
  FundReturns,
  FundScores,
  FundTaxConfidence,
  TaxConfidenceFilter,
  UserPersona,
} from "@/app/(app)/_lib/tefas/types";

type SortKey = "mehmet" | "net_1y" | "vol" | "gross_1y";

interface Props {
  funds: Fund[];
  categories: FundCategory[];
  scores: FundScores[];
  returns: FundReturns[];
  persona: UserPersona;
}

const CONFIDENCE_LEVELS: Record<FundTaxConfidence, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

const ROWS_PER_CATEGORY_DEFAULT = 10;

export function KomiteClient({ funds, categories, scores, returns, persona }: Props) {
  const codeToFund = useMemo(() => new Map(funds.map((f) => [f.code, f])), [funds]);
  const codeToReturn = useMemo(() => new Map(returns.map((r) => [r.fund_code, r])), [returns]);

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(
    new Set(categories.map((c) => c.id)),
  );
  const [minScore, setMinScore] = useState<number>(0);
  const [minConfidence, setMinConfidence] = useState<TaxConfidenceFilter>(
    (persona.min_tax_confidence ?? "MEDIUM") as TaxConfidenceFilter,
  );
  const [sortKey, setSortKey] = useState<SortKey>("mehmet");
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Her fon için (Fund + FundScores + FundReturns) bağlı row
  interface Row {
    fund: Fund;
    score: FundScores;
    ret: FundReturns | null;
  }
  const allRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const s of scores) {
      const fund = codeToFund.get(s.fund_code);
      if (!fund) continue;
      out.push({ fund, score: s, ret: codeToReturn.get(s.fund_code) ?? null });
    }
    return out;
  }, [scores, codeToFund, codeToReturn]);

  const filteredRows = useMemo(() => {
    const minLevel = CONFIDENCE_LEVELS[minConfidence];
    return allRows.filter((r) => {
      if (!selectedCategoryIds.has(r.fund.category_id)) return false;
      if ((r.score.mehmet_score ?? -1) < minScore) return false;
      const conf = (r.fund.tax_confidence as FundTaxConfidence) ?? "NONE";
      if (CONFIDENCE_LEVELS[conf] < minLevel) return false;
      return true;
    });
  }, [allRows, selectedCategoryIds, minScore, minConfidence]);

  const sortRows = (rows: Row[]): Row[] => {
    const compare = (a: Row, b: Row): number => {
      if (sortKey === "mehmet") return (b.score.mehmet_score ?? -1) - (a.score.mehmet_score ?? -1);
      if (sortKey === "net_1y") return (b.ret?.net_1y ?? -Infinity) - (a.ret?.net_1y ?? -Infinity);
      if (sortKey === "gross_1y")
        return (b.ret?.gross_1y ?? -Infinity) - (a.ret?.gross_1y ?? -Infinity);
      // vol: düşük → yüksek (düşük risk üstte)
      const va = a.score.volatility_1y ?? Infinity;
      const vb = b.score.volatility_1y ?? Infinity;
      return va - vb;
    };
    return [...rows].sort(compare);
  };

  // Kategori bazında grupla
  const byCategoryId = new Map<number, Row[]>();
  for (const r of filteredRows) {
    const list = byCategoryId.get(r.fund.category_id) ?? [];
    list.push(r);
    byCategoryId.set(r.fund.category_id, list);
  }

  const visibleCategories = categories
    .filter((c) => selectedCategoryIds.has(c.id) && byCategoryId.has(c.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <FilterBar
        categories={categories}
        selectedCategoryIds={selectedCategoryIds}
        onToggleCategory={toggleCategory}
        onSelectAllCategories={() =>
          setSelectedCategoryIds(new Set(categories.map((c) => c.id)))
        }
        onClearCategories={() => setSelectedCategoryIds(new Set())}
        minScore={minScore}
        onMinScoreChange={setMinScore}
        minConfidence={minConfidence}
        onMinConfidenceChange={setMinConfidence}
        sortKey={sortKey}
        onSortChange={setSortKey}
        filteredCount={filteredRows.length}
        totalCount={allRows.length}
      />

      {visibleCategories.length === 0 && (
        <div className="empty">
          <div>Hiç fon filtreye uymuyor.</div>
          <div className="hint">
            Filtreleri gevşetin (örn. min Mehmet Score düşürün).
          </div>
        </div>
      )}

      {visibleCategories.map((cat) => {
        const rows = sortRows(byCategoryId.get(cat.id) ?? []);
        const expanded = expandedCategories.has(cat.id);
        const visibleRows = expanded ? rows : rows.slice(0, ROWS_PER_CATEGORY_DEFAULT);
        const hasMore = rows.length > ROWS_PER_CATEGORY_DEFAULT;
        return (
          <CategoryTable
            key={cat.id}
            cat={cat}
            rows={visibleRows}
            totalRows={rows.length}
            hasMore={hasMore}
            expanded={expanded}
            onToggleExpanded={() => {
              setExpandedCategories((prev) => {
                const next = new Set(prev);
                if (next.has(cat.id)) next.delete(cat.id);
                else next.add(cat.id);
                return next;
              });
            }}
          />
        );
      })}
    </div>
  );
}

// ---------- FilterBar -----------------------------------------------

interface FilterBarProps {
  categories: FundCategory[];
  selectedCategoryIds: Set<number>;
  onToggleCategory: (id: number) => void;
  onSelectAllCategories: () => void;
  onClearCategories: () => void;
  minScore: number;
  onMinScoreChange: (v: number) => void;
  minConfidence: TaxConfidenceFilter;
  onMinConfidenceChange: (v: TaxConfidenceFilter) => void;
  sortKey: SortKey;
  onSortChange: (v: SortKey) => void;
  filteredCount: number;
  totalCount: number;
}

function FilterBar(props: FilterBarProps) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 14,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
            Min Mehmet Score: <strong style={{ color: "var(--fg)" }}>{props.minScore}</strong>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={props.minScore}
            onChange={(e) => props.onMinScoreChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
            Min Stopaj Güveni
          </div>
          <select
            value={props.minConfidence}
            onChange={(e) => props.onMinConfidenceChange(e.target.value as TaxConfidenceFilter)}
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 6,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontSize: 13,
            }}
          >
            <option value="NONE">Hepsi (NONE+)</option>
            <option value="LOW">Düşük+ (LOW)</option>
            <option value="MEDIUM">Orta+ (MEDIUM)</option>
            <option value="HIGH">Yüksek (HIGH)</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
            Sıralama
          </div>
          <select
            value={props.sortKey}
            onChange={(e) => props.onSortChange(e.target.value as SortKey)}
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 6,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontSize: 13,
            }}
          >
            <option value="mehmet">Mehmet Score (DESC)</option>
            <option value="net_1y">Net 1Y (DESC)</option>
            <option value="gross_1y">Brüt 1Y (DESC)</option>
            <option value="vol">Volatilite (ASC)</option>
          </select>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Kategoriler ({props.selectedCategoryIds.size}/{props.categories.length})
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={props.onSelectAllCategories}
              style={{ fontSize: 11, padding: "3px 8px", background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
            >
              Hepsi
            </button>
            <button
              onClick={props.onClearCategories}
              style={{ fontSize: 11, padding: "3px 8px", background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
            >
              Temizle
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {props.categories
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => {
              const active = props.selectedCategoryIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => props.onToggleCategory(c.id)}
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? c.color ?? "var(--accent)" : "var(--border)"}`,
                    background: active ? `${c.color ?? "#999"}22` : "transparent",
                    color: active ? c.color ?? "var(--fg)" : "var(--muted)",
                    cursor: "pointer",
                  }}
                >
                  {c.name_tr}
                </button>
              );
            })}
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted)" }}>
        {props.filteredCount} / {props.totalCount} fon filtreden geçti
      </div>
    </div>
  );
}

// ---------- CategoryTable -------------------------------------------

function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(digits)}%`;
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--muted)";
  if (score >= 70) return "#4cc9b0";
  if (score >= 55) return "#e0b341";
  return "#e26a8f";
}

function taxBadge(score: number | null): { label: string; color: string } {
  if (score == null) return { label: "?", color: "var(--muted)" };
  if (score >= 100) return { label: "HSYF %0", color: "#c44569" };
  if (score >= 50) return { label: "Döviz/Serb.", color: "#6ea8fe" };
  if (score >= 25) return { label: "%17.5", color: "var(--muted)" };
  return { label: "Belirsiz", color: "#e0b341" };
}

interface CategoryTableProps {
  cat: FundCategory;
  rows: Array<{ fund: Fund; score: FundScores; ret: FundReturns | null }>;
  totalRows: number;
  hasMore: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}

function CategoryTable({ cat, rows, totalRows, hasMore, expanded, onToggleExpanded }: CategoryTableProps) {
  return (
    <div className="card">
      <div
        className="card-head"
        style={{ borderLeft: `3px solid ${cat.color ?? "var(--border)"}` }}
      >
        <div className="card-title">{cat.name_tr}</div>
        <div className="card-sub">
          {expanded ? `${rows.length} / ${totalRows}` : `top ${rows.length} / ${totalRows}`}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "40px 70px 1fr 70px 80px 90px 60px",
          gap: 10,
          padding: "8px 14px",
          borderBottom: "1px solid var(--border-soft)",
          fontSize: 10,
          color: "var(--muted)",
          textTransform: "uppercase",
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        <span>#</span>
        <span>Fon</span>
        <span>Adı</span>
        <span style={{ textAlign: "right" }}>Net 1Y</span>
        <span style={{ textAlign: "right" }}>Vol 1Y</span>
        <span style={{ textAlign: "center" }}>Stopaj</span>
        <span style={{ textAlign: "right" }}>Mehmet</span>
      </div>

      {rows.map((r, idx) => {
        const tax = taxBadge(r.score.tax_advantage_score);
        return (
          <Link
            key={r.fund.code}
            href={`/fonlar/${encodeURIComponent(r.fund.code)}`}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 70px 1fr 70px 80px 90px 60px",
              gap: 10,
              alignItems: "center",
              padding: "9px 14px",
              borderBottom: idx < rows.length - 1 ? "1px solid var(--border-soft)" : "none",
              color: "inherit",
              textDecoration: "none",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--muted)", fontSize: 11 }}>#{idx + 1}</span>
            <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {r.fund.code}
            </code>
            <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.fund.name}
            </span>
            <span
              style={{
                textAlign: "right",
                color:
                  r.ret?.net_1y == null ? "var(--muted)" :
                  r.ret.net_1y >= 0 ? "#4cc9b0" : "#e26a8f",
                fontFamily: "var(--font-mono)",
              }}
            >
              {pct(r.ret?.net_1y, 1)}
            </span>
            <span style={{ textAlign: "right", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              {pct(r.score.volatility_1y, 1)}
            </span>
            <span style={{ textAlign: "center" }}>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: `${tax.color}22`,
                  color: tax.color,
                  whiteSpace: "nowrap",
                }}
              >
                {tax.label}
              </span>
            </span>
            <strong
              style={{
                fontSize: 16,
                color: scoreColor(r.score.mehmet_score),
                textAlign: "right",
              }}
            >
              {r.score.mehmet_score ?? "—"}
            </strong>
          </Link>
        );
      })}

      {hasMore && (
        <button
          onClick={onToggleExpanded}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "transparent",
            color: "var(--muted)",
            border: "none",
            borderTop: "1px solid var(--border-soft)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {expanded
            ? `▲ İlk 10'a daral`
            : `▼ Tümünü göster (${totalRows - rows.length} daha)`}
        </button>
      )}
    </div>
  );
}
