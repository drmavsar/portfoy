# Cron HTTP Çağrıları — Audit ve Servis Katmanı Önerisi

**Tarih:** 2026-05-30
**Tetikleyici:** CPI ingest'te Vercel Deployment Protection 401 sorunu
**Kapsam:** Tüm cron route'larındaki function-to-function HTTP çağrıları + Sprint-6 öncesi teknik borç planı

---

## TL;DR

8 cron route'tan **yalnız 2'si** internal Python endpoint'ine HTTP çağrısı yapıyor (cpi-ingest, tefas-prices). Bunlar gerçek Python kütüphanelerine bağımlı (`tefas-crawler`, EVDS); kolayca Node'a indirgenmez. Diğer 6 cron route doğrudan server action çağırıyor (HTTP yok, sorun yok).

**Sprint-6 öncesi tek kritik konu:** Vercel Deployment Protection'ın internal function-to-function çağrılarını engellememesi. Çözüm B (Production URLs için protection kapat) kalıcı. Plan B (`NEXT_PUBLIC_BASE_URL` env var) kalıcı bir workaround.

---

## 1. Cron Route Envanteri

| Route | Bağlı olduğu logic | HTTP çağrısı? | Risk |
|---|---|---|---|
| `/api/cron/snapshot` | `computeUserSnapshot` (inline) + `getAssetRates`/`getStockPrices` (lib) | ❌ Yok (lib fonksiyonları dışarı `truncgil.com` vb. çağırır, internal değil) | — |
| `/api/cron/cpi-ingest` | `/api/cpi-ingest.py` (Python serverless) | ✅ **internal HTTP** | **Yüksek — Deployment Protection** |
| `/api/cron/tefas-prices` | `/api/tefas-prices.py` (Python serverless) via `fetchTefasPrices` | ✅ **internal HTTP** | **Yüksek — Deployment Protection** |
| `/api/cron/fund-returns-refresh` | `refreshAllFundReturns()` server action | ❌ Yok (DB read/write only) | — |
| `/api/cron/fund-scores-refresh` | `refreshAllFundScores()` server action | ❌ Yok (DB read/write only) | — |
| `/api/cron/cpi-manual-import` | Inline UPSERT | ❌ Yok | — |

## 2. Sorunlu HTTP Çağrıları — Detaylı

### 2.1 `cpi-ingest` → `/api/cpi-ingest.py`

**Neden HTTP?** Python serverless function (Vercel runtime ayrı). EVDS API çağrısı için `urllib.request` + JSON parse. Node'a port etmek mümkün, ama:
- TCMB EVDS HTTP endpoint'i basit (key header + query string). Node'da `fetch` ile yapılabilir
- Eski cmpat header (`key` query param) ve content-type/JSON handling
- **Effort: ~50 satır TS** (Python equivalent'i)

**Servis katmanına indirgeme:** ✅ Mümkün
- `_lib/tefas/cpi-fetch-evds.ts` — pure async function
- Direct call from `cron/cpi-ingest/route.ts` → HTTP yok
- Python endpoint silinir veya legacy fallback olarak kalır

### 2.2 `tefas-prices` → `/api/tefas-prices.py`

**Neden HTTP?** `tefas-crawler` PyPI paketi kullanılıyor. Bu paket TEFAS'ın resmi web sayfasını parse ediyor (HTML scrape + JSON API karışımı). Node alternatifi yok.

**Servis katmanına indirgeme:** ⚠️ Zor
- Seçenek A: TEFAS HTML/JSON endpoint'lerini Node'da scrape et (~200-300 satır TS; tefas-crawler logic'inin replikasyonu)
- Seçenek B: Python kalsın ama protection bypass çözülsün (mevcut yaklaşım)
- Seçenek C: Üçüncü taraf TR fon API'si (KAP, vb.) — mevcut yok

**Sprint-6 önerisi:** Şimdilik Python kalsın. TS port'u Sprint-7 sonrası teknik borç olarak listeye eklensin (effort/risk büyük, kazanım orta).

---

## 3. Çözüm Karşılaştırması (Senin Verdiğin)

| Çözüm | Etki | Effort | Tavsiye |
|---|---|---|---|
| **B — Deployment Protection kapat (production)** | Production URL public erişilebilir; CRON_SECRET + middleware auth zaten korumalı | 0 (Vercel UI 1 tıklama) | ✅ **Önerilen kalıcı çözüm** |
| **A — `NEXT_PUBLIC_BASE_URL` env var** | Hard-coded production alias; deployment protection bypass etmez | 0 (env var + redeploy) | ⚠️ Workaround; B kapatılamazsa |
| **C — Vercel Automation Bypass Secret** | Cron Bearer header'da bypass token; karmaşık ama izole | ~20 satır kod | ❌ Gereksiz; B yeterli |
| **D — Manuel CSV import** | Mevcut endpoint (PR #133); EVDS bypass | 0 | Son çare |

## 4. Senin Önerdiğin Sıra (Onaylandı)

1. ✅ Vercel UI → Deployment Protection → Production URLs disable
2. ✅ `curl -i ... /api/cron/cpi-ingest?debug=1` tekrar (header'da `x-wrapper-version: 2026-05-30-pr135-baseurl-fix` görünmeli)
3. ✅ Debug çalışırsa → CPI ingest → NAV ingest → Returns refresh → Scores refresh
4. ✅ `fund_scores_cache` dolunca → benim hazırlayacağım 5'li rapor:
   - İlk 20 Mehmet Score
   - Her kategori için ilk 5 fon
   - Score dağılımı histogram (0-29 / 30-49 / 50-69 / 70-89 / 90-100)
   - Hatalı/boş kalan fonlar (skor null, components < 5, warning üretenler)
   - Veri kalitesi yorumu

## 5. Sprint-6 Sonrası Teknik Borç Listesi

| # | İçerik | Effort | Aciliyet |
|---|---|---|---|
| TB-1 | `cpi-ingest.py` → Node `_lib/tefas/cpi-fetch-evds.ts` portu | ~50 satır + test | Düşük (B çözümü stabilse) |
| TB-2 | `tefas-prices.py` → Node port (tefas-crawler equivalent) | ~200-300 satır + test | Orta (mevcut Python stabil değilse) |
| TB-3 | Function-to-function call'lar için **istemci sınıfı** (auth token forward, retry, timeout) | ~100 satır | Düşük |
| TB-4 | Cron endpoint'lerine `wrapper_version` tagging genelleştirmesi (mevcut pattern PR #135'te sadece cpi-ingest'te) | ~30 satır | Düşük (deployment confirmation için faydalı) |

## 6. Eylem Önerisi

Bu PR **dokümantasyon** içerir (kod değişikliği yok). Senin sırayı uygula:

1. Deployment Protection kontrol et + production'a kapat
2. CPI debug tekrar dene
3. Yanıt başarılıysa 4 cron zincirini çalıştır
4. JSON çıktılarını paylaş
5. Ben rapor hazırlayım
6. Rapor temizse → Sprint-6 tasarım PR'ı

TB-1...4 teknik borç olarak listede, Sprint-7+ kapsamında ele alınabilir.
