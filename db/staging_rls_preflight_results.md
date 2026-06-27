# Staging RLS Preflight Results

> Bu dosya, staging/local üzerinde `db/staging_rls_preflight_checks.sql` çalıştırıldıktan sonra sonuçların yapıştırılacağı şablondur. Production'da çalıştırılmaz.

## Ortam Bilgisi

| Alan | Değer |
| --- | --- |
| Ortam tipi | Staging / Branch / Local |
| Supabase project adı | |
| Production mı? | Hayır |
| Test tarihi | |
| Test eden | |

## 0. Env Safety Doğrulaması (Sprint 2.2)

`scripts/verify-staging-env.mjs` çıktısı ve manuel ortam kontrolü buraya işlenir. Secret değer yazılmaz; yalnızca maskelenmiş/özet sonuç.

| Kontrol | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| `.env.local` bulundu mu? | Evet | | |
| `NEXT_PUBLIC_SUPABASE_URL` mevcut | Evet | | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` mevcut | Evet | | |
| `SUPABASE_SERVICE_ROLE_KEY` mevcut | Evet | | |
| Production hint yakalandı mı? | Hayır (staging için) | | |
| `verify-staging-env.mjs` exit kodu | 0 (staging) | | |
| Supabase Dashboard project adı production değil | Doğrulandı | | |

> Not: Script production ortamda `exit 1` döner; bu, "ortam production, dry-run yapılmamalı" anlamına gelir ve beklenen güvenlik davranışıdır. Preflight SQL yalnızca exit 0 alındıktan ve manuel doğrulama yapıldıktan sonra çalıştırılır.

## 1. Kritik Tablolar Var mı?

| table_name | table_exists |
| --- | --- |

## 2. firma_id Kolonları Var mı?

| table_name | firma_id_exists |
| --- | --- |

## 3. Helper Fonksiyon Durumu

| function_name | result_type | security_definer | not |
| --- | --- | --- | --- |

## 4. Kullanıcı / Firma / Rol Kontrolü

| id | firma_id | firma_adi | sube_id | sube_adi | aktif | rol_adi |
| --- | --- | --- | --- | --- | --- | --- |

## 5. Fazla İzin Veren Policy Sayısı

| permissive_policy_count |
| --- |

## 6. Preflight Kararı

- [ ] Temiz, helper upgrade aşamasına geçilebilir.
- [ ] Eksikler var, helper upgrade aşamasına geçilmez.
- [ ] Ortam production olabilir, işlem durduruldu.

## Notlar

-
