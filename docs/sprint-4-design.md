# Sprint-4 Tasarımı — Mehmet Score, Risk Motoru, Persona

**Statü:** Tasarım önerisi. Kod yok. Bu PR merge edilene kadar Sprint-4'te implementasyon başlamayacak.

Sprint-3'te brüt + reel + net getiri cache'i tamamlandı. Sprint-4 bu temel üzerinde **fon başına 0-100 ölçekli skorlar** + **kullanıcı persona ağırlıkları** + **Mehmet Score** üretir.

UI ekranları Sprint-5'e ait. Sprint-4 yalnız hesap motorudur.

---

## 1. Sprint-4 Kapsamı

### Dahil

- `user_personas` tablo (parametrik ağırlıklar)
- `fund_scores_cache` tablo (dinamik skorlar + Mehmet Score)
- Risk metrik motoru: **volatilite**, **max drawdown**, **Sharpe-benzeri risk/getiri**
- Korelasyon motoru: **BIST bağımlılık skoru**, **altın bağımlılık skoru**
- Enflasyon koruması skoru (CPI-üstü getiri)
- Uzun vadeli performans skoru (net CAGR vs kategori medyanı)
- Çeşitlendirme katkısı skoru (kovaryans tabanlı, basit ilk versiyon)
- Mehmet Score = ağırlıklı toplam (persona'dan okur)
- Cache refresh cron'u (NAV + returns ingest sonrası)
- Monitoring (skor health view, ingest log)

### Dahil DEĞİL (Sprint-5+)

- ❌ UI ekranları (Fon Komitesi tablosu, fon detay sayfası, dashboard)
- ❌ Allocation recommendations
- ❌ AI yorum / komite notu
- ❌ Portföy entegrasyonu
- ❌ Realized lots stopaj uygulaması

---

## 2. Persona Sistemi

### 2.1 Tasarım Kararı: Parametrik tablo + Mehmet seed

`user_personas` tek user için tek default persona ile başlar. Çoklu persona (örn. "agresif Mehmet" / "savunmacı Mehmet") ileride aynı şemaya kolayca eklenir.

### 2.2 Şema

```sql
create table user_personas (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete cascade,
                                                   -- NULL = sistem geneli default
  name                     text not null,          -- 'Mehmet Default'
  is_default               boolean not null default false,

  -- Ağırlıklar (Mehmet Score formülü) — toplam = 1.0
  inflation_weight         numeric(5,4) not null,  -- 0.25
  tax_weight               numeric(5,4) not null,  -- 0.20
  risk_weight              numeric(5,4) not null,  -- 0.20
  long_term_weight         numeric(5,4) not null,  -- 0.20
  diversification_weight   numeric(5,4) not null,  -- 0.15

  -- Profil filtreleri (yatırımcı pencereleri)
  investment_horizon_years int,                    -- 5-10 (Mehmet için 7)
  max_volatility_pct       numeric(5,4),           -- üst sınır (örn 0.30)
  min_tax_confidence       text,                   -- 'LOW' / 'MEDIUM' / 'HIGH'
                                                   -- bu altındaki fonlar dışlanır (UI filtre)
  notes                    text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  constraint persona_weights_sum check (
    abs((inflation_weight + tax_weight + risk_weight +
         long_term_weight + diversification_weight) - 1.0) < 0.0001
  )
);
```

### 2.3 Seed — Mehmet Default

```sql
insert into user_personas
  (user_id, name, is_default,
   inflation_weight, tax_weight, risk_weight, long_term_weight, diversification_weight,
   investment_horizon_years, max_volatility_pct, min_tax_confidence,
   notes)
values
  (NULL, 'Mehmet Default', true,
   0.25, 0.20, 0.20, 0.20, 0.15,
   7, 0.30, 'MEDIUM',
   '47 yaş, 5-10 yıl vade, katılım uyumlu, enflasyona karşı koruma odaklı, aşırı risk yok');
```

`user_id IS NULL` = sistem default'u. User'ın kendi persona'sı yoksa default kullanılır.

### 2.4 Karar Noktası

❓ **Mehmet için kendi user_id'sine bağlı bir kopya mı, sistem default'u mu?**
- Önerim: **Sistem default** + ileride kullanıcı isterse override (`is_default=true` user_id'li satır). Sprint-4'te tek satır yeterli.

---

## 3. Risk Motoru

### 3.1 Volatilite

**Tanım:** günlük log-getiri standart sapması × √252 (yıllıklaştırılmış).

```
daily_returns[i] = ln(nav[i] / nav[i-1])
volatility_annualized = stdev(daily_returns) * sqrt(252)
```

**Pencere:** son **252 trading day** (~1 yıl).

**Çıktı (cache kolonu):** `volatility_1y` (ondalık form, 0.18 = %18 yıllık vol)

**Edge case:** 252 günden az veri → null + warning `"insufficient_history_vol"`.

### 3.2 Max Drawdown

**Tanım:** tepe-çukur arası en büyük yüzde düşüş, son N yıllık pencere içinde.

```
peak[i] = max(nav[0..i])
drawdown[i] = (nav[i] / peak[i]) - 1  // negatif
max_drawdown = min(drawdown[0..N])
```

**Pencere:** son **3 yıl** (~756 trading day). 3Y geçmişi yoksa elden çıkan pencere ile hesap, warning üret.

**Çıktı (cache kolonu):** `max_drawdown_3y` (ondalık, -0.25 = -%25)

### 3.3 Sharpe-Benzeri Risk/Getiri Skoru

**Sade tanım (risk-free kullanmadan):**

```
sharpe_like_1y = gross_1y / volatility_1y
```

> Klasik Sharpe = `(return − risk_free) / volatility`. Risk-free için TR'de TLREF kullanılır ama EVDS seri eklemek scope-creep. Sprint-4'te ratio sade tutulur; risk-free Sprint-5+'a ertelenebilir.

**Çıktı:** `sharpe_like_1y` (boyutsuz, yorum: yüksek = riske göre iyi).

### 3.4 Normalize Edilmiş Risk Skoru (0-100)

Mehmet Score'da `risk_weight` için kullanılır.

```
normalized_risk_score = clamp(0, 100, 100 × (1 − volatility_1y / 0.40))
```

- `vol = 0` → 100 (mükemmel)
- `vol = 0.40` (yıllık %40) → 0 (kötü)
- `vol > 0.40` → 0 (clamp)

> 0.40 üst sınırı katılım hisse fonlarının uzun-vadeli ortalama vol'üne yakın; persona profili "aşırı risk yok".

**Edge case:** vol null → risk_score null + warning.

---

## 4. Korelasyon Motoru

### 4.1 BIST Bağımlılık Skoru

**Tanım:** fonun günlük getirileri ile **XU100** günlük getirileri arasındaki **Pearson korelasyonu**, son 252 gün.

**Veri kaynağı:** mevcut `price_snapshots` tablosu (XU100 için `asset_class='equity_tr', symbol='XU100'`). Henüz yoksa, Sprint-4'te `benchmark_points` tablosu reuse edilir (zaten 0005_wealth.sql'de var).

**Hesap:**
```
fund_daily_returns = log-returns son 252 gün
xu100_daily_returns = aynı pencere, tarihlerle hizalı
correlation = pearson(fund_daily_returns, xu100_daily_returns)
bist_dependency_score = clamp(0, 100, correlation × 100)
```

- correlation `1.0` → 100 (tamamen BIST'e bağlı)
- correlation `0.0` → 0 (bağımsız)
- correlation negatif → 0 (clamp)

**Edge case:** ortak pencere < 60 trading day → null + warning.

### 4.2 Altın Bağımlılık Skoru

Aynı mantık, XU100 yerine **XAUTRY**. Veri: Truncgil v4 üzerinden zaman serisi yok; `benchmark_points` veya `price_snapshots`'ta XAU varsa kullanılır.

> ⚠️ **Karar noktası**: XAU TRY zaman serisi şu an düzenli kayıt edilmiyor. Sprint-4'te:
> - **Seçenek A**: Sprint-4'e bir `gold_price_snapshots` ingest mini-bileşeni ekle (her gün Truncgil GRA tek satır)
> - **Seçenek B**: Sprint-4'te gold_dependency null + warning; ileride Sprint-5'te ingest ekle
> - **Önerim**: **Seçenek B** — scope sade. UI'da "veri yok" rozeti. Persona ağırlığını koruyup eksik veri için fallback.

### 4.3 Default Universe Bias

Sprint-1 `funds.investment_universe` ile default bias zaten var (örn. `BIST_HISSE_TR` → BIST bağımlılık yüksek beklenir). Korelasyon hesabı **bunu doğrular**. Eğer veri yoksa universe'a göre default kullanılır:
- `BIST_HISSE_TR`, `BIST_KATILIM_30`, `SEKTOREL_BIST`, `TEKNOLOJI_HISSE` → default `bist_dep = 100`
- `ALTIN`, `KIYMETLI_MADEN_KARMA` → default `gold_dep = 100`
- Diğer → default `0`

Hibrit yaklaşım: cache'te `_default` ve `_computed` ayrı tutulur; UI'da hangisinin kullanıldığını badge gösterir.

---

## 5. Diğer Bileşen Skorları

### 5.1 Enflasyon Koruma Skoru

**Tanım:** son 1 yıl reel getiri ne kadar pozitif.

```
inflation_protection_score = clamp(0, 100, 50 + real_1y × 200)
```

- `real_1y = 0` → 50 (nötr — enflasyona yetişti)
- `real_1y = 0.25` (%25 üzeri) → 100 (mükemmel)
- `real_1y = -0.25` (%25 altı) → 0 (kötü)

**Edge case:** `real_1y` null → null + warning.

### 5.2 Stopaj Avantajı Skoru

**Sprint-1'deki yarı-statik `funds.tax_advantage_score`** (eğer Sprint-1'de eklenmediyse — kontrol et) yerine, dinamik hesap:

```
tax_advantage_score:
  HSYF_0_STOPAJ  → 100   (en yüksek)
  GENEL_17_5     → 30    (baseline)
  DOVIZ_BAZLI    → 50    (kur avantajı veya dezavantajı bilinmez)
  SERBEST_FON    → 25    (genelde yüksek + belirsiz)
  BELIRSIZ       → 0
```

> Sprint-1'de `funds.tax_advantage_score` eklenmedi (skor kolonları Sprint-4'e ertelendi). Bu skor `fund_returns_cache.applied_tax_kind`'tan türetilir.

### 5.3 Uzun Vadeli Performans Skoru

**Tanım:** 3Y net CAGR'ın kategori medyanına göre konumu.

```
long_term_performance_score = clamp(0, 100, 50 + vs_category_3y × 200)
```

- `vs_category_3y = 0` → 50 (medyan)
- `vs_category_3y = +0.25` (%25 üstün) → 100
- `vs_category_3y = -0.25` → 0

**Veri:** Sprint-3'teki `fund_returns_cache.vs_category_3y` (brüt CAGR kullanıyor; Sprint-4'te aynı pencere için **net** vs_category eklenmeli — schema değişikliği).

> 🔧 **Schema ekleme**: `fund_returns_cache.vs_category_net_3y` ve `vs_category_net_1y` kolonları eklenmeli. PR-2'nin küçük bir uzantısı.

### 5.4 Çeşitlendirme Katkısı Skoru

**Sprint-4 sade versiyonu (önerilen):**

> Kullanıcının mevcut portföyüne bakmadan, fonun **universe çeşitliliği** üzerinden tek-rakam skor.

```
diversification_score:
  ALTIN, GUMUS, KIYMETLI_MADEN_KARMA   → 80 (BIST'ten ayrı)
  KIRA_SERTIFIKASI_TRY/FX              → 75
  COKLU_VARLIK, FON_SEPETI             → 90
  KATILIM_PARA_PIYASASI                → 60
  BIST_HISSE_TR, SEKTOREL_BIST         → 30 (BIST yoğun)
  DOVIZ_SERBEST_USD/EUR                → 70 (FX hedge)
  ARBITRAJ, DIGER                      → 50
```

**Tam versiyon (Sprint-6+):** kullanıcının mevcut portföy kovaryans matrisi + marjinal katkı. Sprint-4'te sade tablo yeterli.

---

## 6. Mehmet Score

### 6.1 Formül

Persona ağırlıkları (toplam = 1.0):

```
mehmet_score =
   inflation_weight        * inflation_protection_score
 + tax_weight              * tax_advantage_score
 + risk_weight             * normalized_risk_score
 + long_term_weight        * long_term_performance_score
 + diversification_weight  * diversification_score
```

Tüm bileşenler 0-100 ölçeğinde, ağırlıklı toplam da 0-100.

### 6.2 Eksik Bileşen Davranışı

Bileşenlerden biri null ise:
- **Seçenek A (sıkı):** mehmet_score null
- **Seçenek B (esnek):** mevcut bileşenleri kullan, ağırlıkları normalize et, warning ekle

**Önerim: Seçenek B** — bir veya iki bileşen eksik olsa bile yaklaşık skor üretilir. Warning'le şeffaflık.

```
available_weights = sum(weights where component is not null)
adjusted_score = sum(weight_i × component_i) / available_weights × 100
```

### 6.3 Karar Noktası

❓ **Min veri gereksinimi**: bileşenlerin kaçı null olabilir? Önerim: en az **3/5 bileşen** dolu olmalı, yoksa mehmet_score null + warning `"insufficient_components"`.

---

## 7. `fund_scores_cache` Şeması

```sql
create table fund_scores_cache (
  fund_code               text not null references funds(code) on delete cascade,
  as_of                   date not null,
  persona_id              uuid not null references user_personas(id) on delete cascade,

  -- Risk metrikleri (ham)
  volatility_1y           numeric(10,6),
  max_drawdown_3y         numeric(10,6),
  sharpe_like_1y          numeric(10,6),

  -- Korelasyon metrikleri (ham)
  bist_correlation_1y     numeric(6,4),         -- pearson korelasyon, ham
  gold_correlation_1y     numeric(6,4),
  bist_source             text,                  -- 'computed' / 'default_from_universe'
  gold_source             text,

  -- 0-100 normalize bileşen skorları
  inflation_protection_score   int check (inflation_protection_score between 0 and 100),
  tax_advantage_score          int check (tax_advantage_score between 0 and 100),
  normalized_risk_score        int check (normalized_risk_score between 0 and 100),
  long_term_performance_score  int check (long_term_performance_score between 0 and 100),
  diversification_score        int check (diversification_score between 0 and 100),
  bist_dependency_score        int check (bist_dependency_score between 0 and 100),
  gold_dependency_score        int check (gold_dependency_score between 0 and 100),

  -- Kompozit
  mehmet_score                 int check (mehmet_score between 0 and 100),

  -- Metadata
  computed_at             timestamptz not null default now(),
  warnings                text[] not null default '{}'::text[],
  components_used         int,                  -- mehmet_score'da kullanılan bileşen sayısı

  primary key (fund_code, as_of, persona_id)
);

create index fund_scores_cache_persona_idx on fund_scores_cache(persona_id, as_of desc);
create index fund_scores_cache_mehmet_idx on fund_scores_cache(persona_id, mehmet_score desc);
```

**Persona PK'da** çünkü her persona aynı fon için farklı Mehmet Score üretir (ağırlıklar farklı).

### `v_fund_scores_latest` view

Default persona için her fonun son skor satırı:

```sql
create or replace view v_fund_scores_latest as
select distinct on (fund_code, persona_id) *
from fund_scores_cache
order by fund_code, persona_id, as_of desc;
```

---

## 8. Hesap Akışı (Cron / Manuel)

Endpoint: `/api/cron/fund-scores-refresh`

**Adımlar:**
1. Aktif persona'ları çek (Sprint-4'te sadece Mehmet Default)
2. `fund_returns_cache` son satırlarını al (her fon için)
3. `fund_prices` son ~3 yıl NAV serisi (volatilite + MaxDD + korelasyon için)
4. `benchmark_points` veya `price_snapshots` XU100 + XAUTRY son ~1 yıl (korelasyon)
5. Her fon × her persona için:
   - Risk metrikleri (vol, MaxDD, Sharpe-benzeri)
   - Korelasyonlar (BIST, altın)
   - 0-100 skorlar
   - Mehmet Score
   - Warning toplama
6. `fund_scores_cache`'a batch UPSERT (`onConflict: fund_code, as_of, persona_id`)
7. `fund_scores_ingest_log`'a sonuç satırı

**Cron schedule:** `"0 18 * * *"` (UTC 18:00 = TR 21:00). Returns refresh TR 20:00'da; bir saat sonra skorlar.

---

## 9. Sprint-4 PR Bölünmesi

| PR | İçerik |
|---|---|
| **PR-1** | `user_personas` tablo + Mehmet seed + persona-actions |
| **PR-2** | Risk motoru (pure logic: vol, MaxDD, Sharpe-like) + birim test |
| **PR-3** | Korelasyon motoru + benchmark veri kontrolü (XU100 var, gold fallback) |
| **PR-4** | Component score'lar (inflation, tax, long-term, diversification) + Mehmet Score |
| **PR-5** | `fund_scores_cache` schema + DB motor (refresh) |
| **PR-6** | Cron + monitoring (`fund_scores_ingest_log` + `v_fund_scores_health` + UI'da Veri Durumu sekmesine "Skor refresh" özeti) |

Her PR bir önceki PR'a bağlı. Toplam ~6 PR, her biri 100-300 satır.

> 🔧 Alternatif: PR-2, PR-3, PR-4 birleştirilebilir ("Motor PR'ı") → toplam **4 PR**. Bölme tercihi senin.

---

## 10. Karar Noktaları (Onayın Lazım)

1. **Persona modeli:** sistem-default tek satır + ileride user override OK mi? Önerim: ✅ evet.
2. **Volatilite üst sınırı (0.40 normalize)** uygun mu? Daha yumuşak/sıkı yapılabilir.
3. **Gold dependency skoru:**
   - **(A)** Sprint-4'e XAUTRY ingest mini-bileşeni ekle
   - **(B)** Şimdilik null + warning, Sprint-5'te ingest *(önerim)*
4. **Eksik bileşen davranışı:** Esnek (önerim) vs sıkı (tüm bileşenler dolu olmalı)?
5. **`vs_category_net_1y/3y` kolonları:** PR-2'ye uzantı olarak Sprint-4 PR-1'e mi ekleyelim, yoksa Sprint-3 PR-2'yi mi reopen edelim? Önerim: **Sprint-4 PR-1'in içine küçük migration ekle** (`alter table fund_returns_cache add column ...`).
6. **PR bölünmesi:** 6 küçük PR mı 4 birleşik PR mı?
7. **Çeşitlendirme skoru:** Sprint-4 sade tablo (universe-bazlı) yeterli mi, kovaryans Sprint-6'ya ertelenebilir mi?
8. **Sharpe-benzeri:** risk-free olmadan ratio (önerim) mi, EVDS TLREF ingest mi?
9. **`min_tax_confidence` filtresi:** persona alanı olarak burada mı (UI filtre için), yoksa sadece UI'da mı?
10. **Mehmet Score normalizasyon:** `clamp(0,100)` mu, yoksa skorların gerçek dağılımına göre persentil mi (örn. en yüksek %100, en düşük %0)? Önerim: **clamp** — kararlılık.

---

## 11. Sprint-4 Definition of Done

- ✅ `user_personas` + `fund_scores_cache` migration'ları
- ✅ Tüm risk + korelasyon + skor hesapları pure func + birim test (en az 30 yeni test)
- ✅ Mehmet Default persona ile refresh çalışıyor, cache 155 fon için dolar
- ✅ `npm run tefas:quality` benzeri bir `tefas:scores:report` (opsiyonel, PR-6'da)
- ✅ Daily cron schedule (`/api/cron/fund-scores-refresh`)
- ✅ Monitoring view (`v_fund_scores_health`)
- ✅ Sprint-5 (UI) için güvenilir skor verisi

Sprint-5'e geçilmeden önce yine bir gate kontrolü (sağlık raporu) yapılacak — Sprint-3'ün aynısı pattern.
