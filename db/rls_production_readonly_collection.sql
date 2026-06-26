-- ==========================================================
-- PRODUCTION READ-ONLY RLS ENVANTER SORGULARI
-- ==========================================================
-- Bu dosya SADECE SELECT sorguları içermelidir.
-- Production Supabase SQL Editor'da bölüm bölüm çalıştırılabilir.
--
-- KESİNLİKLE YAPMAZ:
-- - RLS açmaz
-- - Policy oluşturmaz
-- - Policy silmez
-- - Veri değiştirmez
-- - NOT NULL yapmaz
--
-- Bu dosyada UPDATE / INSERT / DELETE / DROP / ALTER / CREATE POLICY
-- komutları aktif SQL olarak bulunmamalıdır.
-- ==========================================================

-- ==========================================================
-- Bölüm 1 - Tenant Kritik Tablo Durumu
-- ==========================================================
WITH tenant_tables(table_name) AS (
  VALUES
    ('firmalar'),
    ('kullanici_profiller'),
    ('subeler'),
    ('customers'),
    ('devices'),
    ('service_forms'),
    ('service_form_items'),
    ('invoices'),
    ('invoice_items'),
    ('invoice_brokers'),
    ('payments'),
    ('teslimatlar'),
    ('teslimat_kalemleri'),
    ('teklifler'),
    ('teklif_kalemleri'),
    ('proforma_faturalar'),
    ('proforma_fatura_kalemleri'),
    ('teknik_raporlar'),
    ('musteri_talepleri'),
    ('is_planlari'),
    ('planli_isler'),
    ('brokers'),
    ('araci_cari_hareketleri')
)
SELECT
  t.table_name,
  c.oid IS NOT NULL AS table_exists,
  fc.column_name IS NOT NULL AS firma_id_column_exists,
  COALESCE(c.relrowsecurity, false) AS rls_enabled,
  COALESCE(c.relforcerowsecurity, false) AS force_rls,
  COUNT(p.policyname) AS policy_count
FROM tenant_tables t
LEFT JOIN pg_class c
  ON c.oid = to_regclass('public.' || t.table_name)
LEFT JOIN information_schema.columns fc
  ON fc.table_schema = 'public'
 AND fc.table_name = t.table_name
 AND fc.column_name = 'firma_id'
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.table_name
GROUP BY
  t.table_name,
  c.oid,
  c.relrowsecurity,
  c.relforcerowsecurity,
  fc.column_name
ORDER BY t.table_name;

-- ==========================================================
-- Bölüm 2 - RLS Açık/Kapalı Tüm Public Tablolar
-- ==========================================================
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- ==========================================================
-- Bölüm 3 - Mevcut Policy Listesi
-- ==========================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ==========================================================
-- Bölüm 4 - Fazla İzin Veren Policy Tespiti
-- ==========================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  CASE
    WHEN COALESCE(qual, '') ILIKE '%auth.uid() IS NOT NULL%'
      OR COALESCE(with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
      THEN 'auth.uid() IS NOT NULL'
    WHEN COALESCE(qual, '') IN ('true', '(true)')
      OR COALESCE(with_check, '') IN ('true', '(true)')
      OR COALESCE(qual, '') ILIKE '%true%'
      OR COALESCE(with_check, '') ILIKE '%true%'
      THEN 'TRUE / overly permissive'
    ELSE 'review'
  END AS risk_pattern
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
    OR COALESCE(qual, '') ILIKE '%true%'
    OR COALESCE(with_check, '') ILIKE '%true%'
  )
ORDER BY tablename, policyname;

-- ==========================================================
-- Bölüm 5 - Helper Fonksiyon Durumu
-- ==========================================================
SELECT
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_function_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_firma_id',
    'is_super_admin',
    'current_user_role',
    'current_user_sube_id'
  )
ORDER BY p.proname;

-- ==========================================================
-- Bölüm 6 - Kullanıcı Profil / Rol / Firma Kontrolü
-- ==========================================================
SELECT
  kp.id,
  kp.firma_id,
  f.ad AS firma_adi,
  kp.sube_id,
  s.ad AS sube_adi,
  kp.aktif,
  kp.rol_id,
  r.ad AS rol_adi,
  kp.created_at
FROM public.kullanici_profiller kp
LEFT JOIN public.firmalar f ON f.id = kp.firma_id
LEFT JOIN public.subeler s ON s.id = kp.sube_id
LEFT JOIN public.roller r ON r.id = kp.rol_id
ORDER BY kp.created_at DESC
LIMIT 50;

-- ==========================================================
-- Bölüm 7 - Veri Temizlik Özet Kontrolü
-- ==========================================================
SELECT 'customers_firma_id_null' AS kontrol, COUNT(*)::text AS sonuc FROM public.customers WHERE firma_id IS NULL
UNION ALL SELECT 'devices_firma_id_null', COUNT(*)::text FROM public.devices WHERE firma_id IS NULL
UNION ALL SELECT 'service_forms_firma_id_null', COUNT(*)::text FROM public.service_forms WHERE firma_id IS NULL
UNION ALL SELECT 'service_form_items_firma_id_null', COUNT(*)::text FROM public.service_form_items WHERE firma_id IS NULL
UNION ALL SELECT 'invoices_firma_id_null', COUNT(*)::text FROM public.invoices WHERE firma_id IS NULL
UNION ALL SELECT 'invoice_items_firma_id_null', COUNT(*)::text FROM public.invoice_items WHERE firma_id IS NULL
UNION ALL SELECT 'invoice_brokers_firma_id_null', COUNT(*)::text FROM public.invoice_brokers WHERE firma_id IS NULL
UNION ALL SELECT 'payments_firma_id_null', COUNT(*)::text FROM public.payments WHERE firma_id IS NULL
UNION ALL SELECT 'teslimatlar_firma_id_null', COUNT(*)::text FROM public.teslimatlar WHERE firma_id IS NULL
UNION ALL SELECT 'teslimat_kalemleri_firma_id_null', COUNT(*)::text FROM public.teslimat_kalemleri WHERE firma_id IS NULL
UNION ALL SELECT 'teklifler_firma_id_null', COUNT(*)::text FROM public.teklifler WHERE firma_id IS NULL
UNION ALL SELECT 'teklif_kalemleri_firma_id_null', COUNT(*)::text FROM public.teklif_kalemleri WHERE firma_id IS NULL
UNION ALL SELECT 'proforma_faturalar_firma_id_null', COUNT(*)::text FROM public.proforma_faturalar WHERE firma_id IS NULL
UNION ALL SELECT 'proforma_fatura_kalemleri_firma_id_null', COUNT(*)::text FROM public.proforma_fatura_kalemleri WHERE firma_id IS NULL
UNION ALL SELECT 'teknik_raporlar_firma_id_null', COUNT(*)::text FROM public.teknik_raporlar WHERE firma_id IS NULL
UNION ALL SELECT 'musteri_talepleri_firma_id_null', COUNT(*)::text FROM public.musteri_talepleri WHERE firma_id IS NULL
UNION ALL SELECT 'is_planlari_firma_id_null', COUNT(*)::text FROM public.is_planlari WHERE firma_id IS NULL
UNION ALL SELECT 'planli_isler_firma_id_null', COUNT(*)::text FROM public.planli_isler WHERE firma_id IS NULL
UNION ALL SELECT 'brokers_firma_id_null', COUNT(*)::text FROM public.brokers WHERE firma_id IS NULL
UNION ALL SELECT 'araci_cari_hareketleri_firma_id_null', COUNT(*)::text FROM public.araci_cari_hareketleri WHERE firma_id IS NULL
UNION ALL SELECT 'customers_sube_firma_mismatch', COUNT(*)::text FROM public.customers c JOIN public.subeler s ON s.id = c.sube_id WHERE c.sube_id IS NOT NULL AND c.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'invoices_sube_firma_mismatch', COUNT(*)::text FROM public.invoices i JOIN public.subeler s ON s.id = i.sube_id WHERE i.sube_id IS NOT NULL AND i.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'teslimatlar_sube_firma_mismatch', COUNT(*)::text FROM public.teslimatlar t JOIN public.subeler s ON s.id = t.sube_id WHERE t.sube_id IS NOT NULL AND t.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'teklifler_sube_firma_mismatch', COUNT(*)::text FROM public.teklifler q JOIN public.subeler s ON s.id = q.sube_id WHERE q.sube_id IS NOT NULL AND q.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'service_forms_sube_firma_mismatch', COUNT(*)::text FROM public.service_forms sf JOIN public.subeler s ON s.id = sf.sube_id WHERE sf.sube_id IS NOT NULL AND sf.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'musteri_talepleri_sube_firma_mismatch', COUNT(*)::text FROM public.musteri_talepleri mt JOIN public.subeler s ON s.id = mt.sube_id WHERE mt.sube_id IS NOT NULL AND mt.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'is_planlari_sube_firma_mismatch', COUNT(*)::text FROM public.is_planlari ip JOIN public.subeler s ON s.id = ip.sube_id WHERE ip.sube_id IS NOT NULL AND ip.firma_id IS DISTINCT FROM s.firma_id
UNION ALL SELECT 'devices_customer_firma_mismatch', COUNT(*)::text FROM public.devices d JOIN public.customers c ON c.id = d.customer_id WHERE d.customer_id IS NOT NULL AND d.firma_id IS DISTINCT FROM c.firma_id
UNION ALL SELECT 'service_forms_customer_firma_mismatch', COUNT(*)::text FROM public.service_forms sf JOIN public.customers c ON c.id = sf.customer_id WHERE sf.customer_id IS NOT NULL AND sf.firma_id IS DISTINCT FROM c.firma_id
UNION ALL SELECT 'invoices_customer_firma_mismatch', COUNT(*)::text FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id WHERE i.customer_id IS NOT NULL AND i.firma_id IS DISTINCT FROM c.firma_id
UNION ALL SELECT 'teslimatlar_customer_firma_mismatch', COUNT(*)::text FROM public.teslimatlar t JOIN public.customers c ON c.id = t.customer_id WHERE t.customer_id IS NOT NULL AND t.firma_id IS DISTINCT FROM c.firma_id
UNION ALL SELECT 'teklifler_customer_firma_mismatch', COUNT(*)::text FROM public.teklifler q JOIN public.customers c ON c.id = q.musteri_id WHERE q.musteri_id IS NOT NULL AND q.firma_id IS DISTINCT FROM c.firma_id
UNION ALL SELECT 'invoice_items_parent_firma_mismatch', COUNT(*)::text FROM public.invoice_items it JOIN public.invoices i ON i.id = it.invoice_id WHERE it.firma_id IS DISTINCT FROM i.firma_id
UNION ALL SELECT 'invoice_brokers_parent_firma_mismatch', COUNT(*)::text FROM public.invoice_brokers ib JOIN public.invoices i ON i.id = ib.invoice_id WHERE ib.firma_id IS DISTINCT FROM i.firma_id
UNION ALL SELECT 'service_form_items_parent_firma_mismatch', COUNT(*)::text FROM public.service_form_items it JOIN public.service_forms sf ON sf.id = it.service_form_id WHERE it.firma_id IS DISTINCT FROM sf.firma_id
UNION ALL SELECT 'teklif_kalemleri_parent_firma_mismatch', COUNT(*)::text FROM public.teklif_kalemleri tk JOIN public.teklifler q ON q.id = tk.teklif_id WHERE tk.firma_id IS DISTINCT FROM q.firma_id
UNION ALL SELECT 'teslimat_kalemleri_parent_firma_mismatch', COUNT(*)::text FROM public.teslimat_kalemleri tek JOIN public.teslimatlar t ON t.id = tek.teslimat_id WHERE tek.firma_id IS DISTINCT FROM t.firma_id
UNION ALL SELECT 'proforma_fatura_kalemleri_parent_firma_mismatch', COUNT(*)::text FROM public.proforma_fatura_kalemleri k JOIN public.proforma_faturalar p ON p.id = k.proforma_id WHERE k.firma_id IS DISTINCT FROM p.firma_id
ORDER BY kontrol;

-- Büyük ve ayrıntılı audit gerekirse ayrıca db/tenant_audit_checks.sql
-- dosyasındaki read-only sorgular bölüm bölüm çalıştırılabilir.
