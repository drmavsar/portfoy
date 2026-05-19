# Manuel Test Rehberi

Bu dosya, son zamanlarda eklenen / değiştirilen özellikleri arayüzden adım adım
nasıl test edeceğini gösterir. Her bölüm bir özellik veya fix.

Karşılaşılan tutarsızlıkları **GitHub Issues**'a yaz veya doğrudan söyle —
"test plan'da X yapacağımı yazmışsın ama Y görüyorum" gibi.

---

## 1. Özet sayfası — Bugünkü Servet Değişimi

### 1a. Borsa kapalıyken hisse değişimi 0 olmalı (PR #77)

**Senaryo**: Resmi tatil veya hafta sonu. Yahoo Finance dünkü kapanışı veriyor.

**Test adımları**:
1. Tatil/hafta sonu bir günde https://mehmetsassets.vercel.app/ozet aç
2. "Toplam Servet" kartında **YATIRIMLAR** alt rozetine bak

**Beklenen**:
- YATIRIMLAR değişimi `+0 ₺` veya `−0 ₺` (yani 0)
- "Bugünkü Servet Değişimi" tablosunda **Hisse** satırı görünmeyebilir
  (değer 0 olduğu için)
- Yahoo `lastUpdate` etiketi son trading günü gösterir (örn. "18/05 15:10")

**Eskiden olan**: Cuma günkü kapanış değişimini "bugün" gibi gösteriyordu.

### 1b. Nakit hesap günlük değişimi (PR #77)

**Senaryo**: Bir gider veya gelir eklediğinde Nakit alt rozeti güncellenmeli.

**Test adımları**:
1. /ozet'i aç, "Bugünkü Servet Değişimi" tablosunda **Nakit (₺)** satırına bak
2. Yeni bir gelir veya gider ekle (/gelirler veya /giderler)
3. /ozet'e geri dön

**Beklenen**:
- İlk açılışta Nakit satırının "₺" sütunu **dünkü snapshot ile fark**
  gösterir (örn. +25.000 ₺ gelir → +25.000 ₺ değişim)
- KAYNAK sütununda "daily_snapshots · YYYY-MM-DD'den beri" yazar
- Toplam Servet kartının altındaki **NAKİT KPI** mini rozeti aynı farkı
  gösterir (örn. +25.000 ₺ · +X%)

**Eskiden olan**: Nakit değişimi her zaman `+0 ₺` gösteriyordu.

**Önkoşul**: 0014 migration (`daily_snapshots`) çalıştırılmış olmalı. Eğer
hiç snapshot yoksa veya tek snapshot varsa (ilk gün) değişim 0 görünür —
ikinci gün doğru çalışmaya başlar.

---

## 2. Soft Delete + Undo (PR #75)

**Senaryo**: Yanlışlıkla bir gideri sildin, 30 sn içinde geri alabilmelisin.

**Test adımları**:
1. /giderler aç
2. Herhangi bir gideri sil (× ikonu)
3. Sağ alt köşeye bak

**Beklenen**:
- Sağ altta toast: **"İşlem silindi"** + 30 sn geri sayım + "Geri al" butonu
- "Geri al" tıkla → satır listeye geri gelir
- 30 sn beklersen toast kaybolur, satır kalıcı silinmiş gibi görünür

**Doğrulama (SQL Editor)**:
```sql
select id, description, occurred_on, deleted_at
from public.transactions
where deleted_at is not null
order by deleted_at desc
limit 10;
```
Yukarıdaki sorgu silinmiş kayıtları (deleted_at dolu) listeler. Demek ki
gerçek hard delete değil, hâlâ DB'de.

**Önkoşul**: 0018 migration çalıştırılmış olmalı.

---

## 3. Aktivite Geçmişi (PR #76)

**Senaryo**: Yaptığın her değişikliğin (ekleme/düzenleme/silme) log'unu görmek.

**Test adımları**:
1. /ayarlar → "Aktivite Geçmişi" sekmesini tıkla
2. Listeye bak

**Beklenen**:
- Son 100 değişiklik tarih azalan sırada
- Aksiyon rozeti renkli: 🟢 EKLENDİ, 🔵 DÜZENLENDİ, 🔴 SİLİNDİ
- Tablo sütunu: tarih, hangi tablo, ne yapıldı, özet

**Test senaryosu** (önce → sonra karşılaştırma):
1. Aktivite Geçmişi sekmesini aç → satır sayısını not al
2. /giderler'de yeni gider ekle
3. /ayarlar/aktivite tekrar aç (sayfa yenile)
4. Yeni "EKLENDİ" satırı en üstte görünmeli

**Önkoşul**: 0019 migration çalıştırılmış olmalı. Migration yapılmamışsa
empty state'te uyarı çıkar.

---

## 4. Ekstre Yükleyici (PR #58 + öncesi)

**Senaryo**: Garanti BBVA .xls ekstresi yükle, sınıflandırma kurallarına göre
otomatik kategorize olur.

**Test adımları**:
1. /giderler sayfasında sağ üst "Ekstre Yükle" tıkla
2. Garanti .xls dosyasını seç → "Önizle"
3. Hesap dropdown'undan kart hesabını seç
4. Kişi seç (veya kart sahibinden otomatik gelmiş olur)
5. Preview tablosunda her satır için kategori önerisi gör
6. "X işlemi ekle" tıkla

**Beklenen**:
- Negatif tutarlar gider olarak işaretli (seçili)
- Pozitif tutarlar (Cep Şube Ödeme vb.) transfer (seçili değil)
- Market satırları "Market" kategori + "Ev" kişi (varsa kuralı)
- Mehmet kartında ise Yeme/Pastane → Mehmet
- 1023 (Ahmet Burak) kartında ise tüm satırlar Ahmet Burak

**Tümüne Ata**: Üst Kişi dropdown'undan kişi seç → "Tümüne ata" butonu
tüm satırların kişisini sabitler (rule ezer).

**Mükerrer engeli**: Aynı ekstreyi tekrar yükle → "0 eklendi · N mükerrer
atlandı" mesajı çıkmalı.

---

## 5. Portföy Trade Plan (PR #67)

**Senaryo**: Her pozisyon için ATR-bazlı T1/T2 hedef ve S1/S2 stop görmek.

**Test adımları**:
1. /yatirimlar aç
2. Pozisyon tablosunda son kolon **"Plan"**'a bak

**Beklenen**:
- Sağlık rozeti (renkli pill): Sağlıklı / Maliyet Altı / Stop Yakın /
  Hedef Yakın / Extended / Stop Altı
- Altında: "T1 +X% · S1 −Y%" özet
- Hücre üzerine **hover** → tooltip ile T2, S2, RR1, RR2, 52W mesafe,
  MA20 extension detayları

**Doğrulama**:
- Bir hisse anlık fiyat 100, ATR 2 ise → T1 ≈ 104, S1 ≈ 97
- WAC altındaki bir pozisyon → "Maliyet Altı" sarı rozet

---

## 6. Tarama RS + Sektör Momentum + Pattern (PR #68 + #71)

**Senaryo**: BIST 100 ölçeğinde lider/laggard görmek + pattern dedektörleri.

**Test adımları**:
1. /tarama aç
2. **RS 20d** ve **RS 60d** kolonlarına bak (XU100'e karşı %)
3. **Sektör** sütununda **#1, #2, #3** rozetlerine bak
4. **Pattern** kolonuna bak

**Beklenen**:
- XU100'den iyi performans gösterenler yeşil RS yüzdesi
- Top 3 sektör yeşil rozet, top 6 sarı
- Pattern: ATH Breakout / Cup & Handle / Double Bottom
  - 🟢 **Teyit** rozeti: breakout teyitli
  - 🟡 **Yakın** rozeti: kırılım %3 mesafesinde
  - ⚪ **İzle** rozeti: teyit var ama extended (MA20 +%15)
- Pattern hücresine hover → tooltip: entry/stop/target/RR/kalite

---

## 7. Raporlar — Tarih aralığı + En Büyük 10 Gider (PR #63 + #62)

**Senaryo**: Belirli bir dönemdeki en büyük 10 gider — taksitli işlemler
gruplanmış.

**Test adımları**:
1. /raporlar aç
2. Üst sağ tarih aralığı preset'lerinden birini seç (YTD, Son 3 Ay, vb.)
3. "Özel" tıkla → tarih picker'larından özel aralık seç
4. "En Büyük 10 Gider" kartına bak

**Beklenen**:
- Taksitli işlemler (örn. MAPFRE(1/3), (2/3), (3/3)) **tek satır**:
  "MAPFRE İSTANBUL · 3/3 taksit · 58.779 ₺"
- Farklı tutarlı taksit alımları ayrı gruplar (5/3 hataları yok)
- Period dışında kalan taksit varsa "(eksik)" rozeti
- Footer satırında: ilk 10 toplamı + toplam giderin %X'i

---

## 8. Privacy Mode (PR #57)

**Senaryo**: Demoda veya başkası bakarken sayısal değerleri gizlemek.

**Test adımları**:
1. /ozet aç (ilk açılışta varsayılan **GİZLİ**)
2. Topbar'daki **göz ikonuna** tıkla

**Beklenen**:
- İlk açılışta sayılar blur (`.tabular` elementler)
- Göz ikonu tıklayınca açılır
- Bir sayının üzerine **hover** edersen geçici görünür (peek)
- sessionStorage tercihini saklar — tab'ı yenile, aynı durum kalır

---

## 9. Risk Overlay (/yatirimlar) (PR #70)

**Test adımları**:
1. /yatirimlar aç
2. Kişi kartları altındaki **3 yeni karta** bak:
   - Risk Uyarıları
   - En Büyük 5 Pozisyon
   - Sektör Dağılımı

**Beklenen**:
- Bir pozisyon Stop Altı ise **kırmızı KRITIK uyarı**
- Tek pozisyon > %25 ise sarı UYARI
- Sektör > %40 ise sarı UYARI

---

## Genel kontrol kuralları

- Her yeni özellikten sonra: önce ROADMAP / PR açıklamasındaki "Test plan"
  bölümünü oku
- Migration gerektiren PR'larda SQL Editor'da migration'ı çalıştır
- Tarayıcıyı **hard refresh** yap (Cmd+Shift+R) — Next.js fetch cache
  bazen stale veri verir
- CI hatası: `npm test` yereldeyse, `npx tsc --noEmit` ve `npx eslint src/`
  ile aynı checks
