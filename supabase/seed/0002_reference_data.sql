-- =====================================================================
-- Reference data shared across all users (run as service_role).
-- =====================================================================

-- ---------- benchmark series ----------------------------------------
insert into public.benchmark_series (code, name, unit, source) values
  ('CPI_TR',  'TÜFE (Yıllık %)',     '%',   'TCMB'),
  ('USDTRY',  'USD/TRY',             'TRY', 'TCMB'),
  ('EURTRY',  'EUR/TRY',             'TRY', 'TCMB'),
  ('XAUTRY',  'Gram Altın',          'TRY', 'borsapy'),
  ('XU100',   'BIST 100',            'idx', 'borsapy')
on conflict (code) do nothing;

-- ---------- FX & metal assets ---------------------------------------
insert into public.assets (symbol, name, asset_class, currency) values
  ('USDTRY', 'ABD Doları',  'fx',    'TRY'),
  ('EURTRY', 'Euro',        'fx',    'TRY'),
  ('XAU',    'Gram Altın',  'metal', 'TRY')
on conflict (symbol, asset_class) do nothing;

-- ---------- BIST common tickers (seed sample) -----------------------
-- The full list is maintained by the borsapy ETL; this seed keeps
-- the dev environment usable without waiting for the first scan.
insert into public.assets (symbol, name, asset_class, currency, exchange, sector) values
  ('ASELS',  'Aselsan',                 'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('THYAO',  'Türk Hava Yolları',       'equity_tr', 'TRY', 'BIST', 'XULAS'),
  ('AKBNK',  'Akbank',                  'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('GARAN',  'Garanti Bankası',         'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('ISCTR',  'İş Bankası (C)',          'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('YKBNK',  'Yapı Kredi',              'equity_tr', 'TRY', 'BIST', 'XBANK'),
  ('TUPRS',  'Tüpraş',                  'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('EREGL',  'Ereğli Demir Çelik',      'equity_tr', 'TRY', 'BIST', 'XMANA'),
  ('KCHOL',  'Koç Holding',             'equity_tr', 'TRY', 'BIST', 'XHOLD'),
  ('SAHOL',  'Sabancı Holding',         'equity_tr', 'TRY', 'BIST', 'XHOLD'),
  ('BIMAS',  'BİM Mağazalar',           'equity_tr', 'TRY', 'BIST', 'XGIDA'),
  ('SISE',   'Şişe Cam',                'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('PETKM',  'Petkim',                  'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('FROTO',  'Ford Otosan',             'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('TOASO',  'Tofaş',                   'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('ARCLK',  'Arçelik',                 'equity_tr', 'TRY', 'BIST', 'XUSIN'),
  ('BETAE',  'Beta Enerji ve Teknoloji','equity_tr', 'TRY', 'BIST', 'XELKT'),
  ('BINHO',  '1000 Yatırımlar Holding', 'equity_tr', 'TRY', 'BIST', 'XHOLD'),
  ('ORZAX',  'Orzaks İlaç ve Kimya',    'equity_tr', 'TRY', 'BIST', 'XKMYA'),
  ('SOKE',   'Söke Değirmencilik',      'equity_tr', 'TRY', 'BIST', 'XGIDA'),
  ('ISDMR',  'İskenderun Demir ve Çelik','equity_tr', 'TRY', 'BIST', 'XMANA')
on conflict (symbol, asset_class) do nothing;

-- ---------- common crypto -------------------------------------------
insert into public.assets (symbol, name, asset_class, currency) values
  ('BTC',   'Bitcoin',  'crypto', 'TRY'),
  ('ETH',   'Ethereum', 'crypto', 'TRY'),
  ('SOL',   'Solana',   'crypto', 'TRY')
on conflict (symbol, asset_class) do nothing;
