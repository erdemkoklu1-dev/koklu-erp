-- ============================================================
-- MUTABAKAT FORMLARI MIGRATION
-- Köklü ERP — Müşteri Cari Mutabakat Modülü
-- ============================================================

create table if not exists public.mutabakat_formlari (
  id                  uuid primary key default gen_random_uuid(),
  musteri_id          uuid not null references public.customers(id) on delete cascade,
  mutabakat_tarihi    date not null,
  bizim_bakiye        numeric(15,2) not null default 0,
  musteri_bakiyesi    numeric(15,2) null,
  durum               text not null default 'taslak'
                        check (durum in ('taslak','gonderildi','onaylandi','itiraz','fark_var')),
  notlar              text null,
  olusturan_kullanici_id uuid null,
  musteri_onay_tarihi date null,
  created_at          timestamptz not null default now()
);

-- İndeksler
create index if not exists idx_mutabakat_musteri on public.mutabakat_formlari(musteri_id);
create index if not exists idx_mutabakat_tarih   on public.mutabakat_formlari(mutabakat_tarihi desc);

-- RLS: Oturum açmış kullanıcılar tam erişim (diğer tablolarla aynı politika)
alter table public.mutabakat_formlari enable row level security;

create policy "authenticated_full_access" on public.mutabakat_formlari
  for all
  to authenticated
  using (true)
  with check (true);

-- Anon kullanıcı için de (gerekirse)
create policy "anon_full_access" on public.mutabakat_formlari
  for all
  to anon
  using (true)
  with check (true);
