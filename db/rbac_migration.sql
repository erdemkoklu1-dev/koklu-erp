-- ══════════════════════════════════════════════
-- RBAC - Rol Tabanlı Erişim Kontrolü Migration
-- ══════════════════════════════════════════════

-- 1. ROLLER
CREATE TABLE IF NOT EXISTS public.roller (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad         varchar(100) NOT NULL UNIQUE,
  aciklama   text,
  renk       varchar(7) NOT NULL DEFAULT '#607D8B',
  created_at timestamptz DEFAULT now()
);

-- 2. KULLANICI PROFİLLERİ
CREATE TABLE IF NOT EXISTS public.kullanici_profiller (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_soyad   varchar(200),
  telefon    varchar(50),
  departman  varchar(100),
  rol_id     uuid REFERENCES public.roller(id),
  aktif      boolean DEFAULT true,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. MODÜL İZİNLERİ
CREATE TABLE IF NOT EXISTS public.modul_izinleri (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_id     uuid NOT NULL REFERENCES public.roller(id) ON DELETE CASCADE,
  modul_adi  varchar(100) NOT NULL,
  okuma      boolean DEFAULT false,
  yazma      boolean DEFAULT false,
  silme      boolean DEFAULT false,
  UNIQUE(rol_id, modul_adi)
);

-- 4. GİRİŞ KAYITLARI
CREATE TABLE IF NOT EXISTS public.giris_kayitlari (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kullanici_id uuid,
  email        varchar(200),
  ad_soyad     varchar(200),
  islem_tipi   varchar(50) NOT NULL CHECK (islem_tipi IN ('giris','cikis','basarisiz_giris')),
  ip_adresi    varchar(50),
  tarayici     text,
  created_at   timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════

ALTER TABLE public.kullanici_profiller ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modul_izinleri      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giris_kayitlari     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roller              ENABLE ROW LEVEL SECURITY;

-- roller: herkes okuyabilir (auth user)
CREATE POLICY "roller_okuma" ON public.roller
  FOR SELECT TO authenticated USING (true);

-- kullanici_profiller: kullanıcı kendi profilini okur; service role tümünü yönetir
CREATE POLICY "kullanici_kendi_profil" ON public.kullanici_profiller
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "kullanici_profil_guncelle" ON public.kullanici_profiller
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- modul_izinleri: authenticated kullanıcılar okuyabilir
CREATE POLICY "modul_izinleri_okuma" ON public.modul_izinleri
  FOR SELECT TO authenticated USING (true);

-- giris_kayitlari: insert için authenticated, select service role
CREATE POLICY "giris_kayit_ekle" ON public.giris_kayitlari
  FOR INSERT TO authenticated WITH CHECK (true);

-- ══════════════════════════════════════════════
-- SEED DATA - ROLLER
-- ══════════════════════════════════════════════

INSERT INTO public.roller (id, ad, aciklama, renk) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin',          'Tüm modüllere tam yetki',                    '#C8102E'),
  ('00000000-0000-0000-0000-000000000002', 'Saha Tekniker',  'Cihaz ve servis form işlemleri',             '#2196F3'),
  ('00000000-0000-0000-0000-000000000003', 'İdari Çalışan',  'Müşteri ve cari hesap işlemleri',            '#4CAF50'),
  ('00000000-0000-0000-0000-000000000004', 'Pazarlamacı',    'Müşteri, teklif ve aracı işlemleri',         '#FF9800'),
  ('00000000-0000-0000-0000-000000000005', 'Fabrika',        'Fabrika ve üretim işlemleri',                '#9C27B0')
ON CONFLICT (ad) DO NOTHING;

-- ══════════════════════════════════════════════
-- SEED DATA - MODÜL İZİNLERİ
-- ══════════════════════════════════════════════

-- Admin: tüm izinler
INSERT INTO public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme) VALUES
  ('00000000-0000-0000-0000-000000000001', 'musteriler',        true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'cihazlar',          true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'servis_formlari',   true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'cari_hesap',        true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'faturalar',         true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'fiyat_teklifleri',  true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'hatirlatmalar',     true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'aracilar',          true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'fabrika',           true, true, true),
  ('00000000-0000-0000-0000-000000000001', 'yonetim',           true, true, true)
ON CONFLICT (rol_id, modul_adi) DO NOTHING;

-- Saha Tekniker
INSERT INTO public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme) VALUES
  ('00000000-0000-0000-0000-000000000002', 'musteriler',        true,  false, false),
  ('00000000-0000-0000-0000-000000000002', 'cihazlar',          true,  true,  false),
  ('00000000-0000-0000-0000-000000000002', 'servis_formlari',   true,  true,  true),
  ('00000000-0000-0000-0000-000000000002', 'hatirlatmalar',     true,  false, false),
  ('00000000-0000-0000-0000-000000000002', 'cari_hesap',        false, false, false),
  ('00000000-0000-0000-0000-000000000002', 'faturalar',         false, false, false),
  ('00000000-0000-0000-0000-000000000002', 'fiyat_teklifleri',  false, false, false),
  ('00000000-0000-0000-0000-000000000002', 'aracilar',          false, false, false),
  ('00000000-0000-0000-0000-000000000002', 'fabrika',           false, false, false),
  ('00000000-0000-0000-0000-000000000002', 'yonetim',           false, false, false)
ON CONFLICT (rol_id, modul_adi) DO NOTHING;

-- İdari Çalışan
INSERT INTO public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme) VALUES
  ('00000000-0000-0000-0000-000000000003', 'musteriler',        true,  true,  false),
  ('00000000-0000-0000-0000-000000000003', 'cari_hesap',        true,  true,  true),
  ('00000000-0000-0000-0000-000000000003', 'faturalar',         true,  true,  true),
  ('00000000-0000-0000-0000-000000000003', 'servis_formlari',   true,  false, false),
  ('00000000-0000-0000-0000-000000000003', 'cihazlar',          false, false, false),
  ('00000000-0000-0000-0000-000000000003', 'fiyat_teklifleri',  false, false, false),
  ('00000000-0000-0000-0000-000000000003', 'hatirlatmalar',     false, false, false),
  ('00000000-0000-0000-0000-000000000003', 'aracilar',          false, false, false),
  ('00000000-0000-0000-0000-000000000003', 'fabrika',           false, false, false),
  ('00000000-0000-0000-0000-000000000003', 'yonetim',           false, false, false)
ON CONFLICT (rol_id, modul_adi) DO NOTHING;

-- Pazarlamacı
INSERT INTO public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme) VALUES
  ('00000000-0000-0000-0000-000000000004', 'musteriler',        true,  true,  false),
  ('00000000-0000-0000-0000-000000000004', 'fiyat_teklifleri',  true,  true,  true),
  ('00000000-0000-0000-0000-000000000004', 'hatirlatmalar',     true,  false, false),
  ('00000000-0000-0000-0000-000000000004', 'aracilar',          true,  true,  false),
  ('00000000-0000-0000-0000-000000000004', 'cihazlar',          false, false, false),
  ('00000000-0000-0000-0000-000000000004', 'servis_formlari',   false, false, false),
  ('00000000-0000-0000-0000-000000000004', 'cari_hesap',        false, false, false),
  ('00000000-0000-0000-0000-000000000004', 'faturalar',         false, false, false),
  ('00000000-0000-0000-0000-000000000004', 'fabrika',           false, false, false),
  ('00000000-0000-0000-0000-000000000004', 'yonetim',           false, false, false)
ON CONFLICT (rol_id, modul_adi) DO NOTHING;

-- Fabrika
INSERT INTO public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme) VALUES
  ('00000000-0000-0000-0000-000000000005', 'fabrika',           true,  true,  true),
  ('00000000-0000-0000-0000-000000000005', 'cihazlar',          true,  false, false),
  ('00000000-0000-0000-0000-000000000005', 'musteriler',        false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'servis_formlari',   false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'cari_hesap',        false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'faturalar',         false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'fiyat_teklifleri',  false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'hatirlatmalar',     false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'aracilar',          false, false, false),
  ('00000000-0000-0000-0000-000000000005', 'yonetim',           false, false, false)
ON CONFLICT (rol_id, modul_adi) DO NOTHING;

-- ══════════════════════════════════════════════
-- Admin kullanıcısına Admin rolü ata
-- (admin@koklu.com auth.users tablosunda mevcutsa)
-- ══════════════════════════════════════════════

INSERT INTO public.kullanici_profiller (id, ad_soyad, rol_id, aktif)
SELECT
  au.id,
  'Admin',
  '00000000-0000-0000-0000-000000000001',
  true
FROM auth.users au
WHERE au.email = 'admin@koklu.com'
ON CONFLICT (id) DO UPDATE SET
  rol_id = '00000000-0000-0000-0000-000000000001';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kullanici_profiller_updated_at ON public.kullanici_profiller;
CREATE TRIGGER kullanici_profiller_updated_at
  BEFORE UPDATE ON public.kullanici_profiller
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
