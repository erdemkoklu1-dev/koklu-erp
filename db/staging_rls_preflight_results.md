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
