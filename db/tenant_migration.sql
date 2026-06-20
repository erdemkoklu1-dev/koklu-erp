-- Ticari ürünleşme: firma / tenant altyapısı
-- Bu migration bilinçli olarak NOT NULL zorlamaz. Mevcut tek firma verisini
-- varsayılan firmaya bağlar, sonraki fazda tablo bazlı RLS sertleştirilebilir.

create table if not exists public.firmalar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  slug text not null unique,
  vergi_no text,
  vergi_dairesi text,
  telefon text,
  email text,
  adres text,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.firmalar enable row level security;

drop policy if exists "firmalar_auth_read" on public.firmalar;
create policy "firmalar_auth_read" on public.firmalar
  for select to authenticated using (true);

drop policy if exists "firmalar_auth_insert" on public.firmalar;
create policy "firmalar_auth_insert" on public.firmalar
  for insert to authenticated with check (true);

drop policy if exists "firmalar_auth_update" on public.firmalar;
create policy "firmalar_auth_update" on public.firmalar
  for update to authenticated using (true) with check (true);

insert into public.firmalar (ad, slug, telefon, email, adres, aktif)
values (
  'Köklü Yangın',
  'koklu-yangin',
  '04462144581',
  'kokluyanginsondurme@hotmail.com',
  'Karaağaç Mah. 774. Sok. No:49',
  true
)
on conflict (slug) do update set
  ad = excluded.ad,
  telefon = coalesce(public.firmalar.telefon, excluded.telefon),
  email = coalesce(public.firmalar.email, excluded.email),
  adres = coalesce(public.firmalar.adres, excluded.adres),
  aktif = true;

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if to_regclass('public.subeler') is not null then
    alter table public.subeler
      add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

    update public.subeler
    set firma_id = (select id from public.firmalar where slug = 'koklu-yangin')
    where firma_id is null;

    create index if not exists subeler_firma_id_idx on public.subeler(firma_id);
  end if;

  if to_regclass('public.kullanici_profiller') is not null then
    alter table public.kullanici_profiller
      add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

    if to_regclass('public.subeler') is not null then
      update public.kullanici_profiller kp
      set firma_id = coalesce(
        (select s.firma_id from public.subeler s where s.id = kp.sube_id),
        (select id from public.firmalar where slug = 'koklu-yangin')
      )
      where kp.firma_id is null;
    else
      update public.kullanici_profiller
      set firma_id = (select id from public.firmalar where slug = 'koklu-yangin')
      where firma_id is null;
    end if;

    create index if not exists kullanici_profiller_firma_id_idx on public.kullanici_profiller(firma_id);
  end if;
end $$;

do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'customers',
    'devices',
    'service_forms',
    'invoices',
    'invoice_items',
    'invoice_series',
    'payments',
    'tedarikciler',
    'teslimatlar',
    'teslimat_kalemleri',
    'teklifler',
    'teklif_kalemleri',
    'proforma_faturalar',
    'proforma_kalemleri',
    'hatirlatmalar',
    'hatirlatma_sablonlari',
    'hatirlatma_susturmalar',
    'teknik_raporlar',
    'teknik_hesap_ayarlari',
    'musteri_talepleri',
    'is_planlari',
    'planli_isler',
    'brokers',
    'araci_cari_hareketleri',
    'urunler',
    'hammaddeler',
    'urun_receteler',
    'uretim_emirleri',
    'urun_stok_hareketleri',
    'hammadde_stok_girisler',
    'depo_hareketleri',
    'on_kayitlar',
    'on_kayit_kalemler',
    'musteri_cari_belgeler',
    'mutabakat_formlari',
    'gelir_gider_hareketleri',
    'sabit_giderler',
    'calisanlar',
    'maas_hareketleri',
    'vergi_takvimleri',
    'personeller',
    'app_settings',
    'backup_history'
  ];
begin
  foreach table_name in array tenant_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'alter table public.%I add column if not exists firma_id uuid references public.firmalar(id) on delete restrict',
        table_name
      );

      execute format(
        'update public.%I set firma_id = (select id from public.firmalar where slug = %L) where firma_id is null',
        table_name,
        'koklu-yangin'
      );

      execute format(
        'create index if not exists %I on public.%I(firma_id)',
        table_name || '_firma_id_idx',
        table_name
      );
    end if;
  end loop;
end $$;

create or replace function public.current_firma_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tenant_id uuid;
begin
  if to_regclass('public.kullanici_profiller') is null then
    return null;
  end if;

  execute 'select firma_id from public.kullanici_profiller where id = auth.uid() limit 1'
    into tenant_id;

  return tenant_id;
end;
$$;

create or replace function public.is_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_role boolean;
begin
  if to_regclass('public.kullanici_profiller') is null or to_regclass('public.roller') is null then
    return false;
  end if;

  execute $q$
    select exists (
      select 1
      from public.kullanici_profiller kp
      join public.roller r on r.id = kp.rol_id
      where kp.id = auth.uid()
        and r.ad = 'Super Admin'
    )
  $q$ into has_role;

  return coalesce(has_role, false);
end;
$$;

drop trigger if exists firmalar_updated_at on public.firmalar;
create trigger firmalar_updated_at
  before update on public.firmalar
  for each row execute function public.update_updated_at();
