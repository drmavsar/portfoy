# TEFAS Katılım Fonları Modülü

Sprint-1 sonu durumu. Sonraki sprint'lerde dashboard, fiyat ingest,
performans motoru, risk skoru ve AI yorum eklenecek.

## Mimari Özet

```
funds (master)        ── kod, kategori, currency, universe, tax_confidence
   ↓                    + bool flag'ler (HSYF, free fund, FX, TEFAS-traded)
fund_categories       ── 16 kategori + default_tax_kind
fund_tax_rules        ── tarihli/lot-bazlı stopaj kuralları
tax_rules_audit       ── kural değişiklik izi (trigger)
tracked_funds         ── kullanıcı bazlı takip listesi
                        (bootstrap: kayıt anında tüm aktif fonlar eklenir)
```

Sprint-2 ekledikleri:
- `fund_prices` — günlük NAV (büyüklük/yatırımcı kolonları null; TEFAS yeni API'sinde yok)
- `tefas_ingest_log` — her cron çalıştırmasının özet sonucu
- `v_fund_prices_latest` view — her fon için son NAV
- `v_tefas_fund_prices_health` view — fon başına son fiyat tarihi + days_stale

Sprint-3+ ekleyecekleri:
- `fund_returns_cache` — brüt + net + reel (CPI) getiriler
- `fund_scores_cache` — Mehmet Score + dinamik bileşenler
- `user_personas` — Mehmet Score ağırlıkları (parametrik)
- `allocation_recommendations` — fon dağılım önerileri

## Sprint-2 — NAV Ingest Altyapısı

**Endpoint:** `/api/tefas-prices` (Python serverless, `tefas-crawler` PyPI).
- 6h → **24h** edge cache (TEFAS bir defa akşam yayınlar).
- En fazla 20 fon/istek; üstü chunk'lara bölünür (TS tarafında).

**Cron:** `/api/cron/tefas-prices`, TR 19:00 (UTC 16:00). 155 fonu chunk halinde ingest; chunk başına 2 deneme + exp backoff. Sonuç `tefas_ingest_log`'a yazılır.

**TEFAS erişilemezse:** UPSERT yeni satır yazmaz → mevcut son fiyat korunur. Truncgil v4'ün katılım fonu desteği olmadığından Sprint-2'de NAV fallback kaynağı yok; ileride bulunursa Sprint-3+ olarak ele alınır.

**Monitoring (Ayarlar → TEFAS Fonları → Veri Durumu):**
- Son ingest özeti (talep / başarılı / upsert / başarısız / süre)
- Genel sağlık chip'leri (güncel / stale / hiç yok)
- Stale fonlar tablosu (≥3 gün eski)
- Son 10 cron çalıştırma geçmişi

## Stopaj Çözüm Mantığı

`resolveTaxRule(fundCode, acquiredAt, soldAt)` → `ResolvedTaxRule`

**Öncelik:** FUND > CATEGORY > TAX_KIND_DEFAULT

**Tarih filtreleri:**
- `effective_from <= soldAt` ve (`effective_to` null veya `> soldAt`) — kuralın yürürlük zamanı
- `applies_to_acquired_from` null veya `<= acquiredAt` — lot iktisap aralığı alt sınırı
- `applies_to_acquired_to` null veya `> acquiredAt` — üst sınırı

**Çakışma:** aynı seviyede birden çok eşleşme varsa `priority DESC` karar verir.

**Çıktı yapısı:**
```ts
interface ResolvedTaxRule {
  rule: FundTaxRule | null;
  effective_rate: number | null;  // null = belirsiz (BELIRSIZ/DOVIZ_BAZLI/SERBEST_FON)
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  kind: FundTaxKind;
  source: 'FUND' | 'CATEGORY' | 'TAX_KIND_DEFAULT' | 'NONE';
}
```

**Confidence clamp:** `funds.tax_confidence` HIGH/MEDIUM olsa bile
`effective_rate` null ise (kuralın oranı belirsiz) confidence otomatik
LOW'a düşürülür.

**Saf logic:** `_lib/tefas/tax-rules-logic.ts` → `resolveTaxRulePure`.
DB-bağımsız, test edilebilir, Sprint-3'te batch performans hesabında
reuse edilebilir.

## investment_universe

Fonun gerçekte ne aldığını belirtir; kategori (SPK sınıflandırması) ile
aynı şey değildir. Sprint-4'te `bist_dependency_score` ve
`gold_dependency_score` kestirimi için default sağlar.

| Universe | Açıklama | Örnek |
|---|---|---|
| BIST_HISSE_TR | Türkiye hisse | DKH, HFI |
| BIST_KATILIM_30 | Endeks-takipli katılım hisse | — |
| KIRA_SERTIFIKASI_TRY | TL bazlı sukuk | DPK, EKF |
| KIRA_SERTIFIKASI_FX | Döviz bazlı sukuk | KIS, TPZ |
| ALTIN | Gram altın | GOL, KMF |
| GUMUS | Gram gümüş | GUK |
| KIYMETLI_MADEN_KARMA | Karma metal | KUT, KMN |
| TEKNOLOJI_HISSE | Teknoloji hissesi | BTK, CPU |
| SEKTOREL_BIST | Sektörel BIST | EPI, KNJ |
| KATILIM_PARA_PIYASASI | Kısa vade katılım | AIS, KPI |
| COKLU_VARLIK | Multi-asset | FBC, CKF |
| ULUSLARARASI_HISSE | Yabancı katılım hisse | — |
| DOVIZ_SERBEST_USD | USD serbest | BKY, KLS |
| DOVIZ_SERBEST_EUR | EUR serbest | BDA, KAV |
| ARBITRAJ | Arbitraj | KVK |
| FON_SEPETI | Fon sepeti | YCY |
| DIGER | Sınıflandırılamayan | BVK |

## tax_confidence

Stopaj kuralının ne kadar güvenle bilindiği.

| Değer | Anlam | Sprint-1 seed dağılımı |
|---|---|---|
| HIGH | Mevzuat ve prospectus net, oran kesin | HSYF + TRY katılım hisse/altın/para piyasası/teknoloji/sektörel/çoklu varlık/kira sert |
| MEDIUM | Genel çerçeve net, özel durum riski (döviz, yabancı) | KIS/TPZ + USD/EUR serbest |
| LOW | Serbest fon yapısı, fon-spesifik değişebilir | Tüm serbest kategorileri |
| NONE | Hiçbir kural eşleşmiyor | (Sprint-1 seed sonrası beklenmiyor) |

## Sprint-1 PR Akışı

| PR | İçerik | Statü |
|---|---|---|
| #110 — PR-1 | Schema (4 migration) + tipler + actions + 12 birim test | ✅ merged |
| PR-2 (bu) | Seed migration (155 fon) + bootstrap + quality script + docs | — |
| PR-3 | Ayarlar UI sekmesi (Takipte / Ekle / Stopaj kuralları read-only) | sıradaki |

## Sprint-2 Geçiş Gate'i

Quality raporu üretilmeden Sprint-2'ye geçilmeyecek:

```bash
npm run tefas:quality
```

Çıktı: `reports/tefas-seed-quality-YYYYMMDD.md`. Geçiş için:
- CRITICAL = 0
- `tax_confidence = NONE` sayısı = 0 (veya her biri için kabul gerekçesi)
- `tracked_funds` bootstrap beklenen = gerçekleşen
- Audit altyapısı: `auditPresent = true` ve (canlı test ok ya da skipped)

Script `SUPABASE_SERVICE_ROLE_KEY` veya `NEXT_PUBLIC_SUPABASE_ANON_KEY`
ile çalışabilir; canlı audit testi için service_role gerekir (anon
ile probe INSERT atlanır ve INFO yazılır).

## Sprint-0.5 (Tamamlandı)

`docs/wac-fees-realized-audit.md` — TEFAS Sprint-6 öncesi mevcut
altyapının teşhisi. Sprint-1'i bloke etmiyor; Sprint-6 başlangıcında
o dokümanın 6. bölümündeki görevler ele alınacak.
