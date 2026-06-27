# Staging Manuel Auth Kullanıcı Kurulumu

> Yalnızca staging Supabase projesi içindir. Production Auth üzerinde kullanıcı oluşturulmaz/değiştirilmez. Şifreler hiçbir dokümana veya commit'e yazılmaz.

`kullanici_profiller.id`, `auth.users(id)`'ye foreign key'dir. Bu yüzden önce Supabase Auth'ta kullanıcı oluşturulur, sonra profil satırı bu UUID ile eşlenir.

## 1. Gerekli Kullanıcılar

Tenant izolasyon testi için en az iki kullanıcı:

| Kullanıcı | Firma | Rol | Amaç |
| --- | --- | --- | --- |
| staging-koklu@example.com | koklu-yangin | Admin | Geniş yetkili kullanıcı testi |
| staging-test@example.com | test-yangin | Saha Tekniker (veya normal rol) | Tenant kısıtlı kullanıcı testi |

> E-posta adresleri sahte/test amaçlıdır. Gerçek kullanıcı e-postası kullanılmaz.

## 2. Auth Kullanıcısı Oluştur (Dashboard)

Her kullanıcı için:

1. Supabase Dashboard → **Authentication → Users** (staging projesinde olduğunu doğrula).
2. **Add user → Create new user**.
3. E-posta ve geçici şifre gir. "Auto confirm user" seçeneğini işaretle (e-posta doğrulamasını atlamak için).
4. Oluşan kullanıcının **UUID**'sini not et (bu secret değildir ama commit'e yazma).

Şifreler not defterinde/commit'te tutulmaz; yalnızca staging testini yapan kişide kalır.

## 3. Profil Satırını Eşle

Auth kullanıcısı oluştuktan sonra `kullanici_profiller` satırını oluştur/eşle:

```sql
-- STAGING ONLY
-- <KOKLU_USER_UUID> Auth'tan alınan gerçek UUID'dir.
INSERT INTO public.kullanici_profiller (id, ad_soyad, rol_id, aktif, firma_id)
VALUES (
  '<KOKLU_USER_UUID>',
  'Staging Köklü Admin',
  '00000000-0000-0000-0000-000000000001', -- Admin rol_id
  true,
  (SELECT id FROM public.firmalar WHERE slug = 'koklu-yangin')
)
ON CONFLICT (id) DO UPDATE SET
  rol_id = EXCLUDED.rol_id,
  aktif = true,
  firma_id = EXCLUDED.firma_id;

-- Normal (tenant kısıtlı) kullanıcı
INSERT INTO public.kullanici_profiller (id, ad_soyad, rol_id, aktif, firma_id)
VALUES (
  '<TEST_USER_UUID>',
  'Staging Test Kullanıcı',
  '00000000-0000-0000-0000-000000000002', -- Saha Tekniker rol_id
  true,
  (SELECT id FROM public.firmalar WHERE slug = 'test-yangin')
)
ON CONFLICT (id) DO UPDATE SET
  rol_id = EXCLUDED.rol_id,
  aktif = true,
  firma_id = EXCLUDED.firma_id;
```

> Rol UUID'leri `db/rbac_migration.sql` seed değerleridir (Admin = `...0001`, Saha Tekniker = `...0002`).

## 4. Doğrulama

```sql
-- STAGING ONLY
SELECT kp.id, kp.ad_soyad, kp.aktif, f.slug AS firma, r.ad AS rol
FROM public.kullanici_profiller kp
LEFT JOIN public.firmalar f ON f.id = kp.firma_id
LEFT JOIN public.roller r ON r.id = kp.rol_id
ORDER BY f.slug;
```

Beklenen:

- En az iki kullanıcı, iki farklı firmaya bağlı.
- Biri `Admin`, diğeri tenant kısıtlı rolde.
- İkisi de `aktif = true`.

## 5. Güvenlik Notları

- Bu adımlar yalnızca staging Auth üzerinde yapılır.
- Production Auth kullanıcılarına dokunulmaz.
- Şifre/secret commit edilmez.
- UUID'ler örnek doldurma için kullanılabilir ama gerçek değerler `<...>` placeholder olarak bırakılır.
