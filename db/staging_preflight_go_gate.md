# Staging Preflight GO Gate

> Bu gate geçmeden RLS helper, cleanup veya tenant policy apply dosyaları çalıştırılmaz. Sprint 2.5 kapsamında SQL çalıştırılmadı.

## 1. Environment Gate

- [ ] `.env.local` staging Supabase project'e bağlı.
- [ ] `node scripts/verify-staging-env.mjs` exit 0 döndü.
- [ ] Supabase Dashboard project adı production değil.
- [ ] Secret/key değerleri dokümana veya commit'e yazılmadı.

## 2. Schema Source Gate

- [ ] `customers` temel migration kaynağı doğrulandı.
- [ ] `devices` temel migration kaynağı doğrulandı.
- [ ] `service_forms` temel migration kaynağı doğrulandı.
- [ ] `service_form_items` temel migration kaynağı doğrulandı.
- [ ] Eksik kaynak varsa karar `NO-GO`.

## 3. Apply Safety Gate

- [ ] `db/staging_migration_inventory.md` review edildi.
- [ ] `db/staging_schema_apply_order.md` review edildi.
- [ ] `db/staging_sql_file_safety_matrix.md` review edildi.
- [ ] Data-fix dosyaları çalıştırılmadı.
- [ ] RLS dry-run/apply/rollback dosyaları çalıştırılmadı.
- [ ] Production/read-only koleksiyon dosyaları apply sırasına alınmadı.

## 4. Schema Verification Gate

- [ ] `db/staging_schema_required_objects_check.sql` tüm kritik tabloları var gösterdi.
- [ ] Kritik tenant tablolarında `firma_id` mevcut.
- [ ] `db/tenant_audit_checks.sql` sonuçlarında tenant bütünlüğü temiz.

## 5. Seed/Auth Gate

- [ ] Staging Auth kullanıcıları manuel oluşturuldu.
- [ ] Auth UUID değerleri commit edilmedi.
- [ ] `kullanici_profiller.id = auth.users.id` eşleşmesi doğrulandı.
- [ ] Minimal anonim seed staging'de gerçek veri içermeden uygulandı.
- [ ] `db/staging_seed_verification.sql` temiz.

## 6. Karar

```txt
[ ] GO     — RLS preflight çalıştırılabilir.
[ ] NO-GO  — Env, schema, seed veya güvenlik matrisi eksik.
```

## Sprint 2.5 Varsayılan Karar

Bu dokümantasyon sprintinde SQL çalıştırılmadı. Mevcut local env production hint verirse karar:

```txt
NO-GO: .env.local hâlâ production
```
