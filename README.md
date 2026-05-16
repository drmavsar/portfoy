# Mehmet's Assets — Wealth OS

Kişisel ERP ve yatırım terminali. Nakit akışı, çoklu portföy varlık takibi ve
BIST için teknik+temel screener — tek arayüzde.

## Canlı Demo / Deploy

Vercel'e tek tıkla deploy:

**[Deploy to Vercel ↗](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdrmavsar%2Fportfoy&project-name=mehmet-assets&repository-name=portfoy)**

Adımlar:

1. Yukarıdaki linke tıkla
2. GitHub ile Vercel'e giriş yap
3. Project Name: `mehmet-assets` (veya istediğin)
4. Framework: Next.js (otomatik tanır)
5. Region: **fra1** (Frankfurt — TR'ye en yakın, `vercel.json`'da default)
6. Env vars'ı şu an boş geç → Deploy
7. ~90 saniyede `https://mehmet-assets-xxx.vercel.app` hazır

Demo şu an **sample data** ile gelir (Hasan Hanesi: Ben/Ahmet Burak/Salih, ASELS/THYAO/BIMAS pozisyonları, vs.).

Supabase'i daha sonra bağlayınca env vars'ı Vercel dashboard'dan ekleyebilirsin:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (opsiyonel, ETL için)

## Mimari

```
Next.js 16 (App Router)  ←→  Supabase (Postgres + Auth + RLS)
        ↑                              ↑
        │                              │
   ETL Adapters                  Python ETL (borsapy, KAP, TCMB)
   (CSV / XLSX / Garanti Bonus)  → price_snapshots, technical_scans,
                                   fundamental_data, catalyst_events
```

## Klasör yapısı

```
docs/
  design-brief.md             claude/design için detaylı UI spec'i
supabase/
  migrations/                 0001..0008 — şema, RLS, view'lar
  seed/                       kullanıcı default'ları + reference data
src/
  app/
    (app)/                    auth gerektiren ana shell
      dashboard, cashflow, wealth, screener, settings
    api/cashflow/             import / commit endpoint'leri
    login/
  components/
    layout/                   sidebar
    ui/                       page-header, placeholder-card
  lib/
    etl/parsers/              generic + garanti-bonus
    etl/classifier.ts         kural motoru + Garanti etiket fallback
    finance/                  format, WAC, MTM
    supabase/                 client / server / middleware
    types/database.ts         elle tutulan tip iskeleti
test-fixtures/                örnek Garanti BBVA ekstreleri
```

## Kurulum

```bash
# 1. Bağımlılıklar
npm install

# 2. Supabase
#    a) https://supabase.com/dashboard üzerinden yeni proje aç
#    b) Project Settings → API → URL ve anon/service_role key'leri al
cp .env.example .env.local
# .env.local içine değerleri gir

# 3. Şemayı uygula
supabase link --project-ref <project-ref>
supabase db push    # supabase/migrations + seed

# 4. Geliştirme sunucusu
npm run dev
```

## Mimari prensipler

1. **Tek gerçeklik kaynağı.** "Cep Şube Ödeme" gibi satırlar masraf değil
   transfer; iki ayrı satıra bölünmez, `counter_account_id` ile aynı
   satırda modellenir.
2. **Dinamik tanımlamalar.** Kategori, faydalanıcı, custody, kural — hepsi
   user-scoped tablo satırı; enum değil.
3. **Gözetimli otomasyon.** Ekstre → `transaction_drafts` → onay → `transactions`.
   Hiçbir satır onay almadan harcama raporlarına girmez.
4. **Teknik önce, temel sonra.** Screener felsefesi: RS + hacim önce
   filtreler, bilanço sürdürülebilirliği teyit eder.
5. **Reel vs nominal.** Her getiri ölçümü CPI/USD/EUR/XAU overlay ile
   karşılaştırılabilir.

## Geliştirme notları

* `npm run lint` — ESLint
* `npm run build` — Next.js production build (TypeScript dahil)
* Garanti BBVA Bonus formatı için örnek dosyalar `test-fixtures/` içinde.

## Sonraki adımlar

* [ ] `claude/design` çıktısıyla tasarım katmanı (renk, tipografi, mock'lar)
* [ ] Draft review ekranı (Cashflow → Ekstreler)
* [ ] Trade form'u + WAC önizleme
* [ ] borsapy ETL (Python, GitHub Actions ile günlük)
* [ ] KAP entegrasyonu + LLM özet pipeline'ı
