# Staging Preflight Öncesi (SQL Öncesi) Checklist

> Bu checklist, staging'de **herhangi bir RLS SQL dosyası çalıştırılmadan önce** tamamlanmalıdır. Production'da hiçbir adım çalıştırılmaz.

İlk çalıştırılacak SQL `db/staging_rls_preflight_checks.sql`'dir ve yalnızca `SELECT` içerir. Buna geçmeden önce aşağıdakiler doğrulanır.

## 1. Ortam / Env Güvenliği

- [ ] Bağlanılan Supabase projesi **production değil** (Dashboard'da staging proje adı doğrulandı).
- [ ] `.env.local` staging URL/anon key/service role key ile çalışıyor.
- [ ] `node scripts/verify-staging-env.mjs` çalıştırıldı.
- [ ] Script `exit 0` döndü (production hint yakalanmadı).
- [ ] Env switching adımları uygulandı (bkz. `db/staging_env_switching_guide.md`).

> `verify-staging-env.mjs` `exit 1` (production hint) dönerse bu checklist **durur**; preflight SQL çalıştırılmaz.

## 2. Şema Hazırlığı

- [ ] Migration'lar staging'de uygulandı (bkz. `db/staging_project_setup_runbook.md`).
- [ ] `firmalar`, `roller`, `kullanici_profiller`, `subeler` tabloları mevcut.
- [ ] Kritik tenant tablolarında `firma_id` kolonu mevcut.
- [ ] RLS dry-run dosyaları (helper upgrade / cleanup / apply / rollback) **henüz çalıştırılmadı**.

## 3. Seed / Test Verisi

- [ ] En az iki firma var (`koklu-yangin`, `test-yangin`).
- [ ] En az iki aktif kullanıcı var, iki farklı firmada.
- [ ] En az bir `Admin` ve bir tenant kısıtlı kullanıcı var.
- [ ] Her firmada negatif test için yeterli tenant kaydı var.
- [ ] `firma_id` boş kayıt yok.

## 4. Yedek / Geri Dönüş

- [ ] Staging DB snapshot/backup alındı (rollback provası için).
- [ ] Snapshot geri yükleme yönteminin staging'de mümkün olduğu doğrulandı.

## 5. İzinli İlk SQL

Yukarıdaki tüm maddeler işaretliyse, çalıştırılabilecek **tek** dosya:

- `db/staging_rls_preflight_checks.sql` (read-only)

Sonuçlar `db/staging_rls_preflight_results.md` şablonuna işlenir.

## 6. Karar

```txt
[ ] GO     — SQL öncesi tüm kontroller geçti, preflight SQL çalıştırılabilir.
[ ] NO-GO  — Bir veya daha fazla kontrol eksik/başarısız, preflight SQL çalıştırılmaz.
```

Gerekçe:

-

## Sprint 2.4 Schema/Seed Kontrolleri

- [ ] staging_schema_required_objects_check.sql temiz.
- [ ] staging_seed_verification.sql temiz.
- [ ] auth user/profile eşleşmesi doğrulandı.
