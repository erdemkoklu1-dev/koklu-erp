-- ============================================================
-- FABRİKA YÖNETİM MODÜLÜ (idempotent — safe to run multiple times)
-- Köklü ERP
-- ============================================================

-- ── 1. HAMMADDELER ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hammaddeler (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ad             text        NOT NULL,
  birim          text        NOT NULL CHECK (birim IN ('kg', 'litre', 'adet', 'm3', 'metre')),
  mevcut_stok    numeric(14,4) NOT NULL DEFAULT 0,
  minimum_stok   numeric(14,4) NOT NULL DEFAULT 0,
  tedarikci_id   uuid        REFERENCES public.tedarikciler(id) ON DELETE SET NULL,
  birim_maliyet  numeric(14,2) NOT NULL DEFAULT 0,
  kategori       text        NOT NULL CHECK (kategori IN ('kimyasal', 'metal', 'plastik', 'gaz', 'diger')),
  notlar         text,
  aktif          boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hammaddeler_ad_key ON public.hammaddeler (ad);
CREATE INDEX IF NOT EXISTS hammaddeler_kategori_idx ON public.hammaddeler (kategori);
CREATE INDEX IF NOT EXISTS hammaddeler_aktif_idx    ON public.hammaddeler (aktif);

ALTER TABLE public.hammaddeler ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access" ON public.hammaddeler;
CREATE POLICY "Service role has full access" ON public.hammaddeler USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.hammaddeler;
CREATE POLICY "Authenticated users" ON public.hammaddeler FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 2. ÜRÜN REÇETELERİ (BOM) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.urun_receteler (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  urun_id      uuid          NOT NULL REFERENCES public.urunler(id) ON DELETE CASCADE,
  hammadde_id  uuid          NOT NULL REFERENCES public.hammaddeler(id) ON DELETE CASCADE,
  miktar       numeric(14,4) NOT NULL,
  birim        text          NOT NULL,
  notlar       text,
  UNIQUE (urun_id, hammadde_id)
);

CREATE INDEX IF NOT EXISTS urun_receteler_urun_idx      ON public.urun_receteler (urun_id);
CREATE INDEX IF NOT EXISTS urun_receteler_hammadde_idx  ON public.urun_receteler (hammadde_id);

ALTER TABLE public.urun_receteler ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access" ON public.urun_receteler;
CREATE POLICY "Service role has full access" ON public.urun_receteler USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.urun_receteler;
CREATE POLICY "Authenticated users" ON public.urun_receteler FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 3. ÜRETİM EMİRLERİ ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uretim_emirleri (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  emir_no              text          NOT NULL UNIQUE,
  urun_id              uuid          NOT NULL REFERENCES public.urunler(id),
  miktar               numeric(14,4) NOT NULL,
  durum                text          NOT NULL DEFAULT 'planlandı'
                         CHECK (durum IN ('planlandı', 'üretimde', 'tamamlandı', 'iptal')),
  planlanan_baslangic  date,
  planlanan_bitis      date,
  gercek_baslangic     timestamptz,
  gercek_bitis         timestamptz,
  sorumlu              text,
  notlar               text,
  created_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uretim_emirleri_durum_idx     ON public.uretim_emirleri (durum);
CREATE INDEX IF NOT EXISTS uretim_emirleri_urun_idx      ON public.uretim_emirleri (urun_id);
CREATE INDEX IF NOT EXISTS uretim_emirleri_created_idx   ON public.uretim_emirleri (created_at DESC);

ALTER TABLE public.uretim_emirleri ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access" ON public.uretim_emirleri;
CREATE POLICY "Service role has full access" ON public.uretim_emirleri USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.uretim_emirleri;
CREATE POLICY "Authenticated users" ON public.uretim_emirleri FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 4. ÜRETİM HAREKETLERİ ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uretim_hareketleri (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  uretim_emri_id    uuid          NOT NULL REFERENCES public.uretim_emirleri(id) ON DELETE CASCADE,
  hammadde_id       uuid          NOT NULL REFERENCES public.hammaddeler(id),
  kullanilan_miktar numeric(14,4) NOT NULL,
  tarih             date          NOT NULL DEFAULT CURRENT_DATE,
  notlar            text
);

CREATE INDEX IF NOT EXISTS uretim_hareketleri_emri_idx     ON public.uretim_hareketleri (uretim_emri_id);
CREATE INDEX IF NOT EXISTS uretim_hareketleri_hammadde_idx ON public.uretim_hareketleri (hammadde_id);

ALTER TABLE public.uretim_hareketleri ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access" ON public.uretim_hareketleri;
CREATE POLICY "Service role has full access" ON public.uretim_hareketleri USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.uretim_hareketleri;
CREATE POLICY "Authenticated users" ON public.uretim_hareketleri FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 5. DEPO HAREKETLERİ ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depo_hareketleri (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  hareket_tipi  text          NOT NULL CHECK (hareket_tipi IN ('giris', 'cikis', 'fire', 'transfer')),
  kaynak        text          NOT NULL CHECK (kaynak IN ('urun', 'hammadde')),
  kaynak_id     uuid          NOT NULL,
  miktar        numeric(14,4) NOT NULL,
  tarih         date          NOT NULL DEFAULT CURRENT_DATE,
  referans_no   text,
  aciklama      text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS depo_hareketleri_kaynak_idx    ON public.depo_hareketleri (kaynak, kaynak_id);
CREATE INDEX IF NOT EXISTS depo_hareketleri_tarih_idx     ON public.depo_hareketleri (tarih DESC);
CREATE INDEX IF NOT EXISTS depo_hareketleri_tip_idx       ON public.depo_hareketleri (hareket_tipi);

ALTER TABLE public.depo_hareketleri ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access" ON public.depo_hareketleri;
CREATE POLICY "Service role has full access" ON public.depo_hareketleri USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.depo_hareketleri;
CREATE POLICY "Authenticated users" ON public.depo_hareketleri FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 6. ÜRÜN STOK ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.urun_stok (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  urun_id     uuid          NOT NULL REFERENCES public.urunler(id) ON DELETE CASCADE UNIQUE,
  stok_adedi  numeric(14,4) NOT NULL DEFAULT 0,
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE public.urun_stok ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role has full access" ON public.urun_stok;
CREATE POLICY "Service role has full access" ON public.urun_stok USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.urun_stok;
CREATE POLICY "Authenticated users" ON public.urun_stok FOR ALL USING (auth.uid() IS NOT NULL);

-- ── SEED: HAMMADDELER ──────────────────────────────────────
INSERT INTO public.hammaddeler (ad, birim, kategori, mevcut_stok, minimum_stok, birim_maliyet) VALUES
  ('KKT Tozu',                  'kg',    'kimyasal', 0, 50,  0),
  ('CO2 Gazı',                  'kg',    'gaz',      0, 20,  0),
  ('Azot Gazı',                 'm3',    'gaz',      0, 10,  0),
  ('Argon Gazı',                'm3',    'gaz',      0, 10,  0),
  ('Çelik Tüp Gövde 1kg',       'adet',  'metal',    0, 10,  0),
  ('Çelik Tüp Gövde 2kg',       'adet',  'metal',    0, 10,  0),
  ('Çelik Tüp Gövde 6kg',       'adet',  'metal',    0, 10,  0),
  ('Çelik Tüp Gövde 9kg',       'adet',  'metal',    0, 10,  0),
  ('Çelik Tüp Gövde 12kg',      'adet',  'metal',    0, 10,  0),
  ('Çelik Tüp Gövde 25kg',      'adet',  'metal',    0,  5,  0),
  ('Çelik Tüp Gövde 50kg',      'adet',  'metal',    0,  5,  0),
  ('KKT Vanası 6-12kg',         'adet',  'metal',    0, 20,  0),
  ('KKT Vanası 25-50kg',        'adet',  'metal',    0, 10,  0),
  ('CO2 Vanası',                'adet',  'metal',    0, 10,  0),
  ('Manometre',                 'adet',  'metal',    0, 20,  0),
  ('KKT Hortumu 6-12kg',        'adet',  'plastik',  0, 20,  0),
  ('CO2 Lans Hortum',           'adet',  'plastik',  0, 10,  0),
  ('Köpük Konsantresi',         'litre', 'kimyasal', 0, 50,  0),
  ('Boya',                      'kg',    'kimyasal', 0, 20,  0),
  ('Etiket/Sertifika',          'adet',  'diger',    0, 100, 0),
  ('Ambalaj Malzemesi',         'adet',  'diger',    0, 50,  0)
ON CONFLICT (ad) DO NOTHING;
