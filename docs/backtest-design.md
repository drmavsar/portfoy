# Mehmet Score Backtest — Tasarım Dokümanı

**Sprint:** 5.5 PR-5 — yalnız tasarım (kod yok)
**Hedef sprint:** 5.6 (implementasyon)
**Tarih:** 2026-05-31

---

## 1. Amaç

Mehmet Score, gerçek veriyle (5Y NAV history + 100 fonda dolu
`inflation_protection_score`) ilk kez kullanıma hazır hale geldi. Sprint-6'da
allocation recommendation motoru başlamadan önce **skor stratejisinin geçmişte
nasıl performans gösterdiği** sorusuna cevap aramak istiyoruz.

> "Bu tarihte Mehmet Score Top 10 fonları seçilseydi bugün sonuç ne olurdu?"

Bu doküman backtest **metodolojisini** belirler — kod yok. Sprint-5.6'da
implementasyon PR'ı bu dokümana referansla açılır.

## 2. Hipotez

H1 — **Mehmet Score Top 10 stratejisi**, **kategori medyanı** ve **eşit ağırlıklı
geniş katılım fonu sepeti** üzerinde, **uzun dönemde (3-5Y) reel getiri
bakımından üstünlük** sağlar.

H2 — Strateji, **dönem bağımsız** çalışır — 2022, 2023, 2024, 2025 başlangıçlı
4 senaryoda **3'ünde** medyanı geçer.

Reddedildiğinde: skor formülünün yeniden kalibrasyonu (Sprint-5.5 PR-4 ile
yapıldı) ya da component ağırlıklarının revizyonu Sprint-6 öncesi tartışılır.

---

## 3. Rolling Başlangıç Tarihleri

Tek tarih (örn. 2024-01-02) yanıltıcı — strateji o özel piyasa rejimine
kalibre olmuş olabilir. **4 başlangıç tarihi** ile rejim stres testi yapılır.

| Başlangıç | Bitiş | Window | Türkiye piyasa rejimi (kısa not) |
|---|---|---|---|
| **2022-01-03** | 2026-05-26 | ~4.5Y | Yüksek enflasyon başlangıcı, lira düşüşü hızlanıyor |
| **2023-01-02** | 2026-05-26 | ~3.5Y | Faiz şokları, deprem sonrası, USDTRY 18→27 |
| **2024-01-02** | 2026-05-26 | ~2.5Y | TCMB sıkı para başlangıcı, dezenflasyon yön değişimi |
| **2025-01-02** | 2026-05-26 | ~1.5Y | Yakın dönem, reel faiz pozitif |

Her başlangıç ayrı bir backtest run'ı. 4 sonucun **karşılaştırma matrisi**
çıktı.

**Stabilite kontrolü (opsiyonel — Sprint-5.6):** Her başlangıç tarihinden ±1
hafta ofsetli 2 ek tarih (ör. 2024-01-09, 2023-12-26) ile sonuç dalgalanması
ölçülür. Top 10 seçiminin yarım hafta öncesi/sonrası ile değişmemesi
beklenir.

---

## 4. Universe ve Look-Ahead Bias

### 4.1 O tarihte aktif fonlar (survivorship-free universe)

Backtest'in en kritik tasarım kararı: **2022-01-03'te seçim yaparken
2026-05'te aktif olan fonların listesi kullanılamaz** (survivorship bias).

**Mevcut durum (eksik):** `funds.is_active` tek bir bayrak — bugünki durum.
KRA 2026 başında delisted oldu ama `is_active=true`. Tarihsel
"o tarihte aktif miydi" bilgisi yok.

**Pre-requisite — Sprint-5.6:**
- Yeni tablo `fund_status_history` öneriliyor:
  ```
  fund_code text, effective_from date, effective_to date | null,
  status enum('active','delisted','suspended','new_listing')
  ```
- KRA için manuel insert: `2026-02-28, delisted` (DNP gibi geçici timeout'lar
  hariç).
- TEFAS backfill'i yeni fon kodu görürse → `new_listing` insert.
- TEFAS `empty_result` N kez ardışık → `delisted` adayı (manuel onay).

**Şimdilik (5Y backfill ile elde olan):** Hangi fonların hangi tarihte
NAV satırı var bilgisinden universe çıkartılabilir:
```
universe(at_date) = funds WHERE EXISTS (
  SELECT 1 FROM fund_prices
  WHERE fund_code = funds.code AND as_of = at_date
)
```
Bu yaklaşım **yaklaşık** (TEFAS hafta sonu yayın yok, ±5 gün tolerans gerek)
ama survivorship'i ciddi ölçüde azaltır.

### 4.2 Skor hesabı look-ahead'siz

`computeFundReturns` ve `computeMehmetScore` zaten **as_of parametresi
alıyor** — bu doğru. Sprint-5.6 implementasyonunda:

- `series` parametresi as_of'tan **önceki** NAV'larla sınırlanır
  (slice)
- CPI `cpi.filter(period_month <= as_of)` ile filtrelenir
- `tax_rules` zaten `effective_from/to` taşıyor — doğru çek
- `category_id` o tarihte doğru olmalı (kategori değişiklikleri varsa)

### 4.3 Look-ahead bias kaynakları listesi

| # | Kaynak | Risk | Önleme |
|---|---|---|---|
| 1 | NAV serisi → as_of sonrası satırlar dahil | Yüksek | `series.filter(as_of <= run_date)` |
| 2 | CPI → as_of sonrası yayınlar dahil | Orta | `cpi.filter(period_month <= run_date)` |
| 3 | **Survivorship — sadece bugün aktif fonlar** | Çok Yüksek | `fund_status_history` ile o tarihteki universe |
| 4 | **`funds.is_active` snapshot** | Yüksek | Aynı — `fund_status_history` |
| 5 | Kategori değişiklikleri (fon kategori değiştirir) | Düşük | Şimdilik göz ardı; doc'a not |
| 6 | Tax rule değişiklikleri | Düşük | `fund_tax_rules.effective_from/to` zaten doğru |
| 7 | Benchmark history → as_of sonrası benchmark değerleri | Orta | `benchmark_points.filter(as_of <= run_date)` |

**Madde 3 ve 4** en kritik — gerçek backtest için `fund_status_history`
implementasyonu Sprint-5.6 ön koşulu.

---

## 5. Portföy İnşası

### 5.1 Top 10 seçimi

- Her rebalance noktasında: o tarihte aktif fonlar arasından `mehmet_score
DESC` ilk 10
- **components_used ≥ 3** filtresi zorunlu (eksik component'li fonlar
  dışarda)
- **Ties:** `mehmet_score` eşitse `components_used DESC` sonra `fund_code
ASC` tie-breaker

### 5.2 Ağırlıklandırma

- **İlk versiyon: equal weight** (her fon %10)
- Skor-ağırlıklı (`score / sum(scores)`) versiyon Sprint-6'da
  değerlendirilir; ilk versiyonda karşılaştırma karmaşıklığını artırır

### 5.3 Rebalancing

- **Default: üç aylık** (her takvim çeyreğinin 1. iş günü: Ocak/Nisan/Temmuz/Ekim)
- Alternatif scenariolar:
  - Aylık (turnover yüksek, işlem maliyeti baskın olabilir)
  - Yıllık (turnover düşük ama strateji yavaş tepki verir)
- 4 başlangıç × 3 rebalance = 12 çalıştırma — matriksin bir boyutu

### 5.4 İşlem maliyeti

İlk versiyonda **sıfır işlem maliyeti** varsayımı (TEFAS fonlarda alım-satım
ücreti çoğunlukla yok ama yönetim ücreti NAV'a içkin).

Sprint-6'da gerçekçi maliyet modeli eklenebilir:
- Yönetim ücreti zaten NAV içinde
- Stopaj satışta — `realized_lots` mantığı kullanılır
- Spread yok (TEFAS aynı NAV'dan alım-satım)

---

## 6. Benchmark Seti

Strateji performansını **6 referans** ile karşılaştır:

| Benchmark | Tablo | Veri durumu |
|---|---|---|
| BIST 100 (`XU100`) | `benchmark_series` + `benchmark_points` | Tablo var; **5Y backfill YOK** — pre-req |
| Gram altın (`XAUTRY`) | aynı | Aynı — pre-req |
| USD/TRY (`USDTRY`) | aynı | Aynı — pre-req |
| EUR/TRY (`EURTRY`) | aynı | Aynı — pre-req |
| CPI (TÜFE) | `cpi_monthly` | ✓ 193 satır 2010-01 → 2026-01 |
| Kategori medyanı | runtime hesap | `fund_returns_cache.vs_category_*` mevcut, backtest için as-of versiyon gerek |

**Pre-requisite — Sprint-5.6:**
- `benchmark_points` 5Y backfill cron route (`/api/cron/benchmark-backfill`)
- Kaynak: BIST/XAU/USD için TCMB EVDS veya Investing.com (manuel CSV de
  kabul edilebilir tek seferlik)
- ~5 × 1250 = ~6250 satır — küçük ingest

---

## 7. Çıktı Metrikleri

Her backtest run'ı (4 başlangıç × N rebalance stratejisi) için aşağıdaki
metrikler hesaplanır:

| Metrik | Formül / Açıklama |
|---|---|
| `total_return` | (sonNAV - başNAV) / başNAV |
| `cagr` | (sonNAV/başNAV)^(1/yıl) - 1 |
| `max_drawdown` | min(peak'ten sapma) — risk göstergesi |
| `volatility` | günlük log return std × √252 |
| `sharpe_like` | (cagr - rf) / volatility (rf = TLREF avg) |
| `vs_benchmark_alpha` | strategy_cagr - benchmark_cagr |
| `vs_cpi_real_cagr` | Fisher: (1+cagr)/(1+cpi_cagr) - 1 |
| `turnover` | Her rebalance'da değişen fon sayısı / 10 (turnover ratio) |
| `top10_overlap` | İki ardışık rebalance'ın kesişimi (devamlılık göstergesi) |

---

## 8. Çıktı Format

### 8.1 Matrix — 4 başlangıç × 6 benchmark

```
              CAGR    vs XU100   vs XAU    vs USDTRY  vs CPI  vs CatMed
2022-01-03    %X      +%A        -%B       +%C        +%D     +%E
2023-01-02    %X      ...
2024-01-02    %X      ...
2025-01-02    %X      ...
```

### 8.2 Detay tablo (her run için)

- Top 10 holdings her rebalance tarihinde
- Turnover & top10_overlap zaman serisi
- Strateji NAV vs benchmark NAV grafiği

### 8.3 Özet metrik

- Kaç senaryoda XU100 yenildi? (örnek hedef: 4/4 enflasyon, 3/4 BIST)
- Kaç senaryoda kategori medyanı yenildi? (hedef: 4/4 katılım hisse)
- Sharpe avg, max DD avg

---

## 9. Sprint-5.6 Pre-Requisite Listesi

Backtest implementasyon PR'ları başlamadan önce **mutlaka** tamamlanmalı:

| # | İş | Sprint-5.6 PR sırası |
|---|---|---|
| A | `fund_status_history` tablosu (migration) | PR-A.1 |
| B | KRA için manuel `delisted` insert | PR-A.1 |
| C | TEFAS backfill route'una `new_listing` kayıt mantığı | PR-A.2 |
| D | `benchmark_points` 5Y backfill cron route | PR-A.3 |
| E | XU100/XAUTRY/USDTRY/EURTRY tarihsel veri ingest | PR-A.3 |
| F | `computeFundReturns` ve `computeMehmetScore` için **as-of** mode (parametre zaten var, kullanım doğrula) | PR-A.4 |
| G | `getActiveFundsAtDate(date)` helper | PR-A.4 |
| H | Backtest engine (`runBacktest(start_date, rebalance_period, top_n)`) | PR-B.1 |
| I | `backtest_runs` + `backtest_holdings` tabloları | PR-B.1 |
| J | `/fonlar/backtest` UI — matrix + detay tablo + grafik | PR-B.2 |

Tahmini sprint-5.6 effort: PR-A (1-2 gün), PR-B (3-4 gün). Toplam: **1
hafta**.

---

## 10. Riskler ve Sınırlamalar

| # | Risk | Etki | Mitigation |
|---|---|---|---|
| 1 | Survivorship bias — `fund_status_history` eksik kalırsa | Çok Yüksek | Sprint-5.6 PR-A.1 zorunlu blocker |
| 2 | Look-ahead — as_of cutoff yanlış uygulanırsa skor olduğundan iyi görünür | Yüksek | Code review check-list; unit test asserts |
| 3 | Backtest 4 senaryoda çelişkili sonuç → "skor güvenilmez" sonucu | Orta | Bu beklenen — rejim bağımsız strateji bulmak garantili değil; sonuçlar açık raporlanır |
| 4 | Benchmark backfill veri kaynağı bulunamazsa | Orta | EVDS USD/EUR/Altın var; BIST için investing.com manuel CSV son çare |
| 5 | Equal weight basitleştirmesi gerçek portföy davranışını yansıtmaz | Düşük | Sprint-6'da skor-ağırlıklı versiyon |
| 6 | İşlem maliyeti yok — turnover yüksekse strateji şişer | Orta | İlk versiyon "ideal upper bound", maliyet sonraki PR'da |
| 7 | Kategori medyanı benchmark'i — kategori değişen fonlar yanlış sınıflanır | Düşük | Şimdilik snapshot kategori; doc'a sınırlama olarak yaz |
| 8 | CPI fallback kullanılırsa "real" metrikler yanıltıcı | Düşük | Backtest çıktısında her noktada `cpi_lag_months` görünür |
| 9 | TÜİK CPI revize edilirse geçmiş skorlar değişir | Düşük | `cpi_monthly.is_final` flag'i; revize varsa run'lar tekrar |

---

## 11. Açık Kararlar (Sprint-5.6 başlamadan onay gerekli)

1. **Top N: 10 mu 5 mi 20 mi?** — Önerim: **10** (yeterli çeşitlendirme + yorum
   yapılabilir liste boyutu)
2. **Rebalance period default: 3 ay** — değişiklik istiyorsan belirt
3. **Risk-free rate**: TLREF mi sabit %X mi? — Önerim: TLREF günlük ortalama
   (mevcut değil → 5.6'da ingest)
4. **Backtest UI:** `/fonlar/backtest` sayfası mı, yoksa kalibrasyon
   ekranına entegre mi? — Önerim: ayrı sayfa, kalibrasyon ile çapraz link
5. **Eşit ağırlık vs skor ağırlıklı vs ters volatilite** — İlk versiyon sadece
   eşit, çoklu strateji Sprint-6
6. **Kategori filtreli backtest** (sadece HSYF veya sadece katılım hisse) —
   Sprint-6 sonrası, bu doc'ta sadece "ileride" notu

---

## 12. Acceptance Criteria (Sprint-5.6 implementasyon için)

PR-A:
- `fund_status_history` tablosu + migration + RLS
- KRA için `delisted` insert
- TEFAS backfill `new_listing` mantığı çalışıyor
- `benchmark_points` 5Y backfill — XU100 + XAUTRY + USDTRY + EURTRY için
  en az 1Y veri (öncelik: XU100)
- `getActiveFundsAtDate(date)` helper + 5 birim test

PR-B:
- `runBacktest({ start_date, end_date, rebalance, top_n })` çağrısı çalışıyor
- 4 başlangıç × default rebalance run'larının çıktısı `backtest_runs` ve
  `backtest_holdings`'a yazılıyor
- `/fonlar/backtest` sayfası matrix tablosu + 1 grafik render eder
- Look-ahead bias unit test'leri: "2022 run'ında 2025 NAV'ı kullanılmadığı"
  doğrulanır
- Survivorship bias unit test'i: "KRA 2022 run'unda universe'de, 2026 run'unda
  yok" doğrulanır

---

## 13. İleride (Sprint-6+ kapsamına ertelenen)

- Skor ağırlıklı portfoy
- Stop-loss / take-profit kuralları
- Ters volatilite ağırlıklı
- Persona-bazlı backtest (her preset için ayrı strateji)
- Monte Carlo: rebalance günü ±7 gün rasgele
- Out-of-sample test (eğitim/değerlendirme dönem ayrımı)

---

**Karar bekleyen:** §11'deki 6 açık karar. User onayı sonrası Sprint-5.6
implementasyon PR'ları açılır.
