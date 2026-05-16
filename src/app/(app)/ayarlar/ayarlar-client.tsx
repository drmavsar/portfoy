"use client";

import { useState } from "react";

import { CatChip, PersonChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { ACCOUNTS, BANKS, CATS, RULES } from "@/lib/sample/data";

import type { BeneficiaryRow } from "./actions";
import { KisilerTab } from "./kisiler-tab";

const inp: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  width: "100%",
};
const sel: React.CSSProperties = { ...inp, padding: "6px 8px" };

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}


function CategoryList({ title, cats }: { title: string; cats: typeof CATS }) {
  const [name, setName] = useState("");
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
        <div className="card-sub">{cats.length}</div>
      </div>
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-soft)",
          display: "flex",
          gap: 8,
        }}
      >
        <input style={{ ...inp, flex: 1 }} placeholder="Yeni kategori" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-prim"><Icon name="plus" size={12} /> Ekle</button>
      </div>
      <div>
        {cats.map((c, i) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
            }}
          >
            <span style={{ fontSize: 16 }}>{c.icon}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
            <span style={{ width: 10, height: 10, borderRadius: 50, background: c.color }} />
            <button className="icon-btn"><Icon name="edit" size={12} /></button>
            <button className="icon-btn"><Icon name="trash" size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function KategorilerTab() {
  const expense = CATS.filter((c) => c.kind === "expense");
  const income = CATS.filter((c) => c.kind === "income");
  return (
    <div className="grid-base grid-2" style={{ gap: 16 }}>
      <CategoryList title="Gider Kategorileri" cats={expense} />
      <CategoryList title="Gelir Kategorileri" cats={income} />
    </div>
  );
}

function HesaplarSettingsTab() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Hesaplar</div>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
          <Icon name="plus" size={12} /> Yeni Hesap
        </button>
      </div>
      <table className="dg">
        <thead>
          <tr>
            <th>Banka</th>
            <th>Hesap</th>
            <th>Tip</th>
            <th>Para</th>
            <th>IBAN</th>
            <th>Sahip</th>
            <th className="num">Bakiye (₺)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ACCOUNTS.map((a) => {
            const b = BANKS.find((x) => x.id === a.bank);
            if (!b) return null;
            return (
              <tr key={a.id}>
                <td>
                  <span className="row gap-8">
                    <span className="bank-logo" style={{ background: b.color, width: 20, height: 20, fontSize: 8 }}>
                      {b.short}
                    </span>
                    {b.name}
                  </span>
                </td>
                <td>{a.name}</td>
                <td><span className="chip chip-sm">{a.subtype.toUpperCase()}</span></td>
                <td className="mono" style={{ fontSize: 11 }}>{a.ccy}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {a.iban !== "—" ? a.iban.slice(0, 9) + "••••" : "—"}
                </td>
                <td><PersonChip id={a.owner} size="sm" /></td>
                <td className="num tabular">{a.balance_try.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>
                  <div className="row gap-8">
                    <button className="icon-btn"><Icon name="edit" size={12} /></button>
                    <button className="icon-btn"><Icon name="trash" size={12} /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KurallarTab({ onNew }: { onNew: () => void }) {
  return (
    <div>
      <div className="row gap-8" style={{ marginBottom: 12 }}>
        <div className="hint">Sürükle-bırak ile öncelik sırasını değiştir. Üstteki kural önce çalışır.</div>
        <span className="spacer" />
        <button className="btn btn-prim" onClick={onNew}>
          <Icon name="plus" size={14} /> Yeni Kural
        </button>
      </div>
      <div className="card">
        <table className="dg">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Öncelik</th>
              <th>Ad</th>
              <th>Eşleştirme</th>
              <th>Aksiyon</th>
              <th className="num">Hit</th>
              <th>Son Tetik</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.id}>
                <td className="center"><span className="mono" style={{ fontWeight: 600 }}>#{r.prio}</span></td>
                <td><div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div></td>
                <td>
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--fg-soft)",
                      background: "var(--surface-2)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {r.match}
                  </code>
                </td>
                <td>
                  <code
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--accent)",
                      background: "var(--accent-soft)",
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    {r.action}
                  </code>
                </td>
                <td className="num tabular">{r.hits}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.last}</td>
                <td>
                  <div className="row gap-8">
                    <button className="icon-btn"><Icon name="edit" size={12} /></button>
                    <button className="icon-btn"><Icon name="trash" size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cond({ field, op, value }: { field: string; op: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 2fr auto", gap: 8, alignItems: "center" }}>
      <select style={sel} defaultValue={field}>
        <option value="merchant">merchant</option>
        <option value="tutar">tutar</option>
        <option value="hesap">hesap</option>
        <option value="description">açıklama</option>
      </select>
      <select style={sel} defaultValue={op}>
        <option>=</option>
        <option>içerir</option>
        <option>regex</option>
        <option>≥</option>
        <option>≤</option>
      </select>
      <input style={inp} defaultValue={value} />
      <button className="icon-btn"><Icon name="trash" size={12} /></button>
    </div>
  );
}

function Act({ field, value }: { field: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr auto", gap: 8, alignItems: "center" }}>
      <select style={sel} defaultValue={field}>
        <option value="kategori">kategori ata</option>
        <option value="kişi">kişi ata</option>
        <option value="transfer">transfer işaretle</option>
        <option value="etiket">etiket ekle</option>
      </select>
      <div style={{ padding: "6px 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
        {value}
      </div>
      <button className="icon-btn"><Icon name="trash" size={12} /></button>
    </div>
  );
}

function RuleBuilder({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="rules" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Yeni Kural</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 18 }}>
          <div>
            <Lbl>Ad</Lbl>
            <input style={inp} placeholder="ör. İYTE bölgesi → Ahmet Burak" defaultValue="Eczane → Anne" />
          </div>

          <div>
            <div className="section-title">Eşleştirme <small>· tümü sağlanmalı</small></div>
            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 12,
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border-soft)",
              }}
            >
              <Cond field="merchant" op="içerir" value="ECZ" />
              <Cond field="tutar" op="≥" value="800,00 ₺" />
              <button className="btn btn-sm" style={{ alignSelf: "flex-start" }}>
                <Icon name="plus" size={12} /> Koşul ekle
              </button>
            </div>
          </div>

          <div>
            <div className="section-title">Aksiyon</div>
            <div
              style={{
                display: "grid",
                gap: 8,
                padding: 12,
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border-soft)",
              }}
            >
              <Act field="kategori" value={<CatChip id="saglik" />} />
              <Act field="kişi" value={<PersonChip id="anne" />} />
              <button className="btn btn-sm" style={{ alignSelf: "flex-start" }}>
                <Icon name="plus" size={12} /> Aksiyon ekle
              </button>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              background: "var(--positive-soft)",
              border: "1px solid color-mix(in oklab, var(--positive) 30%, transparent)",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            <Icon name="check" size={12} /> Bu kural <b>geçmiş 6 işlemi</b> etkileyecek · son 90 günde önizleme.
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" defaultChecked /> Geçmiş işlemlere de uygula (geriye dönük 90 gün)
          </label>
        </div>
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn" onClick={onClose}>İptal</button>
          <button className="btn btn-prim">Kuralı Kaydet</button>
        </div>
      </div>
    </div>
  );
}

function IntegrationsTab() {
  const items = [
    { name: "borsapy", sub: "OHLCV + RS + MA · BIST tüm", status: "ok" as const, meta: [["Son çalışma", "15.05.2026 09:00"], ["Satır", "12.480"], ["Periyot", "5 dk"]], ext: "github.com/saidsurucu/borsapy" },
    { name: "TCMB", sub: "Döviz kurları + TÜFE", status: "ok" as const, meta: [["Son çalışma", "15.05.2026 08:30"], ["Periyot", "Günlük 16:00"]] },
    { name: "KAP API", sub: "Bilanço + duyuru + insider", status: "warn" as const, meta: [["Son çalışma", "15.05.2026 07:10"], ["Hata", "Rate-limit: 60s"]] },
    { name: "isyatirim", sub: "Çeyreklik temel veri scrape", status: "dev" as const, meta: [["Durum", "Bağlı değil"]] },
    { name: "X (Twitter)", sub: "Cashtag akışı", status: "ok" as const, meta: [["Son çekim", "15.05.2026 09:15"], ["Filtre", "doğrulanmış + 1K+"]] },
    { name: "Anthropic", sub: "KAP özet + polarite", status: "ok" as const, meta: [["Model", "claude-haiku-4-5"], ["24s çağrı", "148"]] },
  ];
  const statusChip = (s: "ok" | "warn" | "dev") => {
    if (s === "ok") return <span className="chip chip-sm chip-pos">● Çalışıyor</span>;
    if (s === "warn") return <span className="chip chip-sm chip-warn">● Hata</span>;
    return <span className="chip chip-sm">● Bağlı değil</span>;
  };
  return (
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
          <div style={{ padding: "8px 16px" }}>
            {it.meta.map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border-soft)",
                  fontSize: 12,
                }}
              >
                <span className="hint">{k}</span>
                <span className="spacer" />
                <span className="mono">{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 16px", display: "flex", gap: 8 }}>
            <button className="btn btn-sm"><Icon name="refresh" size={12} /> Senkronize</button>
            <button className="btn btn-sm">Yapılandır</button>
            {it.ext && (
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }}>
                <Icon name="ext" size={12} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AyarlarClientProps {
  initialBeneficiaries: BeneficiaryRow[];
  supabaseConfigured: boolean;
}

export function AyarlarClient({ initialBeneficiaries, supabaseConfigured }: AyarlarClientProps) {
  const [tab, setTab] = useState<"kisiler" | "kategoriler" | "hesaplar" | "kurallar" | "entegrasyon">("kisiler");
  const [ruleOpen, setRuleOpen] = useState(false);

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

      {tab === "kisiler" && <KisilerTab initialRows={initialBeneficiaries} configured={supabaseConfigured} />}
      {tab === "kategoriler" && <KategorilerTab />}
      {tab === "hesaplar" && <HesaplarSettingsTab />}
      {tab === "kurallar" && <KurallarTab onNew={() => setRuleOpen(true)} />}
      {tab === "entegrasyon" && <IntegrationsTab />}

      {ruleOpen && <RuleBuilder onClose={() => setRuleOpen(false)} />}
    </div>
  );
}
