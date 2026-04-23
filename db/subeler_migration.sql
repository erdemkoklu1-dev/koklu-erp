-- SUBELER MIGRATION

create table if not exists public.subeler (
  id              uuid primary key default gen_random_uuid(),
  ad              text not null,
  tip             text not null default 'sube'
                    check (tip in ('merkez','sube','depo','ofis')),
  sehir           text,
  ilce            text,
  adres           text,
  posta_kodu      text,
  telefon         text,
  email           text,
  yetkili_kisi    text,
  yetkili_telefon text,
  acilis_tarihi   date,
  aktif           boolean not null default true,
  notlar          text,
  created_at      timestamptz not null default now()
);

alter table public.subeler enable row level security;
create policy "auth_all" on public.subeler for all to authenticated using (true) with check (true);
create policy "anon_read" on public.subeler for select to anon using (true);

-- Mevcut tablolara sube_id ekle
alter table public.customers add column if not exists sube_id uuid references public.subeler(id) on delete set null;
alter table public.invoices add column if not exists sube_id uuid references public.subeler(id) on delete set null;
alter table public.service_forms add column if not exists sube_id uuid references public.subeler(id) on delete set null;
alter table public.kullanici_profiller add column if not exists sube_id uuid references public.subeler(id) on delete set null;

-- Şube gelir/gider tablosu
create table if not exists public.sube_gider_gelir (
  id           uuid primary key default gen_random_uuid(),
  sube_id      uuid not null references public.subeler(id) on delete cascade,
  tarih        date not null,
  tip          text not null check (tip in ('gelir','gider')),
  kategori     text,
  aciklama     text,
  tutar        numeric(15,2) not null default 0,
  belge_no     text,
  kullanici_id uuid,
  created_at   timestamptz not null default now()
);
alter table public.sube_gider_gelir enable row level security;
create policy "auth_all" on public.sube_gider_gelir for all to authenticated using (true) with check (true);
create policy "anon_all" on public.sube_gider_gelir for all to anon using (true) with check (true);

-- SEED: İlk iki şube
insert into public.subeler (ad, tip, sehir, ilce, adres, telefon, email, aktif)
values
  ('Erzincan Merkez', 'merkez', 'Erzincan', NULL, 'Karaağaç Mah. 774. Sok. No:49', '04462144581', 'kokluyanginsondurme@hotmail.com', true),
  ('İstanbul Şube', 'sube', 'İstanbul', 'Eyüpsultan', 'Kışla Cd. Seferağa San. Sit. No:181/B Topçular', '05343114905', NULL, true)
on conflict do nothing;
