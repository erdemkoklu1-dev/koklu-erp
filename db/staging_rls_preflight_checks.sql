-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Tenant RLS dry-run APPLY ÖNCESİ durum kontrolüdür.
-- Yalnızca okuma (SELECT) yapar; hiçbir policy/veri değiştirmez.
-- ==========================================================

-- ----------------------------------------------------------
-- 0. Bağlantı güvenliği: production OLMADIĞINI doğrula.
-- ----------------------------------------------------------
SELECT current_database() AS db_name,
       inet_server_addr()  AS server_addr,
       current_user        AS connected_role;

-- ----------------------------------------------------------
-- 1. Public şema tablo sayısı ve RLS durumu özeti.
--    Beklenen: tablo sayısı ile rls_enabled sayısı uyumlu,
--    force_rls = false.
-- ----------------------------------------------------------
SELECT
  count(*)                                    AS public_table_count,
  count(*) FILTER (WHERE c.relrowsecurity)    AS rls_enabled_count,
  count(*) FILTER (WHERE c.relforcerowsecurity) AS force_rls_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r';

-- ----------------------------------------------------------
-- 2. RLS açık olmayan public tablolar (beklenen: 0 satır).
-- ----------------------------------------------------------
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- ----------------------------------------------------------
-- 3. Helper fonksiyon durumu (apply öncesi referans).
--    current_user_role ve current_user_sube_id apply öncesi
--    yok olabilir; helper upgrade sonrası dört fonksiyon da olmalı.
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
-- 4. Cleanup ile düşürülecek riskli/permissive policy'ler.
--    Apply öncesi beklenen: bu policy'ler MEVCUT.
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
-- 5. Apply ile oluşturulacak tenant policy'ler.
--    Apply öncesi beklenen: 0 satır (henüz yok).
-- ----------------------------------------------------------
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%\_tenant\_%'
ORDER BY tablename, policyname;

-- ----------------------------------------------------------
-- 6. anon rolüne açık policy'ler (genel risk taraması).
--    Apply öncesi beklenen: birden fazla satır (riskli durum).
-- ----------------------------------------------------------
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY (roles)
ORDER BY tablename, policyname;

-- ----------------------------------------------------------
-- 7. RLS açık ama hiç policy'si olmayan tablolar.
--    invoices/invoice_items/payments burada görünebilir.
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

-- ----------------------------------------------------------
-- 8. Tenant veri bütünlüğü hızlı kontrolü (firma_id boş kayıt).
--    Beklenen: her satırda bos_firma_id = 0.
-- ----------------------------------------------------------
SELECT 'customers'              AS tablo, count(*) FILTER (WHERE firma_id IS NULL) AS bos_firma_id FROM public.customers
UNION ALL SELECT 'devices',              count(*) FILTER (WHERE firma_id IS NULL) FROM public.devices
UNION ALL SELECT 'service_forms',        count(*) FILTER (WHERE firma_id IS NULL) FROM public.service_forms
UNION ALL SELECT 'invoices',             count(*) FILTER (WHERE firma_id IS NULL) FROM public.invoices
UNION ALL SELECT 'payments',             count(*) FILTER (WHERE firma_id IS NULL) FROM public.payments
UNION ALL SELECT 'teklifler',            count(*) FILTER (WHERE firma_id IS NULL) FROM public.teklifler
UNION ALL SELECT 'teslimatlar',          count(*) FILTER (WHERE firma_id IS NULL) FROM public.teslimatlar
UNION ALL SELECT 'proforma_faturalar',   count(*) FILTER (WHERE firma_id IS NULL) FROM public.proforma_faturalar
UNION ALL SELECT 'teknik_raporlar',      count(*) FILTER (WHERE firma_id IS NULL) FROM public.teknik_raporlar
ORDER BY tablo;
