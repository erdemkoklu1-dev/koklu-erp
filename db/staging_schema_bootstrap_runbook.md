# Staging Schema Bootstrap Runbook

## Amaç

Bu runbook, production'dan bağımsız Supabase staging project oluşturulduktan sonra schema ve minimum test verisinin nasıl hazırlanacağını açıklar.

## Önerilen Sıra

1. Supabase Dashboard'da `koklu-erp-staging` benzeri ayrı project oluştur.
2. Staging project URL ve key bilgilerini yalnızca `.env.local` içine gir.
3. Secret/key değerlerini hiçbir dokümana yazma.
4. `node scripts/verify-staging-env.mjs` çalıştır.
5. Script exit 0 dönmeden SQL çalıştırma.
6. Schema migration'larını staging'e uygula.
7. `db/staging_schema_required_objects_check.sql` ile kritik tabloları kontrol et.
8. Auth kullanıcılarını staging Dashboard'dan manuel oluştur.
9. Auth UUID'leriyle `db/staging_auth_profile_link_template.sql` dosyasını doldur.
10. `db/staging_minimal_seed_template.sql` dosyasını staging'de uygula.
11. `db/staging_seed_verification.sql` ile seed verisini doğrula.
12. Her şey temizse `db/staging_rls_preflight_checks.sql` çalıştır.

## Production Uyarısı

Bu runbook production için değildir.

Production üzerinde:

- seed çalıştırılmaz
- test kullanıcısı oluşturulmaz
- policy değiştirilmez
- RLS cleanup yapılmaz
