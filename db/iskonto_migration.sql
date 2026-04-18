-- ============================================================
-- İSKONTO EKLENTİSİ (idempotent)
-- teklif_kalemleri → satır bazlı iskonto %
-- teklifler        → genel iskonto (% veya TL)
-- ============================================================

ALTER TABLE public.teklif_kalemleri
  ADD COLUMN IF NOT EXISTS iskonto numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.teklifler
  ADD COLUMN IF NOT EXISTS genel_iskonto       numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS genel_iskonto_tip   text         NOT NULL DEFAULT 'yuzde'
    CHECK (genel_iskonto_tip IN ('yuzde', 'tl')),
  ADD COLUMN IF NOT EXISTS genel_iskonto_tutar numeric(14,2) NOT NULL DEFAULT 0;
