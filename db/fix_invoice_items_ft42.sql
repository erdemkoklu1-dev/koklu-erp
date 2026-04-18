-- SORUN 1: FT02026000000042 faturasındaki birim_fiyat ve satir_toplam değerleri
-- 1000 kat eksik girilmiş (88.40 yerine 88400, 106.08 yerine 106080 olması lazım)
-- unit_price sütununu 1000 ile çarp; satır toplamını trigger veya sorgu günceller

UPDATE invoice_items
SET unit_price = unit_price * 1000
WHERE invoice_id = (SELECT id FROM invoices WHERE invoice_number = 'FT02026000000042');
