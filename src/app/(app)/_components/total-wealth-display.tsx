"use client";

import { useState } from "react";

import { fmt } from "@/lib/finance/fmt";

type Currency = "TRY" | "USD" | "EUR";

const SYMBOL: Record<Currency, string> = { TRY: "₺", USD: "$", EUR: "€" };

interface Props {
  /** TL cinsinden toplam servet (anlık) */
  totalTry: number;
  /** TL cinsinden bugünkü değişim */
  dayChangeTry: number;
  /** USD/TRY (1 USD = X TRY) */
  usdRate?: number | null;
  /** EUR/TRY (1 EUR = X TRY) */
  eurRate?: number | null;
}

export function TotalWealthDisplay({ totalTry, dayChangeTry, usdRate, eurRate }: Props) {
  const [ccy, setCcy] = useState<Currency>("TRY");

  const rate = ccy === "TRY" ? 1 : ccy === "USD" ? (usdRate ?? null) : (eurRate ?? null);
  const sym = SYMBOL[ccy];

  const amount = rate && rate > 0 ? totalTry / rate : totalTry;
  const dayChange = rate && rate > 0 ? dayChangeTry / rate : dayChangeTry;
  const pct =
    totalTry > 0 && dayChangeTry !== 0
      ? (dayChangeTry / (totalTry - dayChangeTry || totalTry)) * 100
      : 0;

  const dayColor = dayChange >= 0 ? "var(--positive)" : "var(--negative)";

  return (
    <div style={{ flex: "0 0 auto" }}>
      {/* Currency toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["TRY", "USD", "EUR"] as const).map((c) => {
          const active = c === ccy;
          const disabled = c !== "TRY" && (!rate || rate <= 0)
            ? c === "USD"
              ? !usdRate
              : !eurRate
            : false;
          return (
            <button
              key={c}
              type="button"
              onClick={() => !disabled && setCcy(c)}
              disabled={disabled}
              style={{
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                padding: "3px 10px",
                borderRadius: 4,
                border: "1px solid " + (active ? "var(--accent)" : "var(--border-soft)"),
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--accent-fg)" : disabled ? "var(--muted)" : "var(--fg-soft)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.4 : 1,
              }}
              title={disabled ? `${c} kuru çekilemedi` : `${c} cinsinden göster`}
            >
              {SYMBOL[c]} {c}
            </button>
          );
        })}
      </div>

      {/* Büyük servet rakamı */}
      <div
        className="tabular"
        style={{ fontSize: 36, fontWeight: 700, color: "var(--fg)" }}
      >
        {ccy === "TRY"
          ? fmt.trydp(amount)
          : `${amount.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} ${sym}`}
      </div>

      {/* Bugünkü değişim */}
      <div
        className="tabular"
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginTop: 6,
          color: dayColor,
        }}
      >
        {dayChange >= 0 ? "+" : ""}
        {fmt.tr(dayChange, 0)} {sym}
        {totalTry > 0 && dayChangeTry !== 0 && (
          <>
            {" · "}
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(2)}%
          </>
        )}
      </div>
      <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
        Bugünkü değişim
      </div>
    </div>
  );
}
