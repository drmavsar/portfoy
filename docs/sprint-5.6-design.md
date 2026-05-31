# Sprint-5.6 — Backtest Engine + Benchmark Framework + Backtest UI

**Versiyon:** v5 (FINAL — DESIGN FROZEN)
**Tarih:** 2026-05-31
**Önceki referans:** `docs/backtest-design.md` (Sprint-5.5 PR-5, kısa tasarım)

> ⚠ **Bu doküman dondurulmuştur.** v1 → v5 arası 4 revizyon yapıldı. Yeni
> tasarım fikirleri Sprint-5.7 veya Sprint-6 sonrasına ertelenir.

---

## 1. Hedef

> "Mehmet Score Top 10 stratejisi geçmişte gerçekten işe yarıyor muydu?"

Sprint-6 (allocation + portföy entegrasyonu) **bu sorunun veriyle cevabı**
olmadan başlamaz. Mehmet Score'un anlamlı alpha üretip üretmediğini
**4 rolling senaryoda** stres testi yapılır.

---

## 2. Mevcut Durum (Sprint-5.5 sonrası)

- 154 aktif fon, KRA delisted exception
- 97k NAV satırı, 5Y history (2021-05-26 → 2026-05-26)
- 137/154 fonda Mehmet Score, 100 fonda inflation_protection
- `fund_scores_history` (PR-2) append-only — Forward Test + Komite Arşivi besler
- `score-explain` + `calibration-sim` (PR-1) — komite arşivi runtime için hazır
- CPI fallback aktif (TB-1)

**Eksiklikler — Sprint-5.6 hedef:**
- Geçmişe yönelik strateji simülasyonu yok
- Benchmark tarihsel verisi yok (`benchmark_points` boş)
- Survivorship koruması yok (`fund_status_history` yok)
- Sprint-6 için karar verici metrik yok

---

## 3. Teknik Tasarım

### 3.1 İki strateji karşılaştırması

| Strategy | Formül |
|---|---|
| `equal_weight` | `w_i = 1/N` |
| `score_weighted` | `w_i = score_i / sum(score_j)` + **max_weight_cap = 0.20** iteratif redistribute |

`MAX_WEIGHT_CAP = 0.20` kod sabiti (parametrik değil, Sprint-7 UI opt).

### 3.2 İki fazlı matrix yaklaşımı

| Faz | Kapsam | Run | Süre | Tetik |
|---|---|---|---|---|
| **Faz-1 Baseline** | Top10 · 3ay · 2 strateji · 4 başlangıç | 8 | ~80 sn | Manuel buton |
| **Faz-2 Optimizasyon** | TopN(5/10/20) × Rebalance(1/3/6/12 ay) × 2 strateji × 4 başlangıç | 96 (8 Faz-1 + 88 yeni) | ~16 dk | Manuel "Optimize Et" |

**Faz-1 otomatik trigger YOK** — kullanıcı bilinçli başlatır.

### 3.3 Risk-free rate öncelik zinciri

1. **TLREF** (varsa `tlref_daily`)
2. **KPPF Medyanı** — Katılım Para Piyasası kategorisi runtime medyan
3. **Sabit %30** fallback (son çare, warning ile)

`backtest_runs.summary.risk_free_source` alanı tutar.

### 3.4 Confidence Score + Alpha Strength

**Confidence Score** — win ratio (0-100):

```
For each benchmark b:
  win_count_b = sum(1 for s in 4_scenarios if best_strategy_alpha(s, b) > 0)
  confidence_b = win_count_b / 4 × 100
overall_confidence = mean(confidence_b for b in 7_benchmarks)
```

**Alpha Strength** — büyüklük metriği (per benchmark):

```
median_alpha_b = median(alpha_s for s in 4_scenarios)
mean_alpha_b   = mean(alpha_s for s in 4_scenarios)
```

UI'da **ana ekran sadece median** gösterir; mean detay açılır panelde.

`best_strategy_alpha(s, b)` = `max(equal_weight_alpha, score_weighted_alpha)`.

### 3.5 Forward Test modülü

**Veri kaynağı:** `fund_scores_history` (PR-2 cache).

**5 KPI:**
1. Top10 Stabilitesi — `1 - avg(daily_turnover)`, 1'e yakın stabil
2. Ortalama Elde Tutma Süresi — bir fonun Top N'de kalma ortalama gün sayısı
3. İlk 3 Fon Değişim Sıklığı — ay başına Top 3 değişen fon sayısı
4. Turnover — toplam fon değişimi / dönem
5. **Top10 Koruma Oranı (30 gün)** — `|top10(t0) ∩ top10(t0+30g)| / 10 × 100`

Anlamlı sonuç için **minimum 30 gün history** gerekli (Sprint-5.5 deploy = 2026-05-30 başlangıç → 2026-06-30 itibariyle).

### 3.6 Komite Karar Arşivi

`fund_scores_history` üzerinde **read-only derive** (yeni tablo gerekmez).

Tarih başına gösterim:
- Top 10 listesi + score-explain runtime (strengths, kategori rozet)
- Komite bayrakları (CPI fallback vb.)
- **Delta paneli** (bir önceki güne göre):
  - Yeni giren fonlar
  - Çıkan fonlar
  - En büyük 3 skor artışı
  - En büyük 3 skor düşüşü

Print-friendly CSS (`@media print`). Manuel notlar Sprint-7+.

---

## 4. Veri Modeli

### 4.1 Yeni tablolar

#### `fund_status_history`
```sql
fund_code text REFERENCES funds(code),
effective_from date NOT NULL,
effective_to date NULL,
status enum('active','delisted','suspended','new_listing'),
reason text,
created_at timestamptz DEFAULT now(),
PRIMARY KEY (fund_code, effective_from)
```
Seed: tüm fonlar baseline `active`; KRA için `delisted` (effective_to=2026-02-28).

#### `benchmark_ingest_log`
```sql
id bigserial PRIMARY KEY,
ran_at timestamptz DEFAULT now(),
series_code text,
duration_ms int,
fetched_periods int,
succeeded boolean,
error text,
triggered_by text
```

#### `tlref_daily` (opsiyonel, EVDS validation onaylarsa)
```sql
as_of date PRIMARY KEY,
value numeric(8,4) NOT NULL,
source text DEFAULT 'TCMB_EVDS',
fetched_at timestamptz DEFAULT now()
```

#### `backtest_runs`
```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
created_at timestamptz DEFAULT now(),
params jsonb NOT NULL,
summary jsonb NOT NULL,
final_nav numeric,
total_rebalances int,
universe_size_avg int,
duration_ms int,
ok boolean,
error text
```

#### `backtest_rebalances`
```sql
run_id uuid REFERENCES backtest_runs(id) ON DELETE CASCADE,
rebalance_date date NOT NULL,
universe_size int,
top_n_codes text[],
top_n_scores int[],
top_n_weights numeric[],
portfolio_nav numeric,
turnover numeric,
overlap_with_prev numeric,
PRIMARY KEY (run_id, rebalance_date)
```

#### `backtest_nav_series`
```sql
run_id uuid REFERENCES backtest_runs(id) ON DELETE CASCADE,
as_of date NOT NULL,
portfolio_nav numeric,
xu100_nav numeric,
xau_nav numeric,
usd_nav numeric,
eur_nav numeric,
cpi_index numeric,
kat_fon_sepeti_nav numeric,
kat_kategori_median_nav numeric,
PRIMARY KEY (run_id, as_of)
```

### 4.2 Yeni view'ler

#### `v_backtest_confidence`
Cross-run pivot — UI doğrudan okur.

#### `v_backtest_matrix_summary`
TopN × Rebalance × Strategy heatmap için pivot.

### 4.3 Mevcut kullanılan tablolar
- `fund_prices`, `cpi_monthly`, `funds`, `fund_tax_rules`, `fund_scores_history`

---

## 5. Backtest Engine Mimarisi

### 5.1 İmza

```ts
async function runBacktest(params: BacktestParams): Promise<BacktestResult>

type BacktestParams = {
  start_date: string;
  end_date: string;
  rebalance_days: number;          // 30 | 90 | 180 | 365
  top_n: number;                   // 5 | 10 | 20
  strategy: "equal_weight" | "score_weighted";
  persona_id: string;
  category_filter: number | null;
  min_components: number;          // default 3
  risk_free_source?: "TLREF" | "KPPF_MEDIAN" | "FIXED_30" | "AUTO";
}
```

### 5.2 Algoritma (look-ahead-safe)

```
1. dates = computeRebalanceDates(start, end, rebalance_days)
2. Pre-fetch (5Y NAV + CPI + status_history + tax_rules + 4 benchmark)
3. portfolio = { units_by_code: {}, cash: 100 }
4. For each rebalance_date:
     universe = getActiveFundsAtDate(rebalance_date, status_history)
     scores = []
     For each fund in universe:
       series_cut = NAV.filter(as_of <= rebalance_date)
       cpi_cut    = CPI.filter(period <= rebalance_date)
       returns    = computeFundReturns(series_cut, { cpi: cpi_cut, asOf: rebalance_date })
       risk       = computeFundRiskMetrics(series_cut, returns.gross_1y)
       components = buildComponents(returns, risk, fund.universe, persona)
       mehmet     = computeMehmetScore(components, persona_weights)
       if score != null && components_used >= min_components:
         scores.push(...)
     scores.sort(...)  # tie-break: score / net_1y / code
     topN = scores.slice(0, top_n)
     weights = STRATEGIES[strategy].buildWeights(topN)
     # equal_weight: 1/N; score_weighted: applyCap(scores/sum, 0.20)
     Sell old positions at rebalance_date NAV
     Buy new topN with weights
     record_rebalance(run_id, rebalance_date, topN, weights, ...)
     For each day until next_rebalance: store_nav_point(...)
5. Compute metrics + INSERT backtest_runs
```

### 5.3 Look-ahead bias enforcement
Test suite spy ile NAV/CPI fetch'in tarih kesimi assert.

### 5.4 Helper'lar
- `computeRebalanceDates` · `getActiveFundsAtDate` · `computeBacktestMetrics`
- `applyCap(weights, MAX_WEIGHT_CAP=0.20)` — saf, ≤10 iterasyon
- `computeConfidenceScore(persona_id, top_n, rebalance_days)` — cross-run
- `getRiskFreeRate(start, end, source)` — fallback zinciri

### 5.5 Performance
- 1 run: ~10-15 sn
- Faz-1 8 run: ~80 sn (single HTTP, Vercel 300s içinde)
- Faz-2 88 run: ~15 dk (UI orchestration, resume-safe)

---

## 6. Benchmark Mimarisi

### 6.1 7 Benchmark (YCY KALDIRILDI)

| # | Kod | Kaynak |
|---|---|---|
| 1 | `XU100` | EVDS → `benchmark_points` |
| 2 | `XAUTRY` | EVDS → `benchmark_points` |
| 3 | `USDTRY` | EVDS → `benchmark_points` |
| 4 | `EURTRY` | EVDS → `benchmark_points` |
| 5 | `CPI_TR` | `cpi_monthly` (mevcut) |
| 6 | `KAT_KATEGORI_MEDIAN` | runtime (kategori filtre varsa) |
| 7 | **`KAT_FON_SEPETI`** | runtime (synthetic equal-weight basket) |

### 6.2 EVDS Generic Adapter (PR-A)
```ts
fetchEvdsSeries(seriesCode, start, end, { apiKey, baseUrl, fetchImpl?, frequency? })
```
PR-0 (EVDS validation doc) onaylanmış kodlar kullanılır.

### 6.3 KAT_FON_SEPETI runtime hesap
```ts
computeKatFonSepetiSeries(start, end, activeFundsAtDate) → DailyNavPoint[]
```
Her gün için: `nav[d] = mean(fund_nav[d] / fund_nav[start])` aktif fonlar üzerinde.

### 6.4 KPPF Medyanı (risk-free fallback)
```ts
computeKppfMedianReturn(fundReturns, fundsByCategory, asOf) → number | null
```
"Katılım Para Piyasası Fonları" kategorisi medyan 1Y CAGR.

---

## 7. UI Tasarımı (`/fonlar/backtest`)

### 7.1 Sayfa düzeni

**Boş durum (henüz run yok):**
```
┌─────────────────────────────────────────┐
│  📊 Mehmet Score Backtest               │
│  Henüz backtest çalıştırılmadı.         │
│  [ Faz-1 Çalıştır ] ← 8 run, 80 sn      │
└─────────────────────────────────────────┘
```

**Faz-1 sonrası:**
```
[ Faz-1 Yeniden Çalıştır ]  [ Faz-2 Optimize Et ]  son run: 2 dk önce
```

### 7.2 Sekmeler

| Tab | İçerik |
|---|---|
| 1. Özet | Sprint-6 GO/NO-GO panosu + Confidence breakdown + 6 soru rozeti |
| 2. Rolling Sonuçlar | Senaryo × strateji × config detay tablo |
| 2.5. Parametre Optimizasyonu | Heatmap (3×4 TopN×Rebalance per scenario × strategy) |
| 3. Benchmark Karşılaştırması | **3 toggle: Absolute / Relative-vs-KAT_FON_SEPETI / Drawdown** |
| 4. Rebalance Analizi | Turnover + Top10 Overlap + Universe size |
| 5. Top10 Bileşimi | Heatmap timeline (her hücre ağırlık; cap'li fonlar kalın çerçeve) |

### 7.3 Tab 1 — Sprint-6 GO/NO-GO panosu (ana ekran)

```
┌──────────────────────────────────────────────┐
│  SPRINT-6 GO/NO-GO                            │
│                                                │
│  Kriter (Sprint-5.6 v5):                      │
│  ▸ KAT_FON_SEPETI: Confidence ≥75 AND          │
│                    Median Alpha ≥ %3            │
│  ▸ XU100:          Confidence ≥75              │
│  ▸ CPI_TR:         Confidence ≥75              │
│                                                │
│  Sonuç:                                       │
│  ▸ KAT_FON_SEPETI: ✓ 100 (4/4) · +%4.2 median │
│  ▸ XU100:          ✓ 100 (4/4)                 │
│  ▸ CPI_TR:         ✓ 100 (4/4)                 │
│                                                │
│  → SPRINT-6 GO ✅                             │
└──────────────────────────────────────────────┘
```

### 7.4 Confidence + Alpha Strength rozet (her benchmark)

```
vs KAT_FON_SEPETI:
  Confidence:     ████████░░  75/100 (3/4)
  Alpha Strength: Median +%4.2
  ▾ Detay
    Mean +%5.1
    2022: +%8.1, 2023: +%5.3, 2024: +%1.2, 2025: +%5.7
```

Ana ekran sadece Median; Mean detay açılır panelde.

### 7.5 Tab 3 — Benchmark Karşılaştırması (3 toggle)

```
Görünüm:  [ Absolute ]  [ Relative vs Katılım Fon Sepeti ]  [ Drawdown ]
Senaryo:  [ 2022 ▾ ]
```

- **Absolute:** portföy + 7 benchmark NAV (başlangıç 100 normalize), line chart
- **Relative vs Katılım Fon Sepeti:**
  - Y ekseni: `portfolio_nav / kat_fon_sepeti_nav × 100`
  - Yatay 100 referans çizgisi
  - >100: Mehmet üstün (yeşil dolgu)
  - <100: Mehmet geride (kırmızı dolgu)
  - Drawdown peak'leri renkli işaret
- **Drawdown:** her serinin peak'ten sapması

### 7.6 Forward Test sub-page

`/fonlar/backtest/forward`
- Tarih aralığı + TopN seçici
- **5 KPI rozet** (eşik göstergeli ✓/→/⚠)
- Günlük Top N timeline
- "Backtest engine rekompüt vs cache" toggle

### 7.7 Komite Karar Arşivi sayfa

`/fonlar/komite/arsiv?date=YYYY-MM-DD`
- Top 10 listesi + 1 cümle açıklama (`explainFundScore.strengths[0]`)
- Kategori dağılımı stacked bar
- Komite bayrakları
- Komite Notu paragraf
- **Delta paneli** (yeni giren / çıkan / en büyük artış 3 / en büyük düşüş 3)
- Print-friendly CSS (`@media print`)
- Tarih navigasyonu (önceki/sonraki + takvim widget)

---

## 8. PR Planı

| PR | Kapsam | Effort | Bağımlılık |
|---|---|---|---|
| **PR-0** | EVDS validation doc + design v5 lock | 0.5 gün | — |
| **PR-A** | Benchmark framework + `fund_status_history` + TLREF (opsiyonel) + KAT_FON_SEPETI helper + EVDS adapter + `getActiveFundsAtDate` + KPPF medyan helper | 1.5-2 gün | PR-0 onay |
| **PR-B** | Backtest engine — 2 strateji + applyCap + Faz-1 endpoint + parametre matrisi + risk-free fallback + confidence helper + 60+ test | 3-4 gün | PR-A |
| **PR-C** | Backtest UI — 6 sekme + Sprint-6 GO/NO-GO panosu + 3 toggle chart + heatmap + Faz-2 orchestrator | 2-3 gün | PR-B |
| **PR-D** | Forward Test — 5 KPI rozeti + history-based Top N + comparison | 1.5 gün | PR-C |
| **PR-E** | Komite Karar Arşivi — `/fonlar/komite/arsiv` + delta paneli + print CSS | 1-1.5 gün | Sprint-5.5 mevcut |

**Toplam: ~10-11 gün.** PR-E paralel olabilir (Sprint-5.5 foundation'ı yetiyor) → pratik ~9-10 gün.

---

## 9. Sprint-6 GO/NO-GO Kriteri (NET)

**Sprint-6 (allocation + portföy entegrasyonu) ancak aşağıdaki üç koşul tamamen sağlandığında başlar:**

| Benchmark | Koşul |
|---|---|
| **KAT_FON_SEPETI** | `Confidence ≥ 75` **VE** `Median Alpha ≥ %3` |
| **XU100** | `Confidence ≥ 75` |
| **CPI_TR** | `Confidence ≥ 75` |

`Confidence = win_count / 4 × 100`. Win = `best_strategy_alpha > 0`.

**Sebep:** KAT_FON_SEPETI gerçek yatırım evrenimiz — anlamlı üstünlük (median ≥ %3) zorunlu. XU100 ve CPI farklı karakterde — tutarlı pozitif üstünlük (3/4 senaryo) yeterli.

### Karar matrisi

| Durum | Aksiyon |
|---|---|
| 3 koşul ✅ | **Sprint-6 GO** |
| KAT_FON_SEPETI confidence ≥75 ama median <%3 | **Sprint-5.7 — formül revizyonu** |
| Herhangi benchmark confidence <75 | **Sprint-5.7 — formül revizyonu** |
| Faz-2'de farklı (TopN, Rebalance) config kriteri sağlıyorsa | "Best config" benimsenir, default değiştirilir, **Sprint-6 GO** |

---

## 10. Riskler

| # | Risk | Mitigation |
|---|---|---|
| 1 | EVDS series codes yanlış | PR-0 sign-off blocker |
| 2 | Backtest süresi Vercel 300s aşar | Faz-1 single HTTP yeterli; Faz-2 client orchestrator |
| 3 | Survivorship bias | `fund_status_history` + `getActiveFundsAtDate` test'leri |
| 4 | Look-ahead bias | Test spy ile NAV/CPI cutoff assertion |
| 5 | Equal weight + 0 işlem maliyeti | Disclaimer; Sprint-6'da maliyet modeli |
| 6 | applyCap sonsuz döngü | Max 10 iterasyon + convergence assert |
| 7 | TopN=5 + score_weighted = equal_weight (cap doygun) | Doc/UI'da not |
| 8 | KAT_FON_SEPETI tüm katılım fonları (~120) yavaş | Run başına 1 kez pre-compute cache |
| 9 | Forward Test history yetersiz (yeni) | "Minimum 30 gün" UI sınırı |
| 10 | Komite Arşivi runtime hesap yavaş | Server-side cache 5 dk |
| 11 | Confidence Score yanlış formül | PR-B'de 10+ test (sentetik fixture) |
| 12 | Sprint-6 kriteri çok katı | Faz-2 "best config" alternatifi var |
| 13 | Top10 Koruma Oranı 30g — history yok | UI gizli, "tarihçe yetersiz" mesajı |
| 14 | Komite Arşivi delta — aynı gün 2 snapshot | Gün başına en son snapshot kullan |
| 15 | Kullanıcı Faz-1 butonuna basmazsa boş kalır | Boş durum CTA prominent |
| 16 | TLREF series code yanlışsa | KPPF fallback otomatik devreye girer |
| 17 | KPPF medyanı dar kategori | "≥10 fon" koşulu + warning |
| 18 | Retention — 96 run × 4000 satır | ~5 MB; küçük, retention politikası: son 4 senaryo (96 run) kalıcı |

---

## 11. Acceptance Criteria

### PR-0
- `docs/benchmark-evds-validation.md` user sign-off
- `docs/sprint-5.6-design.md` v5 commit

### PR-A
- `fund_status_history` migration + 155 fon baseline + KRA delisted
- `benchmark_points` ≥1000 satır × 4 series (XU100/XAU/USD/EUR)
- TLREF varsa `tlref_daily` ≥1000 satır; yoksa "KPPF fallback" notu
- `getActiveFundsAtDate('2022-01-03')` 130+ fon, `getActiveFundsAtDate('2026-05-31')` KRA içermez
- KAT_FON_SEPETI helper test (survivorship-safe)
- 10+ unit test

### PR-B
- `backtest_runs` + `backtest_rebalances` + `backtest_nav_series` migration
- `runBacktest` deterministik (aynı input → aynı output, hash assert)
- Look-ahead bias 3+ test (NAV/CPI cutoff spy)
- Survivorship test (KRA 2022 universe'de, 2026'da yok)
- Metric test'leri (sentetik veri → expected CAGR/Sharpe/MaxDD/Fisher)
- `applyCap` 5+ test (TopN=5 doygun, TopN=10 normal, TopN=20 çok iterasyon)
- `computeConfidenceScore` 10+ test (0/4 → 4/4 senaryolar)
- Faz-1 endpoint 8 run idempotent, <120 sn
- 60+ test toplam

### PR-C
- `/fonlar/backtest` 6 sekme render
- Boş durum CTA, Faz-1 manuel buton
- **Sprint-6 GO/NO-GO panosu** Tab 1'de görünür (3 benchmark + sonuç)
- Confidence + Alpha Strength (median ana, mean detay) 7 benchmark için
- Tab 3 toggle: Absolute / Relative-vs-KAT_FON_SEPETI / Drawdown
- score_weighted heatmap'de cap'lenen fon kalın çerçeve
- Faz-2 orchestrator progress bar + resume

### PR-D
- `/fonlar/backtest/forward` render
- **5 KPI** (Top10 Stabilitesi, Elde Tutma, İlk 3 Değişim, Turnover, Top10 Koruma 30g)
- KPI hesap test'leri (sentetik history)
- 30 gün minimum disclaimer

### PR-E
- `/fonlar/komite/arsiv?date=...` render
- Top 10 + score-explain + komite-notu
- **Delta paneli** (yeni/çıkan/+3 artış/-3 düşüş)
- İlk gün edge case "karşılaştırma yok"
- Print CSS aktif
- Takvim widget'ı

### Sprint-5.6 GENEL — 10 soru cevabı
1. equal_weight Top10 XU100'ü yeniyor mu? (N/4)
2. score_weighted Top10 XU100'ü yeniyor mu? (N/4)
3. İki strateji tutarlı hangisi üstün?
4. Reel getiri sağlıyor mu? (CPI)
5. Hangi rejimde başarısız?
6. En iyi TopN × Rebalance kombinasyonu (Faz-2)
7. score_weighted cap konsantrasyonu sınırlıyor mu?
8. KAT_FON_SEPETI yenildi mi? (Sprint-6 GO'nun temel kriteri)
9. Forward Test KPI'ları stabilite gösteriyor mu?
10. **Sprint-6 GO/NO-GO sonucu?** (3 koşul matrisi)

---

## 12. İleride (kapsam dışı)

- Skor ağırlıklı portföy + max_weight_cap UI param
- Stop-loss / take-profit
- İşlem maliyeti modeli
- Persona-bazlı backtest (her preset için ayrı run)
- Monte Carlo rebalance jitter
- Out-of-sample test (eğitim/test ayrımı)
- TLREF ingest (Sprint-5.6'da opsiyonel kaldıysa)
- Komite Arşivi manuel notlar
- CSV export
- Custom start date UI

---

**TASARIM DONDU.** v6 yok. Implementasyon PR-A'dan başlar.
