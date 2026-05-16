# Mehmet's Assets — v2 Tasarım Talimatı (claude/design)

> Bu brief, daha önceki `docs/design-brief.md`'nin üzerine eklenir.
> Aşağıdaki maddelerin çoğu, kullanıcının kendi mevcut uygulamasından
> (5 ekran görsel) ve beğendiği Figma Make örneğinden çıkarıldı.
> Görselleri taklit etme — fonksiyonelliği uygula.

---

## 0. Üst Düzey Kararlar

* **Menü yapısı:** Aşağıdaki **7 sekme top-level** olacak (kullanıcının
  beğendiği Figma Make örneğinin IA'sı):

  ```
  Özet · Gelirler · Giderler · Yatırımlar · İşlemler · Hesaplar · Raporlar · Ayarlar · Piyasa Radarı
  ```

  - Gelir ve Gider eski "Nakit Akışı"ndan **ayrıştırıldı**.
  - **İşlemler** top-level (artık Wealth alt-tab'ı değil) — hisse al/sat defteri.
  - **Yatırımlar** ayrıca top-level — anlık portföy durumu.
  - **Hesaplar** YENİ top-level — banka × alt-hesap (Vadesiz/Dolar/Euro/Altın/Yatırım) detayı.
  - **Raporlar** YENİ top-level — yıllık trend, kategori dağılımları, varlık kompozisyon zaman serisi.
  - **Piyasa Radarı** ve **Ayarlar** kalır.

* **Görsel ton:** Mevcut görsel sistemimiz (IBM Plex + koyu cyan + Bloomberg-esque) **korunur**. Kullanıcının Figma Make örneği açık/sade
  tonda ama o **menü yapısı için** referans alındı, görsel için değil.

* **Para birimi şeridi (canlı):** Topbar'a USD/TRY · EUR/TRY · GRA/TRY
  canlı tikleme şeridi eklenir (yeşil = yukarı, kırmızı = aşağı, son
  güncellenme zamanı). TCMB/borsapy entegrasyonu beslenir.

* **Tanımlamalar tamamen dinamik:** Kişiler, kategoriler, hesaplar,
  kurallar tamamen Ayarlar'dan eklenir/silinir. Hiçbir liste
  hardcoded değil. Yeni kişi (örn. "Eş", "Ben", "Gelin") eklenince
  her ekran otomatik genişler.

---

## 1. Sekme: Özet (Dashboard)

Mehmet'in **soracağı net sorulara** cevap verecek üst-düzey ekran.

### KPI şeridi (4 kart, üstte)
1. **Bugünkü Net Servet Değişimi** — TRY mutlak + yüzde + sparkline
2. **Bugünkü Portföy K/Z** — sadece hisse/varlık piyasa kapanışına göre
3. **Bu Ay Tasarruf** — gelir − gider; geçen aya kıyas %
4. **Reel Getiri YTD** — TÜFE-adj; nominal + BIST/USD/XAU benchmark alt satırda

### Bugünkü Hareketler (yeni iki kart)
- **Bugün En Çok Kazandıran Top 3** (sembol · ad · adet · WAC · K/Z TRY+%)
- **Bugün En Çok Kaybettiren Top 3**

### Hane Bireyleri — Portföy Görünümü (DİNAMİK)
- Her kişi için ayrı kart: anlık değer, K/Z%, bugün +/−
- Settings'ten yeni kişi (Eş, Gelin, vs.) eklenince yeni kart otomatik açılır
- "Ben" + "Ahmet Burak" + "Salih" + ... sırayla
- Liste boşsa "Ayarlar'dan kişi ekle" boş durumu

### Yıllık Özet + YoY Kıyas
- 4 yıl tablosu (Yıl · Gelir · Gider · Net · trend sparkline)
- 3 delta kartı: YoY Gelir %, YoY Gider %, YoY Net %

### Bu Hafta En Büyük 5 Gider
- Tarih · merchant · kategori chip · kişi chip · tutar

### Alt-blok (mevcut)
- Korelasyon ısı haritası (90g)
- Sektör rotasyonu (1A)
- KAP akışı (LLM özet + polarite)

### Kullanıcının sorması beklenen sorulara karşılık
| Soru | KPI / kart |
|------|-----------|
| "Bugün hangi yatırımdan ne kazandım?" | Bugün Top 3 winner/loser kartları |
| "Toplam servetim nasıl değişti?" | Net Servet KPI + 30g spark |
| "Bu ay gelir/gider?" | Bu Ay Tasarruf KPI |
| "Bu yıl ne durumdayım?" | Yıllık Özet + YoY |
| "En çok neyden kazandım?" | Bugün top 3 + Wealth K/Z sıralama |
| "Çocukların serveti?" | Hane Bireyleri kartları |

---

## 2. Sekme: Gelirler

**Tek odak: gelir kayıtları.**

### Üstte 3 KPI
- Bu Ay Gelir · Bu Yıl Gelir · YoY %

### Tablo
- Tarih · Açıklama · Kategori (chip) · Kişi (chip) · Hesap · Kaynak (manuel/ekstre) · Tutar
- Sağ üstte `+ Yeni Gelir` CTA (modal: tarih, tutar, kategori, kişi, hesap, açıklama, hashtag etiketleri)

### Filtreler (sol panel veya üst chip'ler)
- Tarih aralığı · Kişi · Kategori · Hesap · Sadece tekrar edenler

### Empty state
"Henüz gelir kaydı yok. Maaşını eklemek için **+ Yeni Gelir**'e tıkla
veya **Ekstre Yükle** ile otomatik içeri al."

### Tekrar eden gelirler
Sayfanın altında ayrı bölüm: aylık maaş, kira geliri, emekli maaşı vb.
düzenli akışlar.

---

## 3. Sekme: Giderler

**Tek odak: gider kayıtları + ekstre yükleme.**

### Üstte 4 KPI
- Bu Ay Gider · Bu Yıl Gider · YoY %· En Pahalı Kategori

### Ekstre yükleme şeridi
- Sürükle-bırak / dosya seç → Garanti BBVA Bonus XLS, CSV, PDF
- Yüklendiği an: otomatik kategorize edilir, kural eşleşmezse onay
  bekler. Geçmiş ekstre yönetim ekranı yok — sadece açılan modal
  içinde inceleme sonra commit.

### Tablo
- Tarih · Açıklama · Kategori · Kişi · Hesap · Hashtag'ler · Tutar
- Hashtag chip'leri: `#zorunlu #gsm #aydan-aya` gibi free-form etiketler
- Satır tıklanırsa drawer: detay düzenle, kural çıkar, taksit yönet

### "Yıl Boyunca En Büyük 5 Gider" mini-kart
Üstte bir satır widget — bu yıl tek seferlik en pahalı 5 işlem.

### Empty state
"İlk ekstreni yükleyerek başla — sistem otomatik kategorize eder,
sen sadece onaylarsın."

---

## 4. Sekme: Yatırımlar (Portfolio — anlık durum)

### Üst KPI
- Toplam Değer · Toplam Maliyet · Kar/Zarar (TRY+%) · Getiri Oranı · Bugün K/Z · Max Drawdown (12A)

### Hane Bireyi Sekmesi (dinamik)
- "Tümü" + her aktif kişi (PEOPLE listesinden) için tab
- Yeni kişi eklendiğinde yeni tab otomatik

### Banka-bazlı Hisse Portföyü tablosu (mevcut Wealth → revize)
Başlık satırı her kişi/saklama-yeri için: `<Kişi>'nin Portföyü <count> · T: <toplam> · K/Z: <pnl>`

Kolonlar:
- Sembol (adet) · Fiyat · **Günlük %** · Maliyet (WAC) · Değer · K/Z (TRY+%)

### Görselleştirme şeridi
- Sunburst (sınıf → sembol)
- Treemap (saklama yeri: Midas/Garanti/Garanti Kripto/Kasa)
- 52H bandında konum (her sembol için)

### Empty state
"Henüz pozisyon yok. **İşlemler** sekmesinden ilk alımını gir."

---

## 5. Sekme: İşlemler (Trade ledger — al/sat)

### KPI
- Toplam İşlem · Bu Ay İşlem · Realize K/Z (YTD) · Ortalama İşlem Büyüklüğü

### Filtreler
- Tarih · Kişi · Sembol · Saklama · Yön (AL/SAT)

### Tablo
- Tarih · Sembol · Kişi · Saklama · Yön (chip) · Adet · Fiyat · Tutar · Komisyon · Realize K/Z · Not

### `+ Yeni İşlem` (modal)
- Kişi · Saklama · Sembol (typeahead) · Yön (AL/SAT) · Adet · Fiyat · Tarih · Komisyon · Not
- Önizleme: "Bu işlem WAC'ı X → Y yapacak"

### Sembol detay drawer
Tıklanırsa: o sembol için tüm geçmiş işlemler + lot listesi + realize K/Z dökümü.

---

## 6. Sekme: Hesaplar (YENİ — bank-detail)

Kullanıcının mevcut app'inde gördüğümüz hesap detayı.

### Üst hesap özeti (tek kart)
```
HESAP ÖZETİ
  Garanti              3.761.082,53 ₺
  İş Bankası              20.000,00 ₺
  Ahmet Burak            443.832,70 ₺
  Midas                  129.011,28 ₺
  ─────────────────────────────────
  Banka Hesapları Toplamı 4.353.926,51 ₺
  Ev (Fiziki Altın)       743.077,19 ₺
  Portföy Toplamı       5.097.003,70 ₺   ← accent
```

### Banka kartları (her banka bir kart)
Her kartın başlığı: banka adı + grand total (≈ X ₺)

Alt-hesap satırları (kolonlar yan-yana):
- Hesap tipi (Vadesiz / Dolar / Euro / Altın / Yatırım)
- IBAN (TR... maskeli)
- TRY karşılığı (sağda büyük)
- Orijinal birim (USD/EUR/Altın adedi, sağ-alt küçük)

### "ABA" prefix konvansiyonu
Ahmet Burak hesaplarında: "ABA Vadesiz", "ABA Dolar", vb. — kullanıcının kendi şeması.

### Fiziki altın (Ev/Kasa) kartı
**Tip-bazlı kırılım** — bizim eski "tek XAU" yaklaşımı yetersizdi:
- Altın (24K) · adedi · birim fiyat · TRY toplam
- Çeyrek · adedi · birim fiyat · TRY toplam
- Cumhuriyet · adedi · birim fiyat · TRY toplam
- Bilezik · adedi · birim fiyat · TRY toplam

Veri modeli `gold_items` tablosu eklenecek (id, type enum, weight_grams_or_count, beneficiary, custody, manual_value).

### `+ Yeni Hesap` CTA
Sağ üstte. Modal: ad, banka, tip, currency, IBAN, açılış bakiyesi.

---

## 7. Sekme: Raporlar (YENİ — analytics)

Kullanıcının beğendiği Figma örneğindeki 4-kart yapısı, bizim verilerle:

### Kart 1: Yıllık Gelir-Gider Trendi
- Stacked bar chart aylık (12 ay)
- Yeşil bar = Gelir, kırmızı bar = Gider, mavi çizgi = Net
- Hover'da tooltip ile aylık ayrıntı

### Kart 2: Varlık Kompozisyonu (zaman serisi, mevcut app'ten)
- **Stacked area chart, günlük** — Nakit / Döviz / Altın / Hisse
- Legend'a tıklayıp seriler aç/kapat
- Alt çubukta yüzdeler: "Nakit %1.8 · Döviz %20.4 · Altın %22.4 · Hisse %55.4"

### Kart 3: Kişi Bazlı Hisse Portföyü Tarihsel
- Line chart, günlük — her kişi için ayrı çizgi
- Dinamik: kişi listesinden otomatik beslenir
- Önemli atlama noktalarında nokta marker'ı (yeni alım/satım)

### Kart 4: Bu Ay - Kategoriye Göre Gelirler
- Donut + legend; bu ay (veya seçilen ay) gelir dağılımı
- Empty state: "Bu ay gelir kaydı yok"

### Kart 5: Bu Ay - Kategoriye Göre Giderler
- Donut + legend

### Kart 6: Bu Ay - Kişiye Göre Giderler
- Donut + legend; dinamik kişiler

### Kart 7: Reel vs Nominal Getiri (mevcut)
- Portföy · TÜFE · USD · EUR · Altın · BIST100 (overlay line)

### Üst kontrol
- Tarih aralığı seçici (Bu Ay / Bu Yıl / Son 12 Ay / Özel)
- "100=baz göster" toggle (normalize)
- "Toplam: <X>" ve "Değişim: <%>" özet rozetleri

---

## 8. Sekme: Piyasa Radarı (mevcut — değişiklik yok)

Composite Score sıralı tablo, RS/Vol Surge/52H Δ/rozetler, Tier 1/2/3 banner.

---

## 9. Sekme: Ayarlar

Mehmet'in beğendiği Figma örneğinde Ayarlar ultra-minimal: **sadece Kişiler listesi**. Bizim durumumuzda daha zengin ama aynı sade-input deneyimi:

### 4 alt-tab
- **Kişiler** (Figma'daki gibi)
  - Inline ekleme: text input + `+ Ekle`
  - Liste: her satır kişi adı + 🗑 sil
  - Önceki app'ten: **"Ben" + "Ahmet Burak" + "Salih" + "Anne" + "Baba"** (Anne/Baba ayrı satırlar — birleşik değil)
  - Renk seçimi inline
- **Kategoriler**
  - Aynı şablon: parent/alt-kategori ağacı, ikon, renk
- **Hesaplar**
  - Banka × alt-hesap tanımları (Vadesiz/Dolar/Euro/Altın/Yatırım), IBAN
- **Kurallar**
  - Öncelik sıralı, eşleşme + aksiyon
  - "Bu kuralı geçmişe de uygula" toggle

### Tasarım prensibi
"Her ekleme tek tıklık olsun" — Mehmet ileride **Eş'i eklerken**
modal açmaya gerek kalmamalı. Input + `Ekle` yeterli.

---

## 10. Topbar (her sayfada)

- Sol: Crumb (Mehmet's Assets › Aktif Sekme)
- Orta: arama (⌘K)
- Sağ:
  - **Canlı FX şeridi** (USD/TRY · EUR/TRY · GRA/TRY · BTC/USD)
  - Hane filtre chip'i
  - Tarih aralığı chip'i
  - Görünüm chip'i (₺ Nominal / $ Overlay / Reel TÜFE-adj)
  - Bildirim ikonu
  - Tema toggle
  - Power (çıkış)

---

## 11. Sidebar

```
M·A   Mehmet's Assets
      Hasan Hanesi (Tweaks ile değişir)

GENEL
  ◐ Özet                                        ←  birincil
  ↗ Gelirler                                    [+]
  ↘ Giderler                                    [+]
  💰 Yatırımlar
  ⇄ İşlemler
  🏦 Hesaplar
  📊 Raporlar

PİYASA
  🔍 Piyasa Radarı                              [6 yeni]

SİSTEM
  ⚙ Ayarlar

──────────────────────
[+ İşlem Ekle]   N

avatar  Mehmet
        mehmet@eku.com.tr             ☀/🌙
```

---

## 12. Boş Durum Microcopy Standardı

Her ekran için "ne yapmalı + nasıl başlamalı" çift cümle:

- Gelirler boşsa: "Henüz gelir kaydı yok. Maaşını eklemek için **+ Yeni Gelir** ya da **Ekstre Yükle** kullan."
- Giderler boşsa: "İlk ekstreni yükle — sistem otomatik kategorize eder."
- Yatırımlar boşsa: "Henüz pozisyon yok. **İşlemler** sekmesinden ilk alımını gir."
- İşlemler boşsa: "Henüz işlem yok. **+ Yeni İşlem** ile hisse al/sat kaydet."
- Hesaplar boşsa: "Henüz hesap yok. **+ Yeni Hesap** ile Garanti, İş Bankası vb. ekle."
- Raporlar boşsa: "Veri biriktikçe burada görünür."

---

## 13. Veri Modeli Değişiklikleri (kodlamaya not)

Yeni / değişen Supabase tabloları:

1. `gold_items` — fiziki altın tip-bazlı kırılım
   ```sql
   create table gold_items (
     id uuid pk,
     user_id uuid fk,
     beneficiary_id uuid fk,
     custody_id uuid fk,
     kind text check (kind in ('gold_24k','quarter','cumhuriyet','bracelet','other')),
     count int,
     gram_per_unit numeric,
     manual_unit_price_try numeric,  -- optional override
     notes text
   );
   ```

2. `transaction_tags` zaten var → ama **hashtag** UX'ı için
   transaction'da `tags_text text[]` denormalized kolon eklemek
   render hızı için faydalı.

3. `account_subtypes` — tek hesap altında alt-hesaplar:
   ```sql
   alter table accounts add column parent_id uuid references accounts(id);
   alter table accounts add column subtype text;  -- vadesiz, dolar, euro, altin, yatirim
   ```

4. `fx_quotes` — canlı FX şeridi için anlık fiyat snapshot:
   ```sql
   create table fx_quotes (
     pair text pk,           -- 'USDTRY', 'EURTRY', 'XAUTRY'
     bid numeric, ask numeric, last numeric, change_pct numeric,
     updated_at timestamptz
   );
   ```
   (Public read; service_role yazar; UI 1 dakikada bir refresh.)

---

## 14. Yapma Listesi (özet)

claude/design'ın bu brief'i okuyup üretmesi gerekenler:

- [ ] 9 sekmeli sidebar (Özet/Gelirler/Giderler/Yatırımlar/İşlemler/Hesaplar/Raporlar/Radar/Ayarlar)
- [ ] Topbar canlı FX şeridi
- [ ] Özet ekranı: 4 KPI + Bugün Top 3 winner/loser + Hane Bireyleri dinamik + Yıllık YoY + Top 5
- [ ] Gelirler / Giderler ayrı ayrı sayfa, tablo + ekstre yükleme + tekrar edenler
- [ ] Yatırımlar — banka-bazlı tablo, kişi tab'ı, görsel şerit
- [ ] İşlemler — al/sat defteri, "+ Yeni İşlem" modal, sembol drawer
- [ ] Hesaplar — banka × alt-hesap detay, IBAN, fiziki altın tip-kırılımı
- [ ] Raporlar — 6-7 kartlık analitik (yıllık trend, varlık kompozisyon, kişi tarihsel, kategori donut'lar)
- [ ] Piyasa Radarı (değişmedi)
- [ ] Ayarlar — Kişiler/Kategoriler/Hesaplar/Kurallar minimal CRUD

Görsel sistemi koru: IBM Plex + koyu cyan + 36px row · tabular-nums.
