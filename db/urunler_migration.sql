-- ============================================================
-- URUNLER MIGRATION (idempotent — safe to run multiple times)
-- Köklü ERP — Ürün/Fiyat Listesi
-- ============================================================

create table if not exists public.urunler (
  id                     uuid primary key default gen_random_uuid(),
  kategori               text not null check (kategori in ('cihaz', 'dolum', 'yedek_parca')),
  ad                     text not null,
  kapasite               text,
  tip                    text,
  kdv_dahil_fiyat        numeric(14,2) not null default 0,
  kdv_haric_fiyat        numeric(14,2) not null default 0,
  periyodik_bakim_fiyati numeric(14,2),
  dolum_fiyati           numeric(14,2),
  birim                  text not null default 'adet',
  aktif                  boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Unique constraint so seed is idempotent
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'urunler_kategori_ad_key'
      and conrelid = 'public.urunler'::regclass
  ) then
    alter table public.urunler add constraint urunler_kategori_ad_key unique (kategori, ad);
  end if;
end $$;

create index if not exists urunler_kategori_idx on public.urunler (kategori);
create index if not exists urunler_aktif_idx    on public.urunler (aktif);

alter table public.urunler enable row level security;

drop policy if exists "Service role has full access" on public.urunler;
create policy "Service role has full access" on public.urunler
  using (true) with check (true);

-- ============================================================
-- SEED DATA  (ON CONFLICT DO NOTHING = safe to re-run)
-- ============================================================

-- KATEGORİ: cihaz
insert into public.urunler (kategori, ad, kapasite, tip, kdv_dahil_fiyat, kdv_haric_fiyat, birim) values
  ('cihaz', '1 Kg KKT Yangın Söndürme Cihazı',         '1 Kg',  'KKT',     660,   550,     'adet'),
  ('cihaz', '2 Kg KKT Yangın Söndürme Cihazı',         '2 Kg',  'KKT',     850,   708.33,  'adet'),
  ('cihaz', '6 Kg KKT Yangın Söndürme Cihazı',         '6 Kg',  'KKT',     1700,  1416.67, 'adet'),
  ('cihaz', '9 Kg KKT Yangın Söndürme Cihazı',         '9 Kg',  'KKT',     2400,  2000,    'adet'),
  ('cihaz', '12 Kg KKT Yangın Söndürme Cihazı',        '12 Kg', 'KKT',     3000,  2500,    'adet'),
  ('cihaz', '25 Kg KKT Yangın Söndürme Cihazı',        '25 Kg', 'KKT',     9000,  7500,    'adet'),
  ('cihaz', '50 Kg KKT Yangın Söndürme Cihazı',        '50 Kg', 'KKT',     11250, 9375,    'adet'),
  ('cihaz', '12 Kg KÖPÜKLÜ Yangın Söndürme Cihazı',    '12 Kg', 'KÖPÜKLÜ', 2500,  2083.33, 'adet'),
  ('cihaz', '25 Kg KÖPÜKLÜ Yangın Söndürme Cihazı',    '25 Kg', 'KÖPÜKLÜ', 8000,  6666.67, 'adet'),
  ('cihaz', '50 Kg KÖPÜKLÜ Yangın Söndürme Cihazı',    '50 Kg', 'KÖPÜKLÜ', 10000, 8333.33, 'adet'),
  ('cihaz', '5 Kg CO2 Yangın Söndürme Cihazı',         '5 Kg',  'CO2',     3000,  2500,    'adet'),
  ('cihaz', '10 Kg CO2 Yangın Söndürme Cihazı',        '10 Kg', 'CO2',     10000, 8333.33, 'adet'),
  ('cihaz', '30 Kg CO2 Yangın Söndürme Cihazı',        '30 Kg', 'CO2',     15000, 12500,   'adet')
on conflict (kategori, ad) do nothing;

-- KATEGORİ: dolum
insert into public.urunler (kategori, ad, kapasite, tip, kdv_dahil_fiyat, kdv_haric_fiyat, periyodik_bakim_fiyati, dolum_fiyati, birim) values
  ('dolum', '1 Kg KKT Yangın Söndürme Cihazı Dolumu',       '1 Kg',  'KKT',      180,  150,     50,  180,  'adet'),
  ('dolum', '2 Kg KKT Yangın Söndürme Cihazı Dolumu',       '2 Kg',  'KKT',      350,  291.67,  50,  350,  'adet'),
  ('dolum', '6 Kg KKT Yangın Söndürme Cihazı Dolumu',       '6 Kg',  'KKT',      600,  500,     150, 600,  'adet'),
  ('dolum', '9 Kg KKT Yangın Söndürme Cihazı Dolumu',       '9 Kg',  'KKT',      1000, 833.33,  150, 1000, 'adet'),
  ('dolum', '12 Kg KKT Yangın Söndürme Cihazı Dolumu',      '12 Kg', 'KKT',      1200, 1000,    150, 1200, 'adet'),
  ('dolum', '25 Kg KKT Yangın Söndürme Cihazı Dolumu',      '25 Kg', 'KKT',      1780, 1483.33, 200, 1780, 'adet'),
  ('dolum', '50 Kg KKT Yangın Söndürme Cihazı Dolumu',      '50 Kg', 'KKT',      3500, 2916.67, 200, 3500, 'adet'),
  ('dolum', '12 Kg KÖPÜKLÜ Yangın Söndürme Cihazı Dolumu',  '12 Kg', 'KÖPÜKLÜ',  1000, 833.33,  150, 1000, 'adet'),
  ('dolum', '25 Kg KÖPÜKLÜ Yangın Söndürme Cihazı Dolumu',  '25 Kg', 'KÖPÜKLÜ',  1600, 1333.33, 200, 1600, 'adet'),
  ('dolum', '50 Kg KÖPÜKLÜ Yangın Söndürme Cihazı Dolumu',  '50 Kg', 'KÖPÜKLÜ',  3000, 2500,    200, 3000, 'adet'),
  ('dolum', '12 Kg Otomatik Davlumbaz Dolumu',               '12 Kg', 'Otomatik', 3300, 2750,    400, 3300, 'adet'),
  ('dolum', '20 Kg Otomatik Davlumbaz Dolumu',               '20 Kg', 'Otomatik', 5000, 4166.67, 400, 5000, 'adet'),
  ('dolum', '5 Kg CO2 Yangın Söndürme Cihazı Dolumu',        '5 Kg',  'CO2',      600,  500,     150, 600,  'adet'),
  ('dolum', '10 Kg CO2 Yangın Söndürme Cihazı Dolumu',       '10 Kg', 'CO2',      1200, 1000,    200, 1200, 'adet'),
  ('dolum', '30 Kg CO2 Yangın Söndürme Cihazı Dolumu',       '30 Kg', 'CO2',      3000, 2500,    200, 3000, 'adet')
on conflict (kategori, ad) do nothing;

-- KATEGORİ: yedek_parca
insert into public.urunler (kategori, ad, kapasite, tip, kdv_dahil_fiyat, kdv_haric_fiyat, birim) values
  ('yedek_parca', '6-12 Kg KKT Tozlu Hortumu',  '6-12 Kg', 'KKT',   100,  83.33,  'adet'),
  ('yedek_parca', 'Karbondioksit Lans Hortum',   null,      'CO2',   600,  500,    'adet'),
  ('yedek_parca', '25-50 Kg KKT Vanası',         '25-50 Kg','KKT',   1200, 1000,   'adet'),
  ('yedek_parca', '6-12 Kg KKT T.Vanası',        '6-12 Kg', 'KKT',   250,  208.33, 'adet'),
  ('yedek_parca', 'Karbondioksit Vanası',         null,      'CO2',   600,  500,    'adet'),
  ('yedek_parca', 'Manometre (saat)',             null,      'Diger', 50,   41.67,  'adet')
on conflict (kategori, ad) do nothing;
