# Staging First Schema Check Session

> Sprint 2.8 read-only schema check gate kaydıdır. Bu dosya SQL çalıştırmaz; env doğrulama `GO` olmadan schema check başlatılmaz.

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
- [x] `.env.local` git status çıktısında commit adayı değil.

## Oturum Bilgisi

| Alan | Değer |
| --- | --- |
| Tarih | 2026-07-07 |
| Yürüten | Codex |
| Staging project adı | Doğrulanamadı |
| Staging project ref son 4 karakter | Secret/ref kaydı yapılmadı |
| Branch | main |
| Başlangıç saati | Başlatılmadı |
| Bitiş saati | Başlatılmadı |
| Oturum sonucu | NO-GO |

## Read-only Kontrol Kapsamı

| Kontrol | Kaynak | Sonuç | Not |
| --- | --- | --- | --- |
| Kritik tablolar mevcut mu? | `db/staging_schema_required_objects_check.sql` | Çalıştırılmadı | Env gate `NO-GO`. |
| Kritik tablolarda `firma_id` mevcut mu? | `db/staging_schema_required_objects_check.sql` | Çalıştırılmadı | Env gate `NO-GO`. |
| Tenant bütünlüğü read-only kontrol edildi mi? | `db/tenant_audit_checks.sql` | Çalıştırılmadı | Env gate `NO-GO`. |
| Seed/Auth kontrolüne geçmek güvenli mi? | Manuel değerlendirme | Hayır | `.env.local` production hint veriyor. |

## Durdurma Kriterleri

Şu durumlardan biri görülürse oturum durdurulur ve karar `NO-GO` olur:

- Supabase Dashboard project adında production şüphesi.
- `verify-staging-env.mjs` production hint veriyor.
- Çalıştırılacak içerikte read-only olmayan komut var.
- Kritik schema durumu manuel apply sırasını belirsiz hale getiriyor.
- Secret veya gerçek UUID değerinin dokümana yazılması gerekiyor.

## Oturum Sonu

- [x] Sonuçlar `db/staging_schema_apply_results.md` dosyasına işlendi.
- [x] GO/NO-GO kararı `db/staging_preflight_go_gate.md` dosyasına yansıtıldı.
- [ ] Hata veya belirsizlik varsa `db/staging_schema_apply_manual_session.md` notlarına eklendi.
- [x] Secret veya `.env` dosyaları commit'e alınmadı.

## Karar

```txt
[ ] GO     — Manuel schema apply oturumu için mevcut schema durumu kayıt altına alındı.
[x] NO-GO  — Env doğrulama, project ayrımı veya read-only schema kontrolü eksik.
[x] NO-GO  — .env.local hâlâ production.
```

## Oturum Notları

- 2026-07-07: Env doğrulama `NO-GO` olduğu için read-only schema check başlatılmadı. Production veya staging üzerinde SQL çalıştırılmadı.
