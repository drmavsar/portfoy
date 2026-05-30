# WAC, Fees ve Realized P/L Yapı İncelemesi

**Tarih:** 2026-05-26
**Kapsam:** TEFAS modülü Sprint-6 (portföy entegrasyonu + lot-bazlı stopaj) öncesi mevcut altyapının teşhisi.
**Statü:** Sadece inceleme — bu PR'da kod/migration değişikliği yok.

---

## TL;DR

Üç kritik bulgu var:

1. **`realized_lots` tablosu boş ve hiç kimse yazmıyor.** Şemada (0005), RLS'te (0007) ve `setup-all.sql`'de var; ama hiçbir kod buraya insert etmiyor. 7 sell trade kayıt edilmiş, realized lot 0. Realized P/L görünür hiçbir UI yok.
2. **`v_holdings_wac` view'ı `trades.fees`'i cost basis'e dahil etmiyor.** Bir kullanıcı 635 TL komisyon ödese bile WAC bu komisyonu görmezden gelir. Sonuç: unrealized P/L abartılmış görünür (gerçek nakit çıkışından eksik).
3. **`trades.taxes` kolonu tamamen unused.** DB'de var, default 0, hiç yazılmıyor, hiç okunmuyor.

**Sprint-1'i bloke ediyor mu?** **Hayır.** Sprint-1 yalnızca fund master + tax_rules + tracking. Realized P/L yok. `resolveTaxRule(fundCode, acquiredAt, soldAt)` imzasını bugünden taşıyoruz; tüketici Sprint-6 (lot tüketimi).

**Sprint-6'da yapılacaklar bu dokümana eklendi** (Bölüm 6).

---

## 1. Mevcut Şema Özeti

### 1.1 `trades` (`0005_wealth.sql:33-53`)

| Alan | Tip | Default | Not |
|---|---|---|---|
| `side` | trade_side | — | buy / sell |
| `quantity` | numeric(24,8) | — | `> 0` |
| `price` | numeric(24,8) | — | native currency'de birim fiyat |
| `currency` | text | 'TRY' | trade currency |
| `fx_rate_to_try` | numeric(18,6) | NULL | non-TRY için TRY karşılığı |
| `fees` | numeric(18,4) | 0 | komisyon (TL bazında) |
| `taxes` | numeric(18,4) | 0 | vergi (TL bazında) |
| `executed_at` | timestamptz | — | İşlem anı |

> `fees` ve `taxes` **TL bazında** (kolon ismi/birim açıkça dokümante edilmemiş; kullanım örneklerinden TL olduğu çıkarılıyor).

### 1.2 `realized_lots` (`0005_wealth.sql:68-81`)

```sql
create table public.realized_lots (
  id uuid PK,
  user_id, portfolio_id, asset_id,
  sell_trade_id uuid not null references trades(id) on delete cascade,
  buy_trade_id  uuid references trades(id) on delete set null,
  closed_at timestamptz not null,
  quantity numeric(24,8) not null,
  cost_basis_try   numeric(18,4) not null,
  proceeds_try     numeric(18,4) not null,
  realized_pnl_try numeric generated always as (proceeds_try - cost_basis_try) stored,
  created_at timestamptz
);
```

Yorum satırı diyor ki: *"Populated by a service-side job whenever a sell happens"* — **o job hiçbir yerde yazılmamış**.

Şemada eksikler (TEFAS Sprint-6 için lazım):
- `fees_allocated_try` (lot'a düşen fee payı)
- `applied_tax_rule_id` (hangi stopaj kuralı uygulandı)
- `effective_withholding_rate` (gerçek oran, sapma audit'i için)
- `tax_basis_try` (vergiye tabi kazanç)
- `withheld_amount_try` (kesilen stopaj)
- `net_realized_pnl_try` (stopaj sonrası net kâr/zarar)

### 1.3 `v_holdings_wac` (`0008_views_and_helpers.sql:58-99`)

Özet algoritma:

```
gross_cost_try = SUM(quantity * price * fx_to_try) WHERE side='buy'
bought_qty     = SUM(quantity) WHERE side='buy'
wac_try        = gross_cost_try / bought_qty
quantity       = SUM(buy_qty) - SUM(sell_qty)
cost_basis_try = wac_try * quantity
```

**Eksikler:**
- `fees` ve `taxes` formüle dahil değil → cost basis nakit çıkışından düşük → unrealized P/L abartılmış.
- Sell-WAC tüketimi yok (sells sadece quantity'yi düşer; ortalama maliyet sabit kalır — bu klasik WAC, doğru). Ama bir lot kavramı olmadığı için Realized P/L view'ı yok.

### 1.4 `v_portfolio_marked_to_market` (`0008:102-130`)

`unrealized_pnl_try = quantity * close - cost_basis_try`

`cost_basis_try` zaten fees-hariç olduğu için bu **upnl abartılmış** olur.

---

## 2. Gerçek Veri Profili (Production DB, 2026-05-26)

| Metrik | Değer |
|---|---|
| `realized_lots` satır sayısı | **0** |
| Toplam trade | 42 (35 buy + 7 sell) |
| `fees > 0` olan trade | 9 / 42 (%21) |
| `taxes > 0` olan trade | **0** / 42 (%0 — kolon hiç dolu değil) |
| `SUM(fees)` | −2.93 TL (negatif değer var — promosyon iadesi?) |
| `AVG(fees)` (fee dolu trade'lerde) | 168 TL |
| Tüm trade'ler `asset_class` | equity_tr (tek sınıf) |

### 2.1 Gerçek nakit vs WAC view (5 örnek satır)

| Sembol | Adet | WAC view | Cost basis view | Buys (fees dahil) | Fees gözardı edilen |
|---|---|---|---|---|---|
| ASTOR | 1015 | 349.75 | 355,000.75 | 355,636.24 | **635.49** |
| KLKIM | 10008 | 34.24 | 342,650.24 | 342,651.29 | 1.05 |
| KLKIM | 2000 | 32.84 | 65,680.00 | 65,745.69 | 65.69 |
| IZENR | 2736 | 11.80 | 32,279.52 | 32,279.52 | 0.00 |
| TUPRS | 100 | 254.00 | 25,400.00 | 25,400.00 | 0.00 |

**Yorum:** ASTOR'da gerçek 635 TL komisyon WAC'a yansımıyor. Bu, %0.18'lik bir cost-basis sapması demek; o pozisyondaki upnl 635 TL kadar fazla görünür. KLKIM 2,000 lotunda 66 TL benzeri.

---

## 3. Realized P/L Akışının Durumu

**Hiçbir kod `realized_lots`'a yazmıyor.** Aramada referans bulunan tüm yerler:

| Yer | Referans tipi |
|---|---|
| `0005_wealth.sql` | Tablo tanımı |
| `0007_rls_policies.sql:52` | RLS policy |
| `setup-all.sql` | Yine şema/policy kopyası |
| `src/**/*` | **0 referans** |
| Raporlar UI (`raporlar/page.tsx`) | Sadece cashflow (gelir/gider/kategoriler); yatırım PnL yok |

**Sonuç:** Sistemde "realized PnL" diye bir kavram fiilen yok. Sell yapıldığında:
- WAC view quantity'yi düşürüyor.
- Kullanıcının kâr/zarar gerçekleştirdiği hiçbir yere yazılmıyor.
- Vergi matrahı hesabı yok.

---

## 4. `trades.taxes` Kolonunun Statüsü

- DB'de var (`0005:47`).
- `wealth-actions.ts`'te insert/update form payload'ında **dahil değil** — yazılmıyor.
- View'larda kullanılmıyor — okunmuyor.
- Production'da %0 dolu.

**Karar önerisi:** Sprint-6'da iki seçenek:
- (a) `trades.taxes`'i kaldır; vergi/stopaj sadece `realized_lots`'ta hesaplansın.
- (b) `trades.taxes`'i koru; manual override için kullanılsın (kullanıcı stopaj rakamını biliyorsa otomatik hesabı bypass edebilir).

Önerim: **(b) — koru, opsiyonel override field olarak dokümante et.**

---

## 5. TEFAS Modülü Gereksinim Haritası

Her TEFAS gereksinimi mevcut altyapıyla uyumlu mu?

| TEFAS gereksinimi | Mevcut altyapı yeterli mi | Aksiyon |
|---|---|---|
| Fon trade kaydı | ✅ `trades` tablosu, `asset_class='fund'` enum'da var | Sprint-6'da kullanıma alınır |
| WAC ile holdings | ⚠️ View var ama fees gözardı | Sprint-6'da view fix gerekir |
| Realized P/L (satışta kâr/zarar) | ❌ Yok | Sprint-6'da populate eden trigger/job şart |
| Lot-bazlı stopaj çözümü | ❌ Yok (lot kavramı bile yok) | Sprint-6'da `realized_lots`'a stopaj kolonları + `resolveTaxRule` çağrısı |
| Stopaj sonrası net P/L | ❌ Yok | Sprint-6'da `net_realized_pnl_try` kolonu |
| TEFAS giriş/çıkış komisyonu | ⚠️ `trades.fees` var ama tek tip | Opsiyonel: `fee_kind` enum (`BROKERAGE` / `FUND_ENTRY` / `FUND_EXIT` / `EARLY_REDEMPTION`) |
| Fonun NAV'a gömülü yönetim ücreti | ❌ Yok | Sprint-2/3'te `fund_prices.management_fee_annual_pct` ile dolaylı izleme |

---

## 6. Sprint-6 Görev Listesi (Taslak — Bu PR'da Sadece Dokümante)

Aşağıdaki maddeler **bu PR'da kodlanmıyor**. Sprint-6 başlangıcında bu listeden başlanır.

### 6.1 Şema değişiklikleri

```text
0xxx_realized_lots_extension.sql
  - realized_lots'a kolonlar ekle:
      fees_allocated_try, applied_tax_rule_id, effective_withholding_rate,
      tax_basis_try, withheld_amount_try, net_realized_pnl_try
  - tax_rule_id FK → fund_tax_rules

0xxx_trades_fee_kind.sql (opsiyonel)
  - trades.fee_kind enum
  - default 'BROKERAGE'

0xxx_holdings_wac_fees_fix.sql
  - v_holdings_wac yeniden tanımla:
      gross_cost_try = SUM((quantity * price * fx) + fees) WHERE side='buy'
  - (alternatif: cost_basis_try ayrı view'a çıkar, raw WAC ayrı kalsın)
```

### 6.2 Trigger / Job

`trades` INSERT trigger (sadece `side='sell'` için):
1. FIFO ile aynı (user_id, portfolio_id, asset_id) için açık buy lot'larını sıralı tüket.
2. Her tüketilen lot için `realized_lots`'a satır insert et.
3. Eğer `asset_class='fund'` ise:
   - `resolveTaxRule(fund_code, buy_trade.executed_at, sell_trade.executed_at)` çağır
   - `applied_tax_rule_id`, `effective_withholding_rate`, `tax_basis_try`, `withheld_amount_try`, `net_realized_pnl_try` doldur
4. `fees` lot'lara orantısal dağıt (`fees_allocated_try`).

### 6.3 UI

- `raporlar` sayfasına "Realize Edilmiş P/L" sekmesi (asset_class bazlı, fund vs equity_tr ayırımı; stopaj kolonu görünür).
- Fund satışında "Bu satıştan ne stopaj kesildi?" preview (Sprint-5/6 sınırında).

### 6.4 Migration / Veri tabi

- Mevcut 7 sell trade için **historik backfill job** çalıştırılır (`realized_lots`'a geriye dönük lot kaydı). Stopaj uygulanmaz (eski sell'ler fund değil, equity_tr); sadece WAC ve realized PnL kayıt edilir.

---

## 7. Sprint-1 Etkisi

**Hiç yok.** Sprint-1 yalnızca:
- `fund_categories`, `funds`, `fund_tax_rules`, `tax_rules_audit`, `tracked_funds` tabloları
- 200+ fon seed
- Ayarlar UI

`resolveTaxRule(fundCode, acquiredAt, soldAt)` imzasını taşıyoruz (Sprint-3+ tüketici). Bu imza Sprint-6'daki `realized_lots` populate trigger'ı için zaten doğru — `buy_trade.executed_at` ve `sell_trade.executed_at` parametre olarak geçilebilir.

---

## 8. Karar ve Onay Noktaları

Aşağıdakileri Sprint-6 başlamadan önce karara bağla:

1. **WAC view fees fix:** view'ı in-place değiştir mi (`cost_basis_try` semantiği değişir, mevcut tüm raporları etkiler), yoksa ayrı view (`v_holdings_wac_with_fees`) mi açalım?
2. **`trades.taxes` kolonu:** koru/kaldır?
3. **`fee_kind` enum:** Sprint-6'da ekle veya v2'ye ertele?
4. **Backfill stratejisi:** mevcut 7 sell trade için geriye dönük `realized_lots` doldur, yoksa boş bırak ve UI'da "Sprint-6 öncesi satışlar için PnL hesaplanmadı" uyarısı göster?
5. **FIFO vs WAC lot tüketimi:** Türkiye vergi uygulamasında genelde FIFO; ama TEFAS fonu için WAC daha basit (tek lot havuzu). Karar: kullanıcı bazlı tercih (settings) mi, sabit FIFO mu?

---

## 9. Sprint-2 Geçişi İçin Etki

Sprint-2 = TEFAS fiyat çekme (NAV ingest). Bu dokümanın hiçbir bulgusu Sprint-2'yi etkilemiyor — `fund_prices` ayrı bir tablo, `realized_lots` ile bağlantısı yok. Sprint-6'ya kadar bu dokümanın aksiyonları beklenebilir.
