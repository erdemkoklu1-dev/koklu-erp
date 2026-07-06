# Staging Schema Apply Results

> Bu dosya staging schema apply denemesi yapıldığında sonuçların işleneceği şablondur. Sprint 2.7 kapsamında SQL çalıştırılmadı.

## Sprint 2.6 Oturum Bağlantıları

| Doküman | Durum | Not |
| --- | --- | --- |
| `db/staging_env_verification_session.md` | | |
| `db/staging_schema_apply_manual_session.md` | | |
| `db/staging_schema_apply_error_log.md` | | |
| `db/staging_schema_apply_next_steps.md` | | |

## Sprint 2.7 Oturum Bağlantıları

| Doküman | Durum | Not |
| --- | --- | --- |
| `db/staging_env_verification_session.md` | | Env doğrulama sonucunun takip edildiği gate dokümanı. |
| `db/staging_first_schema_check_session.md` | | İlk read-only schema check oturum kaydı. |
| `db/staging_schema_apply_manual_session.md` | | Apply öncesi read-only check bağlantısı eklendi. |

## Ortam Bilgisi

| Alan | Değer |
| --- | --- |
| Ortam tipi | Staging / Branch / Local |
| Supabase project adı | |
| Production mı? | Hayır |
| Test tarihi | |
| Test eden | |
| `verify-staging-env.mjs` exit kodu | |
| Production hint sonucu | |

## Önkoşul Sonucu

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| `.env.local` staging mi? | | |
| Temel tablo migration kaynakları doğrulandı mı? | | |
| SQL güvenlik matrisi review edildi mi? | | |
| Data-fix dosyaları dışarıda mı? | | |
| RLS dry-run dosyaları dışarıda mı? | | |
| Env doğrulama oturumu GO mu? | | |
| İlk read-only schema check oturumu GO mu? | | |
| Açık kritik hata var mı? | | |

## Apply Faz Sonuçları

| Faz | Durum | Çalıştırılan dosyalar | Hata/Not |
| --- | --- | --- | --- |
| Faz 1 — RBAC | | | |
| Faz 2 — Temel tablolar | | | |
| Faz 3 — Cari/şube | | | |
| Faz 4 — Modüller | | | |
| Faz 5 — Broker/aracı cari | | | |
| Faz 6 — Tenant hazırlığı | | | |
| Faz 7 — Schema doğrulama | | | |
| Faz 8 — Seed/Auth | | | |
| Faz 9 — RLS preflight | | | |

## Required Objects Check

`db/staging_schema_required_objects_check.sql` sonuçları buraya işlenir.

Sprint 2.7 notu: İlk kontrol sadece read-only schema check oturumunda kayıt altına alınır; bu dokümantasyon sprintinde production veya staging üzerinde SQL çalıştırılmadı.

| table_name | table_exists |
| --- | --- |

| table_name | firma_id_exists |
| --- | --- |

## Seed Verification

`db/staging_seed_verification.sql` sonuçları buraya işlenir.

| kontrol | sonuc |
| --- | --- |

## Karar

- [ ] GO — RLS preflight aşamasına geçilebilir.
- [ ] NO-GO — Eksik schema/seed/env var.
- [ ] NO-GO — Ortam production olabilir.
- [ ] NO-GO — `.env.local` production hint veriyor.

## Sprint 2.6 Hata Özeti

| Hata ID | Faz | Özet | Durum | Sonraki adım |
| --- | --- | --- | --- | --- |
| | | | | |

## Notlar

-
