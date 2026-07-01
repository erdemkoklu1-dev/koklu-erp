# Staging Migration Inventory

> Sprint 2.5 analiz çıktısıdır. Bu dosya herhangi bir SQL çalıştırma talimatı değildir; production veya staging üzerinde işlem yapılmadı.

## Amaç

`db/*.sql` dosyalarını staging schema kurulumu açısından sınıflandırmak ve hangi dosyaların schema bootstrap sırasına aday olduğunu, hangilerinin read-only kontrol veya RLS dry-run kapsamına ait olduğunu ayırmak.

## Sınıflar

| Sınıf | Anlam |
| --- | --- |
| `schema-aday` | Staging schema kurulumunda incelenip uygulanabilecek DDL/migration dosyası. |
| `schema-aday-riskli` | DDL yanında seed/update/policy içerir; staging'de uygulanmadan önce manuel review gerekir. |
| `read-only-check` | Sadece SELECT/CTE beklenen kontrol veya envanter dosyası. |
| `staging-template` | Template/seed/link dosyası; doğrudan production'da çalıştırılmaz, staging'de manuel doldurma/review ister. |
| `rls-dry-run` | RLS helper/policy cleanup/apply/rollback dosyası; schema bootstrap sırasında çalıştırılmaz. |
| `data-fix` | Belirli veri düzeltmesi; staging schema bootstrap sırasına dahil edilmez. |
| `out-of-band` | Backup, uygulama ayarı, üretim/read-only koleksiyon veya özel amaçlı dosya; ayrı karar gerekir. |

## Kritik Gözlem

Repo içindeki `db/*.sql` aramasında `customers`, `devices`, `service_forms` ve `service_form_items` tablolarını oluşturan açık `CREATE TABLE` migration dosyası bulunamadı. Buna rağmen birçok migration bu tablolara FK veya `ALTER TABLE` ile bağlıdır. Staging schema apply başlamadan önce bu temel tabloların kaynağı doğrulanmalıdır.

## Envanter

| Dosya | Sınıf | Staging schema apply kararı | Not |
| --- | --- | --- | --- |
| `add_brokers_migration.sql` | schema-aday-riskli | Review sonrası | `invoices` tablosuna bağlıdır; trigger içerir. |
| `add_customers_authorized_person.sql` | schema-aday | Temel customers sonrası | `customers` ALTER. |
| `add_customers_il.sql` | schema-aday | Temel customers sonrası | `customers` ALTER. |
| `add_devices_quantity.sql` | schema-aday | Temel devices sonrası | `devices` ALTER. |
| `add_iban_fields.sql` | schema-aday | Temel customers sonrası | IBAN kolonları. |
| `add_planli_gonderim_zamani.sql` | schema-aday | Hatırlatma sonrası | `hatirlatma_kayitlari` ALTER/index. |
| `app_settings_migration.sql` | out-of-band | Ayrı karar | App setting tablo + permissive policy + seed. |
| `araci_cari_hareketleri_migration.sql` | schema-aday-riskli | Broker/invoice sonrası | Trigger, function, seed/sync insert içerir. |
| `backup_migration.sql` | out-of-band | Ayrı karar | Backup altyapısı; core schema sırasına zorunlu değil. |
| `cari_hesap_migration.sql` | schema-aday-riskli | Temel customers/service sonrası | Fatura/ödeme tabloları, enum, trigger ve seed içerir. |
| `fabrika_migration.sql` | schema-aday-riskli | Ürün/personel kararından sonra | Fabrika tabloları ve RLS/policy içerir. |
| `fix_invoice_items_ft42.sql` | data-fix | Uygulama | Belirli fatura verisi düzeltmesi. |
| `fix_tse_vkn_8760051534.sql` | data-fix | Uygulama | Gerçek/veri özel düzeltme; staging bootstrap dışı. |
| `gecikis_vade_fix.sql` | data-fix | Uygulama | Existing invoice update. |
| `hatirlatma_susturmalar_migration.sql` | schema-aday | Hatırlatma/customer sonrası | Hatırlatma susturma tablosu. |
| `hatirlatmalar_migration.sql` | schema-aday-riskli | Customer/device sonrası | Hatırlatma tabloları ve policy içerir. |
| `invoice_items_discount_migration.sql` | schema-aday | Cari hesap sonrası | `invoice_items` ALTER. |
| `invoices_adres_migration.sql` | schema-aday | Cari hesap sonrası | `invoices` ALTER. |
| `invoices_customer_branch_fields_migration.sql` | schema-aday | Cari hesap + subeler sonrası | Fatura müşteri/şube alanları. |
| `invoices_missing_columns_fix.sql` | schema-aday | Cari hesap sonrası | Eksik invoice kolon/index tamamlayıcı. |
| `iskonto_migration.sql` | schema-aday | Teklif sonrası | Teklif iskonto kolonları. |
| `musteri_cari_belgeler_migration.sql` | schema-aday | Customers sonrası | Müşteri cari belge tabloları. |
| `mutabakat_formlari_migration.sql` | schema-aday | Customers sonrası | Mutabakat tabloları. |
| `on_kayit_kalemler_migration.sql` | schema-aday | On kayıt sonrası | Kalem tablosu. |
| `on_kayitlar_migration.sql` | schema-aday | Customers sonrası | Ön kayıt tablosu. |
| `operasyon_migration.sql` | schema-aday-riskli | Customers/devices/subeler/personel sonrası | Operasyon tabloları, constraints, functions, policies. |
| `operasyon_talepler_soft_delete.sql` | schema-aday | Operasyon sonrası | Soft delete kolonları. |
| `payments_unique_constraint.sql` | schema-aday | Cari hesap sonrası | Payment constraint. |
| `personel_migration.sql` | schema-aday-riskli | Core sonrası | Personel tabloları, functions, policies. |
| `proforma_migration.sql` | schema-aday-riskli | Customers/teklif/subeler sonrası | Proforma tabloları, function, policies. |
| `rbac_migration.sql` | schema-aday-riskli | Erken | Roller/profiller/RLS/policies/seed içerir. |
| `rbac_sube_yetkileri_migration.sql` | schema-aday | RBAC + subeler sonrası | Şube yetki kolon/tabloları. |
| `rls_helper_checks.sql` | read-only-check | Uygulama | RLS helper analiz kontrolü. |
| `rls_policy_inventory.sql` | read-only-check | Uygulama | Policy envanteri. |
| `rls_production_readonly_collection.sql` | read-only-check | Production için bile read-only tasarlanmış; staging apply değil | Analiz koleksiyonu. |
| `staging_auth_profile_link_template.sql` | staging-template | Review/manual | Auth UUID placeholder içerir. |
| `staging_minimal_seed_template.sql` | staging-template | Review/manual | ROLLBACK varsayılan; staging seed template. |
| `staging_rls_post_apply_checks.sql` | read-only-check | RLS apply sonrası | Sadece kontrol. |
| `staging_rls_preflight_checks.sql` | read-only-check | Schema/seed sonrası | Sadece kontrol. |
| `staging_schema_required_objects_check.sql` | read-only-check | Schema sonrası | Sadece kontrol. |
| `staging_seed_verification.sql` | read-only-check | Seed sonrası | Sadece kontrol. |
| `sube_varsayilan_migration.sql` | schema-aday-riskli | Subeler sonrası | Default şube/firma sync olabilir; review gerekir. |
| `subeler_migration.sql` | schema-aday-riskli | Customers/invoices/service_forms sonrası veya split edilerek | Subeler create + existing table ALTER + seed + anon policy. |
| `tedarikciler_migration.sql` | schema-aday-riskli | Core sonrası | Tedarikçi tablo + permissive policy. |
| `teklifler_migration.sql` | schema-aday-riskli | Customers sonrası | Teklif tabloları + policy. |
| `teknik_raporlar_havalandirma_kayit_fix.sql` | schema-aday-riskli | Teknik rapor sonrası | ALTER + UPDATE düzeltmeleri. |
| `teknik_raporlar_havalandirma_test_migration.sql` | schema-aday-riskli | Teknik rapor sonrası | Constraint + seed. |
| `teknik_raporlar_migration.sql` | schema-aday-riskli | Customers/subeler/personel sonrası | Teknik rapor tabloları + data cleanup + policies. |
| `teknik_raporlar_sulu_sistem_migration.sql` | schema-aday-riskli | Teknik rapor sonrası | Constraint + settings seed + policy. |
| `tenant_araci_cari_firma_sync.sql` | schema-aday-riskli | Tenant + aracı cari sonrası | Function + update sync. |
| `tenant_audit_checks.sql` | read-only-check | Tenant sonrası | Sadece audit SELECT beklenir. |
| `tenant_migration.sql` | schema-aday-riskli | Core modüller sonrası | Firmalar, firma_id sync, helpers, policies, seed. |
| `tenant_missing_child_firma_id_sync.sql` | schema-aday-riskli | Tenant sonrası | ALTER + UPDATE + trigger/function. |
| `tenant_rls_drop_permissive_policies_draft.sql` | rls-dry-run | Uygulama | Draft/drop policy; bootstrap dışı. |
| `tenant_rls_helper_upgrade_staging.sql` | rls-dry-run | Preflight GO sonrası | Staging only helper upgrade. |
| `tenant_rls_policy_draft.sql` | rls-dry-run | Uygulama | Draft policy dokümanı. |
| `tenant_rls_staging_apply_tenant_policies_real.sql` | rls-dry-run | Preflight GO sonrası | Staging tenant policy apply. |
| `tenant_rls_staging_cleanup_real.sql` | rls-dry-run | Preflight GO sonrası | Staging cleanup. |
| `tenant_rls_staging_drop_permissive_policies.sql` | rls-dry-run | Uygulama | Eski/draft cleanup. |
| `tenant_rls_staging_dry_run_final.sql` | rls-dry-run | Uygulama | Eski birleşik dry-run; split dosyalar tercih edilir. |
| `tenant_rls_staging_rollback_real.sql` | rls-dry-run | Sadece rollback planında | Staging rollback. |
| `teslimatlar_migration.sql` | schema-aday-riskli | Customers/subeler/personel/urunler sonrası | Teslimat tabloları + policies. |
| `urunler_migration.sql` | schema-aday-riskli | Core sonrası | Ürün tabloları + seed + policy. |
| `vergi_mahsup_migration.sql` | schema-aday | Cari hesap sonrası | Invoice mahsup kolon/index. |
