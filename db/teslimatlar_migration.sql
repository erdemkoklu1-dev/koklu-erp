-- ============================================================
-- TESLIMATLAR MODULU (idempotent)
-- Koklu ERP - Teslimat, emanet ve geri teslim takipleri
-- ============================================================

CREATE TABLE IF NOT EXISTS public.teslimatlar (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teslimat_no           text NOT NULL UNIQUE,
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  sube_id               uuid REFERENCES public.subeler(id) ON DELETE SET NULL,
  personel_id           uuid REFERENCES public.personeller(id) ON DELETE SET NULL,
  teslimat_tarihi       date NOT NULL DEFAULT current_date,
  hedef_tarih           date,
  durum                 text NOT NULL DEFAULT 'taslak'
                          CHECK (durum IN ('taslak', 'sevkte', 'tamamlandi', 'iptal')),
  on_kayit_secimi       text NOT NULL DEFAULT 'olusturulmasin'
                          CHECK (on_kayit_secimi IN ('olusturulsun', 'mevcut_kayda_eklensin', 'olusturulmasin')),
  on_kayit_olusturuldu  boolean NOT NULL DEFAULT false,
  aciklama              text,
  notlar                text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teslimatlar
  ADD COLUMN IF NOT EXISTS teslim_form_no text,
  ADD COLUMN IF NOT EXISTS teslim_form_pdf_url text,
  ADD COLUMN IF NOT EXISTS musteri_imza_data text,
  ADD COLUMN IF NOT EXISTS imza_atan_ad_soyad text,
  ADD COLUMN IF NOT EXISTS imza_atan_unvan text,
  ADD COLUMN IF NOT EXISTS imza_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS teslim_form_mail_gonderildi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS teslim_form_mail_tarihi timestamptz;

CREATE TABLE IF NOT EXISTS public.teslimat_kalemleri (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teslimat_id                   uuid NOT NULL REFERENCES public.teslimatlar(id) ON DELETE CASCADE,
  urun_id                       uuid REFERENCES public.urunler(id) ON DELETE SET NULL,
  aciklama                      text NOT NULL,
  hareket_yonu                  text NOT NULL CHECK (hareket_yonu IN ('giden', 'gelen')),
  hareket_tipi                  text NOT NULL CHECK (hareket_tipi IN (
                                  'yeni_cihaz_teslim',
                                  'dolumlu_teslim',
                                  'yenilenmis_teslim',
                                  'yedek_parca_teslim',
                                  'emanet_teslim',
                                  'dolum_icin_alindi',
                                  'bakim_icin_alindi',
                                  'yenileme_icin_alindi',
                                  'emanet_geri_alindi',
                                  'hurda_icin_alindi',
                                  'diger'
                                )),
  miktar                        numeric(14,3) NOT NULL DEFAULT 1,
  birim                         text NOT NULL DEFAULT 'adet',
  birim_fiyat                   numeric(14,2) NOT NULL DEFAULT 0,
  toplam_tutar                  numeric(14,2) NOT NULL DEFAULT 0,
  stoktan_duser_mi              boolean NOT NULL DEFAULT false,
  musteri_envanterine_isler_mi  boolean NOT NULL DEFAULT false,
  emanet_mi                     boolean NOT NULL DEFAULT false,
  geri_alinmasi_gerekir_mi      boolean NOT NULL DEFAULT false,
  hedef_tarih                   date,
  faturalanir_mi                boolean NOT NULL DEFAULT false,
  onceki_kalem_id               uuid REFERENCES public.teslimat_kalemleri(id) ON DELETE SET NULL,
  notlar                        text,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.teslimat_durum_gecmisi (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teslimat_id    uuid NOT NULL REFERENCES public.teslimatlar(id) ON DELETE CASCADE,
  eski_durum     text,
  yeni_durum     text NOT NULL,
  aciklama       text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emanet_takipleri (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teslimat_id       uuid NOT NULL REFERENCES public.teslimatlar(id) ON DELETE CASCADE,
  kalem_id          uuid NOT NULL REFERENCES public.teslimat_kalemleri(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  sube_id           uuid REFERENCES public.subeler(id) ON DELETE SET NULL,
  urun_id           uuid REFERENCES public.urunler(id) ON DELETE SET NULL,
  miktar            numeric(14,3) NOT NULL DEFAULT 1,
  geri_alinan_miktar numeric(14,3) NOT NULL DEFAULT 0,
  hedef_tarih       date,
  durum             text NOT NULL DEFAULT 'acik' CHECK (durum IN ('acik', 'kismi_kapandi', 'kapandi', 'iptal')),
  kapandi_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.geri_teslim_takipleri (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teslimat_id         uuid NOT NULL REFERENCES public.teslimatlar(id) ON DELETE CASCADE,
  kalem_id            uuid NOT NULL REFERENCES public.teslimat_kalemleri(id) ON DELETE CASCADE,
  customer_id         uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  sube_id             uuid REFERENCES public.subeler(id) ON DELETE SET NULL,
  urun_id             uuid REFERENCES public.urunler(id) ON DELETE SET NULL,
  miktar              numeric(14,3) NOT NULL DEFAULT 1,
  teslim_edilen_miktar numeric(14,3) NOT NULL DEFAULT 0,
  hedef_tarih         date,
  durum               text NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor', 'kismi_teslim', 'teslim_edildi', 'iptal')),
  kapandi_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teslimatlar_customer_idx ON public.teslimatlar(customer_id);
CREATE INDEX IF NOT EXISTS teslimatlar_sube_idx ON public.teslimatlar(sube_id);
CREATE INDEX IF NOT EXISTS teslimatlar_durum_idx ON public.teslimatlar(durum);
CREATE INDEX IF NOT EXISTS teslimatlar_tarih_idx ON public.teslimatlar(teslimat_tarihi DESC);
CREATE INDEX IF NOT EXISTS teslimat_kalemleri_teslimat_idx ON public.teslimat_kalemleri(teslimat_id);
CREATE INDEX IF NOT EXISTS teslimat_kalemleri_urun_idx ON public.teslimat_kalemleri(urun_id);
CREATE INDEX IF NOT EXISTS emanet_takipleri_durum_idx ON public.emanet_takipleri(durum);
CREATE INDEX IF NOT EXISTS geri_teslim_takipleri_durum_idx ON public.geri_teslim_takipleri(durum);
CREATE INDEX IF NOT EXISTS geri_teslim_takipleri_hedef_idx ON public.geri_teslim_takipleri(hedef_tarih);

ALTER TABLE public.teslimatlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teslimat_kalemleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teslimat_durum_gecmisi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emanet_takipleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geri_teslim_takipleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access" ON public.teslimatlar;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimat_kalemleri;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimat_durum_gecmisi;
DROP POLICY IF EXISTS "Service role has full access" ON public.emanet_takipleri;
DROP POLICY IF EXISTS "Service role has full access" ON public.geri_teslim_takipleri;

CREATE POLICY "Service role has full access" ON public.teslimatlar USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access" ON public.teslimat_kalemleri USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access" ON public.teslimat_durum_gecmisi USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access" ON public.emanet_takipleri USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access" ON public.geri_teslim_takipleri USING (true) WITH CHECK (true);
