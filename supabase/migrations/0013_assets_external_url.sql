-- =====================================================================
-- Migration 0013: assets.external_url — sembol başına dış kaynak linki
-- =====================================================================
-- Investing.com gibi dış sitelerde sembol slug'ları standart değil
-- (TUPRS → tupras, KLKIM → kalekim-kimyevi-madd vs.). Asset master'a
-- url alanı ekliyoruz; UI'da sembole tıklayınca yeni sekmede açar.

alter table public.assets
  add column if not exists external_url text;

-- Kullanıcının verdiği 14 sembol için investing.com TR linkleri
update public.assets set external_url = 'https://tr.investing.com/equities/tupras'                                  where symbol = 'TUPRS' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/aselsan'                                 where symbol = 'ASELS' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/kalekim-kimyevi-madd'                    where symbol = 'KLKIM' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/gubre-fabrik.'                           where symbol = 'GUBRF' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/koza-altin'                              where symbol = 'TRALT' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/europower-enerji-ve-otomasyon'           where symbol = 'EUPWR' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/tekfen-holding'                          where symbol = 'TKFEN' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/mia-teknoloji-as'                        where symbol = 'MIATK' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/yeo-teknoloji-enerji-ve-endustri-as'     where symbol = 'YEOTK' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/turkcell'                                where symbol = 'TCELL' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/kardemir-(d)'                            where symbol = 'KRDMD' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/astor-enerji-as'                         where symbol = 'ASTOR' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/turk-hava-yollari'                       where symbol = 'THYAO' and asset_class = 'equity_tr';
update public.assets set external_url = 'https://tr.investing.com/equities/enerjisa-enerji'                         where symbol = 'ENJSA' and asset_class = 'equity_tr';
