-- ============================================================
-- OPERASYON MODULU (idempotent)
-- Musteri talepleri, is planlari ve planli isler
-- ============================================================

insert into public.subeler (ad, tip, sehir, aktif)
select 'Erzincan Merkez', 'merkez', 'Erzincan', true
where not exists (select 1 from public.subeler where ad = 'Erzincan Merkez');

create table if not exists public.musteri_talepleri (
  id                         uuid primary key default gen_random_uuid(),
  talep_no                   text not null unique,
  customer_id                uuid references public.customers(id) on delete set null,
  customer_name_snapshot     text,
  cihaz_id                   uuid references public.devices(id) on delete set null,
  cihaz_name_snapshot        text,
  baslik                     text not null,
  aciklama                   text not null,
  kategori                   text not null,
  oncelik                    text not null default 'Normal',
  durum                      text not null default 'Yeni',
  talep_tarihi               date not null default current_date,
  hedef_tarih                date,
  tamamlanma_tarihi          timestamptz,
  sube_id                    uuid not null references public.subeler(id) on delete restrict,
  sorumlu_personel_id        uuid references public.personeller(id) on delete set null,
  talebi_alan_personel_id    uuid references public.personeller(id) on delete set null,
  kaynak                     text not null default 'Telefon',
  ilgili_teslimat_id         uuid references public.teslimatlar(id) on delete set null,
  ilgili_is_plani_id         uuid,
  ilgili_servis_form_id      uuid references public.service_forms(id) on delete set null,
  ilgili_teklif_id           uuid,
  notlar                     text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_by                 uuid
);

create table if not exists public.is_planlari (
  id                         uuid primary key default gen_random_uuid(),
  plan_no                    text not null unique,
  baslik                     text not null,
  aciklama                   text,
  customer_id                uuid references public.customers(id) on delete set null,
  customer_name_snapshot     text,
  sube_id                    uuid not null references public.subeler(id) on delete restrict,
  sorumlu_personel_id        uuid references public.personeller(id) on delete set null,
  plan_turu                  text not null,
  durum                      text not null default 'Taslak',
  baslangic_tarihi           date not null,
  bitis_tarihi               date,
  tekrar_tipi                text not null default 'Tek seferlik',
  tekrar_araligi             int not null default 1,
  sonraki_is_tarihi          date,
  toplam_is_sayisi           int not null default 0,
  tamamlanan_is_sayisi       int not null default 0,
  iptal_is_sayisi            int not null default 0,
  notlar                     text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_by                 uuid
);

create table if not exists public.planli_isler (
  id                         uuid primary key default gen_random_uuid(),
  is_plani_id                uuid not null references public.is_planlari(id) on delete cascade,
  sira_no                    int not null,
  baslik                     text not null,
  aciklama                   text,
  customer_id                uuid references public.customers(id) on delete set null,
  cihaz_id                   uuid references public.devices(id) on delete set null,
  planlanan_tarih            date not null,
  hedef_tarih                date,
  tamamlanma_tarihi          timestamptz,
  durum                      text not null default 'Bekliyor',
  oncelik                    text not null default 'Normal',
  sube_id                    uuid not null references public.subeler(id) on delete restrict,
  atanan_personel_id         uuid references public.personeller(id) on delete set null,
  ilgili_talep_id            uuid references public.musteri_talepleri(id) on delete set null,
  ilgili_teslimat_id         uuid references public.teslimatlar(id) on delete set null,
  ilgili_servis_form_id      uuid references public.service_forms(id) on delete set null,
  notlar                     text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_by                 uuid,
  unique (is_plani_id, sira_no)
);

alter table public.musteri_talepleri add column if not exists sube_id uuid references public.subeler(id) on delete restrict;
alter table public.is_planlari add column if not exists sube_id uuid references public.subeler(id) on delete restrict;
alter table public.planli_isler add column if not exists sube_id uuid references public.subeler(id) on delete restrict;

update public.musteri_talepleri
set sube_id = (select id from public.subeler where ad = 'Erzincan Merkez' order by created_at nulls last limit 1)
where sube_id is null;

update public.is_planlari
set sube_id = (select id from public.subeler where ad = 'Erzincan Merkez' order by created_at nulls last limit 1)
where sube_id is null;

update public.planli_isler pi
set sube_id = coalesce(
  (select ip.sube_id from public.is_planlari ip where ip.id = pi.is_plani_id),
  (select id from public.subeler where ad = 'Erzincan Merkez' order by created_at nulls last limit 1)
)
where pi.sube_id is null;

alter table public.musteri_talepleri alter column sube_id set not null;
alter table public.is_planlari alter column sube_id set not null;
alter table public.planli_isler alter column sube_id set not null;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'musteri_talepleri_is_plani_fk'
      and conrelid = 'public.musteri_talepleri'::regclass
  ) then
    alter table public.musteri_talepleri
      add constraint musteri_talepleri_is_plani_fk
      foreign key (ilgili_is_plani_id) references public.is_planlari(id) on delete set null
      not valid;
  end if;
end $$;

alter table public.musteri_talepleri validate constraint musteri_talepleri_is_plani_fk;

alter table public.musteri_talepleri drop constraint if exists musteri_talepleri_kategori_check;
alter table public.musteri_talepleri add constraint musteri_talepleri_kategori_check check (kategori in (
  'Arıza',
  'Bakım Talebi',
  'Kurulum',
  'Teklif Talebi',
  'Ürün Talebi',
  'Dolum Talebi',
  'Teslimat Talebi',
  'Şikayet',
  'Periyodik Kontrol',
  'Diğer'
));

alter table public.musteri_talepleri drop constraint if exists musteri_talepleri_oncelik_check;
alter table public.musteri_talepleri add constraint musteri_talepleri_oncelik_check check (oncelik in ('Düşük','Normal','Yüksek','Acil'));

alter table public.musteri_talepleri drop constraint if exists musteri_talepleri_durum_check;
alter table public.musteri_talepleri add constraint musteri_talepleri_durum_check check (durum in (
  'Yeni',
  'İşleme Alındı',
  'Planlandı',
  'Sahada',
  'Beklemede',
  'Tamamlandı',
  'İptal',
  'Teslimata Aktarıldı',
  'İş Planına Aktarıldı',
  'Teklif Verildi'
));

alter table public.musteri_talepleri drop constraint if exists musteri_talepleri_kaynak_check;
alter table public.musteri_talepleri add constraint musteri_talepleri_kaynak_check check (kaynak in ('Telefon','WhatsApp','E-posta','Yüz yüze','Sistem','Diğer'));

alter table public.is_planlari drop constraint if exists is_planlari_plan_turu_check;
alter table public.is_planlari add constraint is_planlari_plan_turu_check check (plan_turu in (
  'Periyodik Bakım',
  'Yangın Tüpü Kontrolü',
  'Yangın Alarm Bakımı',
  'HFC / Gazlı Sistem Bakımı',
  'Davlumbaz Bakımı',
  'Teslimat Planı',
  'Dolum Toplama Planı',
  'Arıza Planı',
  'Genel Saha Görevi'
));

alter table public.is_planlari drop constraint if exists is_planlari_durum_check;
alter table public.is_planlari add constraint is_planlari_durum_check check (durum in ('Taslak','Aktif','Beklemede','Tamamlandı','İptal'));

alter table public.is_planlari drop constraint if exists is_planlari_tekrar_tipi_check;
alter table public.is_planlari add constraint is_planlari_tekrar_tipi_check check (tekrar_tipi in (
  'Tek seferlik',
  'Günlük',
  'Haftalık',
  '15 Günde Bir',
  'Aylık',
  '3 Ayda Bir',
  '6 Ayda Bir',
  'Yıllık',
  'Özel'
));

alter table public.planli_isler drop constraint if exists planli_isler_durum_check;
alter table public.planli_isler add constraint planli_isler_durum_check check (durum in ('Bekliyor','Sahada','Tamamlandı','Ertelendi','İptal','Gecikti'));

alter table public.planli_isler drop constraint if exists planli_isler_oncelik_check;
alter table public.planli_isler add constraint planli_isler_oncelik_check check (oncelik in ('Düşük','Normal','Yüksek','Acil'));

create index if not exists musteri_talepleri_customer_idx on public.musteri_talepleri(customer_id);
create index if not exists musteri_talepleri_cihaz_idx on public.musteri_talepleri(cihaz_id);
create index if not exists musteri_talepleri_sube_idx on public.musteri_talepleri(sube_id);
create index if not exists musteri_talepleri_sorumlu_idx on public.musteri_talepleri(sorumlu_personel_id);
create index if not exists musteri_talepleri_durum_idx on public.musteri_talepleri(durum);
create index if not exists musteri_talepleri_kategori_idx on public.musteri_talepleri(kategori);
create index if not exists musteri_talepleri_oncelik_idx on public.musteri_talepleri(oncelik);
create index if not exists musteri_talepleri_hedef_idx on public.musteri_talepleri(hedef_tarih);
create index if not exists musteri_talepleri_created_idx on public.musteri_talepleri(created_at desc);

create index if not exists is_planlari_customer_idx on public.is_planlari(customer_id);
create index if not exists is_planlari_sube_idx on public.is_planlari(sube_id);
create index if not exists is_planlari_sorumlu_idx on public.is_planlari(sorumlu_personel_id);
create index if not exists is_planlari_durum_idx on public.is_planlari(durum);
create index if not exists is_planlari_tur_idx on public.is_planlari(plan_turu);
create index if not exists is_planlari_sonraki_idx on public.is_planlari(sonraki_is_tarihi);
create index if not exists is_planlari_created_idx on public.is_planlari(created_at desc);

create index if not exists planli_isler_plan_idx on public.planli_isler(is_plani_id);
create index if not exists planli_isler_customer_idx on public.planli_isler(customer_id);
create index if not exists planli_isler_cihaz_idx on public.planli_isler(cihaz_id);
create index if not exists planli_isler_sube_idx on public.planli_isler(sube_id);
create index if not exists planli_isler_personel_idx on public.planli_isler(atanan_personel_id);
create index if not exists planli_isler_durum_idx on public.planli_isler(durum);
create index if not exists planli_isler_oncelik_idx on public.planli_isler(oncelik);
create index if not exists planli_isler_planlanan_idx on public.planli_isler(planlanan_tarih);
create index if not exists planli_isler_hedef_idx on public.planli_isler(hedef_tarih);
create index if not exists planli_isler_created_idx on public.planli_isler(created_at desc);

alter table public.musteri_talepleri enable row level security;
alter table public.is_planlari enable row level security;
alter table public.planli_isler enable row level security;

drop policy if exists "operasyon_auth_all" on public.musteri_talepleri;
drop policy if exists "operasyon_auth_all" on public.is_planlari;
drop policy if exists "operasyon_auth_all" on public.planli_isler;

create policy "operasyon_auth_all" on public.musteri_talepleri
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "operasyon_auth_all" on public.is_planlari
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "operasyon_auth_all" on public.planli_isler
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "operasyon_service_all" on public.musteri_talepleri;
drop policy if exists "operasyon_service_all" on public.is_planlari;
drop policy if exists "operasyon_service_all" on public.planli_isler;

create policy "operasyon_service_all" on public.musteri_talepleri using (true) with check (true);
create policy "operasyon_service_all" on public.is_planlari using (true) with check (true);
create policy "operasyon_service_all" on public.planli_isler using (true) with check (true);

create or replace function public.next_operasyon_no(prefix text, table_name text, column_name text)
returns text language plpgsql as $$
declare
  yil text := to_char(current_date, 'YYYY');
  next_no int;
begin
  execute format(
    'select coalesce(max((regexp_match(%I, %L))[1]::int), 0) + 1 from public.%I where %I like %L',
    column_name,
    '^' || prefix || '-' || yil || '-([0-9]+)$',
    table_name,
    column_name,
    prefix || '-' || yil || '-%'
  ) into next_no;

  return prefix || '-' || yil || '-' || lpad(next_no::text, 5, '0');
end;
$$;

create or replace function public.set_musteri_talep_no()
returns trigger language plpgsql as $$
begin
  if new.talep_no is null or new.talep_no = '' then
    new.talep_no := public.next_operasyon_no('TP', 'musteri_talepleri', 'talep_no');
  end if;
  return new;
end;
$$;

create or replace function public.set_is_plani_no()
returns trigger language plpgsql as $$
begin
  if new.plan_no is null or new.plan_no = '' then
    new.plan_no := public.next_operasyon_no('IP', 'is_planlari', 'plan_no');
  end if;
  return new;
end;
$$;

create or replace function public.set_planli_is_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists musteri_talepleri_no on public.musteri_talepleri;
create trigger musteri_talepleri_no
  before insert on public.musteri_talepleri
  for each row execute function public.set_musteri_talep_no();

drop trigger if exists is_planlari_no on public.is_planlari;
create trigger is_planlari_no
  before insert on public.is_planlari
  for each row execute function public.set_is_plani_no();

drop trigger if exists musteri_talepleri_updated_at on public.musteri_talepleri;
create trigger musteri_talepleri_updated_at
  before update on public.musteri_talepleri
  for each row execute function public.set_planli_is_updated_at();

drop trigger if exists is_planlari_updated_at on public.is_planlari;
create trigger is_planlari_updated_at
  before update on public.is_planlari
  for each row execute function public.set_planli_is_updated_at();

drop trigger if exists planli_isler_updated_at on public.planli_isler;
create trigger planli_isler_updated_at
  before update on public.planli_isler
  for each row execute function public.set_planli_is_updated_at();
