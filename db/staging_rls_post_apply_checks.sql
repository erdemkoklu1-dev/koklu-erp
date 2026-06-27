-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Tenant RLS dry-run APPLY SONRASI doğrulama kontrolüdür.
-- Yalnızca okuma (SELECT) yapar; hiçbir policy/veri değiştirmez.
-- Sıra: helper upgrade + cleanup + apply tamamlandıktan sonra çalıştır.
-- ==========================================================

-- ----------------------------------------------------------
-- 0. Bağlantı güvenliği: production OLMADIĞINI doğrula.
-- ----------------------------------------------------------
SELECT current_database() AS db_name,
       inet_server_addr()  AS server_addr,
       current_user        AS connected_role;

-- ----------------------------------------------------------
-- 1. Dört helper fonksiyon da mevcut olmalı (beklenen: 4 satır).
-- ----------------------------------------------------------
SELECT p.proname AS function_name,
       pg_get_function_result(p.oid) AS return_type
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

-- ----------------------------------------------------------
-- 2. is_super_admin tanımı 'admin' rol adını içermeli.
--    Beklenen: tanımda lower(...) IN (...'admin'...) görülmeli.
-- ----------------------------------------------------------
SELECT pg_get_functiondef(p.oid) AS is_super_admin_def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_super_admin';

-- ----------------------------------------------------------
-- 3. Cleanup ile düşmesi gereken riskli policy'ler.
--    Apply sonrası beklenen: 0 satır.
-- ----------------------------------------------------------
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (tablename = 'customers'              AND policyname IN ('customers_select','customers_insert','customers_update'))
    OR (tablename = 'devices'             AND policyname IN ('devices_select','devices_insert','devices_update'))
    OR (tablename = 'service_forms'       AND policyname IN ('sf_select','sf_insert','sf_update','sf_delete'))
    OR (tablename = 'service_form_items'  AND policyname = 'sfi_all')
    OR (tablename = 'proforma_faturalar'  AND policyname = 'proforma_auth_all')
    OR (tablename = 'proforma_fatura_kalemleri' AND policyname = 'proforma_kalem_auth_all')
    OR (tablename = 'teknik_raporlar'     AND policyname = 'teknik_raporlar_auth_all')
    OR (tablename = 'brokers'             AND policyname = 'Authenticated users can do everything on brokers')
    OR (tablename = 'invoice_brokers'     AND policyname = 'Authenticated users can do everything on invoice_brokers')
    OR (tablename = 'araci_cari_hareketleri' AND policyname IN ('anon_all','auth_all'))
    OR (tablename IN ('musteri_talepleri','is_planlari','planli_isler') AND policyname IN ('operasyon_auth_all','operasyon_service_all'))
    OR (tablename IN ('teklifler','teklif_kalemleri','teslimatlar','teslimat_kalemleri','teslimat_durum_gecmisi','on_kayitlar') AND policyname = 'Service role has full access')
  )
ORDER BY tablename, policyname;

-- ----------------------------------------------------------
-- 4. Apply ile oluşması gereken tenant policy'ler.
--    Apply sonrası beklenen: tüm tenant tabloları için satırlar.
-- ----------------------------------------------------------
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%\_tenant\_%'
ORDER BY tablename, policyname;

-- ----------------------------------------------------------
-- 5. Tenant tablolarında beklenen policy sayısı kontrolü.
--    select/insert/update üçlüsü için her tabloda >= 3 beklenir.
-- ----------------------------------------------------------
WITH tenant_tables(tablename) AS (
  VALUES
    ('customers'),('devices'),('service_forms'),('service_form_items'),
    ('invoices'),('invoice_items'),('invoice_brokers'),('payments'),
    ('teslimatlar'),('teslimat_kalemleri'),('teklifler'),('teklif_kalemleri'),
    ('proforma_faturalar'),('proforma_fatura_kalemleri'),('teknik_raporlar'),
    ('musteri_talepleri'),('is_planlari'),('planli_isler'),('brokers'),
    ('araci_cari_hareketleri')
)
SELECT t.tablename,
       count(p.policyname) FILTER (WHERE p.policyname LIKE '%\_tenant\_%') AS tenant_policy_count
FROM tenant_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.tablename
GROUP BY t.tablename
ORDER BY t.tablename;

-- ----------------------------------------------------------
-- 6. Özel policy'ler mevcut olmalı (firmalar/kullanici_profiller/subeler).
-- ----------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'firmalar_tenant_select',
    'kullanici_profiller_self_select',
    'kullanici_profiller_self_update',
    'subeler_tenant_select'
  )
ORDER BY tablename, policyname;

-- ----------------------------------------------------------
-- 7. anon rolüne hâlâ açık tenant policy var mı?
--    Apply sonrası beklenen: tenant tablolarında anon erişimi kalmamalı.
-- ----------------------------------------------------------
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY (roles)
ORDER BY tablename, policyname;

-- ----------------------------------------------------------
-- 8. RLS açık ama policy'si olmayan tablolar (apply sonrası).
--    invoices/invoice_items/payments artık burada GÖRÜNMEMELİ.
-- ----------------------------------------------------------
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
  )
ORDER BY c.relname;
