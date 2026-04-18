-- ============================================================
-- hatirlatma_kayitlari: planli_gonderim_zamani sütunu ekle
-- Supabase SQL Editor'de çalıştırın.
-- ============================================================

-- 1. Sütunu ekle (zaten varsa hata vermez)
ALTER TABLE public.hatirlatma_kayitlari
  ADD COLUMN IF NOT EXISTS planli_gonderim_zamani timestamptz;

-- 2. durum check kısıtını 'planlandı' dahil edecek şekilde güncelle
ALTER TABLE public.hatirlatma_kayitlari
  DROP CONSTRAINT IF EXISTS hatirlatma_kayitlari_durum_check;

ALTER TABLE public.hatirlatma_kayitlari
  ADD CONSTRAINT hatirlatma_kayitlari_durum_check
  CHECK (durum IN ('bekliyor', 'gonderildi', 'hata', 'planlandı'));

-- 3. Performans indeksi
CREATE INDEX IF NOT EXISTS hatirlatma_kayitlari_planli_idx
  ON public.hatirlatma_kayitlari (planli_gonderim_zamani)
  WHERE planli_gonderim_zamani IS NOT NULL;
