-- ============================================================================
-- TESLİMAT ATOMİK GÜNCELLEME — TRANSACTION / INTEGRATION TESTLERİ
-- ============================================================================
--
-- !!! PRODUCTION'DA ÇALIŞTIRILMAZ !!!
--
-- Bu dosya gerçek PostgreSQL transaction davranışını doğrular (GOREV.md §11.2).
-- Yalnızca şu ortamlarda çalıştırılır:
--   - yerel izole PostgreSQL/Supabase kurulumu, VEYA
--   - Gate 0'dan (`node scripts/verify-staging-env.mjs` exit 0) geçmiş staging.
--
-- Güncel durum: Gate 0 NO-GO ⇒ bu dosya ÇALIŞTIRILMAMIŞTIR.
--
-- Çalıştırma:
--   psql "$ISOLATED_TEST_DSN" -v ON_ERROR_STOP=1 -f db/teslimat_atomic_update_tests.sql
--
-- Bütün test verisi tek transaction içinde üretilir ve sonunda ROLLBACK edilir;
-- kalıcı hiçbir satır bırakmaz.
--
-- Ön koşul: db/aggregate_atomic_update_rpc.sql ve db/teslimat_atomic_update_rpc.sql
--           apply edilmiş olmalıdır.
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test yardımcıları
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function pg_temp.assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL [%]: beklenen=%, gerçek=%', label, expected, actual;
  end if;
  raise notice 'PASS: %', label;
end;
$$;

create or replace function pg_temp.assert_raises(sql text, expected_code text, label text)
returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(expected_code in sqlerrm) = 0 then
      raise exception 'FAIL [%]: beklenen hata "%", gerçek "%"', label, expected_code, sqlerrm;
    end if;
    raise notice 'PASS: % (% doğru şekilde reddedildi)', label, expected_code;
    return;
  end;
  raise exception 'FAIL [%]: hata bekleniyordu ama işlem başarılı oldu', label;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sabit test kimlikleri (gerçek veriyle çakışmayacak biçimde)
-- ─────────────────────────────────────────────────────────────────────────────

\set firma_a   '''aaaaaaaa-0000-4000-8000-000000000001'''
\set firma_b   '''aaaaaaaa-0000-4000-8000-000000000002'''
\set user_a    '''bbbbbbbb-0000-4000-8000-000000000001'''
\set user_b    '''bbbbbbbb-0000-4000-8000-000000000002'''
\set urun_1    '''cccccccc-0000-4000-8000-000000000001'''
\set urun_2    '''cccccccc-0000-4000-8000-000000000002'''
\set musteri_a '''dddddddd-0000-4000-8000-000000000001'''
\set tes_a     '''eeeeeeee-0000-4000-8000-000000000001'''
\set tes_b     '''eeeeeeee-0000-4000-8000-000000000002'''

-- ─────────────────────────────────────────────────────────────────────────────
-- Fikstür
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.firmalar (id, ad, slug) values
  (:firma_a::uuid, 'Test Firma A', 'test-firma-a'),
  (:firma_b::uuid, 'Test Firma B', 'test-firma-b');

insert into public.kullanici_profiller (id, firma_id) values
  (:user_a::uuid, :firma_a::uuid),
  (:user_b::uuid, :firma_b::uuid);

insert into public.customers (id, full_name, firma_id)
values (:musteri_a::uuid, 'Test Müşteri', :firma_a::uuid);

insert into public.urunler (id, ad, kategori, birim, aktif, firma_id) values
  (:urun_1::uuid, 'Test Ürün 1', 'test', 'adet', true, :firma_a::uuid),
  (:urun_2::uuid, 'Test Ürün 2', 'test', 'adet', true, :firma_a::uuid);

insert into public.urun_stok (urun_id, stok_adedi) values
  (:urun_1::uuid, 100),
  (:urun_2::uuid, 100);

-- A firmasının teslimatı (tamamlandi, 10 adet urun_1 düşülmüş varsayımıyla)
insert into public.teslimatlar (id, teslimat_no, customer_id, teslimat_tarihi, durum, firma_id)
values (:tes_a::uuid, 'TS-TEST-00001', :musteri_a::uuid, current_date, 'tamamlandi', :firma_a::uuid);

insert into public.teslimat_kalemleri
  (id, teslimat_id, urun_id, aciklama, hareket_yonu, hareket_tipi, miktar, stoktan_duser_mi, firma_id)
values
  ('11111111-0000-4000-8000-000000000001'::uuid, :tes_a::uuid, :urun_1::uuid,
   'Kalem 1', 'giden', 'yeni_cihaz_teslim', 10, true, :firma_a::uuid);

-- B firmasının teslimatı — YABANCI kalem kimliği kaynağı
insert into public.teslimatlar (id, teslimat_no, customer_id, teslimat_tarihi, durum, firma_id)
values (:tes_b::uuid, 'TS-TEST-00002', :musteri_a::uuid, current_date, 'taslak', :firma_b::uuid);

insert into public.teslimat_kalemleri
  (id, teslimat_id, urun_id, aciklama, hareket_yonu, hareket_tipi, miktar, stoktan_duser_mi, firma_id)
values
  ('22222222-0000-4000-8000-000000000001'::uuid, :tes_b::uuid, :urun_2::uuid,
   'Yabancı kalem', 'giden', 'yeni_cihaz_teslim', 5, true, :firma_b::uuid);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 1 — Yabancı (başka teslimata ait) kalem kimliği reddedilir
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  format($q$
    select public.teslimat_update_atomic(
      %L::uuid, '{}'::jsonb,
      '[{"id":"22222222-0000-4000-8000-000000000001","fields":{"miktar":1}}]'::jsonb,
      null, false, null, null, %L::uuid, null)
  $q$, :tes_a, :user_a),
  'TESLIMAT_LINE_NOT_IN_PARENT',
  'Test 1: başka teslimata ait kalem kimliği reddedilir'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 2 — Başka tenant kullanıcısı erişemez
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  format($q$
    select public.teslimat_update_atomic(
      %L::uuid, '{"durum":"taslak"}'::jsonb, null, null, false, null, null, %L::uuid, null)
  $q$, :tes_a, :user_b),
  'TESLIMAT_TENANT_MISMATCH',
  'Test 2: başka tenant kullanıcısı erişemez'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 3 — Eski version ile update reddedilir (optimistic concurrency)
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  format($q$
    select public.teslimat_update_atomic(
      %L::uuid, '{}'::jsonb, null, null, false,
      '2000-01-01T00:00:00Z'::timestamptz, null, %L::uuid, null)
  $q$, :tes_a, :user_a),
  'TESLIMAT_STALE_WRITE',
  'Test 3: bayat version ile update reddedilir'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 4 — Boş kalem listesi açık onay olmadan reddedilir
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  format($q$
    select public.teslimat_update_atomic(
      %L::uuid, '{}'::jsonb, '[]'::jsonb, null, false, null, null, %L::uuid, null)
  $q$, :tes_a, :user_a),
  'TESLIMAT_EMPTY_LINES_NOT_CONFIRMED',
  'Test 4: boş liste açık onay olmadan reddedilir'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 5 — Hata enjeksiyonu: kalem yazımındaki hata ÜST KAYDI da rollback eder
--
-- Geçersiz `hareket_tipi` CHECK kısıtını ihlal eder. Üst kayıt patch'i (aciklama)
-- kalem insert'inden ÖNCE uygulanır; transaction rollback olduğu için kalıcı
-- olmamalıdır.
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_aciklama_once text;
  v_aciklama_sonra text;
  v_kalem_sayisi_once int;
  v_kalem_sayisi_sonra int;
begin
  select aciklama into v_aciklama_once from public.teslimatlar
   where id = 'eeeeeeee-0000-4000-8000-000000000001';
  select count(*) into v_kalem_sayisi_once from public.teslimat_kalemleri
   where teslimat_id = 'eeeeeeee-0000-4000-8000-000000000001';

  begin
    perform public.teslimat_update_atomic(
      'eeeeeeee-0000-4000-8000-000000000001'::uuid,
      '{"aciklama":"BU YAZI KALICI OLMAMALI"}'::jsonb,
      '[{"id":null,"fields":{"aciklama":"Bozuk","hareket_yonu":"giden","hareket_tipi":"GECERSIZ_TIP","miktar":1}}]'::jsonb,
      null, false, null, null,
      'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null);
    raise exception 'FAIL [Test 5]: geçersiz hareket_tipi kabul edildi';
  exception when check_violation or invalid_text_representation then
    null; -- beklenen
  end;

  select aciklama into v_aciklama_sonra from public.teslimatlar
   where id = 'eeeeeeee-0000-4000-8000-000000000001';
  select count(*) into v_kalem_sayisi_sonra from public.teslimat_kalemleri
   where teslimat_id = 'eeeeeeee-0000-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_aciklama_sonra, v_aciklama_once,
    'Test 5a: kalem hatası üst kayıt değişimini rollback eder');
  perform pg_temp.assert_eq(v_kalem_sayisi_sonra, v_kalem_sayisi_once,
    'Test 5b: kalem sayısı değişmez');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 6 — Hata enjeksiyonu: stok güncellemesinden SONRA oluşan hata stoku
--          rollback eder
--
-- `urun_stok` üzerine geçici bir AFTER UPDATE trigger'ı takılır; stok yazıldıktan
-- sonra hata fırlatır. Stok değeri işlem öncesine dönmelidir.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.fail_after_stock() returns trigger
language plpgsql as $$
begin
  raise exception 'INJECTED_FAILURE_AFTER_STOCK';
end;
$$;

do $$
declare
  v_stok_once numeric;
  v_stok_sonra numeric;
begin
  select stok_adedi into v_stok_once from public.urun_stok
   where urun_id = 'cccccccc-0000-4000-8000-000000000001';

  execute 'create trigger tmp_fail_after_stock after update on public.urun_stok
           for each row execute function pg_temp.fail_after_stock()';

  begin
    perform public.teslimat_update_atomic(
      'eeeeeeee-0000-4000-8000-000000000001'::uuid,
      '{}'::jsonb,
      '[{"id":"11111111-0000-4000-8000-000000000001","fields":{"miktar":25,"stoktan_duser_mi":true,"urun_id":"cccccccc-0000-4000-8000-000000000001"}}]'::jsonb,
      null, false, null, null,
      'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null);
    raise exception 'FAIL [Test 6]: enjekte edilen hata oluşmadı';
  exception when others then
    if position('INJECTED_FAILURE_AFTER_STOCK' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  execute 'drop trigger if exists tmp_fail_after_stock on public.urun_stok';

  select stok_adedi into v_stok_sonra from public.urun_stok
   where urun_id = 'cccccccc-0000-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_stok_sonra, v_stok_once,
    'Test 6: stok güncellemesinden sonraki hata stok değişimini rollback eder');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 7 — Net stok DELTA doğru uygulanır (10 → 15 ⇒ 5 adet ek düşüm)
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_stok_once numeric;
  v_stok_sonra numeric;
begin
  select stok_adedi into v_stok_once from public.urun_stok
   where urun_id = 'cccccccc-0000-4000-8000-000000000001';

  perform public.teslimat_update_atomic(
    'eeeeeeee-0000-4000-8000-000000000001'::uuid,
    '{}'::jsonb,
    '[{"id":"11111111-0000-4000-8000-000000000001","fields":{"aciklama":"Kalem 1","hareket_yonu":"giden","hareket_tipi":"yeni_cihaz_teslim","miktar":15,"stoktan_duser_mi":true,"urun_id":"cccccccc-0000-4000-8000-000000000001"}}]'::jsonb,
    null, false, null, null,
    'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null);

  select stok_adedi into v_stok_sonra from public.urun_stok
   where urun_id = 'cccccccc-0000-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_stok_sonra, v_stok_once - 5,
    'Test 7: 10→15 miktar artışı yalnızca 5 adet ek düşüm üretir');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 8 — Idempotency: aynı key + aynı payload yan etkiyi TEKRARLAMAZ
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_stok_1 numeric;
  v_stok_2 numeric;
  v_result jsonb;
  v_payload constant jsonb :=
    '[{"id":"11111111-0000-4000-8000-000000000001","fields":{"aciklama":"Kalem 1","hareket_yonu":"giden","hareket_tipi":"yeni_cihaz_teslim","miktar":20,"stoktan_duser_mi":true,"urun_id":"cccccccc-0000-4000-8000-000000000001"}}]'::jsonb;
begin
  perform public.teslimat_update_atomic(
    'eeeeeeee-0000-4000-8000-000000000001'::uuid, '{}'::jsonb, v_payload,
    null, false, null, 'idem-key-1', 'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null);

  select stok_adedi into v_stok_1 from public.urun_stok
   where urun_id = 'cccccccc-0000-4000-8000-000000000001';

  -- Aynı anahtar + aynı payload
  select public.teslimat_update_atomic(
    'eeeeeeee-0000-4000-8000-000000000001'::uuid, '{}'::jsonb, v_payload,
    null, false, null, 'idem-key-1', 'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null)
  into v_result;

  select stok_adedi into v_stok_2 from public.urun_stok
   where urun_id = 'cccccccc-0000-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_stok_2, v_stok_1,
    'Test 8a: aynı idempotency key ile stok İKİNCİ KEZ değişmez');
  perform pg_temp.assert_eq((v_result ->> 'replayed')::boolean, true,
    'Test 8b: tekrar gönderim replayed olarak işaretlenir');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 9 — Idempotency: aynı key + FARKLI payload conflict döner
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  $q$
    select public.teslimat_update_atomic(
      'eeeeeeee-0000-4000-8000-000000000001'::uuid, '{}'::jsonb,
      '[{"id":"11111111-0000-4000-8000-000000000001","fields":{"miktar":999}}]'::jsonb,
      null, false, null, 'idem-key-1',
      'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null)
  $q$,
  'TESLIMAT_IDEMPOTENCY_CONFLICT',
  'Test 9: aynı key farklı payload ile conflict döner'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 10 — Emanet ve geri teslim kayıtları aynı transaction içinde oluşur
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_emanet int;
  v_geri int;
begin
  perform public.teslimat_update_atomic(
    'eeeeeeee-0000-4000-8000-000000000001'::uuid,
    '{"durum":"tamamlandi"}'::jsonb,
    '[
      {"id":null,"fields":{"aciklama":"Emanet cihaz","hareket_yonu":"giden","hareket_tipi":"emanet_teslim","miktar":2,"emanet_mi":true}},
      {"id":null,"fields":{"aciklama":"Dolum için alındı","hareket_yonu":"gelen","hareket_tipi":"dolum_icin_alindi","miktar":3}}
    ]'::jsonb,
    array['11111111-0000-4000-8000-000000000001']::uuid[], false, null, null,
    'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null);

  select count(*) into v_emanet from public.emanet_takipleri
   where teslimat_id = 'eeeeeeee-0000-4000-8000-000000000001';
  select count(*) into v_geri from public.geri_teslim_takipleri
   where teslimat_id = 'eeeeeeee-0000-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_emanet, 1, 'Test 10a: emanet takibi oluşur');
  perform pg_temp.assert_eq(v_geri, 1, 'Test 10b: geri teslim takibi oluşur');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 11 — Emanet kaydından SONRA oluşan hata emanet değişimini rollback eder
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.fail_after_emanet() returns trigger
language plpgsql as $$
begin
  raise exception 'INJECTED_FAILURE_AFTER_EMANET';
end;
$$;

do $$
declare
  v_once int;
  v_sonra int;
begin
  select count(*) into v_once from public.emanet_takipleri
   where teslimat_id = 'eeeeeeee-0000-4000-8000-000000000001';

  execute 'create trigger tmp_fail_after_emanet after insert on public.emanet_takipleri
           for each row execute function pg_temp.fail_after_emanet()';

  begin
    perform public.teslimat_update_atomic(
      'eeeeeeee-0000-4000-8000-000000000001'::uuid,
      '{"durum":"tamamlandi"}'::jsonb,
      '[{"id":null,"fields":{"aciklama":"Yeni emanet","hareket_yonu":"giden","hareket_tipi":"emanet_teslim","miktar":1,"emanet_mi":true}}]'::jsonb,
      null, true, null, null,
      'bbbbbbbb-0000-4000-8000-000000000001'::uuid, null);
    raise exception 'FAIL [Test 11]: enjekte edilen hata oluşmadı';
  exception when others then
    if position('INJECTED_FAILURE_AFTER_EMANET' in sqlerrm) = 0 then raise; end if;
  end;

  execute 'drop trigger if exists tmp_fail_after_emanet on public.emanet_takipleri';

  select count(*) into v_sonra from public.emanet_takipleri
   where teslimat_id = 'eeeeeeee-0000-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_sonra, v_once,
    'Test 11: emanet kaydından sonraki hata emanet değişimini rollback eder');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 12 — RPC execute izinleri beklenen rollerle sınırlıdır
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_public_can boolean;
  v_anon_can boolean;
  v_auth_can boolean;
begin
  select has_function_privilege('public', p.oid, 'execute')
    into v_public_can
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teslimat_update_atomic';

  select has_function_privilege('anon', p.oid, 'execute')
    into v_anon_can
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teslimat_update_atomic';

  select has_function_privilege('authenticated', p.oid, 'execute')
    into v_auth_can
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teslimat_update_atomic';

  perform pg_temp.assert_eq(v_public_can, false, 'Test 12a: PUBLIC execute yetkisi yok');
  perform pg_temp.assert_eq(v_anon_can, false, 'Test 12b: anon execute yetkisi yok');
  perform pg_temp.assert_eq(v_auth_can, true, 'Test 12c: authenticated execute yetkisi var');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 13 (MANUEL — İKİ OTURUM) — Eşzamanlı update sessiz lost-update üretmez
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Tek psql oturumunda doğrulanamaz. Prosedür:
--
--   Oturum 1:  begin;
--              select public.teslimat_update_atomic(<tes_a>, '{"aciklama":"S1"}', ...);
--              -- COMMIT ETME, bekle
--
--   Oturum 2:  begin;
--              select public.teslimat_update_atomic(<tes_a>, '{"aciklama":"S2"}', ...);
--              -- `for update` kilidi nedeniyle BLOKE olmalıdır
--
--   Oturum 1:  commit;
--   Oturum 2:  bloke çözülür; `expected_updated_at` gönderildiyse
--              TESLIMAT_STALE_WRITE ile REDDEDİLMELİDİR (sessizce üzerine yazmaz).
--
-- Beklenen sonuç: iki eşzamanlı yazmadan biri açıkça reddedilir; hiçbir
-- güncelleme sessizce kaybolmaz.

-- ─────────────────────────────────────────────────────────────────────────────
rollback;   -- Test verisi KALICI OLMAZ.
-- ─────────────────────────────────────────────────────────────────────────────
