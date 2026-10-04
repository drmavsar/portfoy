"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { Button, Spinner } from "@/components/ui/button";
import { AmountStack, Delta } from "@/components/ui/delta";
import { Banner, EmptyState, LedgerSkeleton } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { PERIOD_OPTIONS, PeriodPicker, Segmented, type PeriodKey } from "@/components/ui/segmented";
import { FilterChip, ImportanceChip, SignalChip, TagChip, ZoneChip } from "@/components/ui/status-chips";
import { UndoToast } from "@/components/ui/undo-toast";
import { ASSET_CLASS, BENCHMARK_SERIES } from "@/lib/design/palette";
import { MINUS } from "@/lib/design/format";

/* ---------- Token verisi (koyu / açık değerleri ve kontrast) ---------- */

const COLOR_TOKENS: Array<{ name: string; purpose: string; dark: string; light: string; isNew?: boolean; soft?: [string, string] }> = [
  { name: "--bg", purpose: "Sayfa zemini", dark: "#0d1417", light: "#f3f5f5" },
  { name: "--bg-elev", purpose: "Kenar menü, üst çubuk", dark: "#10181b", light: "#ffffff" },
  { name: "--surface", purpose: "Kart, panel, liste satırı", dark: "#131c20", light: "#ffffff" },
  { name: "--surface-2", purpose: "İkincil dolgu, segment zemini, seçili satır", dark: "#1a252a", light: "#eef2f2" },
  { name: "--surface-3", purpose: "Üzerine gelme ve basılı hal", dark: "#223036", light: "#e3e9ea" },
  { name: "--border", purpose: "Kart ve form alanı kenarı", dark: "#263338", light: "#d3dcdd" },
  { name: "--border-soft", purpose: "Liste ve tablo içi ayraç", dark: "#1d292d", light: "#e5ebeb" },
  { name: "--fg", purpose: "Birincil metin, ana rakam", dark: "#eaf1f2 · 15,6", light: "#0f1a1d · 17,4" },
  { name: "--fg-soft", purpose: "Gövde metni, ikincil rakam", dark: "#c9d4d6 · 11,4", light: "#2c3b40 · 11,7" },
  { name: "--muted", purpose: "Yardımcı metin, açıklama", dark: "#a3b3b6 · 8,0", light: "#4a5b60 · 7,1" },
  { name: "--muted-2", purpose: "Etiket, eksen yazısı; en sessiz metin, hâlâ AA", dark: "#879a9e · 5,9", light: "#5d6d72 · 5,4" },
  { name: "--accent", purpose: "Tek vurgu: birincil eylem, seçim, bağlantı", dark: "#4fb8b0 · 7,2", light: "#0f6e6a · 6,1" },
  { name: "--accent-strong", purpose: "Birincil düğme üzerine gelme ve basılı (artık griye dönmez)", dark: "#6cc9c2", light: "#0b5956", isNew: true },
  { name: "--accent-soft", purpose: "Seçili segment, aktif menü zemini", dark: "#133432", light: "#dcefed" },
  { name: "--accent-fg", purpose: "Vurgu zemini üstündeki metin", dark: "#062220 · 7,1", light: "#ffffff · 6,1" },
  { name: "--focus-ring", purpose: "Klavye odağı halkası (2 px, 2 px boşluk)", dark: "#8fdcd5", light: "#0f6e6a", isNew: true },
  { name: "--positive / -soft", purpose: "Artış, kâr. Daima ▲ ve + ile", dark: "#3ccb8a · 8,3", light: "#0b7a4b · 5,4", soft: ["#11332a", "#e2f3ea"] },
  { name: "--negative / -soft", purpose: "Azalış, zarar, hata. Daima ▼ ve − ile", dark: "#f2737f · 6,2", light: "#c22b36 · 5,2", soft: ["#3a1c22", "#fbe9ea"] },
  { name: "--warning / -soft", purpose: "Bayat bakiye, eksik veri, dikkat", dark: "#e3b341 · 9,6", light: "#8a5d00 · 5,1", soft: ["#33290f", "#fcf2dd"] },
  { name: "--info / --info-soft", purpose: "Bilgi notu, otomatik öneri", dark: "#6aa8f0 · 7,5", light: "#1d4ed8 · 6,7", soft: ["#142a44", "#e8eefc"], isNew: true },
];

const PALETTE: Array<{ label: string; token: string; dark: string; light: string; isNew?: boolean }> = [
  { label: ASSET_CLASS.equity.label, token: "--c-blue", dark: "#4a90e2", light: "#2a6fc4" },
  { label: ASSET_CLASS.fund.label, token: "--c-violet", dark: "#9b8cf0", light: "#6b55c8" },
  { label: ASSET_CLASS.metal.label, token: "--c-amber", dark: "#e0a83a", light: "#b07800" },
  { label: ASSET_CLASS.cash.label, token: "--c-sky", dark: "#5cc3e6", light: "#1f8ab5", isNew: true },
  { label: ASSET_CLASS.fx.label, token: "--c-lime", dark: "#9ccc4a", light: "#5f8a1c" },
  { label: ASSET_CLASS.crypto.label, token: "--c-rose", dark: "#e87ba4", light: "#c4497a" },
  { label: ASSET_CLASS.other.label, token: "--c-slate", dark: "#8a979b", light: "#6c7a7e", isNew: true },
  { label: "Portföy serisi", token: "--c-teal", dark: "#4fb8b0", light: "#0f6e6a" },
  { label: "Ek seri", token: "--c-orange", dark: "#ef8a55", light: "#c25a1e", isNew: true },
];

/* ---------- Küçük yardımcılar ---------- */

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="ds-section" aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        {lead && <p className="ds-lead">{lead}</p>}
      </header>
      {children}
    </section>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="ds-swatch" style={{ background: color.split(" ")[0] }} />;
}

const PlusIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const ChevDown = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
const CardIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
    <rect x="1.5" y="3" width="11" height="8" rx="1.5" />
    <path d="M1.5 6h12" />
  </svg>
);
const SearchIcon = (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </svg>
);

/* ---------- Sayfa ---------- */

export function Showcase() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [ccy, setCcy] = useState<"TRY" | "USD" | "EUR" | "XAU">("TRY");
  const [side, setSide] = useState<"all" | "buy" | "sell">("buy");
  const [kind, setKind] = useState<"exp" | "inc">("exp");
  const [person, setPerson] = useState("ayse");
  const [filters, setFilters] = useState([
    { label: "Hesap", value: "Yapı Kredi KK" },
    { label: "Kişi", value: "Ayşe" },
  ]);
  const [toast, setToast] = useState(false);

  return (
    <div className="ds-page">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Petrol Masa · tasarım sistemi</div>
          <h1 className="page-title">Mehmet&apos;s Assets tasarım sistemi</h1>
          <p className="page-sub" style={{ maxWidth: 820 }}>
            Token&apos;lar mevcut CSS değişken adlarını kullanır (src/app/globals.css). Tema ve yazı boyutu üst çubuk ve
            Ayarlar &gt; Erişilebilirlik&apos;ten değişir; bu sayfadaki bütün bileşenler seçili temaya göre çizilir.
          </p>
        </div>
      </div>

      {/* ============ RENK ============ */}
      <Section
        id="ds-renk"
        title="Renk token'ları"
        lead="Kontrast değerleri metnin --surface üzerindeki oranıdır. Metin token'larının hepsi iki temada da en az AA; --fg, --fg-soft ve --muted AAA."
      >
        <div className="ds-scroll">
          <div className="ds-token-table">
            {["TOKEN", "AMAÇ", "KOYU", "AÇIK"].map((h) => (
              <div key={h} className="head eyebrow">
                {h}
              </div>
            ))}
            {COLOR_TOKENS.map((t) => (
              <TokenRow key={t.name} t={t} />
            ))}
          </div>
        </div>
      </Section>

      {/* ============ GRAFİK PALETİ ============ */}
      <Section
        id="ds-palet"
        title="Grafik paleti ve varlık sınıfı renkleri"
        lead="Dokuz renk, sabit sıra. Varlık sınıfı rengi uygulamanın her yerinde aynıdır ve başka bir anlam için kullanılmaz (src/lib/design/palette.ts). Grafiklerde renk her zaman doğrudan etiket ya da lejantla birlikte gelir."
      >
        <div className="ds-palette">
          {PALETTE.map((p) => (
            <div key={p.token} className="ds-col" style={{ gap: 8 }}>
              <div className="ds-palette-bar" style={{ background: `var(${p.token})` }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</span>
              <span className="ds-mono" style={{ fontSize: 12, color: "var(--muted-2)" }}>
                {p.token}
                {p.isNew ? " · YENİ" : ""}
              </span>
            </div>
          ))}
        </div>
        <div className="ds-col" style={{ gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-soft)" }}>
            Karşılaştırma serileri (Benchmark, Birikim &amp; Hisse)
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 14, color: "var(--fg-soft)" }}>
            {Object.values(BENCHMARK_SERIES).map((s) => (
              <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="28" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="28" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} />
                </svg>
                {s.label}
              </span>
            ))}
          </div>
          <span className="ds-note">Çizgi deseni rengin yerine geçebilecek ikinci ayırt edicidir.</span>
        </div>
      </Section>

      {/* ============ TİPOGRAFİ ============ */}
      <Section
        id="ds-tipografi"
        title="Tipografi ölçeği"
        lead="Inter, tek aile. Bütün rakam stillerinde tabular-nums. Değerler 1× ölçek içindir; yazı boyutu ayarı (1 · 1,15 · 1,32) bütün kabuğu ölçekler. En küçük stil 12 px."
      >
        <div className="ds-grid" style={{ gap: 32 }}>
          <div className="ds-col" style={{ gap: 0 }}>
            <div className="eyebrow" style={{ paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              METİN
            </div>
            <TypeRow spec="title-1 · 28/34 · 700" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.4 }}>Sayfa başlığı</TypeRow>
            <TypeRow spec="title-2 · 20/28 · 700" style={{ fontSize: 20, fontWeight: 700 }}>Bölüm başlığı</TypeRow>
            <TypeRow spec="title-3 · 16/24 · 600" style={{ fontSize: 16, fontWeight: 600 }}>Kart başlığı</TypeRow>
            <TypeRow spec="body · 14/22 · 400" style={{ fontSize: 14, color: "var(--fg-soft)" }}>Gövde metni: Okul taksiti, Ekim</TypeRow>
            <TypeRow spec="body-strong · 14/22 · 600" style={{ fontSize: 14, fontWeight: 600 }}>MIGROS KADIKOY</TypeRow>
            <TypeRow spec="label · 13/18 · 500" style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-soft)" }}>Alan etiketi, çip</TypeRow>
            <TypeRow spec="overline · 12/16 · 600 · +0,4" className="eyebrow">KART ETİKETİ</TypeRow>
            <TypeRow spec="caption · 12/16 · 400" style={{ fontSize: 12, color: "var(--muted)" }}>Son güncelleme 04.10.2026</TypeRow>
          </div>
          <div className="ds-col" style={{ gap: 0 }}>
            <div className="eyebrow" style={{ paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              RAKAM
            </div>
            <TypeRow spec="num-hero · 36/40 · 700" className="tabular" style={{ fontSize: 36, fontWeight: 700, letterSpacing: -0.6 }}>₺5.214.300</TypeRow>
            <TypeRow spec="num-lg · 28/34 · 700" className="tabular" style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.4 }}>₺70.673</TypeRow>
            <TypeRow spec="num-md · 20/26 · 600" className="tabular" style={{ fontSize: 20, fontWeight: 600 }}>₺22.400,00</TypeRow>
            <TypeRow spec="num-row · 15/20 · 600" className="tabular" style={{ fontSize: 15, fontWeight: 600 }}>{MINUS}₺1.284,60</TypeRow>
            <TypeRow spec="num-secondary · 14/20 · 500" className="tabular" style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-soft)" }}>$106.000 · €90.800 · 805 gr</TypeRow>
            <TypeRow spec="num-delta · 13/18 · 600" className="tabular privacy-safe" style={{ fontSize: 13, fontWeight: 600, color: "var(--positive)" }}>▲ +%0,35</TypeRow>
            <TypeRow spec="num-caption · 12/16 · 500" className="tabular" style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>12.850 · 49,20 · 57,40</TypeRow>
          </div>
        </div>
        <p className="ds-note">
          Para simgesi rakamla aynı boyda ve ağırlıkta yazılır. Ondalık kısım KPI&apos;da gösterilmez (₺5.214.300); listede ve
          tabloda iki hane gösterilir. Biçim yardımcıları: src/lib/design/format.ts.
        </p>
      </Section>

      {/* ============ BOŞLUK / KÖŞE / GÖLGE ============ */}
      <Section id="ds-bosluk" title="Boşluk, köşe, gölge, satır yüksekliği">
        <div className="ds-grid" style={{ gap: 32 }}>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">BOŞLUK · 4 PX TABAN</span>
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "6px 12px", alignItems: "center", fontSize: 13 }}>
              {[4, 8, 12, 16, 20, 24, 32, 40, 48].map((n) => (
                <FragmentRow key={n} n={n} />
              ))}
            </div>
            <span className="ds-note">Kart içi 16, kartlar arası 16 (mobil 12), bölümler arası 32. Satır içi öğeler 8.</span>
          </div>
          <div className="ds-col">
            <span className="eyebrow">KÖŞE</span>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              {[
                ["--radius-sm 8", 56, 56, "var(--radius-sm)"],
                ["--radius-card 12", 56, 56, "var(--radius-card)"],
                ["--radius-pill", 80, 32, "var(--radius-pill)"],
              ].map(([l, w, h, r]) => (
                <div key={l as string} className="ds-col" style={{ gap: 6, alignItems: "center" }}>
                  <span style={{ width: w as number, height: h as number, border: "2px solid var(--accent)", borderRadius: r as string }} />
                  <span className="ds-mono" style={{ fontSize: 12, color: "var(--muted)" }}>{l}</span>
                </div>
              ))}
            </div>
            <span className="ds-note">8: düğme, alan, çip, tarih rozeti. 12: kart, pencere, liste kabı. Pill yalnızca değişim rozeti ve kur şeridinde.</span>
          </div>
          <div className="ds-col">
            <span className="eyebrow">GÖLGE VE SATIR</span>
            <div style={{ display: "flex", gap: 16 }}>
              {["--shadow-card", "--shadow-float"].map((s) => (
                <div
                  key={s}
                  className="ds-mono"
                  style={{ flex: 1, height: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: `var(${s})`, display: "grid", placeItems: "center", fontSize: 12, color: "var(--muted)" }}
                >
                  {s}
                </div>
              ))}
            </div>
            <span className="ds-note">
              Katmanı gölge değil yüzey tonu kurar; --shadow-float yalnızca pencere, çekmece ve ipucunda. --row-h 56 px (defter
              satırı), --row-h-compact 44 px (sayısal tablo).
            </span>
          </div>
        </div>
      </Section>

      {/* ============ YAZI BOYUTU ============ */}
      <Section
        id="ds-yazi-boyutu"
        title="Üç yazı boyutunda KPI kartı"
        lead="Kart genişliği sabit (300 px kolon), içerik ölçekleniyor. İkincil para birimleri ızgarası sığmadığında sütun sayısını azaltıyor; ana rakam kısaltılmış biçime düşüyor, tam değer ipucunda."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          {[
            ["Normal · 1×", 1, "₺5.214.300", undefined],
            ["Büyük · 1,15×", 1.15, "₺5.214.300", undefined],
            ["Çok büyük · 1,32×", 1.32, "₺5,21 Mn", "₺5.214.300,00"],
          ].map(([l, z, v, full]) => (
            <div key={l as string} className="ds-scale-card" style={{ "--z": z } as CSSProperties}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-soft)" }}>{l}</span>
              <KpiCard
                label="Toplam servet"
                value={v as string}
                fullValue={full as string | undefined}
                change={18450}
                changePct={0.35}
                secondary={[
                  { label: "USD", value: "$106.000" },
                  { label: "EUR", value: "€90.800" },
                  { label: "ALTIN", value: "805 gr" },
                ]}
              />
            </div>
          ))}
        </div>
        <p className="ds-note">
          Kural: ana rakam kartın içerik genişliğini aşacaksa kısaltılmış biçime geçilir (₺5,21 Mn, ₺886 B). İkincil para birimi
          ızgarası sığmadığında sütun sayısını azaltır; satır asla kırılmaz.
        </p>
      </Section>

      <div className="eyebrow" style={{ paddingTop: 16 }}>BİLEŞENLER</div>

      {/* ============ DÜĞME ============ */}
      <Section
        id="ds-dugme"
        title="Düğme"
        lead="Tek bir düğme ailesi (Button). Birincil düğme üzerine gelince --accent-strong'a geçer, griye dönmez. Sayfa başına tek birincil düğme. Yükseklik 40 px (masaüstü), mobilde en az 44 px; birincil büyük 48 px."
      >
        <div className="ds-scroll">
          <div className="ds-states">
            <span />
            {["NORMAL", "ÜZERİNE GELME", "KLAVYE ODAĞI", "BASILI", "DEVRE DIŞI", "YÜKLENİYOR"].map((h) => (
              <span key={h} className="eyebrow">
                {h}
              </span>
            ))}
            <StateRow label="Birincil" variant="primary" text="İşlem ekle" icon={PlusIcon} loadingText="Kaydediliyor" />
            <StateRow label="İkincil" variant="secondary" text="Ekstre Yükle" loadingText="Yükleniyor" />
            <StateRow label="Sade" variant="ghost" text="Dışa aktar" loadingText="Hazırlanıyor" />
            <StateRow label="Tehlike" variant="danger" text="Kaydı sil" loadingText="Siliniyor" />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border-soft)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-soft)", width: 110 }}>Boyut ve simge</span>
          <Button size="sm">Küçük · 32</Button>
          <Button>Orta · 40</Button>
          <Button variant="primary" size="lg">
            Büyük · 48 · Kaydet ve kapat
          </Button>
          <button type="button" className="icon-btn" style={{ width: 44, height: 44 }} aria-label="Tutarları gizle" data-tip="Tutarları gizle">
            <Icon name="eye" size={20} />
          </button>
          <span className="ds-note">Simge düğmesinin her zaman bir ipucu ve aria-label&apos;ı olur.</span>
        </div>
      </Section>

      {/* ============ SEGMENT / DÖNEM ============ */}
      <Section
        id="ds-segment"
        title="Segment kontrol ve dönem seçici"
        lead="Bütün uygulamada tek segment stili. Seçili öğe --accent-soft zemin, --accent metin ve 600 ağırlık alır; seçim yalnız renkle değil ağırlıkla da belli. Klavyede ok tuşlarıyla gezilir."
      >
        <div className="ds-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 28 }}>
          <div className="ds-col" style={{ gap: 14 }}>
            <span className="eyebrow">DÖNEM SEÇİCİ · MASAÜSTÜ (CANLI)</span>
            <PeriodPicker value={period} onChange={setPeriod} />
            <span className="eyebrow">SABİT HALLER</span>
            <div className="seg" style={{ alignSelf: "flex-start" }} aria-hidden>
              <span className="seg-item active">Bu Ay</span>
              <span className="seg-item">YTD</span>
              <span className="seg-item is-hover">Son 30</span>
              <span className="seg-item is-focus">Son 90</span>
              <span className="seg-item">Tümü</span>
              <span className="seg-item">Özel{ChevDown}</span>
            </div>
            <span className="ds-note">Sırayla: seçili, üzerine gelme (Son 30), klavye odağı (Son 90).</span>
            <div className="card" style={{ boxShadow: "var(--shadow-float)", padding: 16, maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Özel tarih aralığı</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Başlangıç">
                  <input className="input tabular is-focus" defaultValue="01.07.2026" style={{ minHeight: 40 }} />
                </Field>
                <Field label="Bitiş">
                  <input className="input tabular" defaultValue="04.10.2026" style={{ minHeight: 40 }} />
                </Field>
              </div>
              <div className="choice-row">
                {["Geçen ay", "Bu çeyrek", "Geçen yıl"].map((c) => (
                  <button key={c} type="button" className="btn btn-sm" style={{ fontWeight: 500, color: "var(--fg-soft)" }}>
                    {c}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="ghost" className="btn-md">Vazgeç</Button>
                <Button variant="primary" className="btn-md">Uygula</Button>
              </div>
            </div>
          </div>
          <div className="ds-col" style={{ gap: 14 }}>
            <span className="eyebrow">DÖNEM SEÇİCİ · MOBİL</span>
            <button type="button" className="btn" style={{ justifyContent: "space-between", maxWidth: 360, minHeight: 44, fontWeight: 400, color: "var(--fg-soft)" }}>
              <span>
                Dönem <strong style={{ color: "var(--fg)", fontWeight: 600 }}>Bu Ay · Ekim 2026</strong>
              </span>
              {ChevDown}
            </button>
            <span className="ds-note" style={{ maxWidth: 360 }}>
              Mobilde dönem tek satırlık bir seçiciye iner, filtre alanı ekranın yarısını kaplamaz. Dokununca alt çekmece açılır;
              seçenekler 48 px satırlar.
            </span>
            <div className="ds-sheet">
              <span className="grip" />
              {PERIOD_OPTIONS.map((o) => (
                <div key={o.value} className={o.value === period ? "on" : ""}>
                  {o.value === "last30" ? "Son 30 gün" : o.value === "last90" ? "Son 90 gün" : o.value === "custom" ? "Özel tarih aralığı" : o.label}
                  {o.value === period && <Icon name="check" size={16} />}
                </div>
              ))}
            </div>
            <span className="eyebrow" style={{ paddingTop: 6 }}>GENEL SEGMENT · 2-4 SEÇENEK</span>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <Segmented
                label="Para birimi"
                value={ccy}
                onChange={setCcy}
                options={[
                  { value: "TRY", label: "₺" },
                  { value: "USD", label: "$" },
                  { value: "EUR", label: "€" },
                  { value: "XAU", label: "gr" },
                ]}
              />
              <Segmented
                label="Yön"
                value={side}
                onChange={setSide}
                options={[
                  { value: "all", label: "Tümü" },
                  { value: "buy", label: "Alış" },
                  { value: "sell", label: "Satış" },
                ]}
              />
              <Segmented
                label="Değer"
                value="nominal"
                onChange={() => {}}
                disabled
                options={[
                  { value: "nominal", label: "Nominal" },
                  { value: "real", label: "Reel" },
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ============ DEĞİŞİM ROZETİ ============ */}
      <Section
        id="ds-degisim"
        title="Değişim rozeti"
        lead="Yön üç yoldan verilir: ok (▲ ▼ •), işaret (+ −) ve renk. Eksi işareti gerçek U+2212 karakteridir. Yüzde işareti sayının önünde."
      >
        <div className="ds-grid">
          <div className="ds-col">
            <span className="eyebrow">ROZET (ZEMİNLİ)</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Delta badge kind="money" value={18450} />
              <Delta badge kind="pct" value={0.35} decimals={2} />
              <Delta badge kind="money" value={-4120} />
              <Delta badge kind="pct" value={-1.8} />
              <Delta badge kind="pct" value={0} decimals={2} />
            </div>
            <span className="ds-note">KPI kartı ve başlıklar için.</span>
          </div>
          <div className="ds-col">
            <span className="eyebrow">SATIR İÇİ (ZEMİNSİZ)</span>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Delta value={3.2} />
              <Delta value={-0.8} />
              <Delta value={0} />
            </div>
            <span className="ds-note">Tablo, kur şeridi ve liste satırları için.</span>
          </div>
          <div className="ds-col">
            <span className="eyebrow">ÇOK PARA BİRİMLİ TUTAR</span>
            <div style={{ maxWidth: 220, display: "flex", justifyContent: "flex-end" }}>
              <AmountStack values={[`${MINUS}₺70.673,25`, `${MINUS}$1.436,45`, `${MINUS}€1.231,25`]} />
            </div>
            <span className="ds-note">
              İkincil para birimi alt satırda, küçük ve sessiz. İkiden fazla birim ipucuna taşınır.
            </span>
          </div>
        </div>
      </Section>

      {/* ============ ÇİP VE ETİKET ============ */}
      <Section
        id="ds-cip"
        title="Çip ve etiketler"
        lead="Bütün durum etiketleri metin ve şekil taşır; renk ek ipucudur. Kategori ve kişi etiketleri tıklanabilir ve listeyi filtreler; en az 28 px yükseklik."
      >
        <div className="ds-grid" style={{ gap: 28 }}>
          <div className="ds-col">
            <span className="eyebrow">KATEGORİ · KİŞİ · HESAP</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <TagChip label="Eğitim" color="var(--c-violet)" onClick={() => {}} />
              <TagChip label="Market" color="var(--c-blue)" onClick={() => {}} />
              <span className="chip is-hover">
                <span className="chip-dot" style={{ background: "var(--c-amber)" }} />
                Faturalar
              </span>
              <TagChip label="Ayşe" initial="A" onClick={() => {}} />
              <TagChip label="Hane" initial="H" onClick={() => {}} />
              <TagChip label="Yapı Kredi KK" icon={CardIcon} onClick={() => {}} />
            </div>
            <span className="ds-note">
              Kategori rengi Giderler&apos;de harcama sırasına göre paletten gelir (ilk 6), kalanlar --c-slate. Kişi baş harfle
              tanınır. Üzerine gelince zemin --surface-2 olur (Faturalar).
            </span>
          </div>
          <div className="ds-col">
            <span className="eyebrow">SİNYAL GÜCÜ</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SignalChip level="strong" />
              <SignalChip level="medium" />
              <SignalChip level="weak" />
            </div>
            <span className="eyebrow" style={{ paddingTop: 6 }}>ÖNEM (EKONOMİK TAKVİM)</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ImportanceChip level="high" />
              <ImportanceChip level="medium" />
              <ImportanceChip level="low" />
            </div>
          </div>
          <div className="ds-col">
            <span className="eyebrow">ALTMAN Z BÖLGESİ</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ZoneChip zone="safe" />
              <ZoneChip zone="grey" />
              <ZoneChip zone="distress" />
            </div>
            <span className="eyebrow" style={{ paddingTop: 6 }}>AKTİF FİLTRE ÇİPİ</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {filters.map((f) => (
                <FilterChip key={f.label} label={f.label} value={f.value} onRemove={() => setFilters((xs) => xs.filter((x) => x !== f))} />
              ))}
              {filters.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
                  Tümünü temizle
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setFilters([
                      { label: "Hesap", value: "Yapı Kredi KK" },
                      { label: "Kişi", value: "Ayşe" },
                    ])
                  }
                >
                  Filtreleri geri getir
                </Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ============ KPI KARTI ============ */}
      <Section
        id="ds-kpi"
        title="KPI kartı"
        lead="Üç katman: etiket, ana tutar ve değişim, ikincil birimler. İkincil birimler hiçbir zaman ana tutarın satırına yazılmaz; kendi ızgarasında durur ve dar kartta alt satıra geçer."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">NORMAL · GENİŞ</span>
            <KpiCard
              label="Toplam servet · TL"
              value="₺5.214.300"
              change={18450}
              changePct={0.35}
              changeLabel="bugün"
              spark={[24, 22, 25, 20, 21, 17, 18, 14, 15, 11, 12, 8, 6].map((v) => -v)}
              secondary={[
                { label: "USD", value: "$106.000" },
                { label: "EUR", value: "€90.800" },
                { label: "ALTIN", value: "805 gr" },
              ]}
            />
          </div>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">DAR · KISALTILMIŞ · İPUCU</span>
            <div style={{ width: 220 }}>
              <KpiCard
                label="Bu ay gider"
                value={`${MINUS}₺70,7 B`}
                fullValue={`${MINUS}₺70.673,25 · ${MINUS}$1.436,45 · ${MINUS}€1.231,25 · Ekim 2026 · 48 kayıt`}
                changePct={12.4}
                changeLabel="geçen aya göre"
                invert
                footer={<span className="tabular">{MINUS}$1.436 · {MINUS}€1.231</span>}
              />
            </div>
            <span className="ds-note">Gider artışı kötü yönde olduğu için ▲ ama --negative. Ok yönü değeri, renk anlamı söyler.</span>
          </div>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">GİZLİLİK MODU</span>
            <PrivacyPreview />
            <span className="ds-note">Tutarlar bulanık, yüzdeler ve oklar açık (servet büyüklüğünü ele vermez). Ekran okuyucu &quot;gizli tutar&quot; okur.</span>
          </div>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">YÜKLENİYOR</span>
            <KpiCard label="Toplam servet · TL" value="" state="loading" secondary={[]} />
          </div>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">HATA · SON BİLİNEN DEĞER</span>
            <KpiCard
              label="Toplam servet · TL"
              value="₺5.195.850"
              state="error"
              note={
                <>
                  Fiyatlar alınamadı. Değer 03.10.2026 18:10 kapanışına göre.{" "}
                  <button type="button" className="banner-action" style={{ color: "inherit", textDecoration: "underline", padding: 0, fontSize: 13 }}>
                    Tekrar dene
                  </button>
                </>
              }
            />
          </div>
          <div className="ds-col" style={{ gap: 8 }}>
            <span className="eyebrow">BOŞ</span>
            <KpiCard
              label="Bu ay gelir"
              value="₺0"
              state="empty"
              emptyText={
                <>
                  Ekim için gelir kaydı yok.{" "}
                  <a href="/gelirler" style={{ fontWeight: 600 }}>
                    Gelir ekle
                  </a>
                </>
              }
            />
          </div>
        </div>
      </Section>

      {/* ============ DEFTER LİSTESİ ============ */}
      <Section
        id="ds-defter"
        title="Defter listesi"
        lead="Mevcut dil korundu ve sistemleşti: solda tarih rozeti, ortada açıklama ve tıklanabilir etiketler, sağda tutar. Gelirler, Giderler ve İşlemler aynı Ledger bileşenini kullanır (src/components/ledger)."
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="ds-col" style={{ flex: "1 1 560px" }}>
            <span className="eyebrow">MASAÜSTÜ · GRUPSUZ</span>
            <div className="card ledger" style={{ overflow: "hidden" }}>
              <div className="ledger-toolbar">
                <label className="search ledger-search">
                  <Icon name="search" size={16} />
                  <input placeholder="Açıklama, etiket ya da tutar ara" aria-label="Ara" />
                </label>
                <Button icon={<Icon name="filter" size={16} />}>
                  Filtre
                  <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: "var(--accent)", color: "var(--accent-fg)", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" }}>
                    {filters.length}
                  </span>
                </Button>
                <Button style={{ fontWeight: 400, color: "var(--fg-soft)" }}>
                  Grupla: <strong style={{ color: "var(--fg)" }}>Yok</strong>
                  {ChevDown}
                </Button>
                <Button variant="ghost">Dışa aktar{ChevDown}</Button>
              </div>
              <div className="ledger-summary">
                <span className="ledger-chips">
                  {filters.map((f) => (
                    <FilterChip key={f.label} label={f.label} value={f.value} onRemove={() => setFilters((xs) => xs.filter((x) => x !== f))} />
                  ))}
                </span>
                <span className="tabular">
                  18 kayıt · <strong>{MINUS}₺9.842,15</strong>
                </span>
              </div>
              <ul className="ledger-list">
                <LedgerRow day="04" mon="EKİ" title="MIGROS KADIKOY" cat={["Market", "var(--c-blue)"]} tags={["Ayşe", "Yapı Kredi KK"]} value={`${MINUS}₺1.284,60`} />
                <LedgerRow day="01" mon="EKİ" title="ECZANE ŞİFA" cat={["Sağlık", "var(--c-rose)"]} tags={["Ayşe", "Yapı Kredi KK"]} value={`${MINUS}₺642,75`} hover />
                <LedgerRow day="30" mon="EYL" title="Maaş · Ayşe" cat={["Maaş", "var(--c-slate)"]} tags={["Ayşe", "Ziraat Vadesiz"]} value="+₺86.500,00" positive />
              </ul>
              <div className="ledger-more">
                <Button variant="ghost" className="btn-md">Daha fazla göster · 15 kayıt</Button>
              </div>
            </div>
            <span className="ds-note">
              İkinci satır üzerine gelme halini gösterir: zemin --surface-2, düzenle ve sil düğmeleri belirir. Gelir tutarı
              --positive ve + işaretli; gider tutarı nötr --fg, eksi işaretiyle.
            </span>
          </div>
          <div className="ds-col" style={{ flex: "1 1 360px" }}>
            <span className="eyebrow">KATEGORİYE GÖRE GRUPLU</span>
            <div className="card" style={{ overflow: "hidden" }}>
              <ul className="ledger-list">
                <GroupHead label="Eğitim" count={2} total={`${MINUS}₺22.400,00`} share={31.7} color="var(--c-violet)" />
                <GroupHead label="Market" count={9} total={`${MINUS}₺14.900,00`} share={21.1} color="var(--c-blue)" open />
                <LedgerRow day="04" mon="EKİ" title="MIGROS KADIKOY" tags={["Ayşe", "Yapı Kredi KK"]} value={`${MINUS}₺1.284,60`} />
                <LedgerRow day="01" mon="EKİ" title="CARREFOURSA ACIBADEM" tags={["Hane", "Ziraat Bankkart"]} value={`${MINUS}₺2.115,40`} />
                <li className="ledger-hidden">
                  <Button variant="ghost" size="sm" style={{ padding: 0 }}>Gruptaki 7 kaydı daha göster</Button>
                </li>
                <GroupHead label="Faturalar" count={4} total={`${MINUS}₺8.300,00`} share={11.7} color="var(--c-amber)" />
              </ul>
            </div>
            <span className="eyebrow" style={{ paddingTop: 8 }}>BOŞ · ARAMA SONUÇSUZ</span>
            <EmptyState
              icon={SearchIcon}
              title={<>&quot;şişli&quot; için kayıt bulunamadı</>}
              actions={
                <>
                  <Button className="btn-md">Tümü&apos;nde ara</Button>
                  <Button variant="ghost" className="btn-md">Filtreleri temizle</Button>
                </>
              }
            >
              Seçili dönem: Bu Ay. Dönemi genişletmeyi ya da filtreleri temizlemeyi deneyin.
            </EmptyState>
          </div>
        </div>
      </Section>

      {/* ============ SAYISAL TABLO ============ */}
      <Section
        id="ds-tablo"
        title="Sayısal tablo ve mobil karşılığı"
        lead='İlk sütun yapışkan, sayısal sütunlar sağa yaslı ve tabular. Sıralı sütunun başlığı --fg ve ok taşır. 640 px altında tablo "değer kartı" listesine döner: sağ üstte sıralama ölçütü, altta en fazla üç ikincil değer.'
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="table-wrap" style={{ flex: "1 1 640px", minWidth: 0 }}>
            <table className="dg dg-sticky" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th scope="col">Sembol</th>
                  <th scope="col" className="num">Adet</th>
                  <th scope="col" className="num">Maliyet</th>
                  <th scope="col" className="num" aria-sort="descending">
                    <button type="button">
                      Güncel değer
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                        <path d="M5 1v8M2 6l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </th>
                  <th scope="col" className="num">Günlük K/Z</th>
                  <th scope="col" className="num">Toplam K/Z</th>
                  <th scope="col" className="num">Ağırlık</th>
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p) => (
                  <tr key={p.sym}>
                    <td className="strong">{p.sym}</td>
                    <td className="num tabular">{p.qty}</td>
                    <td className="num tabular">{p.cost}</td>
                    <td className="num tabular strong">{p.value}</td>
                    <td className="num">
                      <Delta kind="money" value={p.day} />
                    </td>
                    <td className="num">
                      <Delta value={p.total} />
                    </td>
                    <td className="num tabular privacy-safe">{p.weight}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Toplam</td>
                  <td />
                  <td className="num tabular" style={{ fontWeight: 600, color: "var(--fg-soft)" }}>₺943.400</td>
                  <td className="num tabular">₺1.078.930</td>
                  <td className="num">
                    <Delta kind="money" value={-4370} />
                  </td>
                  <td className="num">
                    <Delta value={14.4} />
                  </td>
                  <td className="num tabular privacy-safe" style={{ fontWeight: 600, color: "var(--fg-soft)" }}>%20,7</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="ds-col" style={{ flex: "0 1 360px", minWidth: 0, gap: 10 }}>
            <span className="eyebrow">MOBİL · DEĞER KARTI</span>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="tabular" style={{ fontSize: 13, color: "var(--muted)" }}>5 pozisyon · ₺1.078.930</span>
              <button type="button" className="btn btn-ghost" style={{ color: "var(--fg-soft)", fontWeight: 400, minHeight: 44, padding: "0 4px" }}>
                Sırala: <strong style={{ color: "var(--fg)" }}>Güncel değer</strong>
                {ChevDown}
              </button>
            </div>
            <div className="value-cards">
              {POSITIONS.filter((p) => p.sym === "THYAO" || p.sym === "KTLEV").map((p) => (
                <div key={p.sym} className="value-card">
                  <div className="value-card-head">
                    <span>
                      <span className="value-card-title">{p.sym}</span>
                      <span className="value-card-sub">{p.qty} adet</span>
                    </span>
                    <span>
                      <span className="value-card-value tabular">{p.value}</span>
                      <Delta value={p.total} label="toplam" className="privacy-safe" />
                    </span>
                  </div>
                  <div className="value-card-grid">
                    <span>
                      <small>Maliyet</small>
                      <b className="tabular">{p.cost}</b>
                    </span>
                    <span>
                      <small>Günlük</small>
                      <Delta kind="money" value={p.day} />
                    </span>
                    <span>
                      <small>Ağırlık</small>
                      <b className="tabular privacy-safe">{p.weight}</b>
                    </span>
                  </div>
                </div>
              ))}
              <div className="value-card-total">
                <span>Toplam</span>
                <span style={{ display: "flex", gap: 10 }}>
                  <span className="tabular">₺1.078.930</span>
                  <Delta value={14.4} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ============ UYARI / BOŞ / İSKELET ============ */}
      <Section
        id="ds-uyari"
        title="Uyarı bandı, boş durum, iskelet"
        lead="Uyarı bandı her zaman simge, kısa açıklama ve tek bir eylem taşır. Sayfa başına en fazla bir band; birden fazla uyarı tek bandda sayıyla birleşir."
      >
        <div className="ds-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
          <div className="ds-col" style={{ gap: 10 }}>
            <Banner tone="warn" title="3 hesabın bakiyesi 30 günden eski" action="Güncelle">
              Ziraat Vadeli, Midas, Fiziki altın. Toplam servete etkisi <span className="tabular">₺612.400</span>.
            </Banner>
            <Banner tone="info" title="Eylül enflasyon verisi henüz yok">
              Reel değerler Ağustos 2026 verisiyle hesaplandı.
            </Banner>
            <Banner tone="error" title="Ekstre okunamadı" action="Tekrar dene">
              yapikredi_eylul.pdf: tarih sütunu bulunamadı. Dosyayı CSV olarak deneyin.
            </Banner>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <EmptyState
              icon={<Icon name="upload" size={20} />}
              title="Ekim için gider yok"
              actions={<Button variant="primary" className="btn-md">Ekstre Yükle</Button>}
            >
              Kredi kartı ya da banka ekstresi yükleyin.
            </EmptyState>
            <div className="card" style={{ overflow: "hidden", boxShadow: "none" }}>
              <LedgerSkeleton />
              <div style={{ padding: "8px 14px 12px", fontSize: 12, color: "var(--muted)" }}>
                İskelet gerçek düzeni taklit eder. Nabız 1,4 sn; hareketi azalt açıkken durur.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ============ FORM / PENCERE / GERİ AL ============ */}
      <Section
        id="ds-form"
        title={'Form, pencere ve "Geri al" bildirimi'}
        lead="Alan yüksekliği 44 px, etiket her zaman alanın üstünde (yer tutucu etiket yerine geçmez). Hata alanın altında metinle ve simgeyle gösterilir. Masaüstünde 520 px pencere, mobilde tam ekran sayfa."
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="modal modal-sm" style={{ position: "static", flex: "0 1 520px", minWidth: "min(100%, 320px)", maxHeight: "none", overflow: "visible" }} role="dialog" aria-labelledby="ds-modal-title">
            <div className="modal-head">
              <h3 className="modal-title" id="ds-modal-title">Kayıt ekle</h3>
              <button type="button" className="icon-btn icon-btn-ghost" aria-label="Kapat" data-tip="Kapat">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <Segmented
                label="Kayıt türü"
                block
                onSurface
                value={kind}
                onChange={setKind}
                options={[
                  { value: "exp", label: "Gider" },
                  { value: "inc", label: "Gelir" },
                ]}
              />
              <Field label="Tutar">
                <label className="input input-amount">
                  <span className="cur">₺</span>
                  <input inputMode="decimal" defaultValue="1.284,60" className="tabular" />
                </label>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Tarih">
                  <input className="input tabular" defaultValue="04.10.2026" />
                </Field>
                <Field label="Hesap">
                  <select className="select" defaultValue="ykkk">
                    <option value="ykkk">Yapı Kredi KK</option>
                    <option value="zv">Ziraat Vadesiz</option>
                  </select>
                </Field>
              </div>
              <div className="ds-col" style={{ gap: 6 }}>
                <Field label="Kategori" error="Kaydetmek için bir kategori seçin.">
                  <select className="select" defaultValue="">
                    <option value="" disabled>
                      Kategori seçin
                    </option>
                    <option>Market</option>
                    <option>Restoran</option>
                  </select>
                </Field>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Öneri:</span>
                  <TagChip label="Market" color="var(--c-blue)" onClick={() => {}} />
                  <TagChip label="Restoran" color="var(--c-orange)" onClick={() => {}} />
                </span>
              </div>
              <div className="field">
                <span className="field-label" id="ds-kisi">Kişi</span>
                <div className="choice-row" role="radiogroup" aria-labelledby="ds-kisi">
                  {[
                    ["mehmet", "Mehmet"],
                    ["ayse", "Ayşe"],
                    ["deniz", "Deniz"],
                    ["hane", "Hane"],
                  ].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={person === v} className="choice" onClick={() => setPerson(v)}>
                      {person === v && <Icon name="check" size={12} stroke={2.4} />}
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Açıklama" optional>
                <input className="input" defaultValue="MIGROS KADIKOY" />
              </Field>
            </div>
            <div className="modal-foot">
              <Button variant="ghost">Vazgeç</Button>
              <Button variant="primary">Kaydet</Button>
            </div>
          </div>
          <div className="ds-col" style={{ flex: "1 1 360px", gap: 14 }}>
            <span className="eyebrow">GERİ AL BİLDİRİMİ · 30 SN</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="danger" onClick={() => setToast(true)} disabled={toast}>
                Kaydı sil (dene)
              </Button>
              <span className="ds-note">Bildirim ekranın altında açılır.</span>
            </div>
            <span className="ds-note" style={{ maxWidth: 440 }}>
              Ters renkli yüzey (açık temada koyu, koyu temada açık), ekranın altında ortada. Kalan süre sayıyla da yazılır.
              Üzerine gelince ya da odaklanınca süre durur. Esc kapatır, Ctrl+Z geri alır.
            </span>
            <span className="eyebrow" style={{ paddingTop: 8 }}>ALAN HALLERİ</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 440 }}>
              <Field label="Normal">
                <input className="input" placeholder="Örn. Okul taksiti" />
              </Field>
              <Field label="Odak">
                <input className="input is-focus" defaultValue="Okul taksiti" />
              </Field>
              <Field label="Devre dışı">
                <input className="input" defaultValue="Ziraat Vadesiz" disabled />
              </Field>
              <Field label="Yükleniyor">
                <span className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--muted)" }} aria-busy="true">
                  Hesaplar alınıyor
                  <Spinner />
                </span>
              </Field>
            </div>
          </div>
        </div>
      </Section>

      {/* ============ UYGULAMA KABUĞU ============ */}
      <Section
        id="ds-kabuk"
        title="Uygulama kabuğu, sayfa başlığı, gezinme"
        lead="Kenar menü 240 px, daraltılınca 64 px (yalnız simge, ipuçlu). Üst çubukta sayfa adı, kur şeridi, gizlilik ve tema düğmeleri. Sayfa başlığı satırında tek birincil eylem. Bu sayfanın kabuğu canlı örnektir; menü düğmesiyle daraltabilirsiniz."
      >
        <div className="ds-shell-demo">
          <div className="ds-demo-side">
            <div className="brand">
              <div className="brand-mark">M</div>
              <div className="brand-name">Mehmet&apos;s Assets</div>
            </div>
            <span className="nav-section-title">Genel</span>
            <span className="nav-item active"><span className="icon"><Icon name="dashboard" size={18} /></span>Özet</span>
            <span className="nav-item"><span className="icon"><Icon name="arrowInc" size={18} /></span>Gelirler</span>
            <span className="nav-item" style={{ background: "var(--surface-2)", color: "var(--fg)" }}><span className="icon"><Icon name="arrowExp" size={18} /></span>Giderler</span>
            <span className="nav-item"><span className="icon"><Icon name="wealth" size={18} /></span>Portföy</span>
            <span className="nav-item"><span className="icon"><Icon name="report" size={18} /></span>Raporlar</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div className="ds-demo-top">
              <span style={{ fontSize: 16, fontWeight: 600 }}>Giderler</span>
              <div className="fx-strip">
                {[
                  ["USD", "49,20", 0.1],
                  ["EUR", "57,40", 0.3],
                  ["GR", "₺6.480", 0.6],
                  ["BIST 100", "12.850", -0.8],
                ].map(([l, v, c]) => (
                  <span key={l as string} className="fx-tick">
                    <span className="fx-pair">{l}</span>
                    <span className="fx-last">{v}</span>
                    <Delta value={c as number} className={`fx-chg ${(c as number) >= 0 ? "pos" : "neg"}`} />
                  </span>
                ))}
              </div>
              <span className="icon-btn" aria-hidden><Icon name="eye" size={18} /></span>
              <span className="icon-btn" aria-hidden><Icon name="sun" size={18} /></span>
            </div>
            <div style={{ padding: 24 }}>
              <div className="page-head">
                <div>
                  <div className="page-title">Giderler</div>
                  <div className="page-sub">Bu ay ne harcadım, nereye, kim için?</div>
                </div>
                <div className="page-actions">
                  <Button>Ekstre Yükle</Button>
                  <Button variant="primary" icon={PlusIcon}>Gider ekle</Button>
                </div>
              </div>
              <span className="ds-note">
                Sayfa başlığının altında o sayfanın cevapladığı soru yazılır. Birincil eylem sağda, ikincil eylem solunda.
                ≤640 px&apos;te eylemler başlık satırının altında tam genişlik olur.
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="ds-col" style={{ gap: 10 }}>
            <span className="eyebrow">DARALTILMIŞ</span>
            <div className="ds-rail">
              <span className="nav-item active"><span className="icon"><Icon name="dashboard" size={18} /></span></span>
              <span className="nav-item"><span className="icon"><Icon name="arrowInc" size={18} /></span></span>
              <span className="nav-item is-focus" style={{ outlineOffset: -2 }}><span className="icon"><Icon name="arrowExp" size={18} /></span></span>
              <span className="nav-item"><span className="icon"><Icon name="wealth" size={18} /></span></span>
              <span className="nav-item"><span className="icon"><Icon name="report" size={18} /></span></span>
            </div>
            <span className="ds-note" style={{ maxWidth: 200 }}>Odaktaki öğe ipucunu gösterir: &quot;Giderler&quot;.</span>
          </div>
          <div className="ds-col" style={{ gap: 10, flex: "0 1 390px" }}>
            <span className="eyebrow">MOBİL ALT SEKME ÇUBUĞU · 390</span>
            <div className="ds-tabbar" aria-hidden>
              <span className="on"><Icon name="dashboard" size={22} />Özet</span>
              <span><Icon name="arrowExp" size={22} />Harcama</span>
              <span><Icon name="wealth" size={22} />Portföy</span>
              <span><Icon name="screener" size={22} />Piyasa</span>
              <span><Icon name="dot" size={22} />Diğer</span>
            </div>
            <span className="ds-note">
              &quot;Harcama&quot; Gelirler ve Giderler&apos;i bir segmentle açar. &quot;Diğer&quot;: İşlemler, Hesaplar, Raporlar, Ayarlar.
              Etiket her zaman görünür; seçili sekme renk + kalın yazı. Öneri onaylanınca uygulanacak.
            </span>
          </div>
          <div className="ds-proposal" style={{ flex: "1 1 320px" }}>
            <span className="ds-tag-oneri">ÖNERİ</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Piyasa bölümünü 6 girdiden 3&apos;e indirmek</span>
            <ul>
              <li>
                <strong>Hisse:</strong>{" "}Piyasa Radarı, Tarama ve Temel Analiz aynı sayfada sekme olur. Üçü de &quot;hangi hisseye
                bakmalıyım?&quot; sorusunu cevaplıyor ve aynı sembol listesini paylaşıyor.
              </li>
              <li>
                <strong>Komite → Portföy &gt; Sağlık sekmesi:</strong>{" "}&quot;Portföyüm sağlıklı mı?&quot; bir portföy sorusu.
              </li>
              <li>
                <strong>TEFAS Fonları</strong> ve <strong>Ekonomik Takvim</strong> yerinde kalır.
              </li>
              <li>Hiçbir işlev kaldırılmıyor; eski adresler yeni sekmelere yönlenir.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ============ GRAFİK DİLİ ============ */}
      <Section id="ds-grafik" title="Grafik dili" lead="Ortak kurallar bütün grafik türleri için geçerli. Tür kartlarında yalnız o türe özgü kurallar var.">
        <div className="ds-rules">
          {CHART_RULES.map(([t, d]) => (
            <div key={t}>
              <b>{t}</b>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 290px), 1fr))", gap: 16 }}>
          <ChartCard title="Çizgi" note="Çizgi 2 px; vurgulanan seri 2,5 px. En fazla 5 seri; fazlası &quot;Diğer&quot;e. Uç noktada doğrudan etiket.">
            <svg viewBox="0 0 260 110" role="img" aria-label="Portföy BIST 100'ün üzerinde">
              {[20, 55, 90].map((y) => (
                <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="var(--chart-grid)" />
              ))}
              <path d="M0,80 L33,72 L66,74 L100,60 L133,52 L166,44 L200,30" fill="none" stroke="var(--c-teal)" strokeWidth="2.5" />
              <path d="M0,80 L33,78 L66,70 L100,72 L133,66 L166,62 L200,58" fill="none" stroke="var(--c-blue)" strokeWidth="2" />
              <circle cx="200" cy="30" r="3" fill="var(--c-teal)" />
              <circle cx="200" cy="58" r="3" fill="var(--c-blue)" />
              <text x="206" y="34" fontSize="12" fontWeight="600" fill="var(--fg)">Portföy</text>
              <text x="206" y="62" fontSize="12" fontWeight="600" fill="var(--fg-soft)">BIST 100</text>
            </svg>
          </ChartCard>
          <ChartCard title="Yığılmış alan" note="Sıra sabit: en büyük sınıf altta. Katmanlar arası 1,5 px zemin rengi çizgi. İpucunda toplam ve her katman.">
            <svg viewBox="0 0 260 110" role="img" aria-label="Varlık sınıfları yığılmış alan">
              <path d="M0,110 L0,80 L65,76 L130,70 L195,66 L260,60 L260,110 Z" fill="var(--c-blue)" />
              <path d="M0,80 L65,76 L130,70 L195,66 L260,60 L260,42 L195,48 L130,54 L65,60 L0,64 Z" fill="var(--c-violet)" />
              <path d="M0,64 L65,60 L130,54 L195,48 L260,42 L260,28 L195,34 L130,40 L65,46 L0,50 Z" fill="var(--c-amber)" />
              <path d="M0,80 L65,76 L130,70 L195,66 L260,60 M0,64 L65,60 L130,54 L195,48 L260,42 M0,50 L65,46 L130,40 L195,34 L260,28" fill="none" stroke="var(--surface-2)" strokeWidth="1.5" />
              <text x="8" y="98" fontSize="12" fontWeight="600" fill="var(--bg)">Hisse</text>
              <text x="8" y="76" fontSize="12" fontWeight="600" fill="var(--bg)">Fon</text>
              <text x="8" y="60" fontSize="12" fontWeight="600" fill="var(--bg)">Altın</text>
            </svg>
          </ChartCard>
          <ChartCard title="Halka">
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <svg viewBox="0 0 42 42" style={{ width: 110, height: 110, flex: "0 0 auto" }} role="img" aria-label="Varlık dağılımı: Hisse yüzde 38">
                {[
                  ["var(--c-blue)", "37.4 62.6", 25],
                  ["var(--c-violet)", "22.4 77.6", -13],
                  ["var(--c-amber)", "16.4 83.6", -36],
                  ["var(--c-sky)", "11.4 88.6", -53],
                  ["var(--c-lime)", "7.4 92.6", -65],
                  ["var(--c-rose)", "1.6 98.4", -73],
                ].map(([c, d, o]) => (
                  <circle key={c as string} cx="21" cy="21" r="15.915" fill="none" stroke={c as string} strokeWidth="5" strokeDasharray={d as string} strokeDashoffset={o as number} />
                ))}
                <text x="21" y="20" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--fg)">₺5,21</text>
                <text x="21" y="26" textAnchor="middle" fontSize="3.6" fill="var(--muted)">Mn</text>
              </svg>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
                Dilimler arası 0,6 birim boşluk. Ortada toplam. En fazla 7 dilim; yanında değerli lejant zorunlu (%38 Hisse). %2 altı dilimler &quot;Diğer&quot;e.
              </p>
            </div>
          </ChartCard>
          <ChartCard title="Çubuk · aylık net birikim" note="Çubuk aralığı çubuk genişliğinin yarısı. Negatif çubuk aşağı ve --negative. Yalnız uç değerler etiketlenir.">
            <svg viewBox="0 0 260 110" role="img" aria-label="Aylık net birikim">
              <line x1="0" y1="60" x2="260" y2="60" stroke="var(--chart-axis)" />
              {[
                [14, 30, 30, true],
                [56, 42, 18, true],
                [98, 60, 12, false],
                [140, 36, 24, true],
                [182, 24, 36, true],
                [224, 60, 8, false],
              ].map(([x, y, h, pos]) => (
                <rect key={x as number} x={x as number} y={y as number} width="22" height={h as number} rx="2" fill={pos ? "var(--positive)" : "var(--negative)"} />
              ))}
              <text x="109" y="86" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--negative)">{MINUS}12 B</text>
              <text x="193" y="18" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--positive)">+36 B</text>
              <text x="25" y="104" textAnchor="middle" fontSize="12" fill="var(--muted-2)">May</text>
              <text x="109" y="104" textAnchor="middle" fontSize="12" fill="var(--muted-2)">Tem</text>
              <text x="193" y="104" textAnchor="middle" fontSize="12" fill="var(--muted-2)">Eyl</text>
            </svg>
          </ChartCard>
          <ChartCard title="Şelale · servet köprüsü" note="Başlangıç --c-slate, son değer --c-teal, ara adımlar işaretli (+/−) ve pozitif/negatif renkte. Bağlayıcı kesikli çizgi.">
            <svg viewBox="0 0 260 120" role="img" aria-label="Servet köprüsü">
              <line x1="0" y1="100" x2="260" y2="100" stroke="var(--chart-axis)" />
              <rect x="14" y="31.6" width="44" height="68.4" rx="2" fill="var(--c-slate)" />
              <rect x="76" y="22.6" width="44" height="9" rx="2" fill="var(--positive)" />
              <rect x="138" y="10" width="44" height="12.6" rx="2" fill="var(--positive)" />
              <rect x="200" y="10" width="44" height="90" rx="2" fill="var(--c-teal)" />
              <path d="M58,31.6 H76 M120,22.6 H138 M182,10 H200" stroke="var(--muted-2)" strokeDasharray="2 2" />
              {[
                [36, "Başlangıç"],
                [98, "Birikim"],
                [160, "Piyasa"],
                [222, "Bugün"],
              ].map(([x, l]) => (
                <text key={l as string} x={x as number} y="114" textAnchor="middle" fontSize="12" fill="var(--muted-2)">
                  {l}
                </text>
              ))}
              <text x="98" y="17" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--positive)">+0,52</text>
            </svg>
          </ChartCard>
          <ChartCard title="Isı haritası · sektör rotasyonu" note="İki yönlü, iki şiddet basamağı. Hücrede her zaman işaretli değer; renk tek başına okunmaz. Metin --fg.">
            <div className="ds-heat">
              <span className="h" />
              {["1H", "1A", "3A", "1Y"].map((h) => (
                <span key={h} className="h">{h}</span>
              ))}
              {HEAT.map(([sector, ...cells]) => (
                <HeatRow key={sector as string} sector={sector as string} cells={cells as number[]} />
              ))}
            </div>
          </ChartCard>
          <ChartCard title="Ağaç haritası · varlık dağılımı" note="Etiket sığmayan kutularda ad ipucuya ve altındaki lejanta taşınır (Döviz %8, Kripto %2). Kutu arası 2 px.">
            <div className="ds-tree">
              <div style={{ flex: 38, background: ASSET_CLASS.equity.color, display: "flex", flexDirection: "column" }}>
                <span>Hisse</span>
                <span>%38</span>
              </div>
              <div style={{ flex: 40, display: "flex", flexDirection: "column", gap: 2, padding: 0 }}>
                <div style={{ flex: 23, display: "flex", gap: 2, padding: 0 }}>
                  <div style={{ flex: 23, background: ASSET_CLASS.fund.color }}>Fon %23</div>
                  <div style={{ flex: 17, background: ASSET_CLASS.metal.color }}>Altın %17</div>
                </div>
                <div style={{ flex: 22, display: "flex", gap: 2, padding: 0 }}>
                  <div style={{ flex: 12, background: ASSET_CLASS.cash.color }}>Nakit %12</div>
                  <div style={{ flex: 8, background: ASSET_CLASS.fx.color }} title="Döviz %8">%8</div>
                  <div style={{ flex: 2, background: ASSET_CLASS.crypto.color, padding: 0 }} title="Kripto %2" />
                </div>
              </div>
            </div>
          </ChartCard>
          <ChartCard title="Küçük eğri" note="Eksen ve ızgara yok, uç noktada nokta. KPI kartında --accent; tablo satırında dönemin yönüne göre pozitif/negatif. Her zaman yanında sayısal değişim.">
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <svg viewBox="0 0 120 36" style={{ width: 140, height: 42 }} aria-hidden>
                <path d="M2,26 L12,24 L22,27 L32,22 L42,23 L52,19 L62,20 L72,16 L82,17 L92,13 L102,14 L114,8" fill="none" stroke="var(--accent)" strokeWidth="2" />
                <circle cx="114" cy="8" r="3" fill="var(--accent)" />
              </svg>
              <svg viewBox="0 0 120 36" style={{ width: 140, height: 42 }} aria-hidden>
                <path d="M2,10 L12,12 L22,9 L32,15 L42,14 L52,18 L62,17 L72,22 L82,21 L92,25 L102,24 L114,29" fill="none" stroke="var(--negative)" strokeWidth="2" />
                <circle cx="114" cy="29" r="3" fill="var(--negative)" />
              </svg>
            </div>
          </ChartCard>
        </div>
      </Section>

      {toast && (
        <UndoToast
          message="Kayıt silindi."
          detail={<span className="tabular">MIGROS KADIKOY · {MINUS}₺1.284,60</span>}
          onUndo={() => setToast(false)}
          onClose={() => setToast(false)}
        />
      )}
    </div>
  );
}

/* ---------- Bölüm parçaları ---------- */

function TokenRow({ t }: { t: (typeof COLOR_TOKENS)[number] }) {
  return (
    <>
      <div className="ds-mono">
        {t.name}
        {t.isNew && <span className="ds-new">YENİ</span>}
      </div>
      <div style={{ color: "var(--fg-soft)" }}>{t.purpose}</div>
      <div className="tabular privacy-safe" style={{ color: "var(--muted)" }}>
        <Swatch color={t.dark} />
        {t.soft && <Swatch color={t.soft[0]} />}
        {t.dark}
      </div>
      <div className="tabular privacy-safe" style={{ color: "var(--muted)" }}>
        <Swatch color={t.light} />
        {t.soft && <Swatch color={t.soft[1]} />}
        {t.light}
      </div>
    </>
  );
}

function TypeRow({ spec, children, style, className }: { spec: string; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className="ds-type-row">
      <span className={className} style={style}>
        {children}
      </span>
      <span className="ds-mono">{spec}</span>
    </div>
  );
}

function FragmentRow({ n }: { n: number }) {
  return (
    <>
      <span className="tabular privacy-safe">{n}</span>
      <span style={{ width: n, height: 12, background: "var(--accent)", borderRadius: 2 }} />
    </>
  );
}

function StateRow({
  label,
  variant,
  text,
  icon,
  loadingText,
}: {
  label: string;
  variant: "primary" | "secondary" | "ghost" | "danger";
  text: string;
  icon?: ReactNode;
  loadingText: string;
}) {
  return (
    <>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-soft)" }}>{label}</span>
      <span>
        <Button variant={variant} icon={icon}>{text}</Button>
      </span>
      <span>
        <Button variant={variant} icon={icon} className="is-hover" tabIndex={-1}>{text}</Button>
      </span>
      <span>
        <Button variant={variant} icon={icon} className="is-focus" tabIndex={-1}>{text}</Button>
      </span>
      <span>
        <Button variant={variant} icon={icon} className="is-active" tabIndex={-1}>{text}</Button>
      </span>
      <span>
        <Button variant={variant} icon={icon} disabled>{text}</Button>
      </span>
      <span>
        <Button variant={variant} loading>{loadingText}</Button>
      </span>
    </>
  );
}

function PrivacyPreview() {
  const blur = (px: number): CSSProperties => ({ filter: `blur(${px}px)`, userSelect: "none" });
  return (
    <div className="kpi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span className="kpi-label">Toplam servet · TL</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 3l14 14M8 5c.6-.1 1.3-.2 2-.2 5 0 8 5.2 8 5.2s-.9 1.6-2.6 3M5.4 6.6C3.4 8 2 10 2 10s3 5.2 8 5.2c1.2 0 2.3-.3 3.2-.8" />
          </svg>
          Gizli
        </span>
      </div>
      <span className="kpi-value" style={blur(9)} aria-label="gizli tutar">
        ₺5.214.300
      </span>
      <div className="kpi-row">
        <span className="delta-badge delta-pos">
          <span aria-hidden>▲</span>
          <span style={blur(6)} aria-label="gizli tutar">+₺18.450</span>
        </span>
        <span className="delta-badge delta-pos">+%0,35</span>
      </div>
      <div className="kpi-ccy">
        {[
          ["USD", "$106.000"],
          ["EUR", "€90.800"],
          ["ALTIN", "805 gr"],
        ].map(([l, v]) => (
          <span key={l}>
            <small>{l}</small>
            <b style={blur(6)} aria-label="gizli tutar">
              {v}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

function LedgerRow({
  day,
  mon,
  title,
  cat,
  tags,
  value,
  positive,
  hover,
}: {
  day: string;
  mon: string;
  title: string;
  cat?: [string, string];
  tags: string[];
  value: string;
  positive?: boolean;
  hover?: boolean;
}) {
  return (
    <li className="ledger-row" style={hover ? { background: "var(--surface-2)" } : undefined}>
      <div className="ledger-date">
        <b>{day}</b>
        <span>{mon}</span>
      </div>
      <div className="ledger-main">
        <div className="ledger-title">{title}</div>
        <div className="ledger-meta">
          {cat && (
            <button type="button">
              <span className="chip-dot" style={{ background: cat[1], width: 7, height: 7 }} />
              {cat[0]}
            </button>
          )}
          {tags.map((t) => (
            <button key={t} type="button">
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="ledger-end">
        {hover && (
          <div className="ledger-actions" style={{ opacity: 1 }}>
            <button type="button" className="icon-btn" aria-label="Düzenle" data-tip="Düzenle">
              <Icon name="edit" size={16} />
            </button>
            <button type="button" className="icon-btn" aria-label="Sil" data-tip="Sil">
              <Icon name="trash" size={16} />
            </button>
          </div>
        )}
        <div className="ledger-value tabular" style={positive ? { color: "var(--positive)" } : undefined}>
          {value}
        </div>
      </div>
    </li>
  );
}

function GroupHead({ label, count, total, share, color, open }: { label: string; count: number; total: string; share: number; color: string; open?: boolean }) {
  return (
    <li className="ledger-group">
      <button type="button" className="ledger-group-toggle" aria-expanded={!!open}>
        <span aria-hidden style={{ color: "var(--fg-soft)" }}>{open ? "▾" : "▸"}</span>
        <span className="chip-dot" style={{ background: color, width: 10, height: 10, borderRadius: 3 }} />
        <span className="ledger-group-label">
          {label} <span style={{ fontWeight: 400, color: "var(--muted)" }}>· {count} kayıt</span>
        </span>
      </button>
      <span className="ledger-share">
        <span className="bar">
          <span style={{ width: `${share}%`, background: color }} />
        </span>
        <span className="hint tabular privacy-safe">%{share.toLocaleString("tr-TR")}</span>
      </span>
      <span className="ledger-group-total tabular">{total}</span>
    </li>
  );
}

function ChartCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="ds-chart-card">
      <b>{title}</b>
      {children}
      {note && <p>{note}</p>}
    </div>
  );
}

function HeatRow({ sector, cells }: { sector: string; cells: number[] }) {
  const bg = (v: number) =>
    v === 0
      ? "var(--surface-3)"
      : Math.abs(v) >= 3
        ? `color-mix(in oklab, var(${v > 0 ? "--positive" : "--negative"}) 45%, var(--surface))`
        : v > 0
          ? "var(--positive-soft)"
          : "var(--negative-soft)";
  return (
    <>
      <span className="l">{sector}</span>
      {cells.map((v, i) => (
        <span key={i} style={{ background: bg(v) }}>
          {v > 0 ? "+" : v < 0 ? MINUS : ""}
          {Math.abs(v).toLocaleString("tr-TR")}
        </span>
      ))}
    </>
  );
}

/* ---------- Örnek veri ---------- */

const POSITIONS = [
  { sym: "THYAO", qty: "1.200", cost: "₺312.000", value: "₺378.600", day: -4560, total: 21.3, weight: "%7,3" },
  { sym: "ASELS", qty: "2.500", cost: "₺245.000", value: "₺301.250", day: 3000, total: 23.0, weight: "%5,8" },
  { sym: "BIMAS", qty: "450", cost: "₺228.000", value: "₺243.900", day: -1350, total: 7.0, weight: "%4,7" },
  { sym: "KTLEV", qty: "3.000", cost: "₺96.000", value: "₺84.300", day: -2100, total: -12.2, weight: "%1,6" },
  { sym: "BINHO", qty: "800", cost: "₺62.400", value: "₺70.880", day: 640, total: 13.6, weight: "%1,4" },
];

const HEAT: Array<[string, number, number, number, number]> = [
  ["Banka", 3.1, 1.2, -0.8, 24],
  ["Sanayi", -1.4, -4.2, 0, 8],
  ["Enerji", 0.6, 2.0, 9.7, -3],
];

const CHART_RULES: Array<[string, string]> = [
  ["Eksen", "Y ekseni solda, kısaltılmış birimle (₺4,4 Mn), 3-4 değer. X ekseninde kısa tarih (Eki, 4 Eki). Eksen yazısı 12 px --muted-2."],
  ["Izgara", "Yalnız yatay, 1 px --chart-grid. Dikey ızgara yok. Sıfır çizgisi --chart-axis."],
  ["İpucu", "Dikey imleç çizgisi; başlıkta tarih (04.10.2026), altında seri başına tam değer. Klavyede ok tuşlarıyla gezilir. Mobilde dokun-basılı tut."],
  ["Lejant", "Önce doğrudan etiket. Lejant gerekiyorsa grafiğin üstünde, solda; tıklayınca seri gizlenir/açılır."],
  ["Negatif değer", "Sıfırın altında, --negative, etikette − işareti. Gider artışı gibi \"kötü\" yönler --negative'i ok yönünden bağımsız kullanır."],
  ["Gizlilik modu", "Şekil kalır; eksen değerleri, etiket ve ipucu tutarları \"•••\" olur. Yüzde etiketleri açık kalır."],
  ["Hareket", "İlk çizimde 200 ms belirme; geçişlerde animasyon yok. Hareketi azalt açıkken hiç yok."],
  ["Erişilebilirlik", "Her grafiğin altında \"Tablo olarak göster\" bağlantısı; SVG'de role=\"img\" ve özet aria-label."],
];
