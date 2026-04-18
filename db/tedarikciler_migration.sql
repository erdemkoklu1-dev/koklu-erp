-- ============================================================
-- TEDARİKÇİLER MIGRATION (idempotent)
-- Köklü ERP — Manuel tedarikçi kaydı
-- ============================================================

create table if not exists public.tedarikciler (
  id               uuid primary key default gen_random_uuid(),
  firma_adi        text not null,
  vergi_no         text,
  vergi_dairesi    text,
  adres            text,
  sehir            text,
  telefon          text,
  email            text,
  web_sitesi       text,
  yetkili_adi      text,
  yetkili_telefon  text,
  urunler_hizmetler text,
  odeme_vadesi     integer,          -- gün olarak
  notlar           text,
  aktif            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists tedarikciler_firma_adi_idx on public.tedarikciler (firma_adi);

alter table public.tedarikciler enable row level security;

drop policy if exists "Service role has full access" on public.tedarikciler;
create policy "Service role has full access" on public.tedarikciler
  using (true) with check (true);
