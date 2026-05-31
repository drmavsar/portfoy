// Sprint-6 PR-F — Allocation UI pure helpers.
//
// Server + client component'lar paylaşır; saf string/URL üreticileri.
// Test edilebilirlik için UI'ya bağlı değil.

import type { AllocationAction, AllocationFlag } from "./allocation-types";

// ──────────────────────────────────────────────────────────────────────────
// Action chip mapping
// ──────────────────────────────────────────────────────────────────────────

export interface ActionChipConfig {
  label: string;
  className: string; // .chip variant
  textColor: string;
}

/** AllocationAction → UI chip ipuçları. */
export function actionChipConfig(action: AllocationAction): ActionChipConfig {
  switch (action) {
    case "EKLEME":
      return { label: "EKLEME", className: "chip chip-acc", textColor: "var(--accent)" };
    case "AZALTMA":
      return { label: "AZALTMA", className: "chip chip-warn", textColor: "var(--warning)" };
    case "TUT":
      return { label: "TUT", className: "chip chip-pos", textColor: "var(--positive)" };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Flag severity styling
// ──────────────────────────────────────────────────────────────────────────

export interface FlagStyle {
  bg: string; // CSS var
  fg: string;
  icon: string;
}

export function flagSeverityStyle(level: AllocationFlag["level"]): FlagStyle {
  switch (level) {
    case "critical":
      return { bg: "var(--negative-soft)", fg: "var(--negative)", icon: "⚠" };
    case "warn":
      return { bg: "var(--warning-soft)", fg: "var(--warning)", icon: "⚠" };
    case "info":
      return { bg: "var(--surface-2)", fg: "var(--muted)", icon: "ℹ" };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Trade prefill URL builder
// ──────────────────────────────────────────────────────────────────────────

export interface TradePrefillParams {
  fundCode: string;
  side: "buy" | "sell";
  quantity?: number;
  price?: number;
}

/**
 * Allocation diff'ten trade formuna prefill link üretir.
 * Sadece query string oluşturur — uygulama emir göndermez, kullanıcı
 * trade formunda görüp kendi onayıyla kayıt yaratır.
 */
export function buildTradePrefillHref(params: TradePrefillParams): string {
  const code = params.fundCode.trim().toUpperCase();
  if (!code) return "/fonlar";
  const sp = new URLSearchParams();
  sp.set("side", params.side);
  if (params.quantity != null && Number.isFinite(params.quantity) && params.quantity > 0) {
    sp.set("qty", roundForUrl(params.quantity, 6));
  }
  if (params.price != null && Number.isFinite(params.price) && params.price > 0) {
    sp.set("price", roundForUrl(params.price, 6));
  }
  const qs = sp.toString();
  return qs ? `/fonlar/${code}/trade?${qs}` : `/fonlar/${code}/trade`;
}

function roundForUrl(n: number, decimals: number): string {
  const f = Math.pow(10, decimals);
  return String(Math.round(n * f) / f);
}

// ──────────────────────────────────────────────────────────────────────────
// Delta → suggested qty (allocation diff'ten önerilen adet)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Allocation diff.delta_try'den önerilen adet üretir.
 * |delta_try| / unit_price; null değerler ve 0 safe.
 */
export function suggestQuantityFromDelta(
  deltaTryAbs: number,
  unitPrice: number | null,
): number | null {
  if (!Number.isFinite(deltaTryAbs) || deltaTryAbs <= 0) return null;
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return deltaTryAbs / unitPrice;
}
