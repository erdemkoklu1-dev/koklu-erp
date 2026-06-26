-- =====================================================================
-- RLS Helper Kontrolleri - Sprint 1.6
-- =====================================================================
-- YALNIZCA OKUMA sorgularıdır.
-- Helper fonksiyonları, profil-firma bağlantısını ve tenant test
-- ön koşullarını doğrulamak için hazırlanmıştır.
-- =====================================================================

-- 1. Helper fonksiyon imzaları.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_function_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_firma_id', 'is_super_admin', 'current_user_role', 'current_user_sube_id')
ORDER BY p.proname;

-- 2. Helper fonksiyon kaynakları. Security definer ve auth.uid()
-- kullanımı manuel olarak incelenmelidir.
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_firma_id', 'is_super_admin', 'current_user_role', 'current_user_sube_id')
ORDER BY p.proname;

-- 3. Oturum bağlamında helper çıktıları.
-- Supabase SQL Editor'de auth.uid() çoğu zaman null dönebilir; null sonuç
-- tek başına hata değildir. Authenticated test kullanıcısıyla çalıştırılmalıdır.
SELECT
  auth.uid() AS auth_uid,
  public.current_firma_id() AS current_firma_id,
  public.is_super_admin() AS is_super_admin;

-- 3.1 Opsiyonel helper'lar varsa ayrı çalıştırılmalıdır.
-- Bu fonksiyonlar mevcut değilse aşağıdaki SELECT yorumda kalmalıdır.
-- SELECT
--   public.current_user_role() AS current_user_role,
--   public.current_user_sube_id() AS current_user_sube_id;

-- 4. Kullanıcı profili firma bağlantısı.
SELECT
  kp.id AS user_id,
  kp.firma_id,
  f.ad AS firma_adi,
  r.ad AS rol_adi,
  CASE
    WHEN kp.firma_id IS NULL THEN 'firma_id EKSİK'
    WHEN f.id IS NULL THEN 'firma kaydı YOK'
    ELSE 'tamam'
  END AS durum
FROM public.kullanici_profiller kp
LEFT JOIN public.firmalar f ON f.id = kp.firma_id
LEFT JOIN public.roller r ON r.id = kp.rol_id
ORDER BY durum DESC, rol_adi, user_id;

-- 5. Super Admin dışındaki kullanıcılar firma_id taşımak zorunda.
SELECT
  kp.id AS user_id,
  r.ad AS rol_adi,
  kp.firma_id
FROM public.kullanici_profiller kp
LEFT JOIN public.roller r ON r.id = kp.rol_id
WHERE COALESCE(r.ad, '') <> 'Super Admin'
  AND kp.firma_id IS NULL
ORDER BY kp.id;

-- 6. Şube-firma temel kontrolü.
SELECT
  s.id AS sube_id,
  s.ad AS sube_adi,
  s.firma_id,
  f.ad AS firma_adi,
  CASE
    WHEN s.firma_id IS NULL THEN 'firma_id EKSİK'
    WHEN f.id IS NULL THEN 'firma kaydı YOK'
    ELSE 'tamam'
  END AS durum
FROM public.subeler s
LEFT JOIN public.firmalar f ON f.id = s.firma_id
ORDER BY durum DESC, s.ad;

-- 7. Kullanıcı-şube yetkileri bağlı olduğu şubenin firmasıyla tutarlı mı?
-- Bu kontrol, şube yetkisi tablosu varsa 0 satır dönmelidir.
SELECT
  ksy.kullanici_id,
  ksy.sube_id,
  kp.firma_id AS kullanici_firma_id,
  s.firma_id AS sube_firma_id
FROM public.kullanici_sube_yetkileri ksy
JOIN public.kullanici_profiller kp ON kp.id = ksy.kullanici_id
JOIN public.subeler s ON s.id = ksy.sube_id
LEFT JOIN public.roller r ON r.id = kp.rol_id
WHERE COALESCE(r.ad, '') <> 'Super Admin'
  AND kp.firma_id IS DISTINCT FROM s.firma_id;
