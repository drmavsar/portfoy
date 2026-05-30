# CPI Ingest Tasarımı (Sprint-3 öncesi)

**Statü:** Sadece tasarım önerisi. Kod yok. Sprint-3 PR-1'de implement edilecek.

## 1. Veri Kaynakları — Karşılaştırma

| Kaynak | Format | Güncellik | Erişim | Veri | Karar |
|---|---|---|---|---|---|
| **TÜİK Bülten** | HTML / Excel | Her ayın 3-5'i (önceki ay endeksi) | Public; HTML scrape veya manuel XLSX | Aylık TÜFE endeksi 2003=100 + alt sepetler | Kaynak olarak ideal ama HTML scrape kırılgan |
| **TCMB EVDS** | JSON / CSV | TÜİK ile aynı gün | **API + free API key** | Tüm CPI serileri (genel + alt başlıklar) tarihli zaman serisi | **Önerilen birincil kaynak** |
| **Manuel CSV** | CSV | Manuel | Kullanıcı ekler | Tek bir kolon (period, index) | Fallback / disaster recovery |

### Öneri: **TCMB EVDS** birincil, **Manuel CSV** fallback

**Sebepleri:**
- EVDS API key sade (TCMB sitesinden ücretsiz) ve JSON dönüyor
- TÜİK HTML scrape kırılgan: site yeniden tasarımı her şeyi bozar
- Yedek manuel CSV upload Ayarlar UI'sından kolayca tetiklenebilir (gerekirse)

**EVDS endpoint örneği** (TÜFE genel, aylık):
```
https://evds2.tcmb.gov.tr/service/evds/series=TP.FG.J0&type=json
&startDate=01-01-2010&endDate=31-12-2026
&aggregationTypes=avg&formulas=0&frequency=5
```
Yanıt: `{ items: [{ Tarih: "2026-04", TP_FG_J0: "1234.56" }, ...] }`

> `TP.FG.J0` — TÜFE Genel (2003=100). Alt başlıklar (gıda, ulaştırma vs.) için ayrı seri kodları var ama Sprint-3 sadece genel TÜFE.

## 2. Tablo Tasarımı

**Soru:** Sadece endeks mi, sadece oran mı, ikisi de mi?

**Karar: Sadece endeks (TÜFE level).** Aylık oran her zaman iki endeksten türetilebilir:
- m/m: `(idx[t] / idx[t-1]) - 1`
- y/y: `(idx[t] / idx[t-12]) - 1`
- Birikimli (a dönem → b dönem): `(idx[b] / idx[a]) - 1`

Endeks saklamak normalize edilmiş, hesaplama anında türetmek formal-olarak doğru. Pre-computed oran kolonu eklemek redundancy.

### Şema

```sql
create table cpi_monthly (
  period      char(7) primary key,    -- "YYYY-MM"
  cpi_index   numeric(12,4) not null check (cpi_index > 0),
  source      text not null default 'tcmb_evds',
  series_code text not null default 'TP.FG.J0',
  fetched_at  timestamptz not null default now(),
  -- TÜİK revize ederse audit:
  revised_at  timestamptz,
  revision_n  int not null default 0
);

create index cpi_monthly_period_idx on cpi_monthly(period desc);
```

**RLS:** Reference data — authenticated select, service write (mevcut pattern).

### Helper view (opsiyonel)

```sql
create or replace view v_cpi_monthly_yoy as
select
  c.period,
  c.cpi_index,
  prev.cpi_index as cpi_index_12mo_ago,
  case when prev.cpi_index > 0
       then (c.cpi_index / prev.cpi_index) - 1
       else null end as yoy_change
from cpi_monthly c
left join cpi_monthly prev
  on prev.period = to_char(
       to_date(c.period || '-01','YYYY-MM-DD') - interval '12 months',
       'YYYY-MM');
```

UI/reports için y/y'yi her seferinde hesaplamak yerine view'dan çek.

## 3. Reel Getiri Formülü

Sprint-3'te `fund_returns_cache.real_*` kolonları için.

### Doğru formül (Fisher denklemi)

```
real_return = ((1 + nominal_return) / (1 + cpi_change)) - 1
```

### Yanlış formül (kaba çıkarma, kullanma)

```
real_return ≈ nominal_return - cpi_change   // sadece düşük enflasyonda doğru
```

Türkiye'de yıllık enflasyon %30-70 aralığında olduğu için kaba çıkarma anlamlı hatalar üretir; **Fisher** zorunlu.

### Uygulama

```ts
function realReturnFisher(nominalRatio: number, cpiRatio: number): number {
  return (nominalRatio / cpiRatio) - 1;
}
// nominalRatio = nav[t] / nav[t0]
// cpiRatio     = cpi[period(t)] / cpi[period(t0)]
```

**Pencere seçimi:** Fund NAV tarihinin ay-başlangıcına yuvarlanır (TÜFE aylık).
- nav as_of = 2026-05-15 → CPI period = "2026-04" (en son yayınlanmış)
- nav t0 = 2025-05-15 → CPI period = "2025-04"

> Mantık: NAV tarihi henüz yayınlanmamış olabilecek aydadır (TÜİK bir ay gecikmeli yayınlar); o yüzden NAV tarihinin **bir önceki ay**'ının endeksi kullanılır. Bu küçük bir yaklaşıklık ama aylık veri sınırı yüzünden zorunlu.

## 4. Eksik Veri / Fallback

**TÜFE neden eksik olabilir:**
- TCMB EVDS API down
- TÜİK ayın 3'üne kadar yayın yapmamış (yeni ay başında)
- Tarihsel olarak yeni bir alt-period eklenmiş

**Reel getiri hesabında eksiklik:**
- Hem `nav[t0]` hem `cpi[t0]` lazım → biri eksikse `real_return = null`
- Cache row `real_1y` vs. NULL olarak yazılır; UI'da "veri yok" rozetiyle
- Kullanıcının `tax_confidence` yaklaşımına paralel: `cpi_confidence` (opsiyonel) — Sprint-3'te değil, Sprint-4 enflasyon koruma skorunda ele alınır

**Fallback stratejisi:**
1. TCMB EVDS ilk deneme
2. EVDS başarısızsa: son başarılı ingest'in verisi DB'de zaten var → reel getiri eski endeksle hesaplanır (bayağı az değişir, kabul edilebilir)
3. Manuel CSV upload (Ayarlar UI'sı, Sprint-3 PR-1 sonu): kullanıcı son bültenleri elle ekleyebilir

## 5. Cron Gerekli mi?

**Hayır, günlük cron gerekmiyor.** TÜFE **aylık** veri:

| Seçenek | Frekans | Avantaj | Dezavantaj |
|---|---|---|---|
| **A. Aylık cron** (her ayın 5'i) | 1× / ay | Tam otomatik | EVDS o gün yayınlamamışsa retry gerekir |
| **B. Haftalık cron** (Çarşamba) | 4× / ay | Aralarda bir kez deneme | Çoğu çalıştırma no-op |
| **C. NAV ingest cron'una bağla** | Günlük | Yeni schedule yok | Her gün gereksiz API çağrısı (cache'lensin diye) |
| **D. Manuel + yarı otomatik** | İhtiyaç anında | Sade, kontrol senin | Unutulabilir |

**Önerilen: A (Aylık cron) + D (Manuel tetikleme butonu)**

```json
// vercel.json
{ "path": "/api/cron/cpi-ingest", "schedule": "0 8 5 * *" }
// Her ayın 5'inde UTC 08:00 (TR 11:00) — TÜİK sabah yayını sonrası
```

Ayarlar UI'da "Şimdi ingest et" butonu da bulunsun (cron başarısız olursa manuel tetikleme).

## 6. Sprint-3 PR-1 Kapsamı (Senin Verdiğin)

| İçerik | Detay |
|---|---|
| `cpi_monthly` tablosu + index + RLS | Yukarıdaki şema |
| `v_cpi_monthly_yoy` view (opsiyonel) | y/y change pre-compute |
| `api/cpi-ingest.py` (Python serverless) | TCMB EVDS fetch + DB upsert |
| `EVDS_API_KEY` env var | TCMB'den ücretsiz |
| `_lib/tefas/cpi-actions.ts` | `listCpiMonthly()`, `getCpiAt(period)`, `realReturnFisher(nominalRatio, cpiRatio)` helper |
| Cron `/api/cron/cpi-ingest` (aylık) | vercel.json |
| Ayarlar → "Manuel ingest" butonu | Cron başarısız ise |
| Birim test'ler | Fisher formülü, period yuvarlama, eksik veri davranışı |

## 7. Sprint-3 Genel Akış (Hatırlatma)

| PR | İçerik | Bağımlılık |
|---|---|---|
| **PR-1** | CPI altyapısı (bu doc) | — |
| **PR-2** | `fund_returns_cache` schema + brüt getiri motoru (1G/1H/1A/3A/6A/YTD/1Y/3Y CAGR/5Y CAGR + kategori medyanı + vs_category) | PR-1 değil (CPI yok henüz) |
| **PR-3** | Net getiri motoru + stopaj (`resolveTaxRulePure` reuse + brüt/net + tax_confidence rozet mantığı) | PR-2 |
| **PR-4** | Daily refresh cron + monitoring (NAV ingest sonrası returns cache refresh + health) | PR-3 |

**Sprint-3 kapsamı dışı (Sprint-4+):** Mehmet Score, risk skoru, allocation, AI yorum, portföy entegrasyonu, realized_lots stopaj uygulaması.

## 8. Karar Noktaları (Senin Onaylaman Gerekenler)

1. **EVDS birincil kaynak — onaylar mısın?** (Alternatif: TÜİK HTML scrape yapalım. Önerim: hayır.)
2. **Sadece TÜFE genel (`TP.FG.J0`) mi, alt sepetler de mi?** Önerim: Sprint-3'te genel; gıda/ulaştırma alt sepetleri ileride gerekirse.
3. **Series code'u kolonda saklamak vs. tek bir series varsayımı?** Önerim: kolon var ama tek seri ile başla; ileride multi-series kolayca eklenir.
4. **Manuel CSV upload UI Sprint-3 PR-1'de mi, sonraya mı?** Önerim: PR-1'in sonu — ingest başarısızsa kurtarıcı.
5. **CPI cron'un manuel tetikleme'si Bearer token mı, kullanıcı butonu mu?** Önerim: ikisi de — Vercel dashboard + Ayarlar buton.

Bu 5 nokta netleşince Sprint-3 PR-1'in ilk commit'ine başlayabilirim.
