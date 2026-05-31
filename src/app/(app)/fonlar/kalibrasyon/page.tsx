import Link from "next/link";

import { listFunds, listFundCategories } from "@/app/(app)/_lib/tefas/funds-actions";
import { getDefaultPersona } from "@/app/(app)/_lib/tefas/persona-actions";
import { listLatestFundScores } from "@/app/(app)/_lib/tefas/scoring-actions";
import type { SimulationInputFund } from "@/app/(app)/_lib/tefas/calibration-sim";

import { KalibrasyonClient } from "./_components/kalibrasyon-client";

export const dynamic = "force-dynamic";

export default async function KalibrasyonPage() {
  const [persona, funds, categories] = await Promise.all([
    getDefaultPersona(),
    listFunds(),
    listFundCategories(),
  ]);

  if (!persona) {
    return (
      <div>
        <div className="page-head">
          <div>
            <Link href="/fonlar" style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
              ← TEFAS Fonları
            </Link>
            <div className="page-title">Skor Kalibrasyonu</div>
          </div>
        </div>
        <div className="card" style={{ padding: 16, color: "var(--muted)" }}>
          Persona bulunamadı. Migration 0033 yeniden uygulanmalı.
        </div>
      </div>
    );
  }

  const scores = await listLatestFundScores(persona.id);
  const scoreByCode = new Map(scores.map((s) => [s.fund_code, s]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Sim için gerekli bileşen verisini hazırla. Skor olmayan fonları dışlama —
  // ağırlık override sonucu computeMehmetScore zaten null döner; UI null'ları
  // sonda sıralar.
  const simInputs: SimulationInputFund[] = funds
    .filter((f) => f.is_active)
    .map((f) => {
      const s = scoreByCode.get(f.code);
      return {
        fund_code: f.code,
        name: f.name,
        category_id: f.category_id,
        components: {
          inflation_protection_score: s?.inflation_protection_score ?? null,
          tax_advantage_score: s?.tax_advantage_score ?? null,
          normalized_risk_score: s?.normalized_risk_score ?? null,
          long_term_performance_score: s?.long_term_performance_score ?? null,
          diversification_score: s?.diversification_score ?? null,
        },
      };
    });

  const categoryNameByCode: Record<string, string> = {};
  for (const f of funds) {
    const cat = f.category_id != null ? categoryById.get(f.category_id) : null;
    if (cat) categoryNameByCode[f.code] = cat.name_tr;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/fonlar" style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}>
            ← TEFAS Fonları
          </Link>
          <div className="page-title">Skor Kalibrasyonu</div>
          <div className="page-sub">
            Persona ağırlıklarını değiştirerek Mehmet Score sıralamasını simüle et ·{" "}
            <strong>{persona.name}</strong> baseline
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: "10px 14px",
          background: "#e0b34122",
          border: "1px solid #e0b34155",
          marginBottom: 16,
          fontSize: 12,
          color: "#b8901c",
        }}
      >
        ⚠ Bu sayfa <strong>client-side simülasyon</strong>dur. Yapılan değişiklikler
        kaydedilmez, gerçek Mehmet Score&apos;lar değişmez. Persona override
        ileride (Sprint-7) eklenecek.
      </div>

      <KalibrasyonClient
        funds={simInputs}
        categoryNameByCode={categoryNameByCode}
        baselinePersona={{
          inflation_weight: persona.inflation_weight,
          tax_weight: persona.tax_weight,
          risk_weight: persona.risk_weight,
          long_term_weight: persona.long_term_weight,
          diversification_weight: persona.diversification_weight,
        }}
      />
    </div>
  );
}
