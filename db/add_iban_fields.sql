-- Müşteri tablosuna IBAN ve banka bilgileri ekle
-- Supabase SQL Editor'da çalıştırın

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS bank_name text;
