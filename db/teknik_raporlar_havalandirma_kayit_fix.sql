-- Havalandirma test raporu kaydinda report type ve durum constraintlerini hizala.

alter table public.teknik_raporlar
  add column if not exists input_data jsonb not null default '{}'::jsonb;

alter table public.teknik_raporlar
  add column if not exists calculation_result jsonb not null default '{}'::jsonb;

alter table public.teknik_raporlar
  add column if not exists material_list jsonb not null default '[]'::jsonb;

alter table public.teknik_raporlar
  add column if not exists notes text;

alter table public.teknik_raporlar
  alter column customer_id drop not null;

update public.teknik_raporlar set durum = 'Hesaplandı'
where durum in ('HesaplandÄ±', 'HesaplandÃ„Â±');

update public.teknik_raporlar set durum = 'Onaylandı'
where durum in ('OnaylandÄ±', 'OnaylandÃ„Â±');

update public.teknik_raporlar set durum = 'Teklife Aktarıldı'
where durum in ('Teklife AktarÄ±ldÄ±', 'Teklife AktarÃ„Â±ldÃ„Â±');

update public.teknik_raporlar set durum = 'İptal'
where durum in ('Ä°ptal', 'Ã„Â°ptal');

alter table public.teknik_raporlar drop constraint if exists teknik_raporlar_rapor_turu_check;
alter table public.teknik_raporlar add constraint teknik_raporlar_rapor_turu_check check (rapor_turu in (
  'yangin_alarm_ihtiyac',
  'genel_ihtiyac_raporu',
  'oda_sizdirmazlik_testi',
  'yangin_dolabi_hidrant_pompa',
  'sulu_sistem_hidrolik_hesap',
  'havalandirma_test_raporu'
));

alter table public.teknik_raporlar drop constraint if exists teknik_raporlar_durum_check;
alter table public.teknik_raporlar add constraint teknik_raporlar_durum_check check (durum in (
  'Taslak',
  'Hesaplandı',
  'Onaylandı',
  'Teklife Aktarıldı',
  'İptal'
));
