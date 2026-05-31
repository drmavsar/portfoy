# Teknik Tasarım — PR-1 · Portföy Sağlığı v0.1

> **Durum:** Onay bekliyor. Onaylandıktan sonra geliştirme başlar.
> **Kapsam:** Investment Decision Platform MVP'sinin ilk dilimi.
> **Hedef dal:** `claude/beautiful-davinci-qIXq3`

## Sabitlenmiş prensipler (donduruldu)

1. Ürünün merkezi **Portföy**'dür.
2. Risk bir skor değil, **Gate**'tir.
3. Komite Kararları = **Tez Defteri**'dir.
4. Hisseler / Fonlar / KAP / Sektörler portföye **hizmet eden mercekler**dir.
5. Amaç işlem değil, **sermaye tahsisi**dir.

Bu doküman yalnızca **PR-1**'i kapsar. PR-2 (Nakit Konuşlandırma) ve PR-3
(Tez Defteri) ileriye dönük not olarak geçer, kapsam dışıdır.

---

## 1. Amaç ve kapsam

**Amaç:** Komite üyesi `/komite`'yi açtığında portföyünün sağlığını tek ekranda
görür: her pozisyonun ağırlığı, sağlığı, kalitesi ve **gate durumu**; üç bileşik
skor (Kalite / Risk / Fırsat); varlık sınıfı ve sektör dağılımı. Risk bir kapı
olarak çalışır: VBTS/SPK işaretli sembol **karantinaya** girer, teknik skoru
geçersiz sayılır.

**PR-1 kapsamında (MUST):**
- `/komite` route — Portföy Sağlığı landing (read-mostly).
- Pozisyon tablosu (çok-varlık: hisse + fon + altın + nakit).
- Üç bileşik skor (pozisyon-ağırlıklı, saf fonksiyon, testli).
- Varlık sınıfı dağılımı (vs varsayılan SAA config).
- Sektör maruziyeti overlay (ağırlık × sektör gücü).
- Gate sistemi: manuel `risk_flags` + otomatik likidite tabanı.
- Manuel risk bayrağı ekle/kaldır UI (CRUD).

**PR-1 kapsamı DIŞI (bilinçli ertelendi):**
- KAP otomasyonu / LLM sınıflandırma → şimdilik manuel bayrak.
- Ölçekli temel veri → "Kalite" teklif teknik-ağırlıklı, dürüst etiketli.
- Cron / DB cache → mevcut canlı screening yeniden kullanılır (v0.2 cron).
- Nakit Konuşlandırma sihirbazı → PR-2.
- Tez Defteri → PR-3.
- Backtest, alert/bildirim, mobil kart layout.
- "Gece Δ" trend → **SHOULD** (aşağıda opsiyonel snapshot ile).

---

## 2. Ekranlar

### 2.1 `/komite` — Portföy Sağlığı (tek sayfa)

```
┌ PORTFÖY SAĞLIĞI ── 4.2M₺ · Sağlık 72 ─────────── veri 1dk önce ● ─┐
│ (SHOULD) Gece Δ: 🔴 THYAO stop yakın · ⚖ Altın hedef üstü         │
├──────────────┬──────────────┬──────────────────────────────────────┤
│ KALİTE 74    │ RİSK 68      │ FIRSAT 61 — nakit %12 + Bankacılık %0│
├──────────────┴──────────────┴──────────────────────────────────────┤
│ VARLIK SINIFI (vs SAA)        │ SEKTÖR MARUZİYETİ (ağırlık × güç)   │
│ Hisse %22/30 ▼  Fon %28/35 ▼  │ Savunma %18·#2 ✓  Perakende %14·#9⚠ │
│ Altın %21/15 ▲  Nakit %12/8 ▲ │ Bankacılık %0·#1 🎯 (açık)          │
├─────────────────────────────────────────────────────────────────────┤
│ POZİSYONLARIM (ağırlık sıralı)                                      │
│ Sembol Ağırlık Değer    Sağlık       Kalite Gate      [bayrak]      │
│ ASELS  %12     504k₺    ✓ Sağlıklı   84     ✓ temiz    [⚑]         │
│ THYAO  %11     462k₺    ⚠ Stop yakın 70     ✓ temiz    [⚑]         │
│ ENJSA  %9      378k₺    ◐ vol↑        66     ✓ temiz    [⚑]         │
│ MAVI   %8      336k₺    ✓             72     ✓ temiz    [⚑]         │
│ (örnek) GESAN  —        —             (kar.) 🚪 VBTS    [⚑ kaldır]   │
│ Altın  %21     882k₺    — (hedef üstü) —     —                       │
│ Nakit  %12     504k₺    —             —      —                       │
├─────────────────────────────────────────────────────────────────────┤
│ Disclaimer: yatırım tavsiyesi değildir; veri özeti.                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Bileşenler:**
- `PortfolioHealthHeader` — toplam değer, Sağlık skoru, veri tazeliği rozeti.
- `NightDeltaStrip` (SHOULD) — gece değişim özeti.
- `ScoreCards` — Kalite / Risk / Fırsat (üç kart, kısa açıklama satırı).
- `AssetClassDistribution` — sınıf bazlı mevcut vs SAA hedef.
- `SectorExposure` — sektör ağırlığı + rank overlay + gap/overweight rozeti.
- `PositionsTable` — ana tablo; satırda `RiskFlagButton` (client).
- `RiskFlagDialog` (client) — bayrak ekle/kaldır.

**Etkileşim:** Tablo sıralanabilir (ağırlık/sağlık/kalite/gate). Bayrak işlemi
optimistic update + server action. Sayfa `force-dynamic`.

### 2.2 Boş durumlar
- Holding yok → "Henüz pozisyon yok. /islemler'den işlem ekleyin."
- Yahoo erişilemez → pozisyonlar son bilinen değerle + uyarı şeridi; skorlar
  "kısmi" rozetiyle hesaplanır, sayfa çökmez.

---

## 3. Route yapısı

```
src/app/(app)/komite/
├── page.tsx                       # server component, force-dynamic, orkestrasyon
├── komite-client.tsx              # client: sıralama + bayrak diyaloğu state
└── _components/
    ├── portfolio-health-header.tsx
    ├── night-delta-strip.tsx      # SHOULD
    ├── score-cards.tsx
    ├── asset-class-distribution.tsx
    ├── sector-exposure.tsx
    ├── positions-table.tsx
    └── risk-flag-dialog.tsx
```

**Navigasyon:** `src/components/layout/app-shell.tsx` içine yeni giriş —
`{ href: "/komite", label: "Komite", icon: "portfolio", section: "Piyasa" }`.
Mevcut `/tarama` PR-1'de **dokunulmaz** (regresyon riski yok); ileride `/komite`
şemsiyesinin "Aday Havuzu" merceğine dönüşür.

---

## 4. Veritabanı değişiklikleri

### 4.1 Migration `0044_risk_flags.sql` (PR-1 — tek zorunlu tablo)

```sql
create table if not exists public.risk_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,                 -- BIST ticker, '.IS' yok ('GESAN')
  kind        text not null check (kind in
                ('vbts','ban','spk','fin','vol','manual')),
  severity    smallint not null default 3 check (severity between 1 and 3),
  note        text,
  active      boolean not null default true,
  expires_at  date,                          -- ör. VBTS tahmini kalkış
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- bir sembol+kind için tek aktif kayıt
create unique index if not exists risk_flags_active_uq
  on public.risk_flags(user_id, symbol, kind) where active;

create index if not exists risk_flags_user_symbol_idx
  on public.risk_flags(user_id, symbol) where active;

select public.fn_apply_owner_rls('public.risk_flags');  -- 0007 helper
```

**Notlar:**
- `kind` semantiği: `vbts`=Volatilite Bazlı Tedbir, `ban`=açığa satış/kredili
  yasağı, `spk`=SPK inceleme/ceza, `fin`=finansal bozulma, `vol`=aşırı
  volatilite, `manual`=serbest.
- Çarpan eşlemesi **kodda** (DB'de değil) — bkz. §6.1. Tablo yalnız ham bayrağı
  tutar.
- `expires_at` geçmişse bayrak "bayat" sayılır (UI uyarısı), ama otomatik
  pasifleştirme PR-1'de yok (manuel veya v0.2 cron).

### 4.2 (SHOULD) Migration `0045_komite_health_snapshots.sql` — Gece Δ için

```sql
create table if not exists public.komite_health_snapshots (
  user_id      uuid not null references auth.users(id) on delete cascade,
  as_of        date not null,
  health       numeric(5,2) not null,
  quality      numeric(5,2) not null,
  risk         numeric(5,2) not null,
  opportunity  numeric(5,2) not null,
  positions    jsonb not null,        -- [{symbol, weight, health_label, gate}]
  created_at   timestamptz not null default now(),
  primary key (user_id, as_of)
);
select public.fn_apply_owner_rls('public.komite_health_snapshots');
```

Günde bir kez idempotent upsert (sayfa ilk yüklemede `as_of=today` yoksa yazar).
Gece Δ = bugün hesaplanan değerler ile `as_of < today` en yakın snapshot farkı.
Snapshot yoksa "ilk gün" gösterilir. Bu tablo **SHOULD**; çıkarılırsa Gece Δ
şeridi gizlenir, PR-1 yine canlıya çıkar.

### 4.3 İleriye dönük (PR-1 DIŞI)
- `saa_targets` → PR-2. PR-1'de SAA hedefleri `constants.ts` içinde sabit.
- `committee_decisions` → PR-3.

---

## 5. Migration planı

| Sıra | Dosya | Zorunlu? | İçerik | Geri alma |
|---|---|---|---|---|
| 1 | `0044_risk_flags.sql` | MUST | risk_flags + index + RLS | `drop table risk_flags` |
| 2 | `0045_komite_health_snapshots.sql` | SHOULD | snapshot tablosu | `drop table` |

- Idempotent (`if not exists`), mevcut numaralandırmayı sürdürür.
- RLS standart `fn_apply_owner_rls` ile — yeni policy yazımı yok.
- `src/lib/types/database.ts` içine `risk_flags` (+ snapshot) tip satırları
  eklenir (mevcut `screener_ranks` deseni gibi).
- Uygulama sırası: migration → tipler → servis → UI.

---

## 6. Servis katmanı

Yeni dizin `src/app/(app)/_lib/komite/`. **I/O ile saf mantık ayrı** (fonlar
`*-actions.ts` vs `*-logic.ts` deseni).

```
_lib/komite/
├── types.ts                  # PortfolioHealthView, Position, GateResult, ...
├── constants.ts              # eşikler, varsayılan SAA, gate çarpanları
├── gate.ts                   # SAF: computeGate()                + gate.test.ts
├── portfolio-health.ts       # SAF: skorlar/dağılım/sektör        + .test.ts
├── portfolio-actions.ts      # "use server": veri toplama orkestrasyonu
└── risk-flags-actions.ts     # "use server": risk_flags CRUD
```

### 6.1 `portfolio-actions.ts` (orkestrasyon, I/O)

`getPortfolioHealthView()` → `PortfolioHealthView`:
1. `listHoldings()` + `listAssets()` → pozisyonlar + sınıf/sektör. *(reuse)*
2. Sembol evreni = `getXK100Symbols()` ∪ (sahip olunan hisse sembolleri). *(reuse)*
3. `getScreeningData(symbols)` → fiyat, ATR, vol_20d, 52h, score, sma20. *(reuse)*
4. `computeSectorMomentum(rows)` → sektör rank/güç. *(reuse)*
5. Fon kovası: `listLatestFundScores(persona)` → fon kalite. *(reuse, fonlar)*
6. Altın/döviz değeri: `getAssetRates()`; nakit: hesap bakiyeleri. *(reuse)*
7. `listActiveRiskFlags(userId)` → manuel bayraklar.
8. Her pozisyon için değerleme (quantity × güncel fiyat) → ağırlık.
9. Saf motoru çağır: `buildPortfolioHealth(positions, screening, sectorMom, flags, config)`.
10. (SHOULD) snapshot upsert + Gece Δ hesapla.

> **Bağımlılık notu:** Çok-varlık değerleme (hisse×fiyat, fon×NAV, altın×kur)
> mevcut `/ozet` ve `/yatirimlar` yollarında zaten yapılıyor. Tek bir
> `valuePortfolio()` helper'ı yoksa, PR-1 mevcut fiyat/kur kaynakları üzerine
> ince bir toplayıcı ekler. **Açık soru §11.**

### 6.2 `risk-flags-actions.ts` (CRUD, I/O)
- `listActiveRiskFlags(userId)` → aktif bayraklar.
- `upsertRiskFlag({symbol, kind, severity, note, expires_at})` — RLS user_id.
- `deactivateRiskFlag(id)` → `active=false`.
- Server action; UI optimistic update; `revalidatePath('/komite')`.

### 6.3 Tipler (`types.ts`) — taslak
```
GateResult     { multiplier: number; quarantine: boolean;
                 tier: 'ok'|'soft'|'hard'; reasons: GateReason[] }
GateReason     { kind: string; label: string; severity: number }
Position       { symbol; name; assetClass; sector;
                 quantity; value; weight; price;
                 quality: number|null; effectiveQuality: number|null;
                 gate: GateResult; health?: TradePlanHealth }
ScoreTriple    { quality; risk; opportunity; health; trend? }
SectorExposure { sector; weight; rank; flag: 'ok'|'overweight_weak'|'gap' }
ClassDrift     { assetClass; currentPct; targetPct; deltaPct }
PortfolioHealthView { totalValue; scores: ScoreTriple;
                 positions: Position[]; sectors: SectorExposure[];
                 classDrift: ClassDrift[]; dataFreshness; partial: boolean;
                 nightDelta?: NightDelta }
```

---

## 7. Hesaplama motorları (saf, testli)

Tüm formüller DB'siz, deterministik, `*.test.ts` ile fixture testli. Sabitler
`constants.ts`'te (kolay kalibrasyon).

### 7.1 `gate.ts` — `computeGate(symbol, flags, liquidity)`

```
ADTV = vol_20d × price
liq bayrağı: ADTV < LIQ_FLOOR (varsayılan 25.000.000₺) → kind='liq'

kind → çarpan / tavan:
  vbts   → multiplier 0.0,  quarantine=true
  ban    → multiplier 0.2,  quarantine=true
  spk    → multiplier 0.3 − 0.1×(severity-1) → [0.1..0.3], quarantine=true
  liq    → multiplier 0.0,  quarantine=false
  fin    → cap 0.5 (üst sınır), quarantine=false
  vol    → cap 0.7,           quarantine=false
  manual → cap (0.7,0.5,0.3)[severity], quarantine=false

multiplier = min(tüm sert çarpanlar, tüm cap'ler), [0..1]
quarantine = herhangi sert-kapı bayrağı aktif mi
tier = multiplier==0 ? 'hard' : multiplier<1 ? 'soft' : 'ok'
reasons[] = okunur etiketler ("VBTS aktif", "ADTV 14M₺ < 25M₺ tabanı")
```

### 7.2 `portfolio-health.ts`

**Pozisyon kalitesi:**
```
stock:  qualityRaw = ScreeningRow.score (0..100)
        effectiveQuality = quarantine ? 0 : qualityRaw × gate.multiplier
fund:   effectiveQuality = latest Mehmet score
gold/cash/other: skorlanmaz (kalite paydası dışında)
```
> Karantina bir holding'i sahiplenmek portföy kalitesini **düşürür**
> (effectiveQuality=0). "Risk bir kapı" prensibi portföy seviyesinde de geçerli.

**Portföy Kalite (0..100):** skorlanabilir kova (hisse+fon) içinde ağırlık-normalize:
```
Quality = Σ (wᵢ_norm × effectiveQualityᵢ)   ,  wᵢ_norm = wᵢ / Σ(skorlanabilir w)
```

**Portföy Risk (0..100, yüksek = kötü):**
```
concentration = HHI(tüm ağırlıklar) → 0..100 (banded)
gateExposure  = Σ weight(gate.multiplier<1 olan holding'ler) → 0..100
volatility    = Σ wᵢ × (ATRᵢ/priceᵢ) → 0..100 (banded)
Risk = 0.40·concentration + 0.35·gateExposure + 0.25·volatility
```

**Portföy Fırsat (0..100):**
```
saaDrift   = Σ |currentPctₖ − targetPctₖ| / 2          (varsayılan SAA config)
cashGap    = |cashPct − targetCashPct|
sectorGaps = sayı(top-3 momentum sektörü, portföy ağırlığı ≈ 0)
Opportunity = banded(saaDrift, cashGap, sectorGaps ağırlıklı)
```

**Sağlık (0..100):** `Health = 0.5·Quality + 0.5·(100 − Risk)`
> Fırsat **Sağlık'a katılmaz** — o bir aksiyon sürücüsü (yapılacak), sağlık
> göstergesi değil. Ayrı kart olarak kalır.

**Trend (SHOULD):** snapshot varsa `Health_today − Health_prev`.

**Sektör maruziyeti:** her sektör için `weight` + `rank`; rozet:
`weight yüksek & rank kötü → overweight_weak ⚠` · `weight≈0 & rank top-3 → gap 🎯`.

**Sınıf sapması:** `currentPct − targetPct` (PR-1 SAA = `constants.ts` sabiti,
persona bazlı; PR-2'de `saa_targets` tablosundan).

### 7.3 Kalibrasyon sabitleri (`constants.ts`)
`LIQ_FLOOR=25_000_000`, gate çarpanları, risk alt-ağırlıkları (0.40/0.35/0.25),
banded normalizasyon eşikleri, varsayılan SAA (`{equity:30, fund:35, gold:15,
cash:8, other:12}` — persona ile değişir), HHI band sınırları.

---

## 8. Test stratejisi

**Birim (vitest, saf fonksiyon — DB yok), mevcut `pattern-detection.test.ts`
disiplini:**

- `gate.test.ts`
  - Her `kind` → doğru çarpan/karantina.
  - Likidite eşiği: ADTV < / ≥ taban.
  - Çoklu bayrak → en sıkı (min) kazanır.
  - Cap vs sert-çarpan etkileşimi.
  - `reasons[]` okunur ve sayıca doğru.
- `portfolio-health.test.ts`
  - Kalite ağırlık-normalizasyonu; karantina → effectiveQuality 0 ve
    portföy kalitesini düşürür.
  - HHI konsantrasyon bandları (tek pozisyon vs dağıtılmış).
  - Risk bileşimi (concentration+gate+vol) doğru ağırlık.
  - Fırsat: sektör gap sayımı, SAA sapma, nakit açığı.
  - Sektör rozetleri: overweight_weak / gap / ok.
  - Sınıf sapması işareti (▲/▼).
  - **Kenar durumlar:** boş portföy; screening null (Yahoo down) → kısmi,
    çökmez; skorlanamayan sembol (fiyat yok) atlanır; tek sektör.

**Kapsam hedefi:** ~25–30 yeni test; `npm test` yeşil; `tsc --noEmit` temiz.
Server action'lar birim test edilmez (I/O); mantık saf katmanda test edilir.

**Manuel doğrulama (TESTING.md'ye not):** VBTS bayrağı ekle → satır karantina,
portföy Kalite düşer, Risk artar; bayrağı kaldır → eski hale döner.

---

## 9. Kullanıcı hikayeleri

- **US-1 — Portföy sağlığı tek bakışta.** Komite üyesi olarak `/komite`'yi
  açtığımda toplam değer, Sağlık skoru ve her pozisyonun ağırlık/sağlık/kalitesini
  tek ekranda görmek istiyorum ki "portföyüm sağlıklı mı?" sorusunu yanıtlayayım.
- **US-2 — Riskli hale gelen pozisyon.** Bir pozisyonun gate/sağlık nedeniyle
  riskli olduğunu görmek istiyorum ki yeni alımdan önce mevcut sermayemi
  koruyayım.
- **US-3 — Manuel risk kapısı.** Bir sembole VBTS/SPK bayrağı koyabilmek
  istiyorum ki sistem onu karantinaya alsın ve teknik skorunu yok saysın
  (GESAN tuzağı).
- **US-4 — Yoğunlaşma.** Konsantrasyonumu (tek-isim + sektör) görmek istiyorum
  ki nerede aşırı yoğunlaştığımı bileyim.
- **US-5 — Sektör açıkları.** Hangi güçlü sektörlerde temsil edilmediğimi
  görmek istiyorum ki boşlukları fark edeyim.
- **US-6 — Dayanıklılık.** Yahoo erişilemese bile sayfanın açılmasını istiyorum
  ki veri kaynağı çökünce kör kalmayayım.
- **US-7 (SHOULD) — Gece değişimi.** Dün geceden bu yana sağlığımda ne
  değiştiğini görmek istiyorum.

---

## 10. Acceptance Criteria

**US-1**
- Verili holdings → `/komite` toplam değer + Sağlık skoru + pozisyon tablosunu
  render eder; ağırlıklar toplam ≈ %100.
- Pozisyonlar ağırlığa göre sıralı; hisse/fon/altın/nakit aynı tabloda.

**US-2**
- gate.multiplier < 1 olan pozisyon görsel olarak işaretli (sebep okunur).
- Portföydeki + gate-bayraklı pozisyon Risk skorunu yükseltir (test ile).

**US-3**
- VBTS bayrağı eklenince ilgili satır **karantina**; teknik kalite kullanılmaz
  (effectiveQuality=0); portföy Kalite düşer, Risk artar.
- Bayrak kaldırılınca değerler eski haline döner; değişiklik kalıcı (DB).
- RLS: kullanıcı yalnız kendi bayraklarını görür/değiştirir.

**US-4**
- Sektör maruziyeti paneli ağırlık × rank gösterir; overweight-weak sektör ⚠
  rozetli. En büyük 3 pozisyon konsantrasyonu görünür.

**US-5**
- Top-3 momentum sektöründen portföy ağırlığı ≈ 0 olanlar "açık 🎯" işaretli;
  Fırsat skoruna yansır.

**US-6**
- `getScreeningData` boş/eksik dönerse sayfa çöker **değil**; "kısmi veri"
  uyarısı + mevcut bilgiyle render.

**US-7 (SHOULD)**
- Önceki snapshot varsa Sağlık trendi (▲/▼ + delta) görünür; yoksa "ilk gün".

**Non-functional**
- `npm test` yeşil (≥25 yeni test); `tsc --noEmit` temiz; `eslint` temiz.
- Migration idempotent; RLS aktif.
- Tüm metinler Türkçe (kod tabanı tutarlılığı); disclaimer mevcut.
- Mevcut design token/bileşenler kullanılır; yeni tasarım sistemi yok.

---

## 11. Açık sorular / karar gereken noktalar

1. **Çok-varlık değerleme helper'ı.** `/ozet` / `/yatirimlar`'da kullanılan
   değerleme tek bir fonksiyona çıkarılmış mı? Değilse PR-1 ince bir
   `valuePortfolio()` toplayıcısı ekler (önerilen). — *Geliştirme başında 30 dk
   inceleme.*
2. **Nakit kaynağı.** Nakit ağırlığı hesap bakiyelerinden mi yoksa ayrı bir
   "nakit holding"den mi gelir? Mevcut `/ozet` yaklaşımı esas alınır.
3. **Persona → SAA eşlemesi.** PR-1 varsayılan SAA'yı persona'dan mı türetir,
   yoksa tek sabit mi? Öneri: persona varsa ondan, yoksa sabit fallback.
4. **`/komite` vs `/tarama` adlandırma.** PR-1 yeni `/komite` açar, `/tarama`
   dokunulmaz. Navigasyon etiketi "Komite" onaylanıyor mu?
5. **Gece Δ (0045) PR-1'de mi, PR-1.1'de mi?** SHOULD; kapsam baskısı olursa
   ayrı küçük PR'a alınabilir.

---

## 12. Riskler ve azaltma

| Risk | Etki | Azaltma |
|---|---|---|
| Canlı Yahoo bağımlılığı (cron yok) | Yavaş/kırılgan | Kısmi render + uyarı; v0.2 cron |
| Manuel bayrak bayatlar | Yanlış karantina | `expires_at` + "bayat" rozeti |
| Teknik-ağırlıklı Kalite yanıltır | Yanlış güven | Dürüst etiket; gate güvenlik ağı |
| Değerleme tutarsızlığı (/ozet ile) | Ağırlık hatası | Mevcut değerleme yolunu yeniden kullan, çift kaynak yok |
| Sektör datası seyrek (<3) | Rank boş | "UNDERSAMPLED" mevcut davranışı korunur |

---

## 13. Çıktı (Definition of Done)

- [ ] `0044` (+ SHOULD `0045`) migration uygulandı, RLS doğrulandı.
- [ ] `_lib/komite/` saf motorlar + testler yeşil.
- [ ] `/komite` sayfası tüm panelleri render ediyor.
- [ ] Manuel bayrak CRUD çalışıyor; karantina davranışı doğrulandı.
- [ ] Yahoo-down senaryosu çökmüyor.
- [ ] `npm test` + `tsc --noEmit` + `eslint` temiz.
- [ ] Draft PR açıldı; bu doküman PR açıklamasına linklendi.
