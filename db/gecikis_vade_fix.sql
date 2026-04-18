-- ============================================================
-- GECİKMİŞ FATURALAR VADE DÜZELTMESİ
-- Vade tarihi NULL olan alış faturalarını fatura tarihiyle doldur
-- Supabase SQL Editor'da çalıştırın
-- ============================================================

UPDATE public.invoices
SET due_date = invoice_date
WHERE due_date IS NULL
  AND invoice_date IS NOT NULL
  AND invoice_type = 'alis';

-- Kaç kayıt güncellendi kontrol:
-- SELECT COUNT(*) FROM invoices WHERE due_date = invoice_date AND invoice_type = 'alis';
