# Sprint-7 Backlog

**Tarih:** 2026-05-31
**Statü:** Backlog — planlanma sırası ve önceliklendirme Sprint-6 bitimi sonrası yapılacak.

> Sprint-6 sırasında ortaya çıkan veya kapsam dışı bırakılan tüm fikirler burada toplanır. Sprint-6 retrospektifi sonrası tek tek değerlendirilir, önceliklendirilir.

---

## 🎯 Yüksek Öncelik (Sprint-7 ilk PR adayları)

### 1. Portföy Sağlığı Ekranı

**Yeni sayfa:** `/portfoy/saglik` veya `/yatirimlar/saglik`

**İçerik:**
- **Concentration Risk:** Tek fon/kategori/varlık sınıfında aşırı yoğunlaşma (HHI index)
- **Drift Score:** Hedef allocation'dan ne kadar uzaklaşıldı (Sprint-6 allocation_snapshots tarihçesinden)
- **Tax Burden Trend:** Son 12 ay realized stopaj toplamı + projection
- **Diversification Score:** Asset class dağılımı + kategori çeşitliliği
- **Volatility Exposure:** Portföy ağırlıklı volatilite (Mehmet Score risk component'leri)
- **Cash Drag:** Yatırılmamış nakit oranı + opportunity cost

**Veri kaynağı:** Mevcut `v_holdings_wac` + `allocation_snapshots` + `realized_lots` + Mehmet scoring.

**Gerekçe:** Sprint-6 sonrası kullanıcı portföyünü görür, **ama "sağlıklı mı?" sorusuna cevap yok.**

**Tahmini effort:** 2-3 gün

---

### 2. Vergi Verimliliği Skoru

**Yeni metrik:** `tax_efficiency_score` (0-100, fon başına + portföy bazlı)

**Hesaplama:**
- Realize edilen P/L'nin ne kadarı vergi sonrası elde edildi (`net_realized / gross_realized`)
- HSYF oranı (portföydeki HSYF fon ağırlığı)
- Lot tutma süresi ortalaması (uzun = vergi avantajı)
- Realize timing (kayıp lot'lar vergi mahsuplaşması için kullanıldı mı)

**UI:**
- Portföy sağlığı ekranında ana KPI
- Fon detayında "Bu fonun vergi verimliliği" kartı
- Allocation ekranında öneri ile birlikte ("HSYF değiştirme vergi etkisi")

**HIFO entegrasyonu:** Sprint-6'da realized_lots.method field hazır. Sprint-7'de UI toggle + Vergi Verimliliği Skoru optimization önerisi.

**Tahmini effort:** 2 gün

---

## 🟡 Orta Öncelik

### 3. HIFO toggle UI

Sprint-6 data modeli hazır (`realized_lots.method` field). UI'da:
- Persona ayarı: "Vergi optimizasyonu (HIFO)" toggle
- Yeni sell trade'ler HIFO ile işlenir
- Mevcut FIFO lotlar dokunulmaz (audit korumalı)

**Tahmini effort:** 0.5-1 gün

---

### 4. Dynamic Regime Allocation

Sprint-6 default static (Top 10 × 90g × EW). Sprint-7+:
- Piyasa rejimi tespiti (high-inflation / disinflation / risk-on / risk-off)
- Rejim bazlı persona ağırlık kayması
- Backtest validation her rejim için ayrı

**Tahmini effort:** 4-5 gün (araştırma + implementasyon + backtest)

---

### 5. Score-Weighted Allocation (production'a alma)

Sprint-6 Equal Weight default. Score-Weighted backtest'te marjinal alpha eklemedi (cap=20%). Sprint-7'de:
- Persona tercihi: EW vs SW
- Allocation UI iki preset karşılaştırması
- Cap parametrik (kullanıcı %15-25 ayarlayabilir)

**Tahmini effort:** 1-2 gün

---

### 6. Persona Allocation Tercihleri

Mehmet Default tek persona. Sprint-7:
- Aggressive (TopN=5, Rebalance=30g)
- Conservative (TopN=15, Rebalance=180g)
- Tax-Optimized (HSYF bias, HIFO)
- Custom (user-defined)

Her persona kendi allocation_snapshots tarihçesi tutar.

**Tahmini effort:** 2-3 gün

---

### 7. Rebalance Band Persona Ayarı

Sprint-6 ±5% sabit. Sprint-7:
- Persona-level eşik (`rebalance_band_pct` field)
- Conservative %3, Aggressive %10
- UI slider

**Tahmini effort:** 0.5 gün

---

### 8. Allocation Snapshot Otomatik Cron

Sprint-6 manuel. Sprint-7:
- Günlük cron her aktif persona için snapshot
- Drift Score zaman serisi otomatik
- Cron başarısızlıkları benchmark_ingest_log pattern'inde

**Tahmini effort:** 1 gün

---

## 🟢 Düşük Öncelik / Araştırma

### 9. TEFAS API Entegrasyonu

Sprint-6 manuel trade. Eğer TEFAS API public/auth olursa:
- Otomatik trade emir
- Bakiye sorgulama
- NAV gerçek zamanlı

**Engel:** TEFAS public API yok (en azından bilgiye göre). Investing aracı kullanmak gerekirse paid integration.

**Tahmini effort:** 5+ gün (araştırma + entegrasyon + auth)

---

### 10. XU100 + XAUTRY Series Code Hotfix

Sprint-5.6 PR-A.1 olarak takipte:
- EVDS portal'dan doğru series code bul
- benchmark-backfill çalıştır
- Backtest re-run (Sprint-6 GO/NO-GO XU100 confidence ekler)

**Tahmini effort:** 30 dk (kullanıcı kodu paylaşırsa)

---

### 11. Backtest UI — Eksik Sekmeler

Sprint-5.6 PR-C 3 sekme yayında. Tasarım v5'te 6 sekme vardı:
- Tab 4 — Rebalance Analizi (turnover + overlap chart)
- Tab 5 — Top10 Bileşimi (heatmap timeline)
- Tab 6 — Benchmark Karşılaştırması (Absolute / Relative / Drawdown toggle, recharts line chart)

**Tahmini effort:** 2-3 gün

---

### 12. Komite Notu LLM Zenginleştirme

Mevcut deterministik komite notu. LLM ile:
- Daha doğal dil
- Tarihsel bağlam ekleme
- Kullanıcı sorusuna cevap modu

**Yasak kelime guard'ı yine korunur.** LLM çıktısı regex check'ten geçer.

**Tahmini effort:** 2 gün (Claude API + prompt + guard)

---

### 13. Backtest CSV Export

Backtest sonuçları + Forward Test KPI export. Yatırım komitesi raporu olarak.

**Tahmini effort:** 0.5 gün

---

### 14. Custom Backtest Date Range UI

Sprint-5.6 4 sabit senaryo. Sprint-7+:
- Kullanıcı kendi start_date seçer
- TopN/Rebalance/Strategy parametre slider
- Anlık run (tek run ~10s)

**Tahmini effort:** 1-2 gün

---

### 15. Backtest Faz-1/Faz-2 Otomatik Tetik

Sprint-5.6 manuel. Sprint-7+:
- Nightly cron her gün Faz-1 yeniler
- Yeni veri eklenince Faz-2 invalidate
- UI'da "Son güncellenme: X gün önce"

**Tahmini effort:** 1 gün

---

### 16. Allocation UI Emir Oluşturma Bağlantısı

Sprint-6'da "İşlem Kaydet" sadece manuel form. Sprint-7:
- Sepete ekle (birden çok alım/satım toplu)
- E-broker'a kopyala-yapıştır export
- TEFAS web sayfası deep link

**Tahmini effort:** 1-2 gün

---

### 17. Stopaj Hesabı Backward Audit

Sprint-6 historik backfill stopaj 0 (sadece equity_tr). Sprint-7'de:
- Eski equity_tr sell'ler için stopaj kuralı uygulanmamış mı?
- Kullanıcı broker statement'tan stopaj rakamlarını yükler
- Sistem reconcile yapar

**Tahmini effort:** 1-2 gün

---

### 18. Multi-Currency Portföy

Sprint-6 TRY-only varsayım. Sprint-7+:
- USD/EUR bazlı fonlar (KIS, TPZ)
- Fx fluctuation P/L ayrımı (currency vs underlying)
- Multi-currency reporting

**Tahmini effort:** 3-4 gün

---

## 📋 Sprint-7 Açılış Listesi (öncelik sırası)

Sprint-6 bitiminde retrospektif sonrası:

1. **Portföy Sağlığı Ekranı** (madde 1) — kullanıcı ana ihtiyacı
2. **Vergi Verimliliği Skoru** (madde 2) — Sprint-6 realized_lots üzerine inşa
3. **HIFO toggle UI** (madde 3) — quick win, data hazır
4. **Backtest UI eksik sekmeler** (madde 11) — Sprint-5.6 kapanış
5. **XU100/XAU hotfix** (madde 10) — paralel iş

İleride: madde 4-9 (dynamic regime, persona varyantları, otomatik cron).

---

## 📝 Backlog güncellemesi

Yeni fikirler bu dosyaya tarih damgalı eklenir. Sprint-7 başlangıcında prune + önceliklendirme.

| Tarih | Kaynak | Madde |
|---|---|---|
| 2026-05-31 | User feedback | Portföy Sağlığı + Vergi Verimliliği Skoru (madde 1-2) |
| 2026-05-31 | Sprint-6 design | HIFO toggle UI (madde 3) |
| 2026-05-31 | Sprint-5.6 kapanış | Backtest UI eksik sekmeler (madde 11) |
| 2026-05-31 | Sprint-5.6 PR-A.1 | XU100/XAU series code (madde 10) |
