# Sprint-5 Öncesi Sağlık Raporu — 2026-05-30

Sprint-4 kapanışı sonrası, Sprint-5 (UI) öncesi gate kontrolü.

## TL;DR

Production cron'ları henüz tetiklenmemiş — `cpi_monthly`, `fund_prices`, `fund_returns_cache`, `fund_scores_cache` **boş**. Bu beklenen durum: Sprint-4 deploy tamamlandı ama TR 19:00 / 20:00 / 21:00 cron'ları ilk otomatik çalışmasını bekliyor.

**Schema sağlamlığı SQL simülasyonu ile doğrulandı:**
- 10 fon için Mehmet Score sentetik olarak yazıldı
- `v_fund_scores_latest` doğru DISTINCT ON sıralaması yaptı
- Top 10 sıralama persona ağırlıklarıyla beklenen şekilde
- Probe satırları temizlendi

**Verdict:** Sprint-5 (UI) tasarımına başlanabilir. UI sayfaları cache boş olsa bile "veri yok" rozetiyle render olur; gerçek skor üretimi production cron tetiklendiğinde ortaya çıkar.

## Mevcut DB Durumu

| Tablo / View | Satır | Beklenen | Statü |
|---|---|---|---|
| `cpi_monthly` | 0 | Bir önceki ayın 5'i sonrası dolar | ⏳ Cron beklemede |
| `fund_prices` | 0 | İlk cron sonrası ~150 | ⏳ |
| `fund_returns_cache` | 0 | NAV ingest sonrası ~150 | ⏳ |
| `fund_scores_cache` | 0 | Returns sonrası 155 × 1 persona = 155 | ⏳ |
| `fund_scores_ingest_log` | 0 | Her cron çalışmasında 1 satır | ⏳ |
| `v_fund_scores_health` | **155** | 1 persona × 155 fon | ✅ View çalışıyor |
| `user_personas` | **1** | Mehmet Default | ✅ |

## Mehmet Score SQL Simülasyonu — Top 10

**Senaryo:** 10 fon için bileşen skorları manuel yazıldı (PR-3 birim test'lerindeki Mehmet senaryosu ile aynı formül). `v_fund_scores_latest` sorgusu DISTINCT ON + ORDER BY ile doğru sıralamayı verdi.

| # | Fon | Kategori | HSYF | Universe | Mehmet | Infl | Tax | Risk | LT | Divers |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **KTS** | HSYF Serbest | ✅ | BIST_HISSE_TR | **72** | 85 | **100** | 52 | 78 | 30 |
| 2 | HFI | HSYF Serbest | ✅ | BIST_HISSE_TR | 71 | 80 | **100** | 55 | 75 | 30 |
| 3 | KLH | HSYF Serbest | ✅ | BIST_HISSE_TR | 71 | 82 | **100** | 50 | 78 | 30 |
| 4 | RKH | HSYF Serbest | ✅ | BIST_HISSE_TR | 71 | 83 | **100** | 53 | 76 | 30 |
| 5 | YCY | Çoklu Varlık | — | FON_SEPETI | 64 | 70 | 30 | 60 | 75 | **90** |
| 6 | KIS | Kira Sert. | — | KIRA_FX | 63 | 55 | 50 | 80 | 60 | 78 |
| 7 | KMN | Kıymetli Maden | — | KIYMETLI_KARMA | 62 | 65 | 30 | 68 | 70 | 82 |
| 8 | KMF | Altın | — | ALTIN | 60 | 60 | 30 | 70 | 65 | 80 |
| 9 | DKH | Hisse | — | BIST_HISSE_TR | 56 | 85 | 30 | 40 | **80** | 30 |
| 10 | KPI | Para Piyasası | — | KATILIM_PARA_PIYASASI | 55 | 45 | 30 | 90 | 55 | 60 |

### Yorumlar

- **HSYF dört fon zirvede** — `tax_advantage_score=100` (stopaj %0) Mehmet'in `tax_weight=0.20` ağırlığıyla 20 puan baseline veriyor; HSYF dışı genel %17.5 stopaj fonları sadece 6 puan alır.
- **YCY (fon sepeti) 5. sırada** — `diversification_score=90` (en yüksek) HSYF tax avantajını kapatıyor.
- **DKH yüksek enflasyon koruması + LT performansına rağmen risk_score=40** (vol ~%30) yüzünden sıralamada düşük — Mehmet'in `max_volatility=0.30` profili belirleyici.
- **KPI en altta**: para piyasası fonları düşük volatilite verir (risk_score=90 yüksek), ama enflasyon koruması (`real_1y` düşük) ve kategori medyanı (mütevazı) Mehmet Score'u 55'te bırakıyor.

> Bu sonuçlar **sentetik** — production NAV verisi geldiğinde sıralama benzer eğilimde olacak ama gerçek değerler farklı olabilir. Schema + sıralama mantığı sağlam, üretim hazır.

## Schema Sağlamlığı Kontrolleri

| Kontrol | Sonuç |
|---|---|
| `v_fund_scores_health` 155 satır döndürdü (her aktif fon × Mehmet persona) | ✅ |
| Sentetik upsert sonrası `has_mehmet=true` 10 fonda | ✅ |
| `v_fund_scores_latest` DISTINCT ON (fund_code, persona_id) doğru en son satırı seçti | ✅ |
| `ORDER BY mehmet_score DESC` sıralama doğru | ✅ |
| Cleanup sonrası `fund_scores_cache = 0` | ✅ |

## Sprint-5 Gate Sonucu

| Gate | Statü |
|---|---|
| Sprint-4 schema/view/motor hazır | ✅ |
| Mehmet Default persona seed | ✅ |
| Pure logic test'leri (259 toplam) yeşil | ✅ |
| UI verisi sağlam DB akışıyla beslenecek | ✅ (cron tetiklendiğinde) |
| Sprint-5 tasarım dokümanı | ✅ (bu PR'da) |

**Verdict:** Sprint-5 UI tasarımına başlanabilir. Tasarım onayı sonrası kod yazılır; canlı veri o sırada gelmiş olacak.

## Canlı Veri Tetikleme (Senin Yapacağın)

```bash
# Önce CPI (TÜFE) — her ayın 5'i otomatik, ama manuel:
curl -i -H "Authorization: Bearer $CRON_SECRET" .../api/cron/cpi-ingest

# Sonra NAV (TEFAS):
curl -i -H "Authorization: Bearer $CRON_SECRET" .../api/cron/tefas-prices

# Returns (brüt/reel/net):
curl -i -H "Authorization: Bearer $CRON_SECRET" .../api/cron/fund-returns-refresh

# Skorlar (Mehmet Score):
curl -i -H "Authorization: Bearer $CRON_SECRET" .../api/cron/fund-scores-refresh
```

Beklenen sonuç: `v_fund_scores_latest`'te ~155 satır, Mehmet Score dağılımı geniş bir aralıkta (gerçek volatilite + reel getiri + kategori medyanı ile).
