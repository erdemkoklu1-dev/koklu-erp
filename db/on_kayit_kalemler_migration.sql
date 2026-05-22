-- ============================================================
-- ON KAYIT KALEMLER MIGRATION
-- Ön kayıtlara çoklu kalem desteği ekler (JSONB)
-- ============================================================

-- kalemler sütununu ekle (mevcut tek-kalem satırları için varsayılan boş dizi)
ALTER TABLE public.on_kayitlar
  ADD COLUMN IF NOT EXISTS kalemler JSONB DEFAULT '[]'::jsonb;
