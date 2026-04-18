-- devices tablosuna quantity kolonu ekle (yoksa)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
