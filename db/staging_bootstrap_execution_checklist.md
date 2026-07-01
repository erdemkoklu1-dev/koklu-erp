# Staging Bootstrap Execution Checklist

## A. Project

- [ ] Ayrı staging Supabase project oluşturuldu.
- [ ] Project adı production'dan farklı.
- [ ] Project URL production'dan farklı.
- [ ] `.env.local` staging'e ayarlandı.
- [ ] `node scripts/verify-staging-env.mjs` exit 0 döndü.

## B. Schema

- [ ] Migration'lar staging'e uygulandı.
- [ ] `db/staging_schema_required_objects_check.sql` temiz.
- [ ] Kritik tablolar var.
- [ ] Kritik `firma_id` kolonları var.

## C. Auth

- [ ] Staging Auth kullanıcıları manuel oluşturuldu.
- [ ] Auth UUID değerleri not edildi.
- [ ] UUID değerleri hiçbir commit'e yazılmadı.
- [ ] `kullanici_profiller.id = auth.users.id` eşleşmesi yapıldı.

## D. Seed

- [ ] `db/staging_minimal_seed_template.sql` staging'de uyarılar kontrol edilerek çalıştırıldı.
- [ ] Gerçek müşteri/personel verisi kullanılmadı.
- [ ] Her iki firma için test verileri oluştu.
- [ ] `db/staging_seed_verification.sql` temiz.

## E. Preflight

- [ ] `db/staging_rls_preflight_checks.sql` çalıştırıldı.
- [ ] Sonuçlar `db/staging_rls_preflight_results.md` içine işlendi.
- [ ] GO/NO-GO kararı verildi.

## F. RLS Dry-Run Öncesi

Preflight temiz çıkmadan aşağıdakiler çalıştırılmayacak:

- [ ] `db/tenant_rls_helper_upgrade_staging.sql`
- [ ] `db/tenant_rls_staging_cleanup_real.sql`
- [ ] `db/tenant_rls_staging_apply_tenant_policies_real.sql`

## G. Sprint 2.5 Schema Apply Planı

- [ ] `db/staging_migration_inventory.md` okundu.
- [ ] `db/staging_schema_apply_order.md` okundu.
- [ ] `db/staging_schema_apply_checklist.md` hazır.
- [ ] `db/staging_sql_file_safety_matrix.md` review edildi.
- [ ] `db/staging_preflight_go_gate.md` GO demeden RLS dosyaları çalıştırılmadı.
- [ ] Temel tablo migration kaynakları doğrulandı.
