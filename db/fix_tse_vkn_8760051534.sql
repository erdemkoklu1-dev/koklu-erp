-- ============================================================
-- TSE VKN DÜZELTME: 8760051534
-- TÜRK STANDARDLARI ENSTİTÜSÜ yanlışlıkla başka bir firma olarak kayıtlı
-- Supabase SQL Editor'da çalıştırın
-- ============================================================

-- 1. Mevcut durumu gör
SELECT id, supplier_name, supplier_tax_no, invoice_number, invoice_date
FROM invoices
WHERE supplier_tax_no = '8760051534'
ORDER BY invoice_date DESC;

-- 2. VKN 8760051534 hangi müşteri/tedarikçi olarak kayıtlı?
SELECT id, full_name, tax_number, city
FROM customers
WHERE tax_number = '8760051534';

SELECT id, firma_adi, vergi_no, sehir
FROM tedarikciler
WHERE vergi_no = '8760051534';

-- 3. Migros'un gerçek VKN'si ne? (6220529513 olmalı)
SELECT id, supplier_name, supplier_tax_no
FROM invoices
WHERE supplier_name ILIKE '%migros%'
ORDER BY invoice_date DESC
LIMIT 5;

-- ============================================================
-- DÜZELTME: VKN 8760051534 ile kayıtlı faturaların supplier_name'ini
-- düzeltin (gerçek sonuca göre aşağıyı uyarlayın)
-- ============================================================

-- Eğer VKN 8760051534 = TSE ise, yanlış supplier_name olan faturaları düzelt:
-- UPDATE invoices
-- SET supplier_name = 'TÜRK STANDARDLARI ENSTİTÜSÜ'
-- WHERE supplier_tax_no = '8760051534'
--   AND supplier_name NOT ILIKE '%standar%'
--   AND supplier_name NOT ILIKE '%TSE%';
