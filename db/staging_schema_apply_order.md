# Staging Schema Apply Order

> Sprint 2.5 planıdır. Bu dosya SQL çalıştırmaz. Production veya staging üzerinde işlem yapılmadı.

## Sprint 2.6 Oturum Notu

Staging project açıldıktan sonra bu sıra doğrudan uygulanmaz; önce Sprint 2.6 oturum dokümanları doldurulur:

1. `db/staging_env_verification_session.md`
2. `db/staging_schema_apply_manual_session.md`
3. `db/staging_schema_apply_error_log.md`
4. `db/staging_schema_apply_next_steps.md`

`db/staging_env_verification_session.md` GO olmadan manuel schema apply oturumu başlatılmaz. Production hint yakalanırsa karar `NO-GO: .env.local hâlâ production` olur.

## Ana Kural

Staging schema apply başlamadan önce şu iki koşul sağlanmalıdır:

1. `.env.local` staging project'e bağlı ve `node scripts/verify-staging-env.mjs` exit 0 dönmüş olmalı.
2. `customers`, `devices`, `service_forms`, `service_form_items` temel tablolarının migration kaynağı doğrulanmış olmalı.
3. Sprint 2.6 manuel oturum kaydı `db/staging_schema_apply_manual_session.md` içinde başlatılmış olmalı.

Repo içindeki `db/*.sql` envanterinde bu dört temel tablo için açık `CREATE TABLE` dosyası bulunamadığı için bu plan şimdilik **NO-GO gate** içerir.

## Önerilen Apply Fazları

### Faz 0 — Ortam ve Kaynak Doğrulama

Çalıştırma yok; sadece kontrol:

1. `node scripts/verify-staging-env.mjs`
2. Supabase Dashboard project adı production'dan farklı mı?
3. Temel tablo migration kaynağı var mı?
4. `db/staging_sql_file_safety_matrix.md` review edildi mi?
5. `db/staging_env_verification_session.md` GO mu?
6. `db/staging_schema_apply_error_log.md` içinde açık kritik hata var mı?

### Faz 1 — Auth/RBAC Temeli

Aday dosyalar:

1. `db/rbac_migration.sql`

Not: Bu dosya RLS/policy ve seed içerir. Staging schema kurulumu için adaydır ancak manuel review olmadan çalıştırılmaz.

### Faz 2 — Temel Operasyon Tabloları

Bu faz için repo dışı veya eksik temel migration doğrulanmalıdır:

1. `customers` create migration
2. `devices` create migration
3. `service_forms` create migration
4. `service_form_items` create migration

Bu kaynaklar olmadan aşağıdaki fazlara geçilmez.

### Faz 3 — Cari ve Şube Omurgası

Önerilen sıra:

1. `db/cari_hesap_migration.sql`
2. `db/subeler_migration.sql`
3. `db/invoices_customer_branch_fields_migration.sql`
4. `db/invoices_adres_migration.sql`
5. `db/invoices_missing_columns_fix.sql`
6. `db/invoice_items_discount_migration.sql`
7. `db/payments_unique_constraint.sql`
8. `db/vergi_mahsup_migration.sql`

### Faz 4 — Modül Migration'ları

Önerilen sıra:

1. `db/urunler_migration.sql`
2. `db/teklifler_migration.sql`
3. `db/iskonto_migration.sql`
4. `db/proforma_migration.sql`
5. `db/personel_migration.sql`
6. `db/teslimatlar_migration.sql`
7. `db/teknik_raporlar_migration.sql`
8. `db/teknik_raporlar_havalandirma_test_migration.sql`
9. `db/teknik_raporlar_sulu_sistem_migration.sql`
10. `db/teknik_raporlar_havalandirma_kayit_fix.sql`
11. `db/operasyon_migration.sql`
12. `db/operasyon_talepler_soft_delete.sql`
13. `db/on_kayitlar_migration.sql`
14. `db/on_kayit_kalemler_migration.sql`
15. `db/tedarikciler_migration.sql`
16. `db/musteri_cari_belgeler_migration.sql`
17. `db/mutabakat_formlari_migration.sql`
18. `db/hatirlatmalar_migration.sql`
19. `db/hatirlatma_susturmalar_migration.sql`
20. `db/add_planli_gonderim_zamani.sql`
21. `db/fabrika_migration.sql`

### Faz 5 — Broker ve Aracı Cari

1. `db/add_brokers_migration.sql`
2. `db/araci_cari_hareketleri_migration.sql`

### Faz 6 — Tenant Hazırlığı

1. `db/tenant_migration.sql`
2. `db/tenant_missing_child_firma_id_sync.sql`
3. `db/tenant_araci_cari_firma_sync.sql`
4. `db/sube_varsayilan_migration.sql`
5. `db/rbac_sube_yetkileri_migration.sql`

### Faz 7 — Schema Doğrulama

Sadece read-only kontrol:

1. `db/staging_schema_required_objects_check.sql`
2. `db/tenant_audit_checks.sql`

### Faz 8 — Seed ve Auth Eşleştirme

1. Auth user'lar Supabase Dashboard'dan manuel oluşturulur.
2. `db/staging_auth_profile_link_template.sql` staging UUID değerleriyle lokal kopyada doldurulur.
3. `db/staging_minimal_seed_template.sql` staging schema ile uyarlanır.
4. `db/staging_seed_verification.sql` ile doğrulanır.

### Faz 9 — RLS Preflight

1. `db/staging_rls_preflight_checks.sql`
2. Sonuçlar `db/staging_schema_apply_results.md` ve `db/staging_rls_preflight_results.md` içine işlenir.
3. `db/staging_preflight_go_gate.md` GO demeden RLS dosyaları çalıştırılmaz.

## Apply Sırasına Dahil Edilmeyecek Dosyalar

- `fix_invoice_items_ft42.sql`
- `fix_tse_vkn_8760051534.sql`
- `gecikis_vade_fix.sql`
- `rls_production_readonly_collection.sql`
- `tenant_rls_*`
- `staging_rls_post_apply_checks.sql` (yalnızca apply sonrası kontrol)
- `backup_migration.sql` (ayrı karar)
- `app_settings_migration.sql` (ayrı karar)
## Sprint 2.6 Kayıt Akışı

Her fazdan sonra:

1. Sonuç `db/staging_schema_apply_manual_session.md` içine işlenir.
2. Hata varsa `db/staging_schema_apply_error_log.md` içine maskelenmiş kayıt açılır.
3. Faz sonucu `db/staging_schema_apply_results.md` içine özetlenir.
4. Devam veya durdurma kararı `db/staging_schema_apply_next_steps.md` içine yansıtılır.
