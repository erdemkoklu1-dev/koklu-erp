# Staging First Schema Check Session

> Sprint 2.7 read-only schema check oturum şablonudur. Bu dosya SQL çalıştırmaz; staging SQL Editor'da yapılacak ilk read-only kontrolün kayıt formudur.

## Amaç

Staging project açıldıktan ve env doğrulama oturumu `GO` olduktan sonra, schema apply öncesi mevcut staging schema durumunu read-only olarak kayıt altına almak.

## Kesin Kurallar

- Production Supabase SQL Editor açılmaz.
- Staging project doğrulanmadan SQL çalıştırılmaz.
- Bu oturumda yalnızca read-only `SELECT` / metadata kontrol sorguları değerlendirilebilir.
- `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `GRANT`, `REVOKE`, `POLICY`, `ENABLE RLS` veya benzeri değişiklik komutları çalıştırılmaz.
- RLS helper, cleanup, policy apply, rollback, seed veya data-fix dosyaları çalıştırılmaz.
- Secret, anon key, service role key, database password veya Auth UUID değerleri bu dosyaya yazılmaz.

## Başlamadan Önce

- [ ] `db/staging_env_verification_session.md` kararı `GO`.
- [ ] `node scripts/verify-staging-env.mjs` exit 0 döndü.
- [ ] Production hint yakalanmadı.
- [ ] Supabase Dashboard'da görünen project adı production değil.
- [ ] Project ref production ref değerinden farklı.
- [ ] `.env.local` git status çıktısında commit adayı değil.

## Oturum Bilgisi

| Alan | Değer |
| --- | --- |
| Tarih | |
| Yürüten | |
| Staging project adı | |
| Staging project ref son 4 karakter | |
| Branch | |
| Başlangıç saati | |
| Bitiş saati | |
| Oturum sonucu | GO / NO-GO / DURDURULDU |

## Read-only Kontrol Kapsamı

| Kontrol | Kaynak | Sonuç | Not |
| --- | --- | --- | --- |
| Kritik tablolar mevcut mu? | `db/staging_schema_required_objects_check.sql` | | |
| Kritik tablolarda `firma_id` mevcut mu? | `db/staging_schema_required_objects_check.sql` | | |
| Tenant bütünlüğü read-only kontrol edildi mi? | `db/tenant_audit_checks.sql` | | |
| Seed/Auth kontrolüne geçmek güvenli mi? | Manuel değerlendirme | | |

## Durdurma Kriterleri

Şu durumlardan biri görülürse oturum durdurulur ve karar `NO-GO` olur:

- Supabase Dashboard project adında production şüphesi.
- `verify-staging-env.mjs` production hint veriyor.
- Çalıştırılacak içerikte read-only olmayan komut var.
- Kritik schema durumu manuel apply sırasını belirsiz hale getiriyor.
- Secret veya gerçek UUID değerinin dokümana yazılması gerekiyor.

## Oturum Sonu

- [ ] Sonuçlar `db/staging_schema_apply_results.md` dosyasına işlendi.
- [ ] GO/NO-GO kararı `db/staging_preflight_go_gate.md` dosyasına yansıtıldı.
- [ ] Hata veya belirsizlik varsa `db/staging_schema_apply_manual_session.md` notlarına eklendi.
- [ ] Secret veya `.env` dosyaları commit'e alınmadı.

## Karar

```txt
[ ] GO     — Manuel schema apply oturumu için mevcut schema durumu kayıt altına alındı.
[ ] NO-GO  — Env doğrulama, project ayrımı veya read-only schema kontrolü eksik.
[ ] NO-GO  — .env.local hâlâ production.
```

## Oturum Notları

-
