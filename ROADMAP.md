# Mehmet's Assets — Roadmap

Son geliştirme moladan önce belirlenen eksiklerin sprint planı. Her sprint
~1-2 PR boyutunda, bağımsız olarak deliver edilebilir. Önceliklendirme:
🔴 kritik · 🟠 yüksek · 🟡 orta · 🟢 düşük.

---

## Sprint 1 · Test Altyapısı + Güvenlik 🔴
**Tema**: Sessiz regression riskini bitir, debug endpoint'i kapat.

**Sorun**:
- ATR/RS/pattern/trade plan/sektör momentum hesabı için **hiç test yok**.
  Bir yanlış edit tüm Tarama/Portföy sayısallarını sessizce bozar.
- `/api/debug-rates` public — Truncgil ham response'unu sızdırıyor.
- `rate_snapshots` freshness kontrolü yok — bozuk veri (XAU=1.0 vb.)
  fallback olarak haftalarca kalır.

**Görevler**:
- [ ] `vitest` + `@vitest/coverage-v8` ekle, `npm test` script'i
- [ ] CI workflow (GitHub Actions): her PR'da `npm test` + `tsc --noEmit`
- [ ] Test dosyaları:
  - [ ] `_lib/trade-plan.test.ts` — buildTradePlan health states
  - [ ] `_lib/pattern-detection.test.ts` — ATH/cup/double_bottom fixture'lar
  - [ ] `_lib/stock-screening.test.ts` — RS, computeSectorMomentum
  - [ ] `_lib/portfolio-risk.test.ts` — auditPortfolio uyarı tipleri
  - [ ] `ekstre/actions.test.ts` — parseTurkishDate/Amount, applyRule
- [ ] `/api/debug-rates`: auth required + sadece dev'de açık (NEXT_PUBLIC_ENV
  veya cookie kontrolü) VEYA tamamen sil
- [ ] `rate_snapshots` sanity check: XAU > 1000, USD 10-200 arası,
  EUR > USD kuralı vs. dışındaysa persist yapma

**Acceptance**:
- `npm test` 50+ test yeşil geçiyor
- Her PR'da CI test step koşuyor
- Debug endpoint'i loginsiz açılmıyor
- Kötü Truncgil response → `rate_snapshots` tablosuna yazılmıyor

**Tahmini boyut**: 2-3 PR

---

## Sprint 2 · Veri Güvenliği + Undo 🔴
**Tema**: Yanlışlıkla silmenin maliyeti sıfır olsun.

**Sorun**:
- Transactions/holdings için **delete = kalıcı**. Yanlışlıkla silinen kayıt
  geri alınamaz (hash dedup re-import için yardımcı değil — yeni ID üretir).
- WAC re-hesabı şüpheli: trade düzenle/sil senaryosunda holdings.wac_try
  otomatik güncellenmiyor mu? Migration trigger'ı vardı ama test edilmedi.
- Kim ne zaman ne sildi/değiştirdi belli değil (audit log yok).

**Görevler**:
- [ ] Migration 0018: `transactions.deleted_at` (soft delete kolonu)
- [ ] `deleteTransaction` → `deleted_at = now()` set, hard delete kaldır
- [ ] `listTransactions` → `.is("deleted_at", null)` filtresi
- [ ] UI: silme sonrası 30 sn "Geri al" toast butonu (`undoDeleteTransaction`
  server action — deleted_at'i null'a çevirir)
- [ ] Migration 0019: `audit_log` tablosu (id, user_id, table_name,
  record_id, action, before_jsonb, after_jsonb, created_at)
- [ ] Postgres trigger: transactions/trades/holdings tablosunda
  insert/update/delete → audit_log'a yaz
- [ ] /ayarlar'a "Aktivite Geçmişi" sekmesi (son 100 audit log)
- [ ] WAC re-hesabını manuel test et: trade sil → holdings.wac_try değişiyor mu?
  Test fixture + assertion ekle.

**Acceptance**:
- Bir gideri sil → 30 sn içinde "Geri al" → geri gelir
- /ayarlar'da silinen işlemleri görebilirsin
- Trade düzenleme sonrası WAC doğru hesaplanıyor (test ile doğrulanmış)

**Tahmini boyut**: 2-3 PR

---

## Sprint 3 · Otomasyon + Tazelik Bilgisi 🟠
**Tema**: Manuel iş yok, ne kadar taze olduğunu gör.

**Sorun**:
- `captureDailySnapshot()` var ama tetikleyen yok — Özet sayfasını her gün
  açmazsan tarihsel grafikler kopuyor.
- Hiçbir kartta "X dk önce" timestamp'i yok — stale veriyi yakalamak zor.
- Yahoo bloke ederse 4 sayfa birden boş döner (BIST hisse + endeks + RS +
  pattern hep Yahoo'ya bağlı).

**Görevler**:
- [ ] `vercel.json`'a cron: günlük 18:30 UTC (TR 21:30) → `/api/cron/snapshot`
- [ ] `src/app/api/cron/snapshot/route.ts`: tüm aktif user'lar için
  captureDailySnapshot çağır (CRON_SECRET ile auth)
- [ ] `wealth_snapshots` için aylık cron (ayın son trading günü)
- [ ] UI: her kart başlığına `· 5dk önce` formatında badge
  - Truncgil update_date → topbar FX şeridine
  - Yahoo regularMarketTime → Tarama/Portföy başlığına
  - rate_snapshots.updated_at → Özet altın/döviz kartlarına
- [ ] Yahoo fallback stratejisi:
  - Yahoo 4xx/5xx → borsapy Python serverless'a fallback
  - `api/bist-quotes.py` (borsapy) endpoint'i: paralel batch
  - asset-rates pattern'i gibi: 3 deneme + son iyi rate'i göster

**Acceptance**:
- Cron 24 saatte 1 kez snapshot alıyor (Vercel logs'tan görünür)
- Truncgil yenilenme zamanı topbar'da görünür
- Yahoo down'a düşüyor → /tarama otomatik borsapy'e fallback yapıyor

**Tahmini boyut**: 3 PR

---

## Sprint 4 · Mobil + UX Polish 🟠
**Tema**: Telefondan da kullanılabilir olsun, listelerde aksiyonu hızlandır.

**Sorun**:
- /tarama 13 kolon, /yatirimlar 9 kolon → mobilde yatay scroll cehennem.
- /giderler'de 50 satırı tek tek silmek zorundasın.
- İşlemlerde merchant'a göre arama yok.

**Görevler**:
- [ ] Mobil-first table: ≤768px ekran → tablo yerine kart layout
  (sembol başlığı + alttaki KPI'lar dikey istif)
- [ ] Sticky first column (`position: sticky; left: 0`) geniş tablolarda
- [ ] /giderler /gelirler /islemler:
  - Multi-select checkbox kolonu
  - "Seçilenleri sil" / "Kategoriyi değiştir" / "Kişiyi değiştir" toplu aksiyon
  - Search bar (merchant_raw + description ILIKE)
  - Hızlı tarih filtresi chip'leri (Bu Ay / Geçen Ay / Son 3 Ay)
- [ ] /yatirimlar /tarama: kolon görünürlük seçici (kullanıcı kapatabilsin)
- [ ] Privacy mode iyileştirme: blur yerine placeholder text (gerçek gizlilik)

**Acceptance**:
- iPhone Mini'de /tarama kullanılabilir
- /giderler'de 20 işlem 2 tıkla kategorize edilebilir
- /islemler'de "MIGROS" yazınca filtrelenir

**Tahmini boyut**: 3-4 PR

---

## Sprint 5 · Watchlist + Alert 🟡
**Tema**: Sahip olmadığın hisseleri takip et, kritik olaylarda bildirim al.

**Sorun**:
- Tarama BIST 100'ü gösteriyor ama kişisel "takip listem" yok.
- Risk uyarıları sadece sayfa açınca görünüyor. Hisse stop altına düşse
  haberim olmuyor.

**Görevler**:
- [ ] Migration 0020: `watchlist_items` tablosu
  (user_id, symbol, target_price, stop_price, note, created_at)
- [ ] /takip sayfası: kişisel hisse listesi
  - Tarama'da her satırın yanında ⭐ "Takibe ekle" butonu
  - Hedef/stop fiyat girişi
  - Status: hedef tetiklendi / stop tetiklendi / nötr
- [ ] Migration 0021: `alerts` + `alert_rules` tabloları
  - rule: symbol, condition (above/below), price, channel (in-app/email)
- [ ] Cron-based değerlendirme (gün sonu çalışır)
- [ ] Topbar'da bildirim çanı: okunmamış alerts sayısı
- [ ] /bildirimler sayfası: son 30 gün alerts
- [ ] Opsiyonel: email digest (Resend / Postmark) — günlük özet

**Acceptance**:
- /tarama'dan bir hisse takibe alınabilir
- Hisse stop fiyatının altına düşerse topbar çanı kırmızı yanar
- /bildirimler'de geçmiş alerts görünür

**Tahmini boyut**: 3-4 PR

---

## Sprint 6 · Benchmark + Vergi + Temettü 🟡
**Tema**: Gerçek getiri net görünsün.

**Sorun**:
- "Portföyüm yıllık ne kazandırdı? XU100'ü geçtim mi?" cevabı yok.
- Temettüleri ayrı tracking yok — gelirler'e elle giriliyor olabilir.
- BSMV/stopaj hesabı yok → "ne kadar net cebime kalır" bilinmiyor.

**Görevler**:
- [ ] /raporlar'a "Benchmark Karşılaştırma" kartı:
  - Portföy getiri eğrisi (daily_snapshots'tan)
  - XU100 getiri eğrisi (aynı periyot)
  - Difference area chart (overlap/underperform)
- [ ] Migration 0022: `dividends` tablosu
  (id, user_id, asset_id, ex_date, payment_date, gross_per_share,
  net_per_share, currency, source)
- [ ] /islemler'e "Temettü" işlem tipi (cash flow trigger değil, position info)
- [ ] Portföy K/Z hesabına temettü dahil et
- [ ] Vergi hesabı: realized_lots'a stopaj % (TR: %10 banka, %15 BIST)
- [ ] /yatirimlar'a "Net getiri (vergi dahil)" toggle

**Acceptance**:
- /raporlar'da portföy vs XU100 grafiği var
- Bir temettü kaydı portföy K/Z'sini doğru artırıyor
- Net getiri hesabı vergi sonrası rakamı gösteriyor

**Tahmini boyut**: 3 PR

---

## Sprint 7 · Refactor + Polish 🟢
**Tema**: Kod kalitesi + minor UX.

**Sorun**:
- /ozet 700 LOC, /yatirimlar 600+ LOC tek dosyada — bakımı zorlaşıyor.
- Inline style her yerde — design token disiplini yok.
- i18n yok (Türkçe hardcoded).
- Privacy mode CSS blur — gerçek değil.

**Görevler**:
- [ ] Component bölme:
  - /ozet → `WealthHeader`, `TodaysChange`, `BeneficiaryBreakdown`, …
  - /yatirimlar → `PortfolioCards`, `PositionTable`, `RiskOverlay` zaten ayrı, devam
- [ ] CSS modules veya Tailwind migration (büyük iş, ayrı RFC gerekir)
- [ ] Design token CSS variable sözlüğü (`spacing`, `radius`, vs.)
- [ ] i18n: `next-intl` kur, mevcut stringleri çıkar
- [ ] Privacy mode v2: değerler `•••` placeholder ile değiştirilir, DOM'da
  da görünmez
- [ ] Error boundary component
- [ ] Skeleton loaders büyük sayfalar için

**Acceptance**:
- /ozet < 400 LOC
- Privacy mode'da DOM inspect ile veriler okunmaz
- EN dil desteği eklenmeye hazır altyapı var

**Tahmini boyut**: 4-5 PR

---

## Bonus / Backlog (gelecek sürümler)

- **Backtest engine** (bt_v18'den port) — kendi trade plan'larını
  geçmişte simüle et
- **KAP integration** — Python Selenium veya yarı manuel feed
- **AI funnel** — Light/Deep AI catalyst review (OpenAI maliyeti)
- **Crypto exchange integration** — Binance/Garanti BBVA Crypto API
- **Multi-currency portfolio view** (TRY + USD ikili görünüm)
- **Goal tracking** ("1M TL hedef · %62'de")
- **What-if scenarios** ("100 TUPRS al simülasyonu")
- **Mobile app** (PWA install prompt + offline mode)

---

## Süreç notları

- Her sprint sonunda bu dosyaya ✅ koy
- Sprint sırası değişebilir — kritiklik > kullanıcı isteği
- Her PR mümkün olduğunca tek sprint kapsamında kalmalı
- Test sprint'i (1) baştaki olmalı — diğerlerinin emniyet ağı.
