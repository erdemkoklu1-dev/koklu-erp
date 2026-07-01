-- ==========================================================
-- STAGING ONLY — REQUIRED OBJECTS CHECK
-- Sadece SELECT sorguları içerir.
-- Production üzerinde çalıştırılması amaçlanmamıştır.
-- Veri değiştirmez.
-- ==========================================================

WITH required_tables(table_name) AS (
  VALUES
    ('firmalar'),
    ('subeler'),
    ('roller'),
    ('kullanici_profiller'),
    ('customers'),
    ('devices'),
    ('service_forms'),
    ('service_form_items'),
    ('invoices'),
    ('invoice_items'),
    ('invoice_brokers'),
    ('payments'),
    ('teklifler'),
    ('teklif_kalemleri'),
    ('proforma_faturalar'),
    ('proforma_fatura_kalemleri'),
    ('teslimatlar'),
    ('teslimat_kalemleri'),
    ('teknik_raporlar'),
    ('musteri_talepleri'),
    ('is_planlari'),
    ('planli_isler'),
    ('brokers'),
    ('araci_cari_hareketleri')
)
SELECT
  rt.table_name,
  to_regclass('public.' || rt.table_name) IS NOT NULL AS table_exists
FROM required_tables rt
ORDER BY rt.table_name;

-- firma_id kolon kontrolü
WITH tenant_tables(table_name) AS (
  VALUES
    ('subeler'),
    ('kullanici_profiller'),
    ('customers'),
    ('devices'),
    ('service_forms'),
    ('service_form_items'),
    ('invoices'),
    ('invoice_items'),
    ('invoice_brokers'),
    ('payments'),
    ('teklifler'),
    ('teklif_kalemleri'),
    ('proforma_faturalar'),
    ('proforma_fatura_kalemleri'),
    ('teslimatlar'),
    ('teslimat_kalemleri'),
    ('teknik_raporlar'),
    ('musteri_talepleri'),
    ('is_planlari'),
    ('planli_isler'),
    ('brokers'),
    ('araci_cari_hareketleri')
)
SELECT
  tt.table_name,
  c.column_name IS NOT NULL AS firma_id_exists
FROM tenant_tables tt
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = tt.table_name
 AND c.column_name = 'firma_id'
ORDER BY tt.table_name;
