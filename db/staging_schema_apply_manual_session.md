# Staging Schema Apply Manual Session

> Sprint 2.6 manuel oturum şablonudur. Bu dosya SQL çalıştırmaz; staging SQL Editor'da yapılacak manuel işlemin kayıt formudur.

## Amaç

Staging schema apply oturumunu kontrollü, faz bazlı ve geri izlenebilir hale getirmek.

## Kesin Kurallar

- Production Supabase SQL Editor açılmaz.
- Staging project doğrulanmadan SQL çalıştırılmaz.
- RLS helper, cleanup, policy apply veya rollback dosyaları bu oturumda çalıştırılmaz.
- Data-fix dosyaları bu oturumda çalıştırılmaz.
- Secret ve `.env` değerleri kayıt altına alınmaz.

## Başlamadan Önce

- [ ] `db/staging_env_verification_session.md` GO.
- [ ] `db/staging_schema_apply_order.md` okundu.
- [ ] `db/staging_schema_apply_checklist.md` A, B ve C bölümleri tamam.
- [ ] `db/staging_sql_file_safety_matrix.md` review edildi.
- [ ] Temel tablo migration kaynakları doğrulandı.
- [ ] Supabase Dashboard'da görünen project production değil.

## Oturum Bilgisi

| Alan | Değer |
| --- | --- |
| Tarih | |
| Yürüten | |
| Staging project adı | |
| Başlangıç saati | |
| Bitiş saati | |
| Oturum sonucu | GO / NO-GO / DURDURULDU |

## Faz Bazlı Uygulama Kaydı

| Faz | Dosya(lar) | Başladı | Bitti | Sonuç | Hata log referansı |
| --- | --- | --- | --- | --- | --- |
| Faz 1 — Auth/RBAC temeli | | | | | |
| Faz 2 — Temel operasyon tabloları | | | | | |
| Faz 3 — Cari ve şube omurgası | | | | | |
| Faz 4 — Modül migration'ları | | | | | |
| Faz 5 — Broker ve aracı cari | | | | | |
| Faz 6 — Tenant hazırlığı | | | | | |
| Faz 7 — Schema doğrulama | | | | | |
| Faz 8 — Seed/Auth | | | | | |
| Faz 9 — RLS preflight hazırlığı | | | | | |

## Durdurma Kriterleri

Şu durumlardan biri görülürse oturum durdurulur ve `db/staging_schema_apply_error_log.md` güncellenir:

- Supabase Dashboard project adında production şüphesi.
- `verify-staging-env.mjs` production hint veriyor.
- Temel tablo migration kaynağı eksik.
- SQL dosyası beklenmeyen DML, RLS/policy veya production-only içerik taşıyor.
- Migration hatası sonraki fazın güvenli uygulanmasını belirsiz hale getiriyor.

## Oturum Sonu

- [ ] Sonuçlar `db/staging_schema_apply_results.md` dosyasına işlendi.
- [ ] Hatalar `db/staging_schema_apply_error_log.md` dosyasına işlendi.
- [ ] Sonraki aksiyonlar `db/staging_schema_apply_next_steps.md` dosyasına işlendi.
- [ ] `.env` veya secret dosyaları commit'e alınmadı.

## Notlar

-
