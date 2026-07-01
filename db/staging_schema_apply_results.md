# Staging Schema Apply Results

> Bu dosya staging schema apply denemesi yapıldığında sonuçların işleneceği şablondur. Sprint 2.5 kapsamında SQL çalıştırılmadı.

## Ortam Bilgisi

| Alan | Değer |
| --- | --- |
| Ortam tipi | Staging / Branch / Local |
| Supabase project adı | |
| Production mı? | Hayır |
| Test tarihi | |
| Test eden | |
| `verify-staging-env.mjs` exit kodu | |

## Önkoşul Sonucu

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| `.env.local` staging mi? | | |
| Temel tablo migration kaynakları doğrulandı mı? | | |
| SQL güvenlik matrisi review edildi mi? | | |
| Data-fix dosyaları dışarıda mı? | | |
| RLS dry-run dosyaları dışarıda mı? | | |

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

## Notlar

-
