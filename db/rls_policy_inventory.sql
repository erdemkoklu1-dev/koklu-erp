-- =====================================================================
-- RLS Policy Envanteri - Sprint 1.6
-- =====================================================================
-- YALNIZCA OKUMA sorgularıdır.
-- Production'da RLS açmaz, policy oluşturmaz, policy silmez.
-- Amaç: mevcut policy'leri, fazla izin veren policy adaylarını ve
-- tenant kapsamındaki tabloların RLS hazırlık durumunu listelemek.
-- =====================================================================

-- 1. Tenant kapsamındaki hedef tablo listesi.
WITH tenant_tables(table_name) AS (
  VALUES
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
  t.table_name AS tablo,
  CASE WHEN c.oid IS NULL THEN 'TABLO YOK' ELSE 'TABLO VAR' END AS tablo_durumu,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls_enabled,
  CASE WHEN f.column_name IS NULL THEN 'firma_id YOK' ELSE 'firma_id VAR' END AS firma_id_durumu,
  COUNT(p.policyname) AS policy_sayisi,
  BOOL_OR(
    COALESCE(p.qual, '') IN ('true', '(true)')
    OR COALESCE(p.with_check, '') IN ('true', '(true)')
    OR COALESCE(p.qual, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(p.with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
  ) AS fazla_izin_veren_policy_var
FROM tenant_tables t
LEFT JOIN pg_class c
  ON c.oid = to_regclass('public.' || t.table_name)
LEFT JOIN information_schema.columns f
  ON f.table_schema = 'public'
 AND f.table_name = t.table_name
 AND f.column_name = 'firma_id'
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.table_name
GROUP BY t.table_name, c.oid, c.relrowsecurity, c.relforcerowsecurity, f.column_name
ORDER BY t.table_name;

-- 2. Tenant tablolarındaki tüm policy'ler.
WITH tenant_tables(table_name) AS (
  VALUES
    ('customers'), ('devices'), ('service_forms'), ('service_form_items'),
    ('invoices'), ('invoice_items'), ('invoice_brokers'), ('payments'),
    ('teslimatlar'), ('teslimat_kalemleri'), ('teklifler'), ('teklif_kalemleri'),
    ('proforma_faturalar'), ('proforma_fatura_kalemleri'), ('teknik_raporlar'),
    ('musteri_talepleri'), ('is_planlari'), ('planli_isler'),
    ('brokers'), ('araci_cari_hareketleri')
)
SELECT
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual,
  p.with_check,
  CASE
    WHEN COALESCE(p.qual, '') ILIKE '%firma_id%'
      OR COALESCE(p.with_check, '') ILIKE '%firma_id%'
      OR COALESCE(p.qual, '') ILIKE '%current_firma_id%'
      OR COALESCE(p.with_check, '') ILIKE '%current_firma_id%'
      THEN 'tenant scoped'
    WHEN COALESCE(p.qual, '') IN ('true', '(true)')
      OR COALESCE(p.with_check, '') IN ('true', '(true)')
      OR COALESCE(p.qual, '') ILIKE '%auth.uid() IS NOT NULL%'
      OR COALESCE(p.with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
      THEN 'fazla izin veren aday'
    ELSE 'manuel inceleme'
  END AS risk_sinifi
FROM pg_policies p
JOIN tenant_tables t ON t.table_name = p.tablename
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.policyname, p.cmd;

-- 3. Fazla izin veren policy adayları.
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
    OR COALESCE(qual, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
  )
ORDER BY tablename, policyname;

-- 4. Policy olmayan tenant tabloları.
WITH tenant_tables(table_name) AS (
  VALUES
    ('customers'), ('devices'), ('service_forms'), ('service_form_items'),
    ('invoices'), ('invoice_items'), ('invoice_brokers'), ('payments'),
    ('teslimatlar'), ('teslimat_kalemleri'), ('teklifler'), ('teklif_kalemleri'),
    ('proforma_faturalar'), ('proforma_fatura_kalemleri'), ('teknik_raporlar'),
    ('musteri_talepleri'), ('is_planlari'), ('planli_isler'),
    ('brokers'), ('araci_cari_hareketleri')
)
SELECT t.table_name AS tablo
FROM tenant_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.table_name
WHERE p.policyname IS NULL
ORDER BY t.table_name;

-- 5. Tenant helper fonksiyonları var mı?
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_firma_id', 'is_super_admin', 'current_user_role', 'current_user_sube_id')
ORDER BY p.proname;
