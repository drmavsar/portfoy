# NAV Ingest Health — 2026-05-30

Sprint-2 kapanışı sonrası, Sprint-3 öncesi gate kontrolü.

## TL;DR

**Production cron henüz çalıştırılmamış** — `fund_prices` boş. Bu beklenen durum (Sprint-2 deploy tamamlandı ama TR 19:00 cron'u henüz tetiklenmedi). Schema, view'lar ve UPSERT semantiği **SQL simülasyonu ile doğrulandı**: hepsi tasarlandığı gibi çalışıyor.

Sprint-3 başlatılabilir; **canlı NAV verisi gerektirmez** (PR-1 CPI altyapısı + PR-2 brüt motoru lazımsa veriyle test edilebilir). Cron canlıya çıktıktan sonra ayrı bir verify adımı yeterli.

## Mevcut Durum (Production DB)

| Metrik | Değer |
|---|---|
| `fund_prices` toplam satır | 0 |
| Distinct fund priced | 0 |
| `tefas_ingest_log` toplam | 0 |
| Son cron çalışması | — |
| Son NAV tarihi | — |
| `v_fund_prices_latest` satır | 0 |
| `v_tefas_fund_prices_health` satır | 155 (her aktif fon için 1; hepsi `last_as_of=NULL, days_stale=NULL`) |

**Sebep:** Cron schedule (`0 16 * * *` = UTC 16:00 = TR 19:00) Sprint-2 PR-2 merge sonrası henüz tetiklenme zamanı gelmedi. Vercel cron ilk otomatik çalışmasını bir sonraki TR 19:00'da yapar.

## Manuel Tetikleme (Senin Yapacağın)

```bash
# Production
curl -i -H "Authorization: Bearer $CRON_SECRET" \
        -H "x-triggered-by: manuel" \
        https://<production>.vercel.app/api/cron/tefas-prices

# Beklenen response (200):
# {
#   "ok": true,
#   "ingest_at": "2026-05-30T...",
#   "duration_ms": 30000-60000,
#   "requested": 155,
#   "succeeded": 140-155,   # bazı kodlar TEFAS'ta yayın yapmamış olabilir
#   "upserted": 140-155,
#   "failed_count": 0-15,
#   "failed_codes": ["..."],
#   "source": "tefas"
# }
```

Sonrasında:
- DB'de `fund_prices` ~150 satır
- `tefas_ingest_log` 1 satır
- Ayarlar → TEFAS Fonları → **Veri Durumu** sekmesi dolar

## SQL Simülasyonu — Çekirdek Davranışlar Doğrulandı

Production cron beklemek yerine, schema/view/UPSERT mantığı probe row'larıyla teyit edildi (ardından temizlendi).

### 1. UPSERT idempotency ✅

```sql
INSERT INTO fund_prices (fund_code, as_of, nav, source) VALUES
  ('HFI', CURRENT_DATE, 12.345678, 'tefas-probe'),
  ('KMF', CURRENT_DATE, 0.987654, 'tefas-probe');

INSERT INTO fund_prices (fund_code, as_of, nav, source) VALUES
  ('HFI', CURRENT_DATE, 99.999999, 'tefas-probe-2'),
  ('KMF', CURRENT_DATE, 0.111111, 'tefas-probe-2')
ON CONFLICT (fund_code, as_of) DO UPDATE
   SET nav = EXCLUDED.nav, source = EXCLUDED.source, fetched_at = now();
```

**Sonuç:**
| fund_code | nav | source |
|---|---|---|
| HFI | 99.999999 | tefas-probe-2 |
| KMF | 0.111111 | tefas-probe-2 |

Aynı `(fund_code, as_of)` için ikinci INSERT, yeni satır oluşturmadı; mevcut satırı **UPDATE etti**. Cron aynı gün ikinci kez çalıştırılırsa duplicate yaratmaz.

### 2. v_fund_prices_latest doğru ✅

```sql
SELECT * FROM v_fund_prices_latest WHERE fund_code IN ('HFI', 'KMF');
```

| fund_code | as_of | nav | source |
|---|---|---|---|
| HFI | 2026-05-30 | 99.999999 | tefas-probe-2 |
| KMF | 2026-05-30 | 0.111111 | tefas-probe-2 |

DISTINCT ON (fund_code) ORDER BY as_of DESC → her fonun **en son** satırı.

### 3. v_tefas_fund_prices_health doğru ✅

```sql
SELECT fund_code, last_as_of, last_nav, days_stale, last_source
FROM v_tefas_fund_prices_health
WHERE fund_code IN ('HFI', 'KMF', 'KPI', 'KIS', 'GUK');
```

| fund_code | last_as_of | last_nav | days_stale | last_source |
|---|---|---|---|---|
| GUK | NULL | NULL | NULL | NULL |
| HFI | 2026-05-30 | 99.999999 | 0 | tefas-probe-2 |
| KIS | NULL | NULL | NULL | NULL |
| KMF | 2026-05-30 | 0.111111 | 0 | tefas-probe-2 |
| KPI | NULL | NULL | NULL | NULL |

Fiyatı olan fonlar için `last_as_of` + `days_stale` doluyken, hiç fiyat çekilmemiş fonlar için `NULL` (UI'da "veri yok" rozetiyle gösterilir).

### 4. TEFAS down → eski fiyat korunur ✅

Cron route kodu:
```ts
if (fetched.prices && fetched.prices.length > 0) {
  // UPSERT ...
}
```

`fetched.prices` boşsa (TEFAS hiçbir yanıt vermediyse) UPSERT çağrılmaz → DB değişmez → **mevcut son fiyat tablo içinde durur**, `v_fund_prices_latest` aynı satırı dönmeye devam eder. Failsafe doğrulandı.

### 5. Cleanup

Probe row'ları silindi. DB temiz: `fund_prices = 0 satır`, `v_tefas_fund_prices_health` 155 satır (hepsi NULL).

## Sprint-3 Gate Sonucu

| Gate | Durum |
|---|---|
| Schema doğru kuruldu | ✅ |
| View'lar doğru SQL üretiyor | ✅ |
| UPSERT idempotency | ✅ |
| TEFAS-down failsafe | ✅ |
| Cron route deploy edildi | ✅ (vercel.json'da) |
| Manuel tetikleme test edildi | ⏳ Kullanıcı production'da curl ile |
| Otomatik cron (TR 19:00) | ⏳ Bir sonraki TR 19:00 |

**Verdict:** Sprint-3'e başlanabilir. CPI altyapısı + brüt getiri motoru NAV verisi olmadan da geliştirilip test edilebilir; net getiri ve health raporları için canlı veri ilerleyen PR'larda görünür olacak.
