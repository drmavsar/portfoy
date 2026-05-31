// Komite · Gate motoru (saf, DB'siz, testli).
//
// "Risk bir skor değil, bir kapıdır." Bir sembolün manuel risk bayrakları
// (VBTS/SPK/...) + otomatik likidite tabanı → bir çarpan (0..1) üretir.
// Çarpan additive ceza DEĞİL: sert kapı sıfırlar, yumuşak kapı tavan koyar.
// VBTS/ban/spk ayrıca KARANTİNA tetikler → teknik skor geçersiz sayılır.

import {
  GATE_MULTIPLIER,
  LIQ_FLOOR_TRY,
  MANUAL_CAP_BY_SEVERITY,
  QUARANTINE_KINDS,
} from "./constants";
import type { ActiveFlag, GateReason, GateResult } from "./types";

function clampSeverity(s: number): number {
  if (!Number.isFinite(s)) return 3;
  return Math.max(1, Math.min(3, Math.round(s)));
}

/** Milyon TRY okunur format ("14M₺", "1.2M₺") — gate sebep etiketleri için. */
function fmtMtl(v: number): string {
  const m = v / 1_000_000;
  return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M₺`;
}

export interface GateInput {
  flags: ActiveFlag[]; // bu sembolün aktif manuel bayrakları
  adtv: number | null; // ortalama günlük işlem hacmi (TRY); null → likidite bilinmiyor
}

/**
 * Bir sembol için gate hesaplar. Birden çok bayrakta EN SIKI (min) çarpan
 * kazanır. Reasons[] insan-okur sebep listesidir.
 */
export function computeGate(input: GateInput): GateResult {
  const reasons: GateReason[] = [];
  let multiplier = 1;
  let quarantine = false;

  // Otomatik likidite kapısı
  if (input.adtv != null && input.adtv < LIQ_FLOOR_TRY) {
    multiplier = Math.min(multiplier, GATE_MULTIPLIER.liq);
    reasons.push({
      kind: "liq",
      severity: 3,
      label: `ADTV ${fmtMtl(input.adtv)} < ${fmtMtl(LIQ_FLOOR_TRY)} tabanı`,
    });
  }

  for (const f of input.flags) {
    const sev = clampSeverity(f.severity);
    let m = 1;
    let label = "";
    switch (f.kind) {
      case "vbts":
        m = GATE_MULTIPLIER.vbts;
        label = "VBTS tedbiri aktif";
        break;
      case "ban":
        m = GATE_MULTIPLIER.ban;
        label = "Açığa satış / kredili işlem yasağı";
        break;
      case "spk":
        m = Math.max(0.1, 0.3 - 0.1 * (sev - 1)); // sev1=0.3, sev2=0.2, sev3=0.1
        label = "SPK inceleme / ceza";
        break;
      case "fin":
        m = GATE_MULTIPLIER.fin; // cap
        label = "Finansal bozulma";
        break;
      case "vol":
        m = GATE_MULTIPLIER.vol; // cap
        label = "Aşırı volatilite";
        break;
      case "manual":
        m = MANUAL_CAP_BY_SEVERITY[sev - 1];
        label = f.note?.trim() ? `Manuel: ${f.note.trim()}` : "Manuel risk işareti";
        break;
    }
    multiplier = Math.min(multiplier, m);
    if (QUARANTINE_KINDS.has(f.kind)) quarantine = true;
    reasons.push({ kind: f.kind, severity: sev, label });
  }

  multiplier = Math.max(0, Math.min(1, multiplier));
  const tier: GateResult["tier"] =
    multiplier === 0 ? "hard" : multiplier < 1 ? "soft" : "ok";

  return { multiplier, quarantine, tier, reasons };
}

/** Boş gate (bayrak yok, likidite bilinmiyor) — non-equity / skorlanmayan için. */
export const OPEN_GATE: GateResult = {
  multiplier: 1,
  quarantine: false,
  tier: "ok",
  reasons: [],
};
