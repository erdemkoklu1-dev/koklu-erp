-- ============================================================
-- TEKNIK RAPORLAR - SULU SISTEM ON HESAP (idempotent)
-- ============================================================

alter table public.teknik_raporlar drop constraint if exists teknik_raporlar_rapor_turu_check;
alter table public.teknik_raporlar add constraint teknik_raporlar_rapor_turu_check check (rapor_turu in (
  'yangin_alarm_ihtiyac',
  'genel_ihtiyac_raporu',
  'oda_sizdirmazlik_testi',
  'yangin_dolabi_hidrant_pompa',
  'sulu_sistem_hidrolik_hesap'
));

alter table public.teknik_hesap_ayarlari add column if not exists value_type text default 'text';
alter table public.teknik_hesap_ayarlari add column if not exists min_value numeric;
alter table public.teknik_hesap_ayarlari add column if not exists max_value numeric;
alter table public.teknik_hesap_ayarlari add column if not exists options_json jsonb;
alter table public.teknik_hesap_ayarlari add column if not exists sort_order int default 0;

insert into public.teknik_hesap_ayarlari (ayar_grubu, ayar_adi, ayar_degeri, birim, aciklama, value_type, sort_order) values
('yangin_sulu_sistem', 'yangin_dolabi_kapsama_yaricapi', '30', 'm', 'Yangın dolabı yaklaşık hortum/kapsama yarıçapı', 'number', 10),
('yangin_sulu_sistem', 'kat_basi_minimum_yangin_dolabi', '1', 'adet', 'Kat başına minimum yangın dolabı adedi', 'number', 20),
('yangin_sulu_sistem', 'yangin_dolabi_debi', '100', 'l/dak', 'Bir yangın dolabı için varsayılan keşif debisi', 'number', 30),
('yangin_sulu_sistem', 'es_zamanli_yangin_dolabi_sayisi', '2', 'adet', 'Aynı anda çalışacağı varsayılan yangın dolabı sayısı', 'number', 40),
('yangin_sulu_sistem', 'hidrant_minimum_dizayn_debisi', '1900', 'l/dak', 'Hidrant sistemi minimum dizayn debisi', 'number', 50),
('yangin_sulu_sistem', 'hidrant_cikis_basinci', '700', 'kPa', 'Hidrant çıkışında hedef basınç', 'number', 60),
('yangin_sulu_sistem', 'hidrant_mesafe_az_riskli', '150', 'm', 'Az riskli bölgelerde hidrantlar arası yaklaşık mesafe', 'number', 70),
('yangin_sulu_sistem', 'hidrant_mesafe_orta_riskli', '125', 'm', 'Orta riskli bölgelerde hidrantlar arası yaklaşık mesafe', 'number', 80),
('yangin_sulu_sistem', 'hidrant_mesafe_riskli', '100', 'm', 'Riskli bölgelerde hidrantlar arası yaklaşık mesafe', 'number', 90),
('yangin_sulu_sistem', 'hidrant_mesafe_cok_riskli', '50', 'm', 'Çok riskli bölgelerde hidrantlar arası yaklaşık mesafe', 'number', 100),
('yangin_sulu_sistem', 'pompa_emniyet_katsayisi', '1.1', 'katsayı', 'Debi/basınç için varsayılan emniyet katsayısı', 'number', 110),
('yangin_sulu_sistem', 'pompa_verimi', '0.65', 'oran', 'Pompa güç hesabı için varsayılan verim', 'number', 120),
('yangin_sulu_sistem', 'motor_emniyet_katsayisi', '1.15', 'katsayı', 'Motor gücü seçiminde kullanılan emniyet katsayısı', 'number', 130),
('yangin_sulu_sistem', 'jokey_pompa_debi_orani', '0.05', 'oran', 'Jokey pompa debisi için ana debiye göre oran', 'number', 140),
('yangin_sulu_sistem', 'jokey_pompa_min_debi', '10', 'l/dak', 'Minimum jokey pompa debisi', 'number', 150),
('yangin_sulu_sistem', 'yangin_dolabi_hat_hiz_limit', '3', 'm/s', 'Yangın dolabı hattı için varsayılan maksimum su hızı', 'number', 160),
('yangin_sulu_sistem', 'hidrant_hat_hiz_limit', '4', 'm/s', 'Hidrant ana hattı için varsayılan maksimum su hızı', 'number', 170),
('yangin_sulu_sistem', 'hazen_williams_c_degeri', '120', 'C', 'Çelik boru için varsayılan Hazen-Williams C değeri', 'number', 180),
('yangin_sulu_sistem', 'yangin_suyu_suresi', '60', 'dk', 'Ön keşif için varsayılan yangın suyu süresi', 'number', 190)
on conflict (ayar_grubu, ayar_adi) do nothing;

insert into public.teknik_hesap_ayarlari (ayar_grubu, ayar_adi, ayar_degeri, birim, aciklama, value_type, sort_order) values
('yangin_hidrolik', 'sprinkler_varsayilan_k_faktoru', '80', 'K', 'Sprinkler varsayılan K faktörü metrik', 'number', 10),
('yangin_hidrolik', 'sprinkler_min_akma_basinci', '0.56', 'bar', 'Sprinkler minimum akma basıncı', 'number', 20),
('yangin_hidrolik', 'duvar_tipi_sprinkler_min_basinci', '1', 'bar', 'Duvar tipi sprinkler için minimum basınç', 'number', 30),
('yangin_hidrolik', 'sprinkler_koruma_alani', '12', 'm²', 'Bir sprinkler için varsayılan koruma alanı', 'number', 40),
('yangin_hidrolik', 'sprinkler_mudahale_suresi', '60', 'dk', 'Sprinkler sistemi yangın suyu süresi', 'number', 50),
('yangin_hidrolik', 'su_deposu_emniyet_katsayisi', '1.1', 'katsayı', 'Yangın su deposu için emniyet katsayısı', 'number', 60),
('yangin_hidrolik', 'varsayilan_hazen_williams_c', '120', 'C', 'Siyah çelik boru için varsayılan C katsayısı', 'number', 70),
('yangin_hidrolik', 'hidrostatik_basinc_katsayisi', '0.098', 'bar/m', 'Yükseklik kaynaklı basınç kaybı katsayısı', 'number', 80)
on conflict (ayar_grubu, ayar_adi) do nothing;

drop policy if exists "teknik_hesap_ayarlari_auth_all" on public.teknik_hesap_ayarlari;
create policy "teknik_hesap_ayarlari_auth_all" on public.teknik_hesap_ayarlari
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
