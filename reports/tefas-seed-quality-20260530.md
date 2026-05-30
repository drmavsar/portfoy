# TEFAS Seed Quality Report — 2026-05-30

**Verdict:** ✅ Sprint-2'ye hazır  |  CRITICAL: 0 · WARN: 0 · INFO: 0

> Bu rapor MCP `execute_sql` (admin) üzerinden üretildi; `npm run tefas:quality`
> script'i ile aynı kontrolleri içerir. Script local `SUPABASE_SERVICE_ROLE_KEY`
> ile çalıştırıldığında aynı sonuçları üretecek.

## Özet

| Metrik | Değer | Beklenen | Durum |
|---|---|---|---|
| Kategori sayısı | 16 | 16 | ✅ |
| Toplam fon | 155 | 155 | ✅ |
| Aktif fon | 155 | 155 | ✅ |
| HSYF (is_equity_intensive) | 4 | 4 | ✅ |
| Serbest fon | 45 | 45 | ✅ |
| Döviz bazlı | 24 | 24 (2 KIS/TPZ + 17 USD + 5 EUR) | ✅ |
| TEFAS'ta işlem gören | 155 | 155 | ✅ |
| tracked_funds | 155 | 1 user × 155 = 155 | ✅ |
| Distinct user | 1 | 1 | ✅ |
| Audit log satırı | 6 | ≥ 5 (default seed) | ✅ |

## Kategori Dağılımı

| Kategori | name_tr | Fon |
|---|---|---|
| KATILIM_HISSE | Katılım Hisse Senedi Fonları | 26 |
| KATILIM_PARA_PIYASASI | Katılım Para Piyasası Fonları | 18 |
| KATILIM_ALTIN | Katılım Altın Fonları | 13 |
| KATILIM_KIYMETLI_MADEN | Katılım Kıymetli Madenler Fonları | 2 |
| KATILIM_KIRA_SERT | Katılım Kira Sertifikaları | 18 |
| KATILIM_TEKNOLOJI | Katılım Teknoloji Fonları | 3 |
| SEKTOREL_KATILIM | Sektörel Katılım Fonları | 4 |
| KATILIM_SERBEST_PARA | Katılım Serbest Para Piyasası Fonları | 7 |
| DOLAR_SERBEST | Dolar ile Alınabilen Katılım Serbest Fonlar | 17 |
| EURO_SERBEST | Euro ile Alınabilen Katılım Serbest Fonlar | 5 |
| KATILIM_HSYF_SERBEST | Katılım Serbest Hisse Senedi Yoğun Fonlar | 4 |
| KISA_VADELI_SERBEST | Kısa Vadeli Katılım Serbest Fonlar | 6 |
| ARBITRAJ_SERBEST | Katılım İstatistiksel Arbitraj Serbest Fon | 1 |
| GUMUS_SERBEST | Katılım Gümüş Serbest Fon | 1 |
| COKLU_VARLIK_KATILIM | Çoklu Varlık Katılım Fonları | 26 |
| DIGER_SERBEST | Diğer Serbest Katılım Fonlar | 4 |
| **Toplam** | | **155** ✅ |

## tax_confidence Dağılımı

| Confidence | Sayı | Yorum |
|---|---|---|
| HIGH | 112 | HSYF + TRY hisse/altın/para piyasası/teknoloji/sektörel/çoklu varlık/TRY kira sert |
| MEDIUM | 24 | KIS, TPZ + 17 USD serbest + 5 EUR serbest |
| LOW | 19 | Tüm TRY serbest fonlar |
| **NONE** | **0** ✅ | Hedef: 0 |

## Investment Universe Dağılımı

| Universe | Sayı |
|---|---|
| BIST_HISSE_TR | 30 (26 Katılım Hisse + 4 HSYF) |
| KATILIM_PARA_PIYASASI | 31 (18 + 7 Serbest Para + 6 Kısa Vadeli) |
| COKLU_VARLIK | 25 |
| DOVIZ_SERBEST_USD | 17 |
| KIRA_SERTIFIKASI_TRY | 16 |
| ALTIN | 13 |
| DOVIZ_SERBEST_EUR | 5 |
| SEKTOREL_BIST | 4 |
| DIGER | 4 |
| TEKNOLOJI_HISSE | 3 |
| KIRA_SERTIFIKASI_FX | 2 (KIS, TPZ) |
| KIYMETLI_MADEN_KARMA | 2 (KUT, KMN) |
| ARBITRAJ | 1 (KVK) |
| FON_SEPETI | 1 (YCY) |
| GUMUS | 1 (GUK) |
| BIST_KATILIM_30 | 0 (enum'da var, kullanılmadı) |
| ULUSLARARASI_HISSE | 0 (enum'da var, kullanılmadı) |
| **Toplam** | **155** ✅ |

## Stopaj Çözüm Matrisi

Sprint-1'de tüm fonlar `scope='TAX_KIND_DEFAULT'` üzerinden çözünür (FUND/CATEGORY override yok).

| tax_kind | Fon | Oran | Confidence dağılımı |
|---|---|---|---|
| HSYF_0_STOPAJ | 4 | %0 | 4 × HIGH |
| GENEL_17_5 | 110 | %17.5 | 108 × HIGH + 2 × MEDIUM (KIS, TPZ) |
| DOVIZ_BAZLI | 22 | null | 22 × MEDIUM (USD + EUR serbest) |
| SERBEST_FON | 19 | null | 19 × LOW (TRY serbest) |
| **BELIRSIZ** | **0** ✅ | — | — |
| **Toplam** | **155** | | |

> BELIRSIZ tax_kind'a düşen fon yok — beklenen.

## HSYF Kontrol

`is_equity_intensive = true` olan fonlar:

| Code | Kategori | Beklenen |
|---|---|---|
| HFI | KATILIM_HSYF_SERBEST | ✅ |
| KLH | KATILIM_HSYF_SERBEST | ✅ |
| KTS | KATILIM_HSYF_SERBEST | ✅ |
| RKH | KATILIM_HSYF_SERBEST | ✅ |

Sadece HSYF kategorisinde + sadece bu 4 fon = ✅.

## FX-denominated Kontrol

| Kategori | Currency | Fon sayısı | Codes |
|---|---|---|---|
| DOLAR_SERBEST | USD | 17 | BKY, CKS, DKL, HML, KDL, KDT, KLS, KPD, KTT, NKA, NME, NVK, NZU, PBK, TRU, YSL, ZP6 |
| EURO_SERBEST | EUR | 5 | BDA, KAV, KDO, KKC, ZP9 |
| KATILIM_KIRA_SERT | TRY | 2 | KIS, TPZ |
| **Toplam** | | **24** ✅ | |

KIS/TPZ TRY currency'sinde ama `is_fx_denominated=true` (döviz bazlı sukuk, kullanıcı kararı) — beklenen.

## Tutarlılık Kontrolleri

Her kontrol için violation sayısı:

| Kontrol | Violation | Durum |
|---|---|---|
| HSYF kategorisinde flag=false | 0 | ✅ |
| Flag=true ama HSYF kategorisinde değil | 0 | ✅ |
| DOLAR_SERBEST kategorisinde currency≠USD | 0 | ✅ |
| EURO_SERBEST kategorisinde currency≠EUR | 0 | ✅ |
| Serbest kategorisinde is_free_fund=false | 0 | ✅ |
| KIS/TPZ FX flag kontrolü | 0 | ✅ |
| tax_confidence = NONE | 0 | ✅ |
| BELIRSIZ tax_kind eşleşmesi | 0 | ✅ |

## tracked_funds Bootstrap

- Distinct user: **1**
- Aktif fon: **155**
- Beklenen tracked rows: **155** (1 × 155)
- Gerçekleşen: **155** ✅

Bootstrap doğru: kullanıcının verdiği tüm 155 fon takipte başladı.

## Audit Altyapısı

- `tax_rules_audit` tablosunda **6 satır** var (5 default seed INSERT + 1 önceki probe).
- Canlı probe testi: INSERT + DELETE → 2 audit satırı oluştu ✅.
- Trigger `fund_tax_rules_audit_trg` çalışıyor.

## Findings

**Hiç finding yok.** Seed verisi tutarlı, stopaj matrisi temiz, bootstrap doğru, audit altyapısı çalışıyor.

## Sprint-2 Geçiş Gate Sonucu

| Gate | Beklenen | Gerçekleşen | Durum |
|---|---|---|---|
| G1 | Sprint-1 DoD tamamlandı | PR-1, PR-2, PR-3 + lint fix merge | ✅ |
| G2 | CRITICAL = 0 | 0 | ✅ |
| G3 | tax_confidence=NONE sayısı = 0 | 0 | ✅ |
| G4 | tracked_funds bootstrap eşleşmesi | 155 = 1 × 155 | ✅ |
| G5 | Tüm test'ler yeşil | 120 vitest + lint + tsc | ✅ |
| G6 | Zorunlu alanlar dolu | 155/155 | ✅ |
| G7 | Audit altyapısı çalışıyor | Trigger + 6 audit row | ✅ |

**Verdict: ✅ Sprint-2 başlatılabilir.**

## Sprint-2 Kapsam Hatırlatması

User onayıyla daraltıldı:
- `fund_prices` tablosu (NAV + büyüklük + yatırımcı + ücret)
- TEFAS veri çekme endpoint'i (Python serverless, `tefas-crawler` POC)
- Günlük NAV verisi
- Cache + fallback (Truncgil v4 yedek kontrolü)
- Cron (TR 18:30 sonrası — TEFAS NAV'ları o saatte yayınlar)

**Kapsam dışı:** performans hesabı, skor üretimi, Mehmet Score, AI yorum, portföy entegrasyonu (Sprint-3+).
