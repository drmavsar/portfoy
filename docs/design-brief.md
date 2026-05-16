# Mehmet's Assets — Tasarım Brief'i (claude/design için)

> **Amaç:** Bu doküman uygulamanın ekranlarını, içeriklerini, kullanıcı
> akışlarını, bileşen envanterini ve görsel tonunu tanımlar. Tasarımcı
> bu brief'i okuyup uygulamanın bütün yüzlerini eksiksiz tasarlayabilmeli;
> mühendis (ben) ise tasarım gelince doğrudan üretebilmeliyim.
>
> Brief tek bir karar değil; "doğru sorular sorulmuş" bir spec.

---

## 0. Tek Cümlede Ürün

"Mehmet'in 4-5 kişilik hane bütçesini ve çok-kanallı yatırım portföyünü
tek terminalde gösteren; otomatik veri çekip kuralla sınıflandıran;
piyasayı reel getiri ve momentum lensiyle okutan bir kişisel ERP."

---

## 1. Kullanıcı, Bağlam, Cihaz

### 1.1 Birincil persona
- **Mehmet**, 50+, BIST'i yakından takip eden bireysel yatırımcı.
- 4-5 kişilik hane (Ev, Ahmet Burak — İYTE Gülbahçe öğrencisi, Salih,
  Anne/Baba) için harcama ve gelir akışını yöneten karar verici.
- Power-user: tablo, grafik, sayı yoğunluğunu tolere eder, hatta tercih
  eder. "Toy" görünüşten kaçınalım.

### 1.2 Cihaz öncelik sırası
1. **Masaüstü (1440×900)** — birincil çalışma yüzeyi (≥ 80% kullanım).
2. **Geniş masaüstü (1920×1080)** — dashboard'da bilgi yoğunluğunu artır.
3. **Tablet (iPad, 1024px)** — okunabilirlik korunmalı, hafif yeniden akış.
4. **Mobil (≤ 640px)** — onay ve hızlı bakış (drafts, screener top10,
   bakiye özeti). Tam tablo düzenleme mobilde beklenmiyor.

### 1.3 Dil & lokalizasyon
- Bütün arayüz **Türkçe**. Etiketler kısa, yatırımcı jargonuyla uyumlu
  ("Reel Getiri", "Realize K/Z", "Birim Maliyet").
- Sayılar: **tr-TR** formatı (1.234.567,89 ₺). Tablolarda **tabular-nums**.
- Tarih: dd.MM.yyyy. Saat 24h (HH:mm).
- Para: TRY ana; her tutarın yanında opsiyonel USD/EUR overlay (tooltip).

### 1.4 Erişilebilirlik
- WCAG AA kontrast.
- Renk asla tek başına anlam taşımaz (artı/eksi → ok ikonu + işaret).
- Klavye odak halkası belirgin.
- Tablo ve form etiketleri vazgeçilmez.

---

## 2. Tasarım Tonu

| Boyut | Yön |
|------|-----|
| Karakter | Bloomberg / Koyfin / Linear karışımı: bilgi yoğun, ayık, profesyonel |
| Yoğunluk | Yüksek — boşluk sevimli ama veri sığması öncelik |
| Renk | Nötr arka plan + tek vurgu; pozitif yeşil, negatif kırmızı, uyarı amber |
| Hareket | Az; sadece veri değişimi, ipucu, tooltip için |
| Şekil | Köşeler 6–8px; kart radius 12px; pill rozetler |
| Tipografi | Sans-serif, görüntüleme için 14px ana, 12px etiket, 13px tablo; tabular figures şart |
| Mod | Light + dark — ikisi de eşit önemli; piyasa saatleri için dark default |

> Renk paleti placeholder olarak `globals.css` içinde tanımlandı; nihai
> kararı sen vereceksin. Yeşil/kırmızı için sektör standardı tonlarını
> önceriz (örn. `#15803d` / `#b91c1c`).

---

## 3. Bilgi Mimarisi

```
/login                          (auth)
/                               → /dashboard

(app shell with persistent sidebar)
/dashboard                      Ana Kokpit
/cashflow                       Nakit Akışı
  /cashflow/imports             Yüklenen ekstreler
  /cashflow/imports/[id]        Bir import'un draft review ekranı
  /cashflow/transactions        Tüm işlemler (filtreli arama)
  /cashflow/budgets             Bütçe planlama (aylık + yıllık)
/wealth                         Varlık Yönetimi
  /wealth/portfolios/[slug]     Bir alt-portföy (Ana / Ahmet Burak / Salih)
  /wealth/assets/[symbol]       Varlık detayı + işlem geçmişi
  /wealth/trades/new            İşlem ekle (modal/page)
/screener                       Piyasa Radarı
  /screener/[symbol]            Hisse detayı (teknik + temel + KAP)
/settings                       Kurallar & Ayarlar
  /settings/dimensions          Kategori / faydalanıcı / custody
  /settings/rules               Kural motoru
  /settings/accounts            Hesap tanımları
  /settings/integrations        borsapy, TCMB, KAP, Twitter
```

---

## 4. App Shell

### 4.1 Yapı
- **Sol Sidebar** (~ 224px, sabit) — global navigasyon.
- **Üst Bar** (~ 56px) — sayfa başlığı, breadcrumb, global filtreler
  (alt-portföy seçici, tarih aralığı), arama, kullanıcı menüsü.
- **İçerik** — `max-w-screen-2xl` merkezli, padding 24–32px.
- **Mobil**: sidebar → bottom-tab dönüşür (5 ikon).

### 4.2 Sidebar bileşenleri
- Logo/hane adı (örn. "Hasan Hanesi") — tıklanırsa hane seçici drawer.
- Navigasyon grubu (Dashboard, Cashflow, Wealth, Screener, Settings).
- Hızlı eylem CTA: "+ İşlem Ekle" (büyük buton).
- Alt: tema toggle, kullanıcı avatarı, çıkış.

### 4.3 Üst-bar global filtre çubuğu
Sayfaya göre adapte olur ama üç sabit slot:
1. **Hane / Alt-portföy** seçici (Ana, Ahmet Burak, Salih, Tümü)
2. **Tarih aralığı** (Bu Ay / Geçen Ay / YTD / Son 12 Ay / Özel)
3. **Para birimi katmanı** (TRY, USD-overlay, EUR-overlay, Reel/Enflasyon-adj.)

---

## 5. Ekran 1 — Ana Kokpit (Dashboard)

### 5.1 Amaç
Kullanıcı sabah açtığında 30 saniyede "ne oldu?" sorusunu yanıtlayan
özet. Drill-down için her widget tıklanır.

### 5.2 Hero Şerit (4 KPI Kartı, yatay)
| Kart | İçerik | Vurgu |
|------|--------|-------|
| **Net Servet** | Σ tüm hesaplar + portföyler (TRY) | Δ günlük, Δ aylık, sparkline 30g |
| **Bu Ay Nakit Akışı** | Gelir / Gider / Tasarruf oranı | "Geçen aya göre +%X" |
| **Portföy Reel Getiri (YTD)** | Σ portföy değeri / CPI-adjusted | Kıyas: Altın, USD, BIST100 — tek satırda |
| **Açık Kart Borcu** | Toplam ödenmemiş + son ödeme tarihi | Renk: amber/kırmızı eşik |

### 5.3 Orta Bölge — 2 sütun
**Sol sütun (geniş, ≈ 60%):**
- **Toplam Servet Waterfall** (son 12 ay)
  - Başlangıç → +Gelir → −Gider → +/−Yatırım K/Z → +Katkı → Bitiş
  - Renkli sütunlar; tıklanırsa breakdown drawer.
- **Aylık Nakit Akışı Bar Grafik** (12 ay): gelir (yeşil yukarı) /
  gider (kırmızı aşağı) / net (çizgi).
- **Reel vs Nominal Getiri Grafiği** (overlay): portföy, CPI, USD, EUR,
  Altın, BIST100 normalize 100'den başlatılmış line chart.

**Sağ sütun (≈ 40%):**
- **Faydalanıcı bazlı harcama** (donut + legend): Ev/Salih/Ahmet Burak/Anne-Baba/Ortak.
- **Varlık dağılımı** (treemap): Hisse, FX, Altın, Kripto, Nakit.
- **Bu Hafta Top 5 Harcama** (liste): merchant, kategori, tutar.

### 5.4 Alt Bölge — Korelasyon & Piyasa
- **Korelasyon ısı haritası** (sembol × sembol, 90 gün rolling) — sadece
  portföyde olan varlıklar. Renk skalası -1 (kırmızı) → +1 (mavi).
- **Sektör Rotasyon Çubuğu**: XBANK, XHOLD, XGIDA vs. son 1 ay performans.
- **Canlı KAP Akışı (cashtag stream)**: portföyündeki hisseler için son 10
  KAP bildirimi + LLM özet + polarite rozeti (pozitif/nötr/negatif).
- **Twitter cashtag akışı** (opsiyonel, kapanabilir): "$ASELS $THYAO" gibi
  son tweet'ler, sahte hesap filtresi notu.

### 5.5 Boş durum
- Yeni kullanıcı için "İlk ekstreni yükle" / "İlk işlemini gir" CTA'ları.
- Onboard checklist: ☐ hesap ekle ☐ ekstre yükle ☐ ilk varlık gir.

---

## 6. Ekran 2 — Nakit Akışı (Cashflow)

### 6.1 Sayfa tabları
`Genel Bakış` · `İşlemler` · `Ekstreler` · `Bütçeler` · `Tekrar Eden`

### 6.2 Genel Bakış
- KPI: Bu ay gelir, gider, tasarruf, beklenen sonraki gelir.
- "Burn rate" bar: bütçe % tüketimi (kategori bazlı, sıralı liste).
- Faydalanıcı pasta + kategori pasta yan yana.
- Aylık trend çizgisi (12 ay).

### 6.3 Ekstreler
- **Sürükle-bırak yükleme alanı** (CSV / XLSX / PDF*).
  - PDF için "OCR'a kuyrukta" rozeti.
- Yüklenen ekstreler listesi (durum: bekliyor / inceleme / işlendi).
- Her satır tıklanırsa **draft review** ekranı açılır.

### 6.4 Draft Review (Gözetimli Otomasyon)
Tek ekranda ekstrenin satır satır incelendiği yer.
- **Üst özet**: dosya adı, tarih aralığı, satır sayısı, "X otomatik / Y inceleme bekliyor".
- **Tablo kolonları**: Tarih · Açıklama (merchant_raw) · Tutar · Yön ·
  Önerilen Kategori (chip, düzenlenebilir) · Faydalanıcı (chip) ·
  Transfer mi? (switch) · Taksit (n/m) · Güven% · Eylem (✓ kabul / ✎ düzenle / ✕ yoksay).
- **Kural önerisi kutucuğu**: 3+ benzer merchant uncategorized ise "X'i her zaman *Market* yap?" gibi inline öneri.
- **Bulk eylem**: filtrele → toplu kategori ata.
- **Commit butonu**: "12 satırı işle" — onaylananları transactions'a yazar.

### 6.5 İşlemler (Transactions)
- Power-user tablo: tarih, hesap, merchant, kategori (chip), faydalanıcı
  (chip), tutar, K/Z direction, taksit göstergesi.
- Sol panel: filtreler (tarih, hesap, kategori, faydalanıcı, etiket, kart
  son 4 hanesi, transfer dahil/hariç).
- Tıklanırsa **işlem drawer'ı** (düzenle, parent purchase'a bak, kurala dönüştür).

### 6.6 Bütçeler
- Yıllık plan tablosu: kategori × ay matrisi. Her hücre: bütçe / gerçekleşen / fark.
- **Enflasyon projeksiyonu**: "TÜFE'ye göre sonraki yılı oluştur" butonu;
  kullanıcı çarpanı görür, override edebilir.
- Faydalanıcı bazlı plan ayrı sekme.

### 6.7 Tekrar Eden
- Maaş, kira, faturalar, abonelikler — kart liste.
- "Önümüzdeki 30 günde beklenen" özet şeridi.

---

## 7. Ekran 3 — Varlık Yönetimi (Wealth)

### 7.1 Üst KPI
- Toplam portföy değeri, gerçekleşmemiş K/Z, gerçekleşmiş K/Z (YTD),
  TWR (YTD), reel getiri (CPI-adj YTD), maks. drawdown (son 12 ay).

### 7.2 Alt-Portföy Sekmeleri
"Tümü" · "Ana" · "Ahmet Burak" · "Salih"

### 7.3 Varlık Listesi (DataGrid)
Kolonlar:
- Sembol · Ad · Sınıf (chip: BIST, FX, Altın, Kripto)
- Adet (tabular) · WAC (TRY) · Son Fiyat · Piyasa Değeri
- Realize K/Z (TRY, %) · Bekleyen K/Z (TRY, %)
- Saklama (chip: Banka, Midas, Garanti Kripto, Kasa)
- Portföy (chip: Ana / Ahmet Burak / Salih)
- 30g sparkline · 52H bandında konum

Tablo özellikleri: çoklu seçim, kolon yeniden sıralama, sıralama,
CSV export, satır expand → işlem geçmişi.

### 7.4 Görselleştirme Şeridi (Listenin altında)
- **Sunburst**: Portföy → Sınıf → Sembol dağılımı.
- **Custody Treemap**: Banka, Midas, Garanti Kripto, Kasa — TRY ağırlık.
- **Reel vs Nominal overlay** (zaman bazlı, 1G/1H/1A/YTD/1Y/Tümü toggle).

### 7.5 Varlık Detay Sayfası (`/wealth/assets/[symbol]`)
- Üst başlık: Sembol, ad, sınıf, sektör, kart KPI'lar (poz, WAC, K/Z,
  ağırlık%, beta vs XU100).
- Fiyat grafiği (mum + hacim, MA50/MA200, RS line).
- İşlem geçmişi tablosu (al/sat, lot bazlı, realize K/Z).
- KAP bildirimleri panel — LLM özet + polarite.
- "+ Bu sembole işlem ekle" CTA.

### 7.6 İşlem Ekle
Modal veya tam sayfa: portföy seçici, custody, varlık (typeahead),
side, adet, fiyat, currency, FX, tarih, komisyon, vergi, not. Önizleme:
"Bu işlem WAC'ı X → Y yapacak".

---

## 8. Ekran 4 — Piyasa Radarı (Screener)

### 8.1 Üst kontrol bandı
- Tier filtre (TIER1 / 2 / 3 / Watch / Tümü).
- Minimum composite score slider.
- Sektör filtre çoklu.
- "Sadece portföyümdekiler" / "Sadece watchlist" toggle.
- "Breakout var" / "Volume surge" / "USD-confirmed" rozet filtreleri.

### 8.2 Sıralı liste (DataGrid)
Kolonlar:
- Sembol · Ad · Sektör
- Composite Score (büyük, renkli)
- Tech Score · Fund Score · Catalyst Score (alt skorlar)
- Rozetler: ↗ Breakout, ⚡ Vol Surge, ◈ Sector Leader, ★ Divergence, ◻ Base Forming
- RS Rating · 52H'den uzaklık (%) · Hacim sürpriz oranı
- Son fiyat · 30g sparkline
- Aksiyon: ⭐ watchlist'e ekle, 👁 detay aç

### 8.3 Hisse Detay (drawer veya tam sayfa)
Üç sekme:
- **Teknik**: tüm Stage-1 metrikleri tablo + grafik
- **Temel**: tüm Stage-2 metrikleri tablo + çeyreklik trend
- **Katalist**: KAP olayları zaman çizgisi, LLM özetleri, polarite

### 8.4 Boş & error
- Tarama yoksa: "Bugünün taraması henüz çalışmadı. Son tarama: X saat önce."
- ETL hatalıysa: "borsapy son çalıştırmasında hata aldı — Settings → Integrations'tan kontrol et."

---

## 9. Ekran 5 — Kurallar & Ayarlar (Settings)

Tab yapısı: `Tanımlamalar` · `Kurallar` · `Hesaplar` · `Entegrasyonlar` · `Hesabım`.

### 9.1 Tanımlamalar (Dimensions)
- Üç sütun yan yana: **Kategoriler** (parent/child ağaç), **Faydalanıcılar**,
  **Saklama Lokasyonları**.
- Her birinde inline ekle / yeniden adlandır / arşivle.
- Renk ve ikon seçimi.
- Etiketler ayrı sekme.

### 9.2 Kurallar
- Liste: öncelik, ad, eşleştirme özeti, aksiyon özeti, hit sayısı, son tetik.
- Sürükle-bırak öncelik sıralama.
- **Yeni Kural Builder** (modal):
  - Eşleştirme: hesap, kart son 4, yön, tutar aralığı, merchant
    içerir/regex, açıklama içerir.
  - Aksiyon: kategori ata, faydalanıcı ata, transfer işaretle,
    karşı hesap, taksit toplamı, yoksay, etiket ekle.
  - Güven %.
  - "Bu kuralı geçmiş işlemlere de uygula" toggle (geri dönük çalıştırma).

### 9.3 Hesaplar
- Banka hesabı, kredi kartı, brokerage, kripto, kasa tanımları.
- Açılış bakiyesi, limit, ekstre günü, son ödeme günü.
- Custody ilişkisi.

### 9.4 Entegrasyonlar
- borsapy bağlantısı (cron sıklığı, son çalıştırma, kaç satır yazıldı).
- TCMB / KAP / Twitter API key alanları.
- LLM özet sağlayıcı (Anthropic, OpenAI) seçimi.
- Manuel "Şimdi senkronize et" butonları.

### 9.5 Hesabım
- Email, şifre, MFA, oturumlar.
- Çıkış, hesap silme.

---

## 10. Tekrarlayan Bileşen Envanteri

Tasarımcı her bileşenin **default / hover / active / disabled / loading /
empty / error** varyantlarını üretmeli.

### 10.1 Atomik
- Button (primary, secondary, ghost, destructive, sm/md/lg)
- IconButton
- Input (text, number, currency-TRY, date, search)
- Select / MultiSelect / Combobox (typeahead)
- Switch / Checkbox / Radio
- Tag / Chip (kategori, faydalanıcı, custody, sektör)
- Badge / Pill (tier, polarite, breakout vb.)
- Tooltip
- Avatar
- Spinner / Skeleton

### 10.2 Kompozit
- **KPI Card** — başlık, büyük sayı, delta (% + ok), sparkline, alt satır
- **Filter Bar** — yatay slot dizisi, "temizle" linki
- **DataGrid** — sıralama, kolon resize, sticky header, virtual scroll,
  satır expand, çoklu seçim, footer toplamı
- **Drill Drawer** — sağdan açılan, başlık + içerik + footer eylemler
- **Modal**
- **Empty State** — illustration + başlık + açıklama + CTA
- **Toast / Inline alert**
- **Confirm Dialog**
- **Date Range Picker** — preset'li (Bu Ay, Geçen Ay, YTD, 1Y, Özel)
- **Chip Picker** — popover ile kategori/faydalanıcı atama
- **Currency Field** — TRY default, sembol konumu, tabular nums
- **Diff / Inline Edit** — tablo hücresinde kayıt-üstü düzen
- **Onboarding Checklist** — sağ köşede minimize edilebilir kart

### 10.3 Grafikler (Recharts hedefliyoruz)
Her grafiğin **legend, eksen etiketi, hover tooltip, boş state, loading
skeleton, zoom toggle** durumları tasarlanmalı.
- LineChart (overlay'lı)
- AreaChart
- BarChart (dikey/yatay, stacked)
- Waterfall (custom)
- Donut
- Treemap
- Sunburst
- Heatmap (korelasyon)
- Sparkline (inline)
- Candle + Volume

---

## 11. Mikrokopya İlkeleri

- Doğrudan konuş: "Bu ay 12.450 ₺ harcandı" (geçişsiz, aktif).
- Sayı + yorum: "Geçen aydan %18 az."
- Risk dilini abartma. "Drawdown" → "Tepe-dip düşüş".
- Yardımcı tooltip'ler kısa: "WAC = Ağırlıklı Ortalama Maliyet."
- Hata mesajı: "Ne oldu + ne yapabilirsin." Örn. "Dosya okunamadı.
  CSV'nin başlık satırı var mı?"

---

## 12. Renk Tokenları (placeholder — sen değiştir)

```
--background        sayfa zemin
--surface           kart zemin
--surface-muted     tablo zebra, secondary kart
--border            ayraç, kart kenar
--foreground        ana metin
--muted             ikincil metin, etiket
--primary           CTA, vurgu
--accent            ikincil aksiyon, link
--positive          gelir, kar
--negative          gider, zarar
--warning           bütçe uyarı, kart borç eşiği
```

Light + dark modda da tutarlı. Pozitif/negatif daltonik-dostu olsun
(ek olarak ok/işaret).

---

## 13. Görsel Yoğunluk Standardı

- Tablo satır yüksekliği: 36–40px (yoğun mod 32px toggle'ı olabilir).
- KPI başlık: 12px uppercase tracking-wider muted.
- KPI sayı: 28–32px semibold, tabular-nums.
- Kart radius: 12px. Inner padding 16–20px.
- Section başlık: 16px semibold + 13px açıklama altında.

---

## 14. Anahtar Kullanım Senaryoları (akış testleri)

Tasarım hazırken bu 6 akışı baştan sona tıklatabiliyor olmamız lazım:

1. **Yeni ekstre yükle → onayla → bütçeye yansıt**
   Cashflow → Ekstreler → CSV bırak → Draft review → bulk kabul → Commit
   → Bütçeler sekmesinde delta güncellendi mi gör.
2. **Kural çıkar**
   Cashflow → İşlemler → "İYTE Gülbahçe" merchant → işlem drawer →
   "Bu merchant'ı her zaman Ahmet Burak / Eğitim yap" → Settings →
   Kurallar listesinde yeni kural belirir.
3. **Taksitli alışveriş**
   Cashflow → Yeni işlem ekle (manuel) → Okul ücreti 60.000 ₺ → Taksit:
   6 → Ana masraf tek satır + 6 borç servisi sat. otomatik.
4. **Hisse al ve portföy etkisini gör**
   Wealth → "+ İşlem" → ASELS 100 lot 78,50 ₺ Midas/Ana → Önizleme
   "WAC 72,30 → 74,55" → Kaydet → Varlık detayında lot listesi güncel.
5. **Screener'dan watchlist'e**
   Screener → Tier 1 → ASELS satırı ⭐ → Dashboard → "Cashtag akışı"nda
   ASELS bildirimleri görünür.
6. **Reel getiriyi sorgula**
   Dashboard üst-bar → "Reel/CPI-adj" toggle → KPI'lar ve grafikler
   enflasyona göre yeniden hesaplanır.

---

## 15. Tasarım Çıktıları (claude/design'dan beklediklerim)

1. **Renk + tipografi sistemi** (light & dark) — token JSON veya CSS var listesi.
2. **App shell**: sidebar + üst bar + içerik (yüksek-fid mock, masaüstü + mobil).
3. **5 ana ekran** için yüksek-fid mock:
   - Dashboard (full)
   - Cashflow → Genel + Draft Review (kritik)
   - Wealth → liste + asset detayı
   - Screener → liste + asset detayı
   - Settings → Tanımlamalar + Kural Builder modal
4. **Bileşen kütüphanesi şeması** — atomik + kompozit varyantlarıyla.
5. **Grafik şablonları** — Recharts'ta uygulanabilir stil rehberi
   (axis font, grid renk, tooltip kart, line stroke vs.).
6. **Boş & error state örnekleri** her ekran için en az 1 adet.
7. **Mobil reflow** — Dashboard + Cashflow Draft Review için en az.

---

## 16. Şu An Kararsız Kalan / Senin Cevaplaman Gereken Konular

1. **Hane adı / branding tonu** — "Mehmet's Assets" mi, "Wealth OS" mi,
   hane adı (örn. "Hasan Hanesi") öne mi? Sen seç.
2. **Logo / mark** — minimal monogram önereyim mi yoksa tasarımcı mı?
3. **Twitter cashtag akışı** — gerçekten istiyor musun? API maliyetli.
   Alternatif: KAP + StockTwits TR kullan.
4. **PDF ekstre OCR** — fazla. v1'de CSV/XLSX yeter mi?
5. **Hisse alımı kredi kartıyla** — PRD "uygulanmaz" diyor. Onaylıyor musun?
6. **Multi-user / paylaşım** — hane içi başka birinin (eşin?) read-only
   erişimi olacak mı?
7. **Mobil hedef** — sadece bakış mı, yoksa hızlı işlem (al/sat, draft
   onay) da olacak mı?

Bu cevaplar tasarımı netleştirir; eksik kalırsa tasarımcı default
seçimi yapsın, sonra iterasyon ederiz.

---

## 17. Tasarım Sürecine Notlar

- Önce **Dashboard** + **Cashflow Draft Review** + **Wealth Varlık Detayı**
  üçlüsünü bitirelim. Bunlar üründe en kritik üç yüzey; geri kalanı bu
  üçünden türer.
- High-fid'e geçmeden önce gri-tonda **wireframe** versin tasarımcı.
- Her ekrana eşlik eden tek cümle "user job-to-be-done" yazılmalı:
  - Dashboard: "Sabah 30 saniyede ne oldu, neye dikkat etmeliyim?"
  - Cashflow: "Ekstreyi yükle, doğru sınıflandır, masrafımı anla."
  - Wealth: "Neyim var, ne kazandırıyor, reel mi?"
  - Screener: "Piyasa hangi hisseye akıyor, ben kaçırıyor muyum?"
  - Settings: "Sistemi kendi dilime öğret."

---

*Brief sonu. Tasarım demo'ları geldikçe bu doküman canlı tutulacak.*
