"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";

import type {
  BeneficiaryRow,
  CategoryRow,
  ClassificationRuleRow,
} from "./actions";
import { KategorilerTab } from "./kategoriler-tab";
import { HesaplarSettingsTab } from "./hesaplar-tab";
import { KisilerTab } from "./kisiler-tab";
import { KurallarTab } from "./kurallar-tab";

function IntegrationsTab() {
  const items = [
    {
      name: "borsapy",
      sub: "OHLCV + RS + MA · BIST tüm",
      status: "dev" as const,
      note: "MCP üzerinden erişiliyor; UI'a bağlanmadı.",
      ext: "github.com/saidsurucu/borsapy",
    },
    {
      name: "KAP API",
      sub: "Bilanço + duyuru + insider",
      status: "dev" as const,
      note: "MCP üzerinden erişiliyor; UI'a bağlanmadı.",
    },
    {
      name: "TCMB",
      sub: "Döviz kurları + TÜFE",
      status: "dev" as const,
      note: "Henüz bağlı değil.",
    },
    {
      name: "Anthropic",
      sub: "KAP özet + polarite",
      status: "dev" as const,
      note: "Sunucu tarafı çağrı yok.",
    },
  ];
  const statusChip = (s: "ok" | "warn" | "dev") => {
    if (s === "ok") return <span className="chip chip-sm chip-pos">● Çalışıyor</span>;
    if (s === "warn") return <span className="chip chip-sm chip-warn">● Hata</span>;
    return <span className="chip chip-sm">● Geliştirilmedi</span>;
  };
  return (
    <div>
      <div
        style={{
          padding: 12,
          marginBottom: 12,
          background: "var(--surface-2)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        Entegrasyonlar henüz UI'a bağlanmadı. Veri çekme akışı (borsapy / KAP / TCMB / Anthropic) ilerleyen sprint'lerde
        sunucu tarafına alınacak.
      </div>
      <div className="grid-base grid-2" style={{ gap: 16 }}>
        {items.map((it) => (
          <div key={it.name} className="card">
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-soft)",
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{it.name}</div>
                <div className="hint" style={{ marginTop: 2 }}>{it.sub}</div>
              </div>
              <span className="spacer" />
              {statusChip(it.status)}
            </div>
            <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--muted)" }}>
              {it.note}
            </div>
            {it.ext && (
              <div style={{ padding: "0 16px 12px", fontSize: 11, color: "var(--muted)" }}>
                <Icon name="ext" size={10} /> {it.ext}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AyarlarClientProps {
  initialBeneficiaries: BeneficiaryRow[];
  initialCategories: CategoryRow[];
  initialRules: ClassificationRuleRow[];
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiariesLite: BeneficiaryLite[];
  supabaseConfigured: boolean;
}

export function AyarlarClient({
  initialBeneficiaries,
  initialCategories,
  initialRules,
  accounts,
  custodies,
  beneficiariesLite,
  supabaseConfigured,
}: AyarlarClientProps) {
  const [tab, setTab] = useState<"kisiler" | "kategoriler" | "hesaplar" | "kurallar" | "entegrasyon">("kisiler");

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Ayarlar</div>
          <div className="page-sub">Sistemi kendi dilime öğret. Tek tıklık ekleme — modal yok, sadece input + Ekle.</div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {(
          [
            ["kisiler", "Kişiler"],
            ["kategoriler", "Kategoriler"],
            ["hesaplar", "Hesaplar"],
            ["kurallar", "Kurallar"],
            ["entegrasyon", "Entegrasyonlar"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "kisiler" && (
        <KisilerTab initialRows={initialBeneficiaries} configured={supabaseConfigured} />
      )}
      {tab === "kategoriler" && (
        <KategorilerTab initialRows={initialCategories} configured={supabaseConfigured} />
      )}
      {tab === "hesaplar" && (
        <HesaplarSettingsTab
          accounts={accounts}
          custodies={custodies}
          beneficiaries={beneficiariesLite}
          configured={supabaseConfigured}
        />
      )}
      {tab === "kurallar" && (
        <KurallarTab
          initialRules={initialRules}
          categories={initialCategories}
          beneficiaries={beneficiariesLite}
          configured={supabaseConfigured}
        />
      )}
      {tab === "entegrasyon" && <IntegrationsTab />}
    </div>
  );
}
