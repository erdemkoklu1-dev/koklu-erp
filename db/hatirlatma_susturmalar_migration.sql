-- ============================================================
-- HATIRLATMA SUSTURMALAR + PLANLI GÖNDERİM (idempotent)
-- ============================================================

-- 1. Susturulan müşteriler tablosu
CREATE TABLE IF NOT EXISTS public.hatirlatma_susturmalar (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  musteri_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hatirlatma_susturmalar_musteri_uniq
  ON public.hatirlatma_susturmalar (musteri_id);

ALTER TABLE public.hatirlatma_susturmalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access" ON public.hatirlatma_susturmalar;
CREATE POLICY "Service role has full access" ON public.hatirlatma_susturmalar
  USING (true) WITH CHECK (true);

-- 2. hatirlatma_kayitlari'na planli_gonderim_zamani sütunu ekle
ALTER TABLE public.hatirlatma_kayitlari
  ADD COLUMN IF NOT EXISTS planli_gonderim_zamani timestamptz;

-- 3. durum check kısıtını 'planlandı' içerecek şekilde güncelle
ALTER TABLE public.hatirlatma_kayitlari
  DROP CONSTRAINT IF EXISTS hatirlatma_kayitlari_durum_check;

ALTER TABLE public.hatirlatma_kayitlari
  ADD CONSTRAINT hatirlatma_kayitlari_durum_check
  CHECK (durum IN ('bekliyor', 'gonderildi', 'hata', 'planlandı'));

-- İndeksler
CREATE INDEX IF NOT EXISTS hatirlatma_kayitlari_planli_idx
  ON public.hatirlatma_kayitlari (planli_gonderim_zamani)
  WHERE planli_gonderim_zamani IS NOT NULL;
