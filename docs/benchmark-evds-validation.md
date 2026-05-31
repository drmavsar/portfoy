# Benchmark EVDS Series Code Doğrulaması — PR-0

**Amaç:** Sprint-5.6'da backtest motorunun karşılaştırması için TCMB EVDS API'sinden
çekilecek benchmark serilerinin **doğru series code'larla** ingest edilmesini
sağlamak. Yanlış kod = backfill boş satır = backtest sonuçları çöp.

**Durum:** Doldurulması ve user tarafından sign-off bekleniyor. **PR-A'ya bu
doküman onaylanmadan başlanmaz.**

---

## 1. Hedef Benchmark Listesi (Sprint-5.6 v5)

Sprint-5.6 tasarım v5'e göre aşağıdaki **4 zorunlu + 1 opsiyonel** seri:

| # | Kod | Açıklama | Zorunluluk | Frekans |
|---|---|---|---|---|
| 1 | `XU100` | BIST 100 endeksi kapanış | Zorunlu | Günlük (iş günü) |
| 2 | `XAUTRY` | Gram altın TRY | Zorunlu | Günlük |
| 3 | `USDTRY` | USD/TRY döviz kuru | Zorunlu | Günlük (iş günü) |
| 4 | `EURTRY` | EUR/TRY döviz kuru | Zorunlu | Günlük (iş günü) |
| 5 | `TLREF` | Türk lirası gecelik referans faiz | **Opsiyonel** | Günlük |

**Kapsamadıklarımız (runtime hesaplananlar):**
- `CPI_TR` — `cpi_monthly` tablosunda mevcut, ingest gerek yok
- `KAT_FON_SEPETI` — synthetic basket, runtime computed
- `KAT_KATEGORI_MEDIAN` — synthetic, runtime computed

---

## 2. EVDS Portal Erişim

1. https://evds.tcmb.gov.tr/ → giriş
2. Sol menüde "**Seri Arama**"
3. Aşağıdaki **arama terimlerini** dene; gelen sonuçlardan **doğru series code'u** kopyala

API erişimi için: https://evds2.tcmb.gov.tr/index.php?/evds/userDocs → "EVDS Web Servisleri" bölümünden API key al (mevcut anahtarın CPI ingest'te kullanılıyor olabilir).

---

## 3. Her Benchmark için Doğrulama

Her benchmark altındaki **3 adımı** doldur. Doldurulan kod ile aşağıdaki
"Sample fetch" curl'ü test et (sample veri dönmeli, boş değil).

### 3.1 XU100 (BIST 100 Endeksi Kapanış)

**Aday series code'ları (tahmin önceliği):**
1. `TP.MK.F.BIST100`
2. `TP.BIST100`
3. `BIST.YHM.BST100`

**Doğrulama adımları:**
1. EVDS portalda "BIST 100" ara
2. "Kapanış" veya "Closing" içeren serileri listele
3. Seri açıklamasında "Endeks Kapanış Değeri" gibi ifade ara
4. Kodu kopyala

**Sample fetch (EVDS API üzerinden):**
```bash
curl -i -H "key: $EVDS_API_KEY" \
  "https://evds3.tcmb.gov.tr/igmevdsms-dis/series=<KOD>&startDate=01-01-2021&endDate=31-05-2026&type=json&frequency=1&aggregationTypes=avg&formulas=0&decimalSeperator=.&key=$EVDS_API_KEY"
```

`<KOD>` yerine doğrulanan kodu koy, `items[]` array'i en az 1000 satır dönmeli
(2021-01-01 → 2026-05-31 arası ~1300 iş günü).

**Doldurulacak alanlar:**
- ✅ Doğrulanan series code: `__________________________`
- ✅ Frekans (günlük/iş günü/aylık): `__________________________`
- ✅ Birim (puan/index): `__________________________`
- ✅ Sample fetched items count: `_______`
- ✅ Sample first/last date: `_______ → _______`
- ✅ Notlar: `__________________________`

---

### 3.2 XAUTRY (Gram Altın TRY)

**Aday series code'ları:**
1. `TP.MK.F.GA` (gram altın TRY, kuruş cinsinden olabilir → bölme gerekir)
2. `TP.MK.CUM.YTL`
3. `TP.AB.B6` (alternatif)

**Doğrulama adımları:**
1. EVDS'de "Gram Altın" veya "Altın TL" ara
2. Birime dikkat — kuruş ise / 100 yapılmalı (PR-A'da adapter handle eder, sen sadece birimi raporla)
3. Tarihsel veri 2021'e kadar gitmeli

**Sample fetch:** Yukarıdakiyle aynı pattern, KOD = altın series.

**Doldurulacak alanlar:**
- ✅ Doğrulanan series code: `__________________________`
- ✅ Frekans: `__________________________`
- ✅ Birim (TL/kuruş): `__________________________` ← **kuruşsa belirt, PR-A bölecek**
- ✅ Sample items count: `_______`
- ✅ Sample first/last value: `_______ → _______`
- ✅ Notlar: `__________________________`

---

### 3.3 USDTRY (USD/TRY Döviz Kuru)

**Aday series code'ları:**
1. `TP.DK.USD.A.YTL` (alış)
2. `TP.DK.USD.S.YTL` (satış)
3. `TP.DK.USD.A` (genel)

**Doğrulama adımları:**
1. EVDS'de "USD" veya "ABD Doları" ara
2. **Alış vs Satış** — birini seç (öneri: **alış**, çünkü stander kullanım)
3. "YTL" eski; yeni serilerde "TRY" olabilir, dikkat

**Doldurulacak alanlar:**
- ✅ Doğrulanan series code: `__________________________`
- ✅ Alış/Satış: `__________________________`
- ✅ Sample items count: `_______`
- ✅ Sample first/last value: `_______ → _______`
- ✅ Notlar: `__________________________`

---

### 3.4 EURTRY (EUR/TRY Döviz Kuru)

**Aday series code'ları:**
1. `TP.DK.EUR.A.YTL`
2. `TP.DK.EUR.S.YTL`
3. `TP.DK.EUR.A`

**Doğrulama adımları:**
1. EVDS'de "EUR" veya "Euro" ara
2. USD ile aynı alış/satış seçimini koru (tutarlılık)

**Doldurulacak alanlar:**
- ✅ Doğrulanan series code: `__________________________`
- ✅ Alış/Satış: `__________________________`
- ✅ Sample items count: `_______`
- ✅ Sample first/last value: `_______ → _______`
- ✅ Notlar: `__________________________`

---

### 3.5 TLREF (Türk Lirası Gecelik Referans Faiz) — OPSİYONEL

**Aday series code'ları:**
1. `TP.TLREF.DAILY`
2. `TP.GECELİK.TLREF`
3. `TP.PR.MT01`

**Doğrulama adımları:**
1. EVDS'de "TLREF" veya "TL Gecelik Referans" ara
2. Günlük basit faiz oranı (%/yıl)
3. **Bulunamazsa skip edilebilir** — Sprint-5.6 risk-free fallback zinciri:
   - 1: TLREF
   - 2: **KPPF Medyanı** (otomatik fallback, kod gerek yok)
   - 3: Sabit %30

**Doldurulacak alanlar:**
- ☐ Doğrulanan series code: `__________________________`  (boş bırak → KPPF fallback kullanılır)
- ☐ Frekans: `__________________________`
- ☐ Birim (%/yıl): `__________________________`
- ☐ Sample items count: `_______`
- ☐ Notlar: `__________________________`

---

## 4. Genel Doğrulama Listesi

PR-A'ya başlamadan önce aşağıdakilerin **hepsi** ✅ olmalı:

- [ ] Tüm zorunlu 4 series code (XU100, XAU, USD, EUR) doğrulandı
- [ ] Her seri için **sample fetch ≥ 1000 satır** döndü
- [ ] Tarih formatı (DD-MM-YYYY) kabul edildi
- [ ] Birim bilgisi (özellikle altın kuruş/TL) net yazıldı
- [ ] Tarihsel veri **en az 2021-01-01**'e kadar geri gidiyor
- [ ] TLREF doğrulandı VEYA "KPPF fallback kullan" kararı verildi
- [ ] EVDS_API_KEY production'da çalışıyor (mevcut CPI ingest doğrular)

---

## 5. Sign-Off

Bu bölüm doldurulup commit edildikten sonra PR-A başlatılabilir.

**Doğrulayan:** `Mehmet Avsar`
**Tarih:** `__________________________`
**PR-A başlatma onayı:**
- [ ] Onaylanmış — PR-A açılabilir
- [ ] Eksikler var (yukarıda not edildi) — düzeltme bekleniyor

**Ek notlar:**

```
(EVDS portal sürprizleri, alternatif kod tercihleri, vb.)
```

---

## 6. PR-A Etkisi

Bu doküman onaylandıktan sonra PR-A açılır:

- `_lib/benchmark/series-config.ts` — doğrulanan kodlar buraya hardcoded
- `_lib/benchmark/evds-adapter.ts` — generic EVDS fetcher (CPI ingest pattern)
- `/api/cron/benchmark-backfill?series=ALL` — 2021-01-01 → bugün ingest
- `benchmark_points` tablosu doldurulur — 4 seri × ~1300 satır = ~5200 satır
- TLREF (opsiyonel): `tlref_daily` ayrı tablo

Eğer ingest sırasında **boş satır** veya **format hatası** dönerse → buraya
dön, yanlış series code'u not et, **PR-A geri çekilir**, doğrulama döngüsü
tekrarlanır.
