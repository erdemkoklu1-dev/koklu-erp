# Staging Preflight GO Gate

> Bu gate geçmeden RLS helper, cleanup veya tenant policy apply dosyaları çalıştırılmaz. Sprint 2.8 kapsamında SQL çalıştırılmadı.

## Sprint 2.6 Ön Gate

- [ ] `db/staging_env_verification_session.md` GO.
- [ ] `db/staging_schema_apply_manual_session.md` tamamlandı.
- [ ] `db/staging_schema_apply_results.md` sonuçları işlendi.
- [ ] `db/staging_schema_apply_error_log.md` içinde açık kritik hata yok.
- [ ] `db/staging_schema_apply_next_steps.md` GO/NO-GO kararı güncel.

## Sprint 2.7 Ön Gate

- [ ] `db/staging_env_verification_session.md` sonucu güncel.
- [ ] `db/staging_first_schema_check_session.md` hazır.
- [ ] İlk read-only schema check sonucu `db/staging_schema_apply_results.md` içine işlenecek.
- [x] Env doğrulama `NO-GO` ise schema apply başlatılmayacak.
- [x] Production hint varsa karar `NO-GO: .env.local hâlâ production`.

## Sprint 2.8 Env PASS Gate

- [x] `db/staging_env_pass_report.md` oluşturuldu.
- [x] `node scripts/verify-staging-env.mjs` çalıştırıldı.
- [x] Production hint yakalandı.
- [x] Karar `NO-GO: .env.local hâlâ production` olarak kaydedildi.
- [x] Production veya staging üzerinde SQL çalıştırılmadı.
- [x] RLS/policy/veri değişikliği yapılmadı.

## 1. Environment Gate

- [ ] `.env.local` staging Supabase project'e bağlı.
- [ ] `node scripts/verify-staging-env.mjs` exit 0 döndü.
- [ ] Production hint yakalanmadı.
- [ ] Supabase Dashboard project adı production değil.
- [x] Secret/key değerleri dokümana veya commit'e yazılmadı.

## 2. Schema Source Gate

- [ ] `customers` temel migration kaynağı doğrulandı.
- [ ] `devices` temel migration kaynağı doğrulandı.
- [ ] `service_forms` temel migration kaynağı doğrulandı.
- [ ] `service_form_items` temel migration kaynağı doğrulandı.
- [x] Eksik kaynak veya env `NO-GO` varsa karar `NO-GO`.

## 3. Apply Safety Gate

- [ ] `db/staging_migration_inventory.md` review edildi.
- [ ] `db/staging_schema_apply_order.md` review edildi.
- [ ] `db/staging_sql_file_safety_matrix.md` review edildi.
- [x] Data-fix dosyaları çalıştırılmadı.
- [x] RLS dry-run/apply/rollback dosyaları çalıştırılmadı.
- [x] Production/read-only koleksiyon dosyaları apply sırasına alınmadı.

## 4. Schema Verification Gate

- [ ] `db/staging_schema_required_objects_check.sql` tüm kritik tabloları var gösterdi.
- [ ] Kritik tenant tablolarında `firma_id` mevcut.
- [ ] `db/tenant_audit_checks.sql` sonuçlarında tenant bütünlüğü temiz.
- [ ] İlk read-only schema check oturumu `GO`.

## 5. Seed/Auth Gate

- [ ] Staging Auth kullanıcıları manuel oluşturuldu.
- [ ] Auth UUID değerleri commit edilmedi.
- [ ] `kullanici_profiller.id = auth.users.id` eşleşmesi doğrulandı.
- [ ] Minimal anonim seed staging'de gerçek veri içermeden uygulandı.
- [ ] `db/staging_seed_verification.sql` temiz.

## 6. Karar

```txt
[ ] GO     — RLS preflight çalıştırılabilir.
[x] NO-GO  — Env, schema, seed veya güvenlik matrisi eksik.
[x] NO-GO  — .env.local hâlâ production.
```

## Sprint 2.5 Varsayılan Karar

Bu dokümantasyon sprintinde SQL çalıştırılmadı. Mevcut local env production hint verirse karar:

```txt
NO-GO: .env.local hâlâ production
```

## Sprint 2.6 Varsayılan Karar

Bu sprint dokümantasyon ve oturum hazırlığı sprintidir. Production veya staging üzerinde SQL çalıştırılmadıysa ve staging env henüz doğrulanmadıysa karar:

```txt
NO-GO: staging env doğrulama oturumu bekleniyor
```

## Sprint 2.7 Varsayılan Karar

Bu sprint env doğrulama sonucunu takip eden oturum dosyalarını ve ilk read-only schema check oturum dosyasını hazırlar. Production veya staging üzerinde SQL çalıştırılmadıysa ve env doğrulama sonucu henüz `GO` değilse karar:

```txt
NO-GO: staging env doğrulama sonucu bekleniyor
```

## Sprint 2.8 Kararı

`node scripts/verify-staging-env.mjs` production hint yakaladığı için güncel karar:

```txt
NO-GO: .env.local hâlâ production
```
