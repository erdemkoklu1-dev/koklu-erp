-- PERSONEL / İNSAN KAYNAKLARI MİGRATION

-- 1. personeller tablosu
create table if not exists public.personeller (
  id                      uuid primary key default gen_random_uuid(),
  sube_id                 uuid references public.subeler(id) on delete set null,
  -- Kişisel Bilgiler
  ad                      text not null,
  soyad                   text not null,
  tc_kimlik_no            text,
  dogum_tarihi            date,
  dogum_yeri              text,
  cinsiyet                text check (cinsiyet in ('erkek','kadin')),
  medeni_durum            text check (medeni_durum in ('bekar','evli','bosanmis')),
  kan_grubu               text,
  uyruk                   text not null default 'T.C.',
  -- İletişim
  telefon                 text,
  email                   text,
  adres                   text,
  sehir                   text,
  posta_kodu              text,
  acil_iletisim_adi       text,
  acil_iletisim_telefonu  text,
  acil_iletisim_yakinligi text,
  -- Özlük Bilgileri
  sicil_no                text unique,
  ise_baslama_tarihi      date,
  isten_cikis_tarihi      date,
  pozisyon                text,
  departman               text,
  rol_id                  uuid references public.roller(id) on delete set null,
  istihdam_tipi           text check (istihdam_tipi in ('tam_zamanli','yari_zamanli','sozlesmeli','stajyer')),
  calisma_sekli           text check (calisma_sekli in ('ofis','saha','uzaktan','hibrit')),
  -- Mali Bilgiler
  maas                    numeric(15,2) default 0,
  maas_turu               text check (maas_turu in ('aylik','gunluk','saatlik')) default 'aylik',
  iban                    text,
  banka_adi               text,
  -- Sigorta ve Vergi
  sgk_no                  text,
  vergi_no                text,
  -- Durum
  durum                   text check (durum in ('aktif','izinli','istifa','cikis','deneme')) default 'aktif',
  avatar_url              text,
  notlar                  text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.personeller enable row level security;
create policy "personeller_auth_all" on public.personeller
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- 2. İzinler tablosu
create table if not exists public.personel_izinler (
  id               uuid primary key default gen_random_uuid(),
  personel_id      uuid not null references public.personeller(id) on delete cascade,
  izin_tipi        text not null check (izin_tipi in ('yillik','hastalik','mazeret','ucretsiz','dogum','babalik','evlilik','olum','resmi')),
  baslangic_tarihi date not null,
  bitis_tarihi     date not null,
  gun_sayisi       int not null default 1,
  durum            text not null check (durum in ('bekliyor','onaylandi','reddedildi','iptal')) default 'bekliyor',
  talep_tarihi     date not null default current_date,
  onay_tarihi      date,
  onaylayan_id     uuid references public.personeller(id) on delete set null,
  aciklama         text,
  notlar           text,
  created_at       timestamptz not null default now()
);

alter table public.personel_izinler enable row level security;
create policy "personel_izinler_auth_all" on public.personel_izinler
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- 3. Maaş ödemeleri tablosu
create table if not exists public.maas_odemeleri (
  id                uuid primary key default gen_random_uuid(),
  personel_id       uuid not null references public.personeller(id) on delete cascade,
  odeme_donemi      text not null,
  brut_maas         numeric(15,2) not null default 0,
  sgk_isci_payi     numeric(15,2) not null default 0,
  sgk_isveren_payi  numeric(15,2) not null default 0,
  gelir_vergisi     numeric(15,2) not null default 0,
  damga_vergisi     numeric(15,2) not null default 0,
  net_maas          numeric(15,2) not null default 0,
  mesai_ucreti      numeric(15,2) not null default 0,
  ikramiye          numeric(15,2) not null default 0,
  kesinti           numeric(15,2) not null default 0,
  toplam_odenen     numeric(15,2) not null default 0,
  odeme_tarihi      date,
  odeme_yontemi     text check (odeme_yontemi in ('havale','nakit','cek')) default 'havale',
  aciklama          text,
  odendi            boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table public.maas_odemeleri enable row level security;
create policy "maas_odemeleri_auth_all" on public.maas_odemeleri
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- 4. Mesai kayıtları tablosu
create table if not exists public.mesai_kayitlari (
  id             uuid primary key default gen_random_uuid(),
  personel_id    uuid not null references public.personeller(id) on delete cascade,
  tarih          date not null,
  giris_saati    time,
  cikis_saati    time,
  calisma_suresi numeric(5,2),
  mesai_suresi   numeric(5,2) default 0,
  mesai_tipi     text check (mesai_tipi in ('normal','hafta_sonu','resmi_tatil')) default 'normal',
  aciklama       text,
  created_at     timestamptz not null default now()
);

alter table public.mesai_kayitlari enable row level security;
create policy "mesai_kayitlari_auth_all" on public.mesai_kayitlari
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- 5. Performans değerlendirmeleri tablosu
create table if not exists public.performans_degerlendirmeleri (
  id               uuid primary key default gen_random_uuid(),
  personel_id      uuid not null references public.personeller(id) on delete cascade,
  degerlendiren_id uuid references public.personeller(id) on delete set null,
  donem            text not null,
  puan             int check (puan between 1 and 5),
  kategori         text check (kategori in ('is_kalitesi','verimlilik','iletisim','takim_calismasi','musteri_memnuniyeti')),
  aciklama         text,
  hedefler         text,
  created_at       timestamptz not null default now()
);

alter table public.performans_degerlendirmeleri enable row level security;
create policy "performans_auth_all" on public.performans_degerlendirmeleri
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- 6. Belgeler ve sertifikalar tablosu
create table if not exists public.personel_belgeler (
  id                uuid primary key default gen_random_uuid(),
  personel_id       uuid not null references public.personeller(id) on delete cascade,
  belge_tipi        text check (belge_tipi in ('diploma','sertifika','ehliyet','kimlik','sgk','vergi','diger')),
  belge_adi         text not null,
  belge_no          text,
  verilis_tarihi    date,
  gecerlilik_tarihi date,
  veren_kurum       text,
  dosya_url         text,
  notlar            text,
  created_at        timestamptz not null default now()
);

alter table public.personel_belgeler enable row level security;
create policy "personel_belgeler_auth_all" on public.personel_belgeler
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- 7. Yıllık izin hakkı tablosu
create table if not exists public.yillik_izin_hakki (
  id          uuid primary key default gen_random_uuid(),
  personel_id uuid not null references public.personeller(id) on delete cascade,
  yil         int not null,
  toplam_hak  int not null default 14,
  kullanilan  int not null default 0,
  kalan       int not null default 14,
  devreden    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (personel_id, yil)
);

alter table public.yillik_izin_hakki enable row level security;
create policy "yillik_izin_hakki_auth_all" on public.yillik_izin_hakki
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- Otomatik updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists personeller_updated_at on public.personeller;
create trigger personeller_updated_at
  before update on public.personeller
  for each row execute function public.set_updated_at();

-- Sicil no otomatik üret: KY-YYYY-NNN
create or replace function public.generate_sicil_no()
returns trigger language plpgsql as $$
declare
  yil   text := to_char(now(), 'YYYY');
  sayac int;
begin
  if new.sicil_no is null or new.sicil_no = '' then
    select count(*) + 1 into sayac
    from public.personeller
    where sicil_no like 'KY-' || yil || '-%';
    new.sicil_no := 'KY-' || yil || '-' || lpad(sayac::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists personeller_sicil_no on public.personeller;
create trigger personeller_sicil_no
  before insert on public.personeller
  for each row execute function public.generate_sicil_no();
