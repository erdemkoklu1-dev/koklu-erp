-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Helper fonksiyon iyileştirme denemesi içindir.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.current_firma_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kp.firma_id
  FROM public.kullanici_profiller kp
  WHERE kp.id = auth.uid()
    AND kp.aktif = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kullanici_profiller kp
    JOIN public.roller r ON r.id = kp.rol_id
    WHERE kp.id = auth.uid()
      AND kp.aktif = true
      AND lower(coalesce(r.ad, '')) IN (
        'super admin',
        'super_admin',
        'admin',
        'sistem yöneticisi'
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.ad
  FROM public.kullanici_profiller kp
  LEFT JOIN public.roller r ON r.id = kp.rol_id
  WHERE kp.id = auth.uid()
    AND kp.aktif = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_sube_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kp.sube_id
  FROM public.kullanici_profiller kp
  WHERE kp.id = auth.uid()
    AND kp.aktif = true
  LIMIT 1
$$;
