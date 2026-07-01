# Staging SQL File Safety Matrix

> Sprint 2.5 analiz çıktısıdır. Bu dosya SQL çalıştırmaz. Amaç, `db/*.sql` dosyalarının staging schema kurulumu için risk sınıfını görünür yapmaktır.

## Risk Seviyeleri

| Seviye | Anlam |
| --- | --- |
| Düşük | Read-only SELECT/CTE kontrol dosyası. |
| Orta | DDL/migration içerir; staging'de manuel review ile uygulanabilir. |
| Yüksek | DDL yanında RLS/policy, function, trigger, seed veya update içerir. |
| Yasak | Schema bootstrap sırasında çalıştırılmayacak data-fix, production/read-only koleksiyon veya RLS apply/rollback dosyası. |

## Güvenlik Matrisi

| Dosya | DDL | DML/Seed | RLS/Policy | Function/Trigger | Risk | Sprint 2.5 Kararı |
| --- | --- | --- | --- | --- | --- | --- |
| `add_brokers_migration.sql` | Evet | Hayır | Hayır | Evet | Yüksek | Review sonrası schema adayı |
| `add_customers_authorized_person.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `add_customers_il.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `add_devices_quantity.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `add_iban_fields.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `add_planli_gonderim_zamani.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `app_settings_migration.sql` | Evet | Evet | Evet | Hayır | Yüksek | Ayrı karar |
| `araci_cari_hareketleri_migration.sql` | Evet | Evet | Evet | Evet | Yüksek | Review sonrası schema adayı |
| `backup_migration.sql` | Evet | Hayır | Belirsiz | Belirsiz | Orta | Ayrı karar |
| `cari_hesap_migration.sql` | Evet | Evet | Hayır | Evet | Yüksek | Review sonrası schema adayı |
| `fabrika_migration.sql` | Evet | Belirsiz | Evet | Belirsiz | Yüksek | Review sonrası schema adayı |
| `fix_invoice_items_ft42.sql` | Hayır | Evet | Hayır | Hayır | Yasak | Data-fix, apply dışı |
| `fix_tse_vkn_8760051534.sql` | Hayır | Evet | Hayır | Hayır | Yasak | Data-fix, apply dışı |
| `gecikis_vade_fix.sql` | Hayır | Evet | Hayır | Hayır | Yasak | Data-fix, apply dışı |
| `hatirlatma_susturmalar_migration.sql` | Evet | Hayır | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `hatirlatmalar_migration.sql` | Evet | Belirsiz | Evet | Belirsiz | Yüksek | Review sonrası schema adayı |
| `invoice_items_discount_migration.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `invoices_adres_migration.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `invoices_customer_branch_fields_migration.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `invoices_missing_columns_fix.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `iskonto_migration.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `musteri_cari_belgeler_migration.sql` | Evet | Hayır | Belirsiz | Hayır | Orta | Schema adayı |
| `mutabakat_formlari_migration.sql` | Evet | Hayır | Belirsiz | Hayır | Orta | Schema adayı |
| `on_kayit_kalemler_migration.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `on_kayitlar_migration.sql` | Evet | Hayır | Belirsiz | Hayır | Orta | Schema adayı |
| `operasyon_migration.sql` | Evet | Evet | Evet | Evet | Yüksek | Review sonrası schema adayı |
| `operasyon_talepler_soft_delete.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `payments_unique_constraint.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |
| `personel_migration.sql` | Evet | Hayır | Evet | Evet | Yüksek | Review sonrası schema adayı |
| `proforma_migration.sql` | Evet | Hayır | Evet | Evet | Yüksek | Review sonrası schema adayı |
| `rbac_migration.sql` | Evet | Evet | Evet | Evet | Yüksek | Erken schema adayı, review şart |
| `rbac_sube_yetkileri_migration.sql` | Evet | Belirsiz | Belirsiz | Belirsiz | Orta | Schema adayı |
| `rls_helper_checks.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Read-only kontrol |
| `rls_policy_inventory.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Read-only kontrol |
| `rls_production_readonly_collection.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Apply değil, read-only analiz |
| `staging_auth_profile_link_template.sql` | Hayır | Evet | Hayır | Hayır | Yüksek | Manual template |
| `staging_minimal_seed_template.sql` | Hayır | Evet | Hayır | Hayır | Yüksek | Manual seed template |
| `staging_rls_post_apply_checks.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | RLS sonrası read-only kontrol |
| `staging_rls_preflight_checks.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Preflight read-only kontrol |
| `staging_schema_required_objects_check.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Schema sonrası read-only kontrol |
| `staging_seed_verification.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Seed sonrası read-only kontrol |
| `sube_varsayilan_migration.sql` | Evet | Evet | Belirsiz | Belirsiz | Yüksek | Review sonrası schema adayı |
| `subeler_migration.sql` | Evet | Evet | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `tedarikciler_migration.sql` | Evet | Hayır | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `teklifler_migration.sql` | Evet | Hayır | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `teknik_raporlar_havalandirma_kayit_fix.sql` | Evet | Evet | Hayır | Hayır | Yüksek | Review sonrası schema adayı |
| `teknik_raporlar_havalandirma_test_migration.sql` | Evet | Evet | Hayır | Hayır | Yüksek | Review sonrası schema adayı |
| `teknik_raporlar_migration.sql` | Evet | Evet | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `teknik_raporlar_sulu_sistem_migration.sql` | Evet | Evet | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `tenant_araci_cari_firma_sync.sql` | Hayır | Evet | Hayır | Evet | Yüksek | Tenant sonrası review |
| `tenant_audit_checks.sql` | Hayır | Hayır | Hayır | Hayır | Düşük | Read-only kontrol |
| `tenant_migration.sql` | Evet | Evet | Evet | Evet | Yüksek | Tenant fazı, review şart |
| `tenant_missing_child_firma_id_sync.sql` | Evet | Evet | Hayır | Evet | Yüksek | Tenant sonrası review |
| `tenant_rls_drop_permissive_policies_draft.sql` | Hayır | Hayır | Evet | Hayır | Yasak | RLS dry-run dışı/draft |
| `tenant_rls_helper_upgrade_staging.sql` | Hayır | Hayır | Hayır | Evet | Yasak | Preflight GO sonrası yalnız staging |
| `tenant_rls_policy_draft.sql` | Hayır | Hayır | Evet | Hayır | Yasak | Draft policy |
| `tenant_rls_staging_apply_tenant_policies_real.sql` | Hayır | Hayır | Evet | Hayır | Yasak | Preflight GO sonrası yalnız staging |
| `tenant_rls_staging_cleanup_real.sql` | Hayır | Hayır | Evet | Hayır | Yasak | Preflight GO sonrası yalnız staging |
| `tenant_rls_staging_drop_permissive_policies.sql` | Hayır | Hayır | Evet | Hayır | Yasak | Eski/draft RLS cleanup |
| `tenant_rls_staging_dry_run_final.sql` | Evet | Hayır | Evet | Evet | Yasak | Eski birleşik dry-run |
| `tenant_rls_staging_rollback_real.sql` | Hayır | Hayır | Evet | Hayır | Yasak | Sadece rollback planında |
| `teslimatlar_migration.sql` | Evet | Hayır | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `urunler_migration.sql` | Evet | Evet | Evet | Hayır | Yüksek | Review sonrası schema adayı |
| `vergi_mahsup_migration.sql` | Evet | Hayır | Hayır | Hayır | Orta | Schema adayı |

## Yasak / Apply Dışı Kümeler

Schema bootstrap sırasında aşağıdakiler çalıştırılmaz:

- Data-fix dosyaları: `fix_*`, `gecikis_vade_fix.sql`
- RLS dry-run/apply/rollback dosyaları: `tenant_rls_*`
- Production/read-only analiz koleksiyonları: `rls_production_readonly_collection.sql`
- Manual staging template dosyaları, doldurulmadan: `staging_auth_profile_link_template.sql`, `staging_minimal_seed_template.sql`
