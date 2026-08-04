"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";
import type {
  Fund,
  FundCategory,
  FundTaxRule,
  TefasFundHealth,
  TefasIngestLog,
  TrackedFund,
} from "@/app/(app)/_lib/tefas/types";

import type {
  BeneficiaryRow,
  CategoryRow,
  ClassificationRuleRow,
} from "./actions";
import { AktiviteTab } from "./aktivite-tab";
import { ErisilebilirlikTab } from "./erisilebilirlik-tab";
import { KategorilerTab } from "./kategoriler-tab";
import { HesaplarSettingsTab } from "./hesaplar-tab";
import { KisilerTab } from "./kisiler-tab";
import { KurallarTab } from "./kurallar-tab";
import { TefasTab } from "./tefas-tab";

interface IntegrationItem {
  name: string;
  sub: string;
  status: "ok" | "warn" | "dev";
  scope: string;
  cache: string;
  endpoint?: string;
  notes?: string;
}

function IntegrationsTab() {
  const items: IntegrationItem[] = [
    {
      name: "TradingView",
      sub: "BIST hisse fiyatları (birincil)",
      status: "ok",
      scope:
        "BIST tüm hisseler (BIST: prefix) · günlük % + haftalık/aylık performans · XU100 endeksi",
      cache: "5 dk",
      endpoint: "https://scanner.tradingview.com/turkey/scan",
      notes: "~15 dk gecikmeli. Tek istekte tüm semboller. previous_close = close − change_abs.",
    },
    {
      name: "canlidoviz",
      sub: "Döviz + Türk altın türleri + gümüş (birincil)",
      status: "ok",
      scope:
        "USD, EUR, GBP, CHF · Gram altın · Çeyrek/Yarım/Tam/Cumhuriyet/Ata · Ons altın · Gümüş",
      cache: "30 dk",
      endpoint: "https://a.canlidoviz.com/items/history?period=DAILY",
      notes:
        "Güvenilir günlük kapanış serisi. Son kapanış = kur, son 2 kapanışın farkı = günlük %. Altın/döviz taban kaynağı.",
    },
    {
      name: "borsapy (Python)",
      sub: "Fiyat geçmişi + sektör endeksi + temel analiz + ekonomik takvim",
      status: "ok",
      scope:
        "Hisse/endeks 1y OHLC (tarama + ana endeksler) · sektör endeksleri · bilanço/rasyo temel veriler · doviz.com ekonomik takvim",
      cache: "10-30 dk",
      endpoint: "Vercel Python serverless (/api/bist-history, /api/bist-sectors, /api/bist-fundamentals, /api/economic-calendar)",
      notes: "TradingView arkalı borsapy kütüphanesi (requirements.txt bağımlılığı).",
    },
    {
      name: "Truncgil v4",
      sub: "Döviz/altın intraday override + yedek",
      status: "ok",
      scope:
        "USD, EUR, GBP, CHF (Selling) · Gram altın (GRA) · Çeyrek/Yarım/Tam/Cumhuriyet/Ata · Ons · Gümüş",
      cache: "10 dk",
      endpoint: "https://finans.truncgil.com/v4/today.json",
      notes:
        "canlidoviz tabanı üzerine çalışırsa taze intraday değişim yazar; kararsız olduğunda canlidoviz kalır.",
    },
    {
      name: "Yahoo Finance",
      sub: "BIST acil yedek (canlı fiyat + tarama geçmişi)",
      status: "ok",
      scope:
        "Yalnızca yedek: TradingView bir hisseyi döndürmezse canlı fiyat · borsapy bir sembolün OHLC geçmişini döndürmezse tarama/komite/endeks",
      cache: "5-30 dk",
      endpoint: "https://query1.finance.yahoo.com/v8/finance/chart/",
      notes:
        "Birincil kaynaklar (TradingView + borsapy) sağlıklıyken çağrılmaz; 429/eksik veri durumunda devreye girer.",
    },
    {
      name: "CoinGecko",
      sub: "Kripto TRY karşılığı",
      status: "ok",
      scope: "BTC · ETH · SOL · USDT · BNB",
      cache: "5 dk",
      endpoint: "https://api.coingecko.com/api/v3/simple/price?vs_currencies=try",
      notes: "Public free tier. Rate limit ~30-50/dk.",
    },
    {
      name: "TCMB",
      sub: "Döviz kurları (son çare)",
      status: "ok",
      scope: "USD, EUR, GBP, CHF, JPY, AUD, CAD (ForexSelling)",
      cache: "1 saat",
      endpoint: "https://www.tcmb.gov.tr/kurlar/today.xml",
      notes: "canlidoviz + Truncgil çökerse FX için son çare. XML regex parse + memory fallback.",
    },
    {
      name: "KAP API",
      sub: "Bilanço + duyuru + insider",
      status: "dev",
      scope: "—",
      cache: "—",
      notes: "MCP üzerinden geliştirme tarafında erişiliyor; UI henüz bağlı değil.",
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
        Canlı veri kaynakları. Sayfa yüklenirken bu servislerden anlık fiyat/kur çekilir, Next.js
        fetch cache ile dakikalık önbelleğe alınır. Bir kaynak çökerse zincirdeki yedek devreye
        girer (BIST hisse canlı: TradingView → Yahoo · BIST geçmiş/tarama/endeks: borsapy → Yahoo · döviz/altın: canlidoviz → Truncgil → TCMB · sektör/temel: borsapy).
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
            <div style={{ padding: "10px 16px", fontSize: 12 }}>
              <div style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <span className="hint">Kapsam</span>
                <span className="spacer" />
                <span style={{ textAlign: "right", maxWidth: "70%", color: "var(--fg-soft)" }}>{it.scope}</span>
              </div>
              <div style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <span className="hint">Cache</span>
                <span className="spacer" />
                <span className="mono">{it.cache}</span>
              </div>
              {it.endpoint && (
                <div style={{ padding: "4px 0", fontSize: 11, color: "var(--muted)" }}>
                  <Icon name="ext" size={10} />{" "}
                  <code style={{ fontFamily: "var(--font-mono)" }}>{it.endpoint}</code>
                </div>
              )}
              {it.notes && (
                <div style={{ padding: "6px 0 2px", fontSize: 11, color: "var(--muted)" }}>
                  {it.notes}
                </div>
              )}
            </div>
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
  tefasFunds: Fund[];
  tefasCategories: FundCategory[];
  tefasTracked: TrackedFund[];
  tefasTaxRules: FundTaxRule[];
  tefasIngestLog: TefasIngestLog[];
  tefasFundsHealth: TefasFundHealth[];
}

export function AyarlarClient({
  initialBeneficiaries,
  initialCategories,
  initialRules,
  accounts,
  custodies,
  beneficiariesLite,
  supabaseConfigured,
  tefasFunds,
  tefasCategories,
  tefasTracked,
  tefasTaxRules,
  tefasIngestLog,
  tefasFundsHealth,
}: AyarlarClientProps) {
  const [tab, setTab] = useState<"kisiler" | "kategoriler" | "hesaplar" | "kurallar" | "tefas" | "entegrasyon" | "aktivite" | "erisilebilirlik">("kisiler");

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
            ["tefas", "TEFAS Fonları"],
            ["entegrasyon", "Entegrasyonlar"],
            ["aktivite", "Aktivite Geçmişi"],
            ["erisilebilirlik", "Erişilebilirlik"],
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
      {tab === "tefas" && (
        <TefasTab
          funds={tefasFunds}
          categories={tefasCategories}
          initialTracked={tefasTracked}
          taxRules={tefasTaxRules}
          ingestLog={tefasIngestLog}
          fundsHealth={tefasFundsHealth}
          configured={supabaseConfigured}
        />
      )}
      {tab === "entegrasyon" && <IntegrationsTab />}
      {tab === "aktivite" && <AktiviteTab configured={supabaseConfigured} />}
      {tab === "erisilebilirlik" && <ErisilebilirlikTab />}
    </div>
  );
}
