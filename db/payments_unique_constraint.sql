-- SORUN 2: Çift ödeme kaydını önlemek için payments tablosuna unique constraint
-- Aynı fatura, aynı tutar, aynı tarih kombinasyonu tekrar eklenemez

ALTER TABLE payments
  ADD CONSTRAINT payments_no_dup
  UNIQUE (invoice_id, amount, payment_date);

-- Eğer mevcut duplikasyonlar varsa önce temizle:
-- DELETE FROM payments
-- WHERE id NOT IN (
--   SELECT MIN(id)
--   FROM payments
--   GROUP BY invoice_id, amount, payment_date
-- );
