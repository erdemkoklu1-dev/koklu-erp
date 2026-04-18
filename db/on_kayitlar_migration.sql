-- ============================================================
-- ON KAYITLAR MIGRATION
-- Köklü ERP — Faturasız Ürün/Hizmet Kayıt Sistemi
-- ============================================================

-- Ön Kayıtlar tablosu
create table public.on_kayitlar (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id) on delete restrict,
  kayit_tarihi   date not null default current_date,
  aciklama       text not null,
  miktar         numeric(14,3) not null default 1,
  birim          text not null default 'adet',
  birim_fiyat    numeric(14,2) not null default 0,
  toplam_tutar   numeric(14,2) not null default 0,
  notlar         text,
  durum          text not null default 'beklemede' check (durum in ('beklemede', 'faturalanmadi')),
  invoice_id     uuid references public.invoices(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on public.on_kayitlar (customer_id);
create index on public.on_kayitlar (durum);
create index on public.on_kayitlar (invoice_id);
create index on public.on_kayitlar (kayit_tarihi);

-- RLS politikaları (diğer tablolarla uyumlu)
alter table public.on_kayitlar enable row level security;
create policy "Service role has full access" on public.on_kayitlar
  using (true) with check (true);
