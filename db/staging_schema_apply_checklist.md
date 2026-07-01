# Staging Schema Apply Checklist

> SQL çalıştırmadan önce ve sonra işaretlenecek staging checklist'idir. Production için değildir.

## A. Ortam Güvenliği

- [ ] Supabase Dashboard'da staging project açık.
- [ ] Project adı production'dan farklı.
- [ ] `.env.local` staging değerlerine ayarlı.
- [ ] `node scripts/verify-staging-env.mjs` exit 0 döndü.
- [ ] Secret değerleri hiçbir dokümana yazılmadı.

## B. Dosya Güvenliği

- [ ] `db/staging_migration_inventory.md` okundu.
- [ ] `db/staging_sql_file_safety_matrix.md` okundu.
- [ ] Data-fix dosyaları apply sırasından çıkarıldı.
- [ ] RLS dry-run dosyaları schema bootstrap sırasından çıkarıldı.
- [ ] Production/read-only analiz dosyaları apply sırasından çıkarıldı.

## C. Temel Migration Kaynağı

- [ ] `customers` create migration kaynağı doğrulandı.
- [ ] `devices` create migration kaynağı doğrulandı.
- [ ] `service_forms` create migration kaynağı doğrulandı.
- [ ] `service_form_items` create migration kaynağı doğrulandı.
- [ ] Bu kaynaklar yoksa apply durduruldu.

## D. Schema Apply

- [ ] Faz 1 RBAC tamamlandı.
- [ ] Faz 2 temel tablolar tamamlandı.
- [ ] Faz 3 cari/şube omurgası tamamlandı.
- [ ] Faz 4 modül migration'ları tamamlandı.
- [ ] Faz 5 broker/aracı cari tamamlandı.
- [ ] Faz 6 tenant hazırlığı tamamlandı.

## E. Schema Doğrulama

- [ ] `db/staging_schema_required_objects_check.sql` çalıştırıldı.
- [ ] Eksik tablo yok.
- [ ] Kritik `firma_id` kolonları mevcut.
- [ ] `db/tenant_audit_checks.sql` sadece staging'de ve read-only olarak değerlendirildi.

## F. Seed/Auth

- [ ] Auth kullanıcıları staging Dashboard'da manuel oluşturuldu.
- [ ] Gerçek UUID değerleri commit'e yazılmadı.
- [ ] `db/staging_auth_profile_link_template.sql` lokal/staging kopyada dolduruldu.
- [ ] `db/staging_minimal_seed_template.sql` staging schema ile uyumlu hale getirildi.
- [ ] `db/staging_seed_verification.sql` temiz.

## G. Preflight GO Gate

- [ ] `db/staging_preflight_go_gate.md` tüm maddeleri geçti.
- [ ] GO kararı verilmeden RLS helper/cleanup/apply dosyaları çalıştırılmadı.
