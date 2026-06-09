-- Havalandırma Test Raporu rapor türü ve teknik ayarları

alter table public.teknik_raporlar drop constraint if exists teknik_raporlar_rapor_turu_check;
alter table public.teknik_raporlar add constraint teknik_raporlar_rapor_turu_check check (rapor_turu in (
  'yangin_alarm_ihtiyac',
  'genel_ihtiyac_raporu',
  'oda_sizdirmazlik_testi',
  'yangin_dolabi_hidrant_pompa',
  'sulu_sistem_hidrolik_hesap',
  'havalandirma_test_raporu'
));

insert into public.teknik_hesap_ayarlari (ayar_grubu, ayar_adi, ayar_degeri, birim, aciklama, aktif)
values
('havalandirma_test', 'havalandirma_minimum_hiz', '2.5', 'm/s', 'Havalandırma testinde otomatik uygunluk için minimum ortalama çıkış hızı.', true),
('havalandirma_test', 'havalandirma_maksimum_kayip_orani', '25', '%', 'Giriş ve çıkış debisi arasındaki kabul edilebilir maksimum kayıp oranı.', true),
('havalandirma_test', 'havalandirma_varsayilan_kayip_orani', '12', '%', 'Çıkış ölçümü yapılamadığında sanal çıkış için kullanılan varsayılan kayıp oranı.', true),
('havalandirma_test', 'havalandirma_dirsek_kayip_orani', '2', '%/adet', 'Sanal çıkış hesabında her dirsek için eklenen tahmini kayıp.', true),
('havalandirma_test', 'havalandirma_metre_kayip_orani', '0.15', '%/m', 'Sanal çıkış hesabında her metre kanal için eklenen tahmini kayıp.', true)
on conflict (ayar_grubu, ayar_adi) do update set
  birim = excluded.birim,
  aciklama = excluded.aciklama,
  aktif = true;
