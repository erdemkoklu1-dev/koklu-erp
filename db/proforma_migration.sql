-- PROFORMA FATURA MIGRATION

create table if not exists public.proforma_faturalar (
  id                   uuid primary key default gen_random_uuid(),

  -- Numara & Tarih
  proforma_no          text not null unique,
  tarih                date not null default current_date,
  vade_tarihi          date,

  -- Müşteri
  customer_id          uuid references public.customers(id) on delete set null,
  musteri_unvan        text not null,
  musteri_adres        text,
  musteri_vkn          text,
  musteri_vergi_dairesi text,
  musteri_telefon      text,
  musteri_email        text,

  -- Teklif bağlantısı
  teklif_id            uuid references public.teklifler(id) on delete set null,

  -- Toplamlar
  ara_toplam           decimal(12,2) default 0,
  toplam_iskonto       decimal(12,2) default 0,
  kdv_matrahi          decimal(12,2) default 0,
  kdv_tutari           decimal(12,2) default 0,
  toplam_tutar         decimal(12,2) default 0,

  -- Para birimi
  para_birimi          text default 'TRY' check (para_birimi in ('TRY','USD','EUR')),

  -- Durum
  durum                text default 'taslak' check (durum in ('taslak','gonderildi','onaylandi','iptal','faturalandi')),

  -- Ödeme
  iban                 text default 'TR930001000116120045825001',
  banka_adi            text default 'TC ZİRAAT BANKASI / ERZİNCAN ŞUBESİ',

  -- Notlar
  notlar               text,
  ozel_sartlar         text,

  -- Şube
  sube_id              uuid references public.subeler(id) on delete set null,

  -- Meta
  created_by           uuid references auth.users(id),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

alter table public.proforma_faturalar enable row level security;
create policy "proforma_auth_all" on public.proforma_faturalar
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Kalemler
create table if not exists public.proforma_fatura_kalemleri (
  id               uuid primary key default gen_random_uuid(),
  proforma_id      uuid not null references public.proforma_faturalar(id) on delete cascade,
  sira_no          integer not null default 1,

  urun_id          uuid references public.urunler(id) on delete set null,
  mal_hizmet       text not null,
  aciklama         text,

  miktar           decimal(10,2) not null default 1,
  birim            text default 'Adet',
  birim_fiyat      decimal(12,2) not null default 0,

  iskonto_orani    decimal(5,2) default 0,
  iskonto_tutari   decimal(12,2) default 0,

  kdv_orani        decimal(5,2) default 20,
  kdv_tutari       decimal(12,2) default 0,

  toplam_tutar     decimal(12,2) default 0,

  created_at       timestamptz default now()
);

alter table public.proforma_fatura_kalemleri enable row level security;
create policy "proforma_kalem_auth_all" on public.proforma_fatura_kalemleri
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Sıralı proforma no üretimi
create or replace function public.generate_proforma_no()
returns text as $$
declare
  current_year text;
  next_num     integer;
begin
  current_year := extract(year from current_date)::text;
  select coalesce(max(
    cast(substring(proforma_no from 'PF-' || current_year || '-(\d+)') as integer)
  ), 0) + 1
  into next_num
  from public.proforma_faturalar
  where proforma_no like 'PF-' || current_year || '-%';
  return 'PF-' || current_year || '-' || lpad(next_num::text, 4, '0');
end;
$$ language plpgsql security definer;

-- updated_at trigger
create or replace function public.update_proforma_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists proforma_updated_at on public.proforma_faturalar;
create trigger proforma_updated_at
  before update on public.proforma_faturalar
  for each row execute function public.update_proforma_updated_at();
