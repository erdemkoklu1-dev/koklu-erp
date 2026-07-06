# Staging Schema Apply Results

> Bu dosya staging schema apply denemesi yapıldığında sonuçların işleneceği şablondur. Sprint 2.8 kapsamında SQL çalıştırılmadı.

## Sprint 2.6 Oturum Bağlantıları

| Doküman | Durum | Not |
| --- | --- | --- |
| `db/staging_env_verification_session.md` | NO-GO | Sprint 2.8 env doğrulama production hint yakaladı. |
| `db/staging_schema_apply_manual_session.md` | Başlatılmadı | Env gate `GO` değil. |
| `db/staging_schema_apply_error_log.md` | Güncellenmedi | SQL/apply çalıştırılmadı. |
| `db/staging_schema_apply_next_steps.md` | Güncellenmedi | Sprint 2.8 kapsamı env gate kaydıdır. |

## Sprint 2.7 Oturum Bağlantıları

| Doküman | Durum | Not |
| --- | --- | --- |
| `db/staging_env_verification_session.md` | NO-GO | Env doğrulama sonucunun takip edildiği gate dokümanı. |
| `db/staging_first_schema_check_session.md` | NO-GO | Env gate nedeniyle ilk read-only schema check başlatılmadı. |
| `db/staging_schema_apply_manual_session.md` | Beklemede | Apply öncesi env gate `GO` olmalı. |

## Sprint 2.8 Env PASS Raporu

| Doküman | Durum | Not |
| --- | --- | --- |
| `db/staging_env_pass_report.md` | NO-GO | `verify-staging-env.mjs` production hint yakaladı. |
| `db/staging_env_verification_session.md` | NO-GO | `.env.local` staging olarak doğrulanamadı. |
| `db/staging_first_schema_check_session.md` | Başlatılmadı | Env gate `NO-GO` olduğu için SQL/read-only check yapılmadı. |

## Ortam Bilgisi

| Alan | Değer |
| --- | --- |
| Ortam tipi | Local |
| Supabase project adı | Doğrulanamadı |
| Production mı? | Production hint var |
| Test tarihi | 2026-07-07 |
| Test eden | Codex |
| `verify-staging-env.mjs` exit kodu | 1 |
| Production hint sonucu | `NO-GO: .env.local hâlâ production` |

## Önkoşul Sonucu

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| `.env.local` staging mi? | Hayır | Production hint yakalandı. |
| Temel tablo migration kaynakları doğrulandı mı? | Uygulanmadı | Env gate `NO-GO`. |
| SQL güvenlik matrisi review edildi mi? | Uygulanmadı | Env gate `NO-GO`. |
| Data-fix dosyaları dışarıda mı? | Evet | Çalıştırılmadı. |
| RLS dry-run dosyaları dışarıda mı? | Evet | Çalıştırılmadı. |
| Env doğrulama oturumu GO mu? | Hayır | `db/staging_env_verification_session.md` kararı `NO-GO`. |
| İlk read-only schema check oturumu GO mu? | Hayır | Env gate nedeniyle başlatılmadı. |
| Açık kritik hata var mı? | Evet | `.env.local` production hint veriyor. |

## Apply Faz Sonuçları

| Faz | Durum | Çalıştırılan dosyalar | Hata/Not |
| --- | --- | --- | --- |
| Faz 1 — RBAC | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 2 — Temel tablolar | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 3 — Cari/şube | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 4 — Modüller | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 5 — Broker/aracı cari | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 6 — Tenant hazırlığı | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 7 — Schema doğrulama | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 8 — Seed/Auth | Çalıştırılmadı | Yok | Env gate `NO-GO`. |
| Faz 9 — RLS preflight | Çalıştırılmadı | Yok | Env gate `NO-GO`. |

## Required Objects Check

`db/staging_schema_required_objects_check.sql` sonuçları buraya işlenir.

Sprint 2.8 notu: Env doğrulama `NO-GO` olduğu için read-only schema check dahil hiçbir SQL çalıştırılmadı.

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
- [x] NO-GO — Eksik schema/seed/env var.
- [x] NO-GO — Ortam production olabilir.
- [x] NO-GO — `.env.local` production hint veriyor.

## Sprint 2.6 Hata Özeti

| Hata ID | Faz | Özet | Durum | Sonraki adım |
| --- | --- | --- | --- | --- |
| ENV-2.8-001 | Environment | `.env.local` production hint veriyor. | Açık | Local env staging project değerleriyle güncellenmeli. |

## Notlar

- 2026-07-07 Sprint 2.8: `db/staging_env_pass_report.md` oluşturuldu. `node scripts/verify-staging-env.mjs` production hint yakaladığı için schema apply ve RLS preflight kapalıdır.
