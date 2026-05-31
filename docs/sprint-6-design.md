# Sprint-6 — Allocation, Portföy Entegrasyonu, Trade Akışı, WAC Fix

**Versiyon:** v2 (FINAL — DESIGN FROZEN)
**Tarih:** 2026-05-31
**Önceki referans:** `docs/wac-fees-realized-audit.md` (Sprint-0.5 audit)

> ⚠ Tasarım v2 dondurulmuştur. v1 → v2 arası 1 revizyon (production default Top10/90g + stopaj/nakit özet + allocation_snapshots + komite gerekçesi inline). Yeni fikirler Sprint-7 backlog'a düşer (`docs/sprint-7-backlog.md`).

---

## 1. Hedef

Mehmet Score Sprint-5.6 backtest ile **veriyle doğrulandı** (TopN=5/30g median +%5.46 alpha vs KAT_FON_SEPETI). Sprint-6'da:

1. Fonlar için **statik allocation recommendation** üret
2. Bu öneriyi **mevcut portföy** ile karşılaştır
3. Manuel **fon alım/satım** kaydı destekle (TEFAS API yok)
4. **WAC / fees / realized_lots / stopaj** hesaplarını doğru hale getir

Sprint-7+ dynamic regime, score-weighted allocation, vergi verimliliği skoru.

---

## 2. Allocation Modeli (statik)

### 2.1 Production default

| Parametre | Production | Backtest Şampiyonu | Sebep |
|---|---|---|---|
| **TopN** | **10** | 5 | Çeşitlendirme + tek-fon riski azaltma |
| **Rebalance** | **90 gün (3 ay)** | 30 gün | Düşük turnover, slippage azaltma |
| **Strategy** | **Equal Weight** | Equal Weight | Backtest doğruladı |

**Gerekçe:** TopN=5/30g median +%5.46 üretti ama yüksek turnover + %20 konsantrasyon. Top10/90g hâlâ pozitif alpha (+%2.13-2.29 backtest), production için daha sürdürülebilir.

**UI'da:**
> "Allocation default'u Top 10 × 90 gün × Equal Weight. Backtest şampiyonu (Top 5 × 30 gün) +%5.46 alpha üretti — referans olarak görüntülenir, default değil."

### 2.2 Allocation kaynağı

```sql
SELECT fund_code FROM v_fund_scores_latest
WHERE persona_id = <mehmet_default>
  AND mehmet_score IS NOT NULL
  AND components_used >= 3
ORDER BY mehmet_score DESC, components_used DESC, fund_code ASC
LIMIT 10;
```

Her birine **%10 hedef ağırlık**.

### 2.3 Karşılaştırma + Aksiyon

```
current_weight_i = (units_i × latest_nav_i) / portfolio_market_value
target_weight_i  = 0.10 (Top 10'daysa) veya 0
delta_i          = target_weight_i - current_weight_i
action_i         = delta > +5%  → "Dengeleme için ekleme"
                 = delta < -5%  → "Dengeleme için azaltma"
                 = else          → "Tut"
```

**Rebalance band:** ±5%. Persona ayarı Sprint-7+.

### 2.4 Dil yasakları

- **Yasak:** "al", "sat", "kesinlikle", "yatırım tavsiyesi", "portföyüne ekle"
- **Kullanılacak:** "Dengeleme için ekleme/azaltma", "Hedef ağırlığa göre fark", "Komite önerisi", "Karar destek çıktısı"
- Test koruma: Sprint-5.5 PR-1 `FORBIDDEN_WORDS_RE` allocation engine + UI metinleri üzerinde

---

## 3. Trade Flow (Manuel Giriş)

### 3.1 Kapsam
❌ TEFAS API, otomatik emir yok.
✅ Manuel form: kullanıcı her trade'i girer.

### 3.2 Form alanları

| Alan | Tip | Zorunlu | Not |
|---|---|---|---|
| `account_id` | dropdown | ✓ | `account_type='brokerage'` öncelik |
| `fund_code` | combobox | ✓ | 155 fon |
| `side` | radio | ✓ | buy / sell |
| `executed_at` | date+time | ✓ | TEFAS NAV tarihi, default bugün |
| `quantity` | numeric | ✓ | Pay adedi |
| `price` | numeric | ✓ | NAV (default: fund_prices'tan otomatik) |
| `fees` | numeric | opsiyonel | TL bazında komisyon |
| `taxes` | numeric | opsiyonel | Manuel stopaj override |
| `notes` | text | opsiyonel | Serbest |

### 3.3 Validation

- `quantity > 0`, `price > 0`, `executed_at <= now()`
- `fund_code` mevcut + `is_active=true`
- `side='sell'` → yeterli açık lot (FIFO open) olmalı

### 3.4 Trade INSERT sonrası
- `currency='TRY'`, `fx_rate_to_try=1` auto
- `asset_id` fonun bridge UUID'i
- `side='sell'` → `processSell` job (bkz. §5)

---

## 4. WAC Fees Fix

### 4.1 Sorun
`v_holdings_wac` `trades.fees`'i ignore eder → cost basis abartılmış → unrealized P/L şişmiş.

### 4.2 Yeni view
```sql
gross_cost_try = SUM(quantity × price × fx_to_try + fees) WHERE side='buy'
wac_try        = gross_cost_try / SUM(quantity WHERE side='buy')
cost_basis_try = wac_try × (buy_qty - sell_qty)
```

### 4.3 Sell'de fees dağıtımı
`realized_lots.fees_allocated_try` (orantısal). Realized P/L = `proceeds - cost - sell_fees`.

### 4.4 Migration
`0040_holdings_wac_fees_fix.sql` — `v_holdings_wac` CASCADE drop + recreate + tüm bağımlı view'lar (özellikle `v_portfolio_marked_to_market`).

---

## 5. realized_lots + Stopaj

### 5.1 Şema genişletme (`0041_realized_lots_extension.sql`)

```sql
ALTER TABLE realized_lots ADD COLUMN fees_allocated_try numeric(18,4) DEFAULT 0;
ALTER TABLE realized_lots ADD COLUMN applied_tax_rule_id uuid REFERENCES fund_tax_rules(id);
ALTER TABLE realized_lots ADD COLUMN applied_tax_kind fund_tax_kind;
ALTER TABLE realized_lots ADD COLUMN effective_withholding_rate numeric(6,4);
ALTER TABLE realized_lots ADD COLUMN tax_basis_try numeric(18,4);
ALTER TABLE realized_lots ADD COLUMN withheld_amount_try numeric(18,4);
ALTER TABLE realized_lots ADD COLUMN net_realized_pnl_try numeric(18,4);
ALTER TABLE realized_lots ADD COLUMN method text NOT NULL CHECK (method IN ('FIFO','HIFO')) DEFAULT 'FIFO';
ALTER TABLE realized_lots ADD COLUMN holding_period_days int;
-- holding_period_days: HIFO seçim için, vergi tutma süresi raporlaması için
```

**Önemli:** `method` field + `holding_period_days` Sprint-6 v1'de **FIFO sabit**, ama **HIFO data modeli hazır** — Sprint-7'de UI toggle ile aktive edilir, migration yeniden gerekmez.

### 5.2 FIFO algoritması (Sprint-6 v1)

```
processSell(sell_trade):
  open_buys = SELECT * FROM trades
              WHERE asset_id = sell.asset_id AND side = 'buy'
                AND executed_at <= sell.executed_at
                AND quantity_remaining > 0
              ORDER BY executed_at ASC   -- FIFO (HIFO: ORDER BY cost_per_unit DESC)
  remaining = sell.quantity
  for buy in open_buys:
    consumed = min(buy.quantity_remaining, remaining)
    cost_per_unit = (buy.price × buy.fx + buy.fees / buy.quantity)
    fees_alloc = (consumed / sell.quantity) × sell.fees
    realized = consumed × (sell.price × sell.fx) - consumed × cost_per_unit - fees_alloc
    holding_days = sell.executed_at - buy.executed_at  # için saklanır

    if fund:
      taxRule = resolveTaxRule(fund_code, buy.executed_at, sell.executed_at)
      tax_basis = max(0, realized)   # zarar varsa stopaj yok
      withheld = sell.taxes ?? (tax_basis × taxRule.effective_rate)
      net = realized - withheld
    else:
      withheld = 0; net = realized

    INSERT realized_lots(..., method='FIFO', holding_period_days=holding_days, ...)
    remaining -= consumed
```

### 5.3 HIFO (Sprint-7+ aktive)

- Algoritma aynı, sadece `ORDER BY` değişir: `cost_per_unit DESC`
- UI toggle: persona-level "Vergi optimizasyonu" tercihi
- Vergi Verimliliği Skoru hesabı için temel (Sprint-7 backlog)

### 5.4 Manuel taxes override
Kullanıcı `trades.taxes > 0` doldurursa → `withheld_amount_try = trades.taxes`. Sistem hesabı bypass. Audit log'a kayıt.

### 5.5 Historik backfill
Eski 7 sell trade (equity_tr) için one-off backfill — stopaj 0, sadece WAC + realized P/L.

---

## 6. Fund Asset Bridge

### 6.1 Migration (`0042_fund_asset_bridge.sql`)

```sql
-- Tüm aktif fonlar için assets satırı
INSERT INTO assets (symbol, name, asset_class, currency, exchange)
SELECT code, name, 'fund'::asset_class, COALESCE(currency,'TRY'), 'TEFAS'
FROM funds WHERE is_active = true
ON CONFLICT DO NOTHING;

-- Trigger: yeni fund eklenince otomatik
CREATE OR REPLACE FUNCTION sync_fund_to_asset() RETURNS trigger AS $$
BEGIN
  INSERT INTO assets (symbol, name, asset_class, currency, exchange)
  VALUES (NEW.code, NEW.name, 'fund', COALESCE(NEW.currency,'TRY'), 'TEFAS')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER funds_after_insert AFTER INSERT ON funds
  FOR EACH ROW EXECUTE FUNCTION sync_fund_to_asset();
```

### 6.2 Helper

```ts
async function findAssetIdByFundCode(code: string): Promise<string | null>
```

Trade formu, allocation engine, holdings view bu helper'ı kullanır.

---

## 7. UI Ekranları

### 7.1 `/fonlar/allocation` (YENİ)

**Üst pano:**
- Persona · TopN=10 · Rebalance=90g · Equal Weight (read-only)
- Yan rozet: "Backtest şampiyonu: Top 5×30g · +%5.46 alpha"
- "📸 Snapshot Kaydet" butonu (bkz. §1.4)

**💰 İşlem Etkisi Özeti (kart — tablonun üstünde):**

| Metrik | Değer |
|---|---|
| Toplam Alım Tutarı | +X TL |
| Toplam Satım Tutarı | −Y TL |
| Net Nakit Etkisi | ±Z TL |
| Tahmini Stopaj Kesintisi | −W TL (FIFO dry-run) |
| Satıştan Net Eline Geçen | V TL |
| Realize Edilen P/L (vergi öncesi) | ±U TL |
| Net P/L (stopaj sonrası) | ±T TL |

Uyarı: "⚠ Stopaj kesintisi FIFO dry-run tahmin. Gerçek tutar broker'a göre değişebilir."

**Hedef Portföy tablosu:**

| Fon | Skor | Hedef % | Mevcut % | Fark | Aksiyon | Tutar | Stopaj | **Komite Gerekçesi** |
|---|---|---|---|---|---|---|---|---|
| KCV | 73 | 10% | 5% | +5% | Ekleme | +20,000 | — | 🥇 Çoklu Varlık · Reel +%20.7 · Risk dengeli |
| ... | | | | | | | | |

**Komite Gerekçesi:** `explainFundScore.strengths[0]` + medal + tax_impact label (score-explain helper reuse).

**Veri kalitesi rozetleri:**
- ⚠ "X fonun bileşeni eksik" (components_used < 5)
- ⚠ "CPI N ay gecikmeli kullanıldı"

**Disclaimer:** "Bu ekran komite karar destek çıktısıdır. Yatırım tavsiyesi değildir."

### 7.2 `/fonlar/allocation/snapshots` (YENİ — §1.4)

- Snapshot tarihçesi liste (DESC)
- Her satır → detay sayfası
- İki snapshot karşılaştırma (Top N delta + Action delta)

### 7.3 `/fonlar/[code]/trade` (YENİ)

Manuel trade form (§3.2).

### 7.4 `/yatirimlar` veya `/portfoy` (REVİZE)

**"Realize Edilmiş P/L" sekmesi:**
- Sell trade başına lot detayı
- Cost / proceeds / realized / stopaj / net P/L kolonları
- Tarih + asset_class filtre

**Holdings sekmesi:**
- `cost_basis_try` (fees dahil) — abartılmış unrealized sorunu çözüldü
- Yeni `unrealized_pnl_try` doğru

### 7.5 `/fonlar/[code]` (REVİZE — yeni kart)

**"Portfoyümde" kartı:**
- Mevcut pozisyon: X pay × NAV = Y TL
- WAC: Z TL
- Unrealized P/L: ±W TL
- Stopaj sonrası tahmini net P/L (şimdi satılırsa)
- "İşlem Kaydet" butonu → `/fonlar/[code]/trade`

### 7.6 `/fonlar/komite` (REVİZE — rol daraltıldı)

Kategori bazlı ranking olarak kalır (geniş bakış). Asıl karar destek artık `/fonlar/allocation`. Sayfaya prominent CTA: "→ Allocation Ekranına Git".

---

## 8. PR Planı (7 PR)

| PR | Kapsam | Effort | Bağımlılık |
|---|---|---|---|
| **PR-A** | Sprint-6 design v2 lock + Sprint-7 backlog | 0.5 gün | — |
| **PR-B** | WAC fees fix migration + funds↔assets bridge + sync trigger + helper | 1.5 gün | PR-A |
| **PR-C** | Manuel fund trade form + validation + asset_id resolve | 1.5 gün | PR-B |
| **PR-D** | realized_lots extension (FIFO + HIFO data model) + processSell + stopaj + tests | 2 gün | PR-C |
| **PR-E** | Allocation recommendation engine + stopaj/nakit dry-run helper | 1.5 gün | PR-D |
| **PR-F** | `/fonlar/allocation` UI + İşlem Etkisi Özeti + Komite Gerekçesi + portföy realize P/L + fon detay kartı | 2.5 gün | PR-E |
| **PR-G** | `allocation_snapshots` tablosu + Snapshot Kaydet + `/fonlar/allocation/snapshots` tarihçe | 1 gün | PR-F |

**Toplam: ~10.5 gün** sequential.

---

## 9. Veri Modeli — YENİ Tablo

### 9.1 `allocation_snapshots`

```sql
CREATE TABLE allocation_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id      uuid NOT NULL REFERENCES user_personas(id),
  snapshot_date   date NOT NULL,
  config          jsonb NOT NULL,  -- { top_n, rebalance_days, strategy, min_components }
  target          jsonb NOT NULL,  -- [{ fund_code, target_weight, mehmet_score, rationale }]
  current_state   jsonb NOT NULL,  -- [{ fund_code, current_weight, quantity, market_value_try, wac_try }]
  diff            jsonb NOT NULL,  -- [{ fund_code, target_weight, current_weight, delta_pct, action, estimated_amount_try, estimated_tax_try }]
  summary         jsonb NOT NULL,  -- { total_buy, total_sell, net_cash, total_estimated_tax, total_realized_pnl, net_pnl }
  data_quality_flags text[],
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_id, snapshot_date)
);
CREATE INDEX ON allocation_snapshots (persona_id, snapshot_date DESC);
ALTER TABLE allocation_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY allocation_snapshots_read ON allocation_snapshots
  FOR SELECT TO authenticated USING (true);
```

### 9.2 Snapshot oluşturma
- **Pasif default:** Sayfa açılınca runtime hesap, DB'ye yazılmaz
- **Aktif:** "Snapshot Kaydet" → UPSERT (idempotent günlük)
- **Otomatik cron:** Sprint-7+ kapsamı

---

## 10. Riskler

| # | Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|---|
| 1 | `v_holdings_wac` CASCADE drop diğer view'ları bozar | Orta | Yüksek | Bağımlı view listesi önce çıkarılır, hepsi birlikte yeniden create |
| 2 | FIFO floating-point hata (8 decimal) | Düşük | Orta | Numeric native, tolerans testi |
| 3 | `trades.quantity_remaining` runtime vs cached race | Düşük | Orta | Runtime ilk versiyon; cached field Sprint-7'de |
| 4 | `resolveTaxRule` mevcut imza uyumsuz | Düşük | Düşük | Audit doğruladı |
| 5 | UI'da fund asset_class filter eksik yerler | Orta | Düşük | Kapsamlı grep |
| 6 | Manuel `trades.taxes` override kötüye kullanım | Düşük | Düşük | UI uyarı + audit log |
| 7 | Allocation Top 10'da min_components<3 olan fon | Orta | Düşük | UI'da "X fon yeterli component yok" notu |
| 8 | Stopaj dry-run gerçek FIFO sonucundan saparsa | Orta | Orta | %1 tolerans testi; uyarı UI'da |
| 9 | Allocation snapshot UPSERT idempotent değilse duplicate | Düşük | Düşük | UNIQUE (persona_id, snapshot_date) constraint |
| 10 | HIFO Sprint-7'de UI toggle ile aktive — data model hazır mı? | Düşük | Düşük | §5.1 `method` + `holding_period_days` field'lar şimdiden migration'da |

---

## 11. Açık Karar Noktaları (14, hepsi onaylandı)

| # | Karar | Onaylanan |
|---|---|---|
| 1 | FIFO vs HIFO Sprint-6'da? | **FIFO sabit. HIFO data modeli hazır (method field), UI Sprint-7** |
| 2 | `trades.taxes` override field? | **Kalsın, manuel override** |
| 3 | Historik backfill realized_lots? | **PR-D'de one-off script, stopaj 0** |
| 4 | Rebalance band eşiği? | **±5%** sabit |
| 5 | Fund asset bridge — manuel/otomatik? | **Otomatik trigger + retro insert** |
| 6 | Allocation UI emir oluşturma butonu? | **Yok, sadece "İşlem Kaydet"** |
| 7 | Equity_tr için stopaj? | **Sprint-6 dışı, withheld=0** |
| 8 | View CASCADE riski | **Bağımlı view'lar birlikte yeniden create** |
| 9 | Dengeleme kademeli mi tek seferde mi? | **Tek seferde, kullanıcı kararı** |
| 10 | Stopaj kesintisi cashflow'da görünür mü? | **Hayır, çift kayıt riski** |
| 11 | Allocation NAV güncel mi? | **Evet, fund_prices.latest** |
| 12 | Forbidden words guard nasıl? | **Build-time test (Sprint-5.5 pattern)** |
| 13 | Production default Top10/90g mı Top5/30g mı? | **Top10/90g (defansif)** |
| 14 | Allocation snapshot — pasif/aktif/cron? | **Manuel Sprint-6, cron Sprint-7+** |

---

## 12. Acceptance Criteria

### PR-A
- `docs/sprint-6-design.md` v2 + `docs/sprint-7-backlog.md` commit
- 14 açık karar onayı (user'dan)

### PR-B (WAC + Bridge)
- `v_holdings_wac` fees dahil cost basis
- 155 fund için assets bridge
- Yeni fund INSERT trigger ile asset'a düşer
- `v_portfolio_marked_to_market` yeniden tanımlandı
- Backward-compat: eski WAC ile sapma raporlanır

### PR-C (Trade Form)
- `/fonlar/[code]/trade` render
- 155 fund kayıt başarılı
- 5+ validation test
- asset_id otomatik resolve

### PR-D (Realized Lots)
- 7+ yeni kolon migration (method, holding_period_days dahil)
- `processSell` FIFO çalışır
- Stopaj fund için hesaplanır, equity_tr için 0
- Manuel taxes override
- 15+ unit test
- 7 eski sell trade için backfill

### PR-E (Allocation Engine)
- `computeAllocation(personaId)` pure helper
- Top 10 + hedef + fark + action
- Stopaj/nakit dry-run helper
- 10+ unit test
- FORBIDDEN_WORDS_RE guard

### PR-F (Allocation UI)
- `/fonlar/allocation` render
- 💰 İşlem Etkisi Özeti kartı
- Hedef Portföy tablosu + Komite Gerekçesi sütunu
- Veri kalitesi rozetleri
- Disclaimer
- `/yatirimlar`'da Realize P/L sekmesi
- Fon detay "Portfoyümde" kartı

### PR-G (Snapshot)
- `allocation_snapshots` migration
- Snapshot Kaydet butonu (UPSERT)
- `/fonlar/allocation/snapshots` liste + detay
- İki snapshot karşılaştırma toggle

### Sprint-6 genel
- 7 sell trade için realized_lots backfill
- 0 kod "al"/"sat" üretir (test koruma)
- WAC fees dahil
- End-to-end fund trade akışı çalışır

---

**TASARIM DONDU.** Sprint-6 v3 yok. Yeni fikirler Sprint-7 backlog'a.
