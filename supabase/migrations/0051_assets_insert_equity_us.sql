-- =====================================================================
-- Migration 0051: ABD hisselerini uygulamadan ekleme izni
-- =====================================================================
-- assets ortak bir tablodur (user_id yok) ve şimdiye kadar yalnız okunabilir
-- (assets_read). Yeni bir ABD hissesi (ör. halka arz) işlem formundan
-- eklenebilsin diye authenticated kullanıcıya DAR bir insert izni: yalnız
-- asset_class = 'equity_us' ve currency = 'USD' satırları. BIST, fon, döviz
-- ve diğer varlıklar yine migration / seed ile gelir; update/delete yok.
-- =====================================================================

drop policy if exists assets_insert_equity_us on public.assets;
create policy assets_insert_equity_us on public.assets
  for insert to authenticated
  with check (asset_class = 'equity_us' and currency = 'USD');
