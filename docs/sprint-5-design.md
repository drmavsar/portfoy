# Sprint-5 Tasarımı — UI: Dashboard, Komite, Detay, Karşılaştırma, Algoritmik Not

**Statü:** Tasarım önerisi. Kod yok. Bu PR merge edilene kadar Sprint-5'te implementasyon başlamayacak.

Sprint-1-4'te master veri + NAV + getiri + skor altyapısı tamamlandı. Sprint-5 bu **veriyi UI'ya bağlar**: sayfalar, tablolar, grafikler, algoritmik komite notu.

UI dışı işler (allocation recommendation, AI yorum, portföy entegrasyonu, realized_lots) Sprint-6/7'ye ait.

---

## 1. Sprint-5 Kapsamı

### Dahil

| Bileşen | Açıklama |
|---|---|
| **TEFAS Dashboard** (`/fonlar`) | KPI'lar + en yüksek 10 Mehmet Score + kategori bazlı özet + sistem sağlığı |
| **Fon Komitesi** (`/fonlar/komite`) | Kategori bazlı sıralı Mehmet Score tabloları — senin "en çok bakacağın ekran" |
| **Fon Detay** (`/fonlar/[code]`) | Tek fon için tam profil: NAV grafiği, getiri tabloları, skor bileşenleri, algoritmik komite notu |
| **Karşılaştırma** (`/fonlar/karsilastir`) | 2-5 fon seçip yan yana detaylı karşılaştırma |
| **Algoritmik Komite Notu** (modül) | Deterministik şablon — fon detay + komite tablosunda satır altı |

### Dahil DEĞİL (Sprint-6+)

- ❌ Allocation recommendation
- ❌ AI yorum (LLM güzelleştirme)
- ❌ Portföy entegrasyonu (fon trade akışı)
- ❌ `realized_lots` lot-bazlı stopaj uygulaması
- ❌ Persona yönetim UI (sistem default'la başlıyoruz, ileride)

---

## 2. Sayfa Mimarisi

```
/fonlar                          → Dashboard
/fonlar/komite                   → Fon Komitesi (kategori bazlı sıralı tablolar)
/fonlar/karsilastir              → Karşılaştırma (query: ?codes=HFI,KMF,KPI)
/fonlar/[code]                   → Fon detay (örn. /fonlar/HFI)
/fonlar/[code]/komite-notu       → (modül; sayfa değil) algoritmik not
```

Side navigation'da **"Piyasa"** seksiyonu altında `/fonlar` zaten Sprint-1 PR-1'de placeholder olarak eklendi; Sprint-5'te yeniden yazılır.

---

## 3. TEFAS Dashboard (`/fonlar`)

### Layout (üstten alta)

```
┌──────────────────────────────────────────────────────────────┐
│  Başlık: TEFAS Katılım Fonları                                │
│  Alt: 155 fon · 16 kategori · Mehmet Default persona aktif    │
└──────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Sistem Sağlığı Şeridi (badge'ler)                            │
│  • Son NAV: 2026-05-30 (1 gün eski) ✅                         │
│  • Son skor refresh: 21:00 ✅                                  │
│  • Bekleyen fonlar: 3 ⚠️                                       │
│  • CPI son ay: 2026-04 ✅                                      │
└───────────────────────────────────────────────────────────────┘

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ KPI Kartı       │ │ KPI Kartı       │ │ KPI Kartı       │
│ Mehmet Score    │ │ HSYF Fonları    │ │ Reel Getiri     │
│ Medyan / Top    │ │ Top Mehmet Avg  │ │ 1Y Top 10       │
└─────────────────┘ └─────────────────┘ └─────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Top 10 Mehmet Score                                          │
│  ┌─────┬────┬──────────────┬──────┬──────┐                    │
│  │ #1  │ KTS│ HSYF Serbest │ 72   │ ✓✓✓  │ → fon detay        │
│  │ #2  │ HFI│ HSYF Serbest │ 71   │ ✓✓✓  │                     │
│  │ ... │    │              │      │      │                     │
│  └─────┴────┴──────────────┴──────┴──────┘                    │
└───────────────────────────────────────────────────────────────┘

┌─────────────────────────────────┐ ┌─────────────────────────┐
│  Kategori Bazlı Dağılım Donut   │ │ Stopaj Dağılımı (bar)   │
│  HSYF: 4 · Çoklu: 26 · ...      │ │ HSYF: 4 · Genel: 110... │
└─────────────────────────────────┘ └─────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Uyarılar (stale, eksik bileşen)                              │
│  • 3 fon son 7 günde fiyat almadı: ABC, DEF, GHI              │
│  • 12 fon için 3Y CAGR henüz yok (kısa geçmiş)                │
└───────────────────────────────────────────────────────────────┘
```

### Veri Kaynakları (server actions)

- `listFundCategories()` + `listFunds()` — özet sayım
- `listLatestFundScores(personaId)` + `ORDER BY mehmet_score DESC LIMIT 10`
- `listScoresHealth(personaId)` + `listStaleScores(7)` — uyarılar
- `getLastScoresRefreshSummary()` + `getLastIngestSummary()` (NAV) + `getLatestCpi()` — sistem sağlık şeridi

### Karar Noktası

❓ **Persona seçici (dropdown)**: Sprint-5'te tek persona (Mehmet Default) ile başlayalım mı, yoksa zaten dropdown koyup ileride genişletelim mi? Önerim: **Tek persona** (URL query param `?persona=mehmet` ileride eklenir; UI'da gizli).

---

## 4. Fon Komitesi (`/fonlar/komite`)

> Senin verdiğin örnek tasarım (kategori başlıklı küçük tablolar) baz alındı.

### Layout

```
TEFAS Fon Komitesi
Mehmet Default persona · 2026-05-30 verisi

┌─ Katılım Hisse Fonları ──────────────────────────────────┐
│  Fon │ Mehmet Score │ 1Y Net │ Vol │ Stopaj │ Universe   │
│  ───┼──────────────┼────────┼─────┼────────┼───────────  │
│  YHK │     88       │ +%42   │ %18 │ %17.5  │ BIST_HISSE │
│  KTS │     84       │ +%38   │ %16 │ %0 HSYF│ BIST_HISSE │
│  TLZ │     82       │ +%35   │ %19 │ %17.5  │ BIST_HISSE │
│  ... (kategori içinde top 10 veya tamamı, collapse)      │
└──────────────────────────────────────────────────────────┘

┌─ Katılım Altın Fonları ──────────────────────────────────┐
│  KMF │ 83 │ ...                                           │
│  GOL │ 80 │ ...                                           │
└──────────────────────────────────────────────────────────┘

┌─ Katılım Para Piyasası ──────────────────────────────────┐
│  KPI │ 78 │ ...                                           │
└──────────────────────────────────────────────────────────┘

... (16 kategori)
```

### Tablo Kolonları (kategori başına)

- **Rank** (#1, #2, …)
- **Fon kodu** → fon detay linki
- **Mehmet Score** (büyük, renkli rozet)
- **Net 1Y** (renkli: pozitif yeşil, negatif kırmızı)
- **Volatilite 1Y** (%)
- **Stopaj** (rozet: HSYF=%0, %17.5, belirsiz)
- **Universe** (etiket: BIST, Altın vb.)
- **Komite notu** (mini ikon, hover'da/tıklayınca algoritmik şablon görünür)

### Filtreler (üstte)

- Kategori multi-select (default: hepsi açık, kullanıcı kapatır)
- `min_tax_confidence` slider (default: persona'dan MEDIUM — BELIRSIZ stopajlı fonlar gizli)
- Min Mehmet Score (default: 0)
- Sıralama: Mehmet Score / Net 1Y / Volatilite

### Karar Noktası

❓ **Kategori başına kaç fon gösterilsin?** Top 10 default, "Tümünü göster" toggle. Önerim: **Top 10 + toggle**.

❓ **Net 1Y mi Brüt 1Y mi default kolonda?** Sprint-3 dashboard default = net. Önerim: **Net** (brüt detay sayfasında).

---

## 5. Fon Detay (`/fonlar/[code]`)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  HFI · Hisse Senedi Yoğun Fon                                 │
│  Katılım Serbest Hisse Senedi Yoğun Fonlar · BIST_HISSE_TR    │
│  Yönetici: Ata Portföy · Risk: 6/7                            │
└──────────────────────────────────────────────────────────────┘

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Mehmet Score    │ │ Stopaj          │ │ Net 1Y          │
│ 71 / 100        │ │ %0 HSYF (HIGH)  │ │ +%42            │
│ 5/5 bileşen ✓   │ │                 │ │ vs kat. medyanı │
└─────────────────┘ └─────────────────┘ └─────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  NAV Trendi (Son 5 yıl)                                       │
│  [LineChart: NAV + 3Y CAGR + 5Y CAGR overlay]                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Getiri Pencereleri Tablosu                                   │
│  Pencere │ Brüt │ Net │ Reel │ vs Kategori                   │
│  1G       │ +%0.5│  -  │  -   │  -                            │
│  1H       │ +%1.2│  -  │  -   │  -                            │
│  1A       │ +%3.5│  -  │  -   │  -                            │
│  3A       │ +%9  │  -  │  -   │  -                            │
│  6A       │ +%18 │  -  │  -   │  -                            │
│  YTD      │ +%20 │  -  │  -   │  -                            │
│  1Y       │ +%42 │ %42 │ +%12 │ +%5 (medyan üstü)             │
│  3Y CAGR  │ +%35 │ %35 │ +%8  │ +%3                            │
│  5Y CAGR  │ +%30 │ %30 │ +%5  │ —                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Skor Bileşenleri (5 bileşen — Mehmet ağırlıklı)              │
│  Bileşen              │ Skor │ Ağırlık │ Katkı                │
│  ─────────────────────┼──────┼─────────┼──────                │
│  Enflasyon koruması   │  80  │  25%    │  20                  │
│  Stopaj avantajı      │ 100  │  20%    │  20                  │
│  Risk (vol %18)       │  55  │  20%    │  11                  │
│  Uzun vade performans │  75  │  20%    │  15                  │
│  Çeşitlendirme        │  30  │  15%    │   4.5                │
│  ─────────────────────┴──────┴─────────┴──────                │
│  TOPLAM Mehmet Score:                            70.5 → 71    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Risk Metrikleri                                              │
│  Volatilite 1Y:    %18                                        │
│  Max Drawdown 3Y:  -%24                                       │
│  Downside Vol 1Y:  %12                                        │
│  Return/Risk:      2.33                                       │
│  BIST bağımlılık:  100 (default_from_universe)                │
│  Altın bağımlılık: 0                                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  🤖 Algoritmik Komite Notu (deterministik)                    │
│                                                               │
│  HFI son 3 yılda kategorisini (medyan üzeri +%3 CAGR ile)     │
│  yenmiş, stopaj avantajı (%0 HSYF) taşıyor ve enflasyonun     │
│  +%12 üstünde reel getiri sağlamış. Ancak BIST bağımlılığı    │
│  yüksek (universe BIST_HISSE_TR), tek kategori çeşitlendirme  │
│  zayıf. Volatilite %18 — Mehmet persona max %30 altında,      │
│  kabul edilebilir.                                            │
│                                                               │
│  ⓘ Bu yorum yatırım tavsiyesi değildir; veri tabanlı karar    │
│     destek notudur.                                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Aksiyon: [Karşılaştır'a ekle] [Takipten çıkar]              │
└──────────────────────────────────────────────────────────────┘
```

### Veri Kaynakları

- `getFund(code)` — master meta
- `getLatestFundReturns(code)` — getiri pencereleri
- `getLatestFundScores(code, personaId)` — skor bileşenleri + risk metrikleri
- `getLatestFundPrice(code)` — son NAV
- `fund_prices` (son 5 yıl, sayfa-içi fetch) — NAV grafiği
- Komite notu modülü (Bölüm 7) — runtime template

### Karar Noktası

❓ **NAV grafiği aralık seçici**: 1M / 3M / 6M / 1Y / 3Y / 5Y / Tümü butonları default 1Y mı, 3Y mi? Önerim: **1Y default**.

---

## 6. Karşılaştırma (`/fonlar/karsilastir?codes=HFI,KMF,KPI`)

### Layout

```
Karşılaştırma · 3 fon seçili

┌────────────────────────────────────────────────────────────────────┐
│  Kolon başlıkları: HFI · KMF · KPI                                 │
│  Aksiyon kolonu: [Kaldır]                                           │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Özet Tablosu (yan yana)                                            │
│  Metrik              │   HFI    │   KMF    │   KPI                  │
│  ────────────────────┼──────────┼──────────┼──────────              │
│  Mehmet Score        │  71 ✓✓   │  60      │  55                    │
│  Kategori            │ HSYF     │ Altın    │ Para Piyasası          │
│  Universe            │ BIST     │ ALTIN    │ KATILIM_PP             │
│  Stopaj              │ %0 HSYF  │ %17.5    │ %17.5                  │
│  Net 1Y              │ +%42 ✓✓✓ │ +%28     │ +%52                   │
│  Net 3Y CAGR         │ +%35     │ +%25     │ +%48                   │
│  Reel 1Y             │ +%12     │ +%5      │ +%18                   │
│  vs Kategori Net 1Y  │ +%5      │ -%2      │ +%4                    │
│  Volatilite 1Y       │ %18      │ %22      │ %8                     │
│  Max DD 3Y           │ -%24     │ -%30     │ -%5                    │
│  Risk skor           │ 55       │ 45       │ 80                     │
│  Çeşitlendirme       │ 30       │ 80       │ 60                     │
│  BIST bağımlılık     │ 100      │ 5        │ 5                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  NAV Normalize Trend (baz 100 = 5 yıl önce)                        │
│  [LineChart: 3 seri (HFI, KMF, KPI) overlay]                       │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Bileşen Skor Karşılaştırması (Radar chart)                        │
│  5 eksen: Infl / Tax / Risk / LongTerm / Divers                    │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Algoritmik Komite Notları (her fon için kısa)                     │
│  HFI: ...                                                          │
│  KMF: ...                                                          │
│  KPI: ...                                                          │
└────────────────────────────────────────────────────────────────────┘
```

### URL & State

- Query param: `?codes=HFI,KMF,KPI` (URL kopyalanabilir)
- 2-5 fon arası destek (önerim: max 5)
- Sağ üstte "Fon ekle" search box (typeahead, 155 fon)

### Karar Noktası

❓ **NAV normalize stratejisi**: baz 100 başlangıç mı, ilk geçerli noktadan mı (her fonun farklı tarihte başlamış olabilir)? Önerim: **ortak en eski NAV tarihinden baz 100**.

❓ **Radar chart 5 bileşen yeterli mi**, BIST/Gold dependency'i de ekleyelim mi (7 eksen)? Önerim: **5 ana bileşen** (radar okunabilir kalsın).

---

## 7. Algoritmik Komite Notu

> Sprint-7'de bu şablonun üzerine LLM güzelleştirmesi gelir. Sprint-5 sade deterministik template.

### Şablon Yapısı

```
{FUND_CODE} {PERFORMANCE_CLAUSE}, {TAX_CLAUSE} ve {INFLATION_CLAUSE}.
Ancak {RISK_CLAUSE}, {DEPENDENCY_CLAUSE}. {VOLATILITY_CLAUSE}.

ⓘ Bu yorum yatırım tavsiyesi değildir; veri tabanlı karar destek notudur.
```

### Clause Generators

| Clause | Mantık | Örnek |
|---|---|---|
| `PERFORMANCE_CLAUSE` | `gross_3y_cagr` vs kategori medyan | "son 3 yılda kategorisini (+%3 CAGR ile) yenmiş" |
| `TAX_CLAUSE` | `applied_tax_kind` | "stopaj avantajı (%0 HSYF) taşıyor" / "standart %17.5 stopaja tabi" |
| `INFLATION_CLAUSE` | `real_1y` | "enflasyon üstünde +%12 reel getiri sağlamış" / "enflasyon altında kalmış" |
| `RISK_CLAUSE` | `normalized_risk_score` + persona max_vol | "Mehmet profili için kabul edilebilir risk" / "vol persona sınırını aşıyor" |
| `DEPENDENCY_CLAUSE` | `bist_dependency_score`, `gold_dependency_score` | "BIST bağımlılığı yüksek" / "altın bağımlılığı baskın" / "dengeli" |
| `VOLATILITY_CLAUSE` | `volatility_1y` + threshold | "Volatilite %18" |

### Eksik Veri Davranışı

- Hesaplanamayan clause atlanır (örn. `real_1y` null ise enflasyon cümlesi yazılmaz)
- Tamamen yetersiz veri varsa: "Bu fon için yeterli geçmiş veri bulunmuyor; karar destek notu Sprint-2+ NAV ingest sonrası üretilebilir."

### Uyarı Tonu

- Asla "öneri", "satın al", "tavsiye" gibi kelimeler **yok**
- "Veri gösteriyor ki...", "Mehmet profili için...", "Avantaj/dezavantaj"
- Footer disclaimer **her zaman** görünür

### Karar Noktası

❓ **LLM güzelleştirme Sprint-7'de devreye girince, deterministik notu kullanıcı yine görsün mü?** Önerim: **toggle** — kullanıcı LLM/deterministik arasında seçim yapabilir.

---

## 8. Sprint-5 PR Bölünmesi

Senin Sprint-3/4'teki gibi **4 PR**:

| PR | İçerik | Bağımlılık |
|---|---|---|
| **PR-1** | Dashboard (`/fonlar`) + sistem sağlığı şeridi + Top 10 + KPI'lar | Sprint-4 ✅ |
| **PR-2** | Fon Komitesi (`/fonlar/komite`) + kategori bazlı tablolar + filtreler | PR-1 |
| **PR-3** | Fon Detay (`/fonlar/[code]`) + NAV grafik + skor bileşenleri + algoritmik komite notu modülü | PR-2 |
| **PR-4** | Karşılaştırma (`/fonlar/karsilastir`) + radar chart + URL state | PR-3 |

> Alternatif: 5 PR (Algoritmik komite notu ayrı PR olarak PR-3 öncesi). Karar senin.

---

## 9. Genel Karar Noktaları (Senin Onayın Bekleniyor)

1. **Persona dropdown**: Sprint-5'te tek persona (gizli URL param) mı, görünür dropdown mu? *Önerim: gizli*
2. **Dashboard Top 10 kartı**: tam tablo mu, mini görsel + "tamamını gör" linki mi? *Önerim: tam tablo (10 satır kompakt)*
3. **Fon Komitesi kategori başına kaç fon**: Top 10 + "Tümünü göster" toggle mu, tümü açık mı? *Önerim: Top 10 + toggle*
4. **Komite tablosu default sıralama**: Mehmet Score / Net 1Y / Risk? *Önerim: Mehmet Score DESC*
5. **Net mi brüt mü default kolonda?** *Önerim: Net*
6. **Fon detay NAV grafiği default aralık**: 1Y / 3Y / 5Y / Tümü? *Önerim: 1Y*
7. **Karşılaştırma max fon sayısı**: 3 / 5 / 10? *Önerim: 5*
8. **Karşılaştırma NAV normalize**: ortak başlangıç tarihinden 100 mü, her fon kendi başlangıç noktasından 100 mü? *Önerim: ortak en eski*
9. **Radar chart bileşen sayısı**: 5 ana skor mu, +2 dependency dahil 7 eksen mi? *Önerim: 5*
10. **Algoritmik komite notu vs LLM toggle**: Sprint-7'de devreye girdiğinde kullanıcı seçimi mi, otomatik LLM mi? *Önerim: toggle (kullanıcı kontrolü)*

---

## 10. Sprint-5 Kapsam Dışı (Bilinçli)

- ❌ Allocation recommendation (Sprint-6)
- ❌ AI yorum (Sprint-7)
- ❌ Portföy entegrasyonu (Sprint-6)
- ❌ Realized lots stopaj (Sprint-6)
- ❌ Persona yönetim UI (ileride)
- ❌ Mobil-spesifik optimizasyon (responsive yeterli)

---

## 11. Sprint-5 Definition of Done

- ✅ 4 sayfa canlı (`/fonlar`, `/komite`, `/karsilastir`, `/[code]`)
- ✅ Mevcut tab pattern + tasarım sistemi uyumlu (Özet/Yatırımlar ile tutarlı)
- ✅ Veri yoksa "veri yok" rozetiyle graceful render
- ✅ Algoritmik komite notu deterministik (her fon için en az 1 cümle)
- ✅ Karşılaştırma URL state (paylaşılabilir)
- ✅ `npx tsc --noEmit` + `npx eslint` + `npx vitest run` temiz
- ✅ Vercel preview deploy yeşil

Sprint-6'ya geçilmeden önce Sprint-3/4 pattern'iyle yine sağlık raporu.
