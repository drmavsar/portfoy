"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type {
  Fund,
  FundCategory,
  FundReturns,
  FundScores,
} from "@/app/(app)/_lib/tefas/types";

import { SummaryTable } from "./_components/summary-table";
import { NavCompareChart } from "./_components/nav-compare-chart";
import { ComponentRadarChart } from "./_components/component-radar-chart";
import { CompactKomiteNotu } from "./_components/compact-komite-notu";

const SERIES_COLORS = ["#4cc9b0", "#e26a8f", "#6ea8fe", "#e0b341", "#b388f2"];

interface Props {
  allFunds: Fund[];
  categories: FundCategory[];
  selectedFunds: Fund[];
  returns: FundReturns[];
  scores: FundScores[];
  navByCode: Record<string, Array<{ as_of: string; nav: number }>>;
  komiteByCode: Record<string, string>;
  maxFunds: number;
}

export function KarsilastirClient({
  allFunds,
  categories,
  selectedFunds,
  returns,
  scores,
  navByCode,
  komiteByCode,
  maxFunds,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const updateCodes = (codes: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (codes.length === 0) params.delete("codes");
    else params.set("codes", codes.join(","));
    router.push(`/fonlar/karsilastir?${params.toString()}`);
  };

  const addFund = (code: string) => {
    if (selectedFunds.length >= maxFunds) return;
    if (selectedFunds.some((f) => f.code === code)) return;
    updateCodes([...selectedFunds.map((f) => f.code), code]);
    setSearch("");
  };

  const removeFund = (code: string) => {
    updateCodes(selectedFunds.filter((f) => f.code !== code).map((f) => f.code));
  };

  const selectedCodes = useMemo(() => new Set(selectedFunds.map((f) => f.code)), [selectedFunds]);
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toUpperCase();
    return allFunds
      .filter(
        (f) =>
          !selectedCodes.has(f.code) &&
          (f.code.includes(q) || f.name.toUpperCase().includes(q)),
      )
      .slice(0, 8);
  }, [search, allFunds, selectedCodes]);

  // Series → fon adı renk eşlemesi
  const colorByCode = useMemo(() => {
    const m = new Map<string, string>();
    selectedFunds.forEach((f, idx) => m.set(f.code, SERIES_COLORS[idx % SERIES_COLORS.length]));
    return m;
  }, [selectedFunds]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Fon seçici */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Karşılaştırılan Fonlar ({selectedFunds.length}/{maxFunds})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {selectedFunds.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Aşağıdan fon ekleyin (en fazla {maxFunds}).
            </span>
          )}
          {selectedFunds.map((f) => {
            const color = colorByCode.get(f.code) ?? "var(--accent)";
            return (
              <span
                key={f.code}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: `${color}22`,
                  border: `1px solid ${color}55`,
                  color,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
                {f.code}
                <button
                  onClick={() => removeFund(f.code)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  aria-label={`${f.code} kaldır`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>

        {selectedFunds.length < maxFunds && (
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Fon kodu veya ad ara… (en az 1 karakter)"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontSize: 13,
              }}
            />
            {searchResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: "var(--bg-elev)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  maxHeight: 240,
                  overflowY: "auto",
                  zIndex: 10,
                }}
              >
                {searchResults.map((f) => (
                  <button
                    key={f.code}
                    onClick={() => addFund(f.code)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "70px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      width: "100%",
                      padding: "8px 12px",
                      background: "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border-soft)",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 12,
                      color: "var(--fg)",
                    }}
                  >
                    <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                      {f.code}
                    </code>
                    <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>+ ekle</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedFunds.length === 0 ? (
        <div className="empty">
          <div>Henüz fon seçilmedi.</div>
          <div className="hint">
            Karşılaştırma için en az 2 fon ekleyin. URL paylaşılabilir
            (<code>?codes=HFI,KMF,KPI</code>).
          </div>
        </div>
      ) : (
        <>
          <SummaryTable
            funds={selectedFunds}
            returns={returns}
            scores={scores}
            categories={catById}
            colorByCode={colorByCode}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
              gap: 16,
            }}
          >
            <NavCompareChart
              funds={selectedFunds}
              navByCode={navByCode}
              colorByCode={colorByCode}
            />
            <ComponentRadarChart
              funds={selectedFunds}
              scores={scores}
              colorByCode={colorByCode}
            />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {selectedFunds.map((f) => (
              <CompactKomiteNotu
                key={f.code}
                fund={f}
                note={komiteByCode[f.code]}
                color={colorByCode.get(f.code) ?? "var(--accent)"}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
