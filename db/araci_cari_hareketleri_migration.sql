-- ============================================================
-- ARACI CARI HAREKETLERI MIGRATION
-- Koklu ERP - Araci Cari / Alacak-Borc Takibi
-- ============================================================

create table if not exists public.araci_cari_hareketleri (
  id                uuid primary key default gen_random_uuid(),
  araci_id          uuid not null references public.brokers(id) on delete cascade,
  hareket_no        text,
  hareket_tarihi    date not null default current_date,
  vade_tarihi       date,
  hareket_tipi      text not null,
  islem_yonu        text not null check (islem_yonu in ('alacak','borc')),
  tutar             numeric(14,2) not null default 0 check (tutar >= 0),
  para_birimi       text not null default 'TRY',
  aciklama          text,
  kategori          text,
  durum             text not null default 'Bekliyor',
  odeme_tarihi      date,
  bagli_fatura_id   uuid references public.invoices(id) on delete set null,
  bagli_fatura_no   text,
  bagli_musteri_id  uuid references public.customers(id) on delete set null,
  bagli_musteri_adi text,
  komisyon_orani    numeric(5,2),
  kaynak            text not null default 'Manuel Giriş',
  belge_no          text,
  dosya_url         text,
  sube_id           uuid references public.subeler(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);

create index if not exists araci_cari_hareketleri_araci_id_idx on public.araci_cari_hareketleri(araci_id);
create index if not exists araci_cari_hareketleri_hareket_tarihi_idx on public.araci_cari_hareketleri(hareket_tarihi);
create index if not exists araci_cari_hareketleri_vade_tarihi_idx on public.araci_cari_hareketleri(vade_tarihi);
create index if not exists araci_cari_hareketleri_durum_idx on public.araci_cari_hareketleri(durum);
create index if not exists araci_cari_hareketleri_sube_id_idx on public.araci_cari_hareketleri(sube_id);
create index if not exists araci_cari_hareketleri_bagli_fatura_id_idx on public.araci_cari_hareketleri(bagli_fatura_id);

create unique index if not exists araci_cari_hareketleri_fatura_komisyon_unique
  on public.araci_cari_hareketleri(araci_id, bagli_fatura_id, kaynak)
  where bagli_fatura_id is not null and kaynak = 'Fatura Komisyonu';

alter table public.araci_cari_hareketleri enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'araci_cari_hareketleri' and policyname = 'auth_all'
  ) then
    create policy "auth_all" on public.araci_cari_hareketleri
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'araci_cari_hareketleri' and policyname = 'anon_all'
  ) then
    create policy "anon_all" on public.araci_cari_hareketleri
      for all to anon using (true) with check (true);
  end if;
end;
$$;

drop trigger if exists trg_araci_cari_hareketleri_updated_at on public.araci_cari_hareketleri;
create trigger trg_araci_cari_hareketleri_updated_at
  before update on public.araci_cari_hareketleri
  for each row execute function public.set_updated_at();

create or replace function public.sync_invoice_broker_cari_hareketi()
returns trigger
language plpgsql
as $$
declare
  inv record;
begin
  select
    i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.customer_id,
    i.sube_id,
    c.full_name as customer_name
  into inv
  from public.invoices i
  left join public.customers c on c.id = i.customer_id
  where i.id = new.invoice_id;

  insert into public.araci_cari_hareketleri (
    araci_id,
    hareket_tarihi,
    vade_tarihi,
    hareket_tipi,
    islem_yonu,
    tutar,
    para_birimi,
    aciklama,
    kategori,
    durum,
    odeme_tarihi,
    bagli_fatura_id,
    bagli_fatura_no,
    bagli_musteri_id,
    bagli_musteri_adi,
    komisyon_orani,
    kaynak,
    sube_id
  )
  values (
    new.broker_id,
    coalesce(inv.invoice_date, current_date),
    inv.due_date,
    'Komisyon Hakedişi',
    'alacak',
    coalesce(new.commission_amount, 0),
    'TRY',
    case
      when inv.invoice_number is null then 'Fatura komisyon hakedişi'
      else inv.invoice_number || ' numaralı fatura komisyon hakedişi'
    end,
    'Komisyon',
    case when new.is_paid then 'Ödendi' else 'Bekliyor' end,
    new.paid_date,
    new.invoice_id,
    inv.invoice_number,
    inv.customer_id,
    inv.customer_name,
    new.commission_rate,
    'Fatura Komisyonu',
    inv.sube_id
  )
  on conflict (araci_id, bagli_fatura_id, kaynak)
  where bagli_fatura_id is not null and kaynak = 'Fatura Komisyonu'
  do update set
    hareket_tarihi = excluded.hareket_tarihi,
    vade_tarihi = excluded.vade_tarihi,
    tutar = excluded.tutar,
    aciklama = excluded.aciklama,
    durum = excluded.durum,
    odeme_tarihi = excluded.odeme_tarihi,
    bagli_fatura_no = excluded.bagli_fatura_no,
    bagli_musteri_id = excluded.bagli_musteri_id,
    bagli_musteri_adi = excluded.bagli_musteri_adi,
    komisyon_orani = excluded.komisyon_orani,
    sube_id = excluded.sube_id,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_invoice_brokers_sync_cari on public.invoice_brokers;
create trigger trg_invoice_brokers_sync_cari
  after insert or update of commission_rate, commission_amount, is_paid, paid_date, invoice_id, broker_id
  on public.invoice_brokers
  for each row execute function public.sync_invoice_broker_cari_hareketi();

insert into public.araci_cari_hareketleri (
  araci_id,
  hareket_tarihi,
  vade_tarihi,
  hareket_tipi,
  islem_yonu,
  tutar,
  para_birimi,
  aciklama,
  kategori,
  durum,
  odeme_tarihi,
  bagli_fatura_id,
  bagli_fatura_no,
  bagli_musteri_id,
  bagli_musteri_adi,
  komisyon_orani,
  kaynak,
  sube_id,
  created_at,
  updated_at
)
select
  ib.broker_id,
  coalesce(i.invoice_date, ib.created_at::date),
  i.due_date,
  'Komisyon Hakedişi',
  'alacak',
  coalesce(ib.commission_amount, 0),
  'TRY',
  case
    when i.invoice_number is null then 'Fatura komisyon hakedişi'
    else i.invoice_number || ' numaralı fatura komisyon hakedişi'
  end,
  'Komisyon',
  case when ib.is_paid then 'Ödendi' else 'Bekliyor' end,
  ib.paid_date,
  ib.invoice_id,
  i.invoice_number,
  i.customer_id,
  c.full_name,
  ib.commission_rate,
  'Fatura Komisyonu',
  i.sube_id,
  ib.created_at,
  ib.updated_at
from public.invoice_brokers ib
left join public.invoices i on i.id = ib.invoice_id
left join public.customers c on c.id = i.customer_id
on conflict (araci_id, bagli_fatura_id, kaynak)
where bagli_fatura_id is not null and kaynak = 'Fatura Komisyonu'
do nothing;
