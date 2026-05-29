-- ============================================================
-- TEKNIK HESAP & RAPORLAR MODULU (idempotent)
-- ============================================================

create table if not exists public.teknik_raporlar (
  id                         uuid primary key default gen_random_uuid(),
  rapor_no                   text not null unique,
  rapor_turu                 text not null,
  baslik                     text not null,
  customer_id                uuid references public.customers(id) on delete restrict,
  customer_name_snapshot     text not null,
  sube_id                    uuid not null references public.subeler(id) on delete restrict,
  lokasyon                   text,
  adres                      text,
  rapor_tarihi               date not null default current_date,
  hazirlayan_personel_id     uuid references public.personeller(id) on delete set null,
  durum                      text not null default 'Taslak',
  standart_profili           text,
  input_data                 jsonb not null default '{}'::jsonb,
  calculation_result         jsonb not null default '{}'::jsonb,
  material_list              jsonb not null default '[]'::jsonb,
  notes                      text,
  pdf_url                    text,
  teklif_id                  uuid,
  teslimat_id                uuid,
  talep_id                   uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_by                 uuid
);

alter table public.teknik_raporlar alter column customer_id drop not null;

alter table public.teknik_raporlar drop constraint if exists teknik_raporlar_rapor_turu_check;
alter table public.teknik_raporlar add constraint teknik_raporlar_rapor_turu_check check (rapor_turu in (
  'yangin_alarm_ihtiyac',
  'genel_ihtiyac_raporu',
  'oda_sizdirmazlik_testi'
));

update public.teknik_raporlar set durum = 'Hesaplandı' where durum = 'HesaplandÄ±';
update public.teknik_raporlar set durum = 'Onaylandı' where durum = 'OnaylandÄ±';
update public.teknik_raporlar set durum = 'Teklife Aktarıldı' where durum = 'Teklife AktarÄ±ldÄ±';
update public.teknik_raporlar set durum = 'İptal' where durum = 'Ä°ptal';

alter table public.teknik_raporlar drop constraint if exists teknik_raporlar_durum_check;
alter table public.teknik_raporlar add constraint teknik_raporlar_durum_check check (durum in (
  'Taslak',
  'Hesaplandı',
  'Onaylandı',
  'Teklife Aktarıldı',
  'İptal'
));

create index if not exists teknik_raporlar_customer_idx on public.teknik_raporlar(customer_id);
create index if not exists teknik_raporlar_sube_idx on public.teknik_raporlar(sube_id);
create index if not exists teknik_raporlar_tur_idx on public.teknik_raporlar(rapor_turu);
create index if not exists teknik_raporlar_tarih_idx on public.teknik_raporlar(rapor_tarihi);
create index if not exists teknik_raporlar_durum_idx on public.teknik_raporlar(durum);
create index if not exists teknik_raporlar_created_idx on public.teknik_raporlar(created_at desc);

create table if not exists public.teknik_hesap_ayarlari (
  id             uuid primary key default gen_random_uuid(),
  ayar_grubu     text not null,
  ayar_adi       text not null,
  ayar_degeri    text not null,
  birim          text,
  aciklama       text,
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (ayar_grubu, ayar_adi)
);

insert into public.teknik_hesap_ayarlari (ayar_grubu, ayar_adi, ayar_degeri, birim, aciklama) values
('yangin_alarm', 'duman_dedektoru_kapsama_alani', '60', 'm²', 'Optik duman dedektörü için MVP varsayılan kapsama alanı'),
('yangin_alarm', 'isi_dedektoru_kapsama_alani', '40', 'm²', 'Isı dedektörü için MVP varsayılan kapsama alanı'),
('yangin_alarm', 'siren_kapsama_alani', '250', 'm²', 'Siren/flaşörlü siren için yaklaşık kapsama alanı'),
('yangin_alarm', 'buton_maksimum_aralik_notu', 'Kaçış yollarında ve kat çıkışlarında manuel yangın butonu önerilir.', null, 'Buton yerleşim notu'),
('yangin_alarm', 'adresli_loop_maksimum_cihaz', '120', 'adet', 'Adresli panel loop başına yaklaşık cihaz sayısı'),
('yangin_alarm', 'kablo_fire_orani', '15', '%', 'Kablo metrajı için yaklaşık fire oranı'),
('genel_ihtiyac', 'yangin_tupu_alan_orani', '250', 'm²/adet', 'Yangın tüpü yaklaşık alan oranı'),
('genel_ihtiyac', 'acil_aydinlatma_koridor_orani', '20', 'm/adet', 'Acil aydınlatma için yaklaşık koridor oranı'),
('genel_ihtiyac', 'yangin_dolabi_kapsama_notu', 'Kat ve kullanım riskine göre yangın dolabı ihtiyacı ayrıca değerlendirilmelidir.', null, 'Yangın dolabı notu'),
('oda_sizdirmazlik', 'hedef_tutma_suresi', '10', 'dk', 'Gazlı söndürme için hedef tutma süresi'),
('oda_sizdirmazlik', 'varsayilan_test_basinci', '50', 'Pa', 'Varsayılan test basıncı'),
('oda_sizdirmazlik', 'degerlendirme_limitleri', 'Uygun, Şartlı Uygun, Uygun Değil', null, 'Temel sonuç seçenekleri')
on conflict (ayar_grubu, ayar_adi) do nothing;

alter table public.teknik_raporlar enable row level security;
alter table public.teknik_hesap_ayarlari enable row level security;

drop policy if exists "teknik_raporlar_auth_all" on public.teknik_raporlar;
drop policy if exists "teknik_hesap_ayarlari_auth_all" on public.teknik_hesap_ayarlari;

create policy "teknik_raporlar_auth_all" on public.teknik_raporlar
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "teknik_hesap_ayarlari_auth_all" on public.teknik_hesap_ayarlari
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
