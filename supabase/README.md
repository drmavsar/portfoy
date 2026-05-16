# Supabase Şema ve Migrasyonlar

Bu klasör projenin veri katmanını tanımlar. Migrasyonlar sıralı uygulanır.

## Dosyalar

| Dosya | İçerik |
|------|--------|
| `migrations/0001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`, ortak enumlar, `updated_at` trigger helper |
| `migrations/0002_dimensions.sql`           | Dinamik tanımlamalar: portföyler, faydalanıcılar, kategoriler, custody, etiketler |
| `migrations/0003_cashflow.sql`             | Hesaplar, ekstre import'ları, işlemler, taslak (draft) tablosu, bütçeler |
| `migrations/0004_classification_rules.sql` | Kural motoru ve `merchant_aliases` |
| `migrations/0005_wealth.sql`               | Varlık master, trade defteri, gerçekleşen lots, fiyat snapshot, benchmark serileri |
| `migrations/0006_screener.sql`             | Teknik/temel taramalar, composite rank, KAP katalist olayları, watchlist |
| `migrations/0007_rls_policies.sql`         | RLS politikaları (her tablo `auth.uid()` ile sahiplenir) |
| `migrations/0008_views_and_helpers.sql`    | Raporlama view'ları: bakiyeler, aylık nakit akışı, WAC, MTM, screener |
| `seed/0001_default_dimensions.sql`         | `bootstrap_user_defaults()` — yeni kullanıcı için TR varsayılan dimensions |
| `seed/0002_reference_data.sql`             | Benchmark serileri ve örnek BIST hisseleri (service_role ile çalıştırılır) |

## Lokal kurulum

```bash
# Supabase CLI gereklidir: https://supabase.com/docs/guides/cli
supabase start
supabase db reset   # tüm migrasyonları + seed'i uygular
```

## Üretim

GitHub Actions üzerinden `supabase db push` ile çalıştırılır. Service role
sadece ETL pipeline'larında (borsapy, KAP scraper) kullanılır; uygulama
katmanı her zaman `anon` veya kullanıcı JWT'si ile bağlanır.

## Tasarım prensipleri

* **Tek gerçeklik kaynağı.** Hesaplar arası transferler tek `transaction`
  satırı + `counter_account_id` ile modellenir; iki ayrı satıra
  bölünmez (no double-counting).
* **Dinamik tanımlamalar.** Kategoriler, faydalanıcılar, custody, etiketler
  ve kurallar her zaman tablo satırı; enum değildirler.
* **Gözetimli otomasyon.** Ekstreler önce `transaction_drafts`'a düşer;
  kullanıcı onaylayınca `transactions`'a materyalize edilir.
* **Reference vs user-data.** `assets`, `price_snapshots`, `technical_scans`,
  `screener_ranks` ve `catalyst_events` paylaşımlıdır; tüm
  authenticated kullanıcılar okuyabilir, sadece service_role yazabilir.
