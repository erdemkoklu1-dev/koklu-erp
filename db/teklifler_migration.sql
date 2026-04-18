-- ============================================================
-- TEKLIFLER MIGRATION
-- Köklü ERP — Fiyat Teklifi Modülü
-- ============================================================

-- Teklifler tablosu
create table public.teklifler (
  id                    uuid primary key default gen_random_uuid(),
  teklif_no             text not null unique,
  tarih                 date not null default current_date,
  gecerlilik_suresi     int not null default 7,
  gecerlilik_bitis      date,
  sehir                 text,
  durum                 text not null default 'taslak'
                          check (durum in ('taslak','gonderildi','bekliyor','kazanildi','kaybedildi','iptal')),

  -- Müşteri (kayıtlı veya manuel)
  musteri_id            uuid references public.customers(id) on delete set null,
  musteri_adi           text not null default '',
  musteri_sehir         text,
  musteri_telefon       text,
  musteri_email         text,

  -- Para birimi ve kur
  para_birimi           text not null default 'TL' check (para_birimi in ('TL','USD','EUR')),
  doviz_kuru            numeric(14,4) default 1,

  -- KDV
  kdv_durumu            text not null default 'haric' check (kdv_durumu in ('dahil','haric','yok')),
  kdv_orani             numeric(5,2) not null default 20,

  -- Tutarlar
  ara_toplam            numeric(14,2) not null default 0,
  kdv_tutari            numeric(14,2) not null default 0,
  genel_toplam          numeric(14,2) not null default 0,

  -- Kar oranı
  kar_orani             numeric(5,2),

  -- Metin alanları
  notlar                text,
  ticari_sartname_metni text,
  ticari_sartname_ekli  boolean not null default false,

  created_at            timestamptz not null default now()
);

create index on public.teklifler (durum);
create index on public.teklifler (tarih);
create index on public.teklifler (musteri_id);
create index on public.teklifler (teklif_no);

-- Teklif kalemleri tablosu
create table public.teklif_kalemleri (
  id           uuid primary key default gen_random_uuid(),
  teklif_id    uuid not null references public.teklifler(id) on delete cascade,
  sira_no      int not null default 1,
  aciklama     text not null default '',
  miktar       numeric(14,3) not null default 1,
  birim_fiyat  numeric(14,2) not null default 0,
  toplam       numeric(14,2) not null default 0,
  created_at   timestamptz not null default now()
);

create index on public.teklif_kalemleri (teklif_id);

-- RLS politikaları
alter table public.teklifler enable row level security;
create policy "Service role has full access" on public.teklifler
  using (true) with check (true);

alter table public.teklif_kalemleri enable row level security;
create policy "Service role has full access" on public.teklif_kalemleri
  using (true) with check (true);
