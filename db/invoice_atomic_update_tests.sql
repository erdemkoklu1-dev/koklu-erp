-- ============================================================================
-- FATURA ATOMİK GÜNCELLEME — TRANSACTION / INTEGRATION TESTLERİ
-- ============================================================================
--
-- !!! PRODUCTION'DA ÇALIŞTIRILMAZ !!!
--
-- GOREV.md §11.3 fatura regresyonlarının gerçek transaction karşılığı.
-- Yalnızca yerel izole PostgreSQL veya Gate 0'dan geçmiş staging üzerinde.
-- Güncel durum: Gate 0 NO-GO ⇒ bu dosya ÇALIŞTIRILMAMIŞTIR.
--
-- Çalıştırma:
--   psql "$ISOLATED_TEST_DSN" -v ON_ERROR_STOP=1 -f db/invoice_atomic_update_tests.sql
--
-- Bütün test verisi transaction sonunda ROLLBACK edilir.
-- Ön koşul: db/aggregate_atomic_update_rpc.sql + db/invoice_atomic_update_rpc.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

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
      raise exception 'FAIL [%]: beklenen "%", gerçek "%"', label, expected_code, sqlerrm;
    end if;
    raise notice 'PASS: % (% doğru şekilde reddedildi)', label, expected_code;
    return;
  end;
  raise exception 'FAIL [%]: hata bekleniyordu ama işlem başarılı oldu', label;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fikstür: iki farklı firmaya ait iki fatura
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.firmalar (id, ad, slug) values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'Fatura Test A', 'fatura-test-a'),
  ('aaaaaaaa-1111-4000-8000-000000000002', 'Fatura Test B', 'fatura-test-b');

insert into public.kullanici_profiller (id, firma_id) values
  ('bbbbbbbb-1111-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'aaaaaaaa-1111-4000-8000-000000000002');

insert into public.invoices (id, invoice_number, invoice_date, subtotal, total_amount, firma_id) values
  ('cccccccc-1111-4000-8000-000000000001', 'TEST-FTR-001', current_date, 300, 360,
   'aaaaaaaa-1111-4000-8000-000000000001'),
  ('cccccccc-1111-4000-8000-000000000002', 'TEST-FTR-002', current_date, 100, 120,
   'aaaaaaaa-1111-4000-8000-000000000002');

insert into public.invoice_items (id, invoice_id, line_order, description, quantity, unit_price, firma_id) values
  ('dddddddd-1111-4000-8000-000000000001', 'cccccccc-1111-4000-8000-000000000001', 1,
   'A faturası kalem 1', 1, 100, 'aaaaaaaa-1111-4000-8000-000000000001'),
  ('dddddddd-1111-4000-8000-000000000002', 'cccccccc-1111-4000-8000-000000000001', 2,
   'A faturası kalem 2', 2, 100, 'aaaaaaaa-1111-4000-8000-000000000001'),
  -- YABANCI kalem: B faturasına ait
  ('dddddddd-1111-4000-8000-000000000099', 'cccccccc-1111-4000-8000-000000000002', 1,
   'B faturası kalemi', 1, 100, 'aaaaaaaa-1111-4000-8000-000000000002');

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 1 — Başka faturaya ait item ID ile UPDATE reddedilir
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  $q$
    select public.invoice_update_atomic(
      'cccccccc-1111-4000-8000-000000000001'::uuid, '{}'::jsonb,
      '[{"id":"dddddddd-1111-4000-8000-000000000099","fields":{"description":"ELE GEÇİRİLDİ"}}]'::jsonb,
      null, null, null, false, null, null,
      'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null)
  $q$,
  'INVOICE_FOREIGN_LINE_ID',
  'Test 1: başka faturaya ait item ID ile update reddedilir'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 2 — Başka faturaya ait item ID ile DELETE reddedilir
--          (kök nedenin doğrudan regresyonu)
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  $q$
    select public.invoice_update_atomic(
      'cccccccc-1111-4000-8000-000000000001'::uuid, '{}'::jsonb, null,
      array['dddddddd-1111-4000-8000-000000000099']::uuid[],
      null, null, false, null, null,
      'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null)
  $q$,
  'INVOICE_FOREIGN_LINE_ID',
  'Test 2: başka faturaya ait item ID ile delete reddedilir'
);

do $$
declare v_var boolean;
begin
  select exists(select 1 from public.invoice_items
                 where id = 'dddddddd-1111-4000-8000-000000000099')
    into v_var;
  perform pg_temp.assert_eq(v_var, true,
    'Test 2b: yabancı faturanın kalemi HÂLÂ yerinde (silinmedi)');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 3 — Başka tenant kullanıcısı erişemez
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  $q$
    select public.invoice_update_atomic(
      'cccccccc-1111-4000-8000-000000000001'::uuid, '{"notes":"sızma"}'::jsonb,
      null, null, null, null, false, null, null,
      'bbbbbbbb-1111-4000-8000-000000000002'::uuid, null)
  $q$,
  'INVOICE_TENANT_MISMATCH',
  'Test 3: başka tenant kullanıcısı faturaya erişemez'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 4 — Doğru id + invoice_id çifti YALNIZCA hedef satırı değiştirir
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_hedef text;
  v_diger text;
begin
  perform public.invoice_update_atomic(
    'cccccccc-1111-4000-8000-000000000001'::uuid, '{}'::jsonb,
    '[{"id":"dddddddd-1111-4000-8000-000000000001","fields":{"description":"GÜNCELLENDİ"}},
      {"id":"dddddddd-1111-4000-8000-000000000002","fields":{"description":"A faturası kalem 2"}}]'::jsonb,
    null, null, null, false, null, null,
    'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null);

  select description into v_hedef from public.invoice_items
   where id = 'dddddddd-1111-4000-8000-000000000001';
  select description into v_diger from public.invoice_items
   where id = 'dddddddd-1111-4000-8000-000000000099';

  perform pg_temp.assert_eq(v_hedef, 'GÜNCELLENDİ', 'Test 4a: hedef satır güncellendi');
  perform pg_temp.assert_eq(v_diger, 'B faturası kalemi',
    'Test 4b: başka faturanın satırı DEĞİŞMEDİ');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 5 — Kalem alanı yoksa mevcut kalemler korunur
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare v_sayi int;
begin
  perform public.invoice_update_atomic(
    'cccccccc-1111-4000-8000-000000000001'::uuid,
    '{"notes":"yalnızca üst bilgi"}'::jsonb,
    null, null, null, null, false, null, null,
    'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null);

  select count(*) into v_sayi from public.invoice_items
   where invoice_id = 'cccccccc-1111-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_sayi, 2, 'Test 5: kalem alanı yokken kalemler korunur');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 6 — Açık silme YALNIZCA seçilen kalemi siler
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_silinen boolean;
  v_kalan boolean;
begin
  perform public.invoice_update_atomic(
    'cccccccc-1111-4000-8000-000000000001'::uuid, '{}'::jsonb, null,
    array['dddddddd-1111-4000-8000-000000000002']::uuid[],
    null, null, false, null, null,
    'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null);

  select exists(select 1 from public.invoice_items
                 where id = 'dddddddd-1111-4000-8000-000000000002') into v_silinen;
  select exists(select 1 from public.invoice_items
                 where id = 'dddddddd-1111-4000-8000-000000000001') into v_kalan;

  perform pg_temp.assert_eq(v_silinen, false, 'Test 6a: seçilen kalem silindi');
  perform pg_temp.assert_eq(v_kalan, true, 'Test 6b: seçilmeyen kalem korundu');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 7 — Kalem yazımındaki hata BÜTÜN fatura işlemini rollback eder
--
-- `quantity` NOT NULL kısıtını ihlal eden bir insert enjekte edilir; üst kayıt
-- patch'i (notes) kalıcı OLMAMALIDIR.
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_notes_once text;
  v_notes_sonra text;
begin
  select notes into v_notes_once from public.invoices
   where id = 'cccccccc-1111-4000-8000-000000000001';

  begin
    perform public.invoice_update_atomic(
      'cccccccc-1111-4000-8000-000000000001'::uuid,
      '{"notes":"BU YAZI KALICI OLMAMALI"}'::jsonb,
      '[{"id":null,"fields":{"description":null,"quantity":1,"unit_price":10}}]'::jsonb,
      null, null, null, false, null, null,
      'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null);
    raise exception 'FAIL [Test 7]: NOT NULL ihlali kabul edildi';
  exception when not_null_violation then
    null; -- beklenen
  end;

  select notes into v_notes_sonra from public.invoices
   where id = 'cccccccc-1111-4000-8000-000000000001';

  perform pg_temp.assert_eq(v_notes_sonra, v_notes_once,
    'Test 7: kalem hatası üst fatura değişimini rollback eder');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 8 — Eski version ile update reddedilir
-- ═════════════════════════════════════════════════════════════════════════════

select pg_temp.assert_raises(
  $q$
    select public.invoice_update_atomic(
      'cccccccc-1111-4000-8000-000000000001'::uuid, '{}'::jsonb, null, null, null, null,
      false, '2000-01-01T00:00:00Z'::timestamptz, null,
      'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null)
  $q$,
  'INVOICE_STALE_WRITE',
  'Test 8: bayat version ile fatura update reddedilir'
);

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 9 — RPC execute izinleri
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare v_public boolean; v_anon boolean; v_auth boolean;
begin
  select has_function_privilege('public', p.oid, 'execute') into v_public
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_update_atomic';
  select has_function_privilege('anon', p.oid, 'execute') into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_update_atomic';
  select has_function_privilege('authenticated', p.oid, 'execute') into v_auth
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_update_atomic';

  perform pg_temp.assert_eq(v_public, false, 'Test 9a: PUBLIC execute yetkisi yok');
  perform pg_temp.assert_eq(v_anon, false, 'Test 9b: anon execute yetkisi yok');
  perform pg_temp.assert_eq(v_auth, true, 'Test 9c: authenticated execute yetkisi var');
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 10 — Toplam tutarlılığı raporlanır (mevcut iş kuralı: HATA değil, uyarı)
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare v_result jsonb;
begin
  select public.invoice_update_atomic(
    'cccccccc-1111-4000-8000-000000000001'::uuid,
    '{"subtotal": 999999}'::jsonb, null, null, null, null, false, null, null,
    'bbbbbbbb-1111-4000-8000-000000000001'::uuid, null)
  into v_result;

  perform pg_temp.assert_eq((v_result ->> 'totals_match')::boolean, false,
    'Test 10: üst toplam ile kalem toplamı uyuşmazlığı raporlanır');
end;
$$;

rollback;   -- Test verisi KALICI OLMAZ.
