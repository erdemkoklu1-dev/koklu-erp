# Staging RLS Dry-Run Çalıştırma Sırası

> Yalnızca staging/local Supabase için geçerlidir. Production üzerinde hiçbir adım çalıştırılmaz.

Bu doküman, tenant RLS dry-run'ının hangi sırayla ve hangi kontrol noktalarıyla çalıştırılacağını tanımlar. Her adımdan sonra ilgili kontrol dosyası çalıştırılmalı ve sonuç beklenenle karşılaştırılmalıdır.

## Ön Koşul

`db/staging_rls_environment_setup.md` içindeki ortam doğrulama checklist'i tamamlanmış olmalıdır.

## Çalıştırma Sırası

### Adım 0 — Ortam ve Snapshot

1. Staging/local Supabase'e bağlandığını doğrula (production değil).
2. Staging DB snapshot/backup al.
3. `db/tenant_audit_checks.sql` çalıştır; veri temiz olmalı.

### Adım 1 — Preflight (Apply Öncesi Durum)

1. `db/staging_rls_preflight_checks.sql` çalıştır.
2. Sonuçları `db/staging_rls_manual_test_results.md` içindeki preflight bölümüne işle.
3. Beklenen: riskli/permissive policy'ler hâlâ mevcut, tenant policy'ler henüz yok, helper fonksiyon durumu kayıt altında.

### Adım 2 — Helper Upgrade

1. `db/tenant_rls_helper_upgrade_staging.sql` çalıştır.
2. `current_firma_id`, `is_super_admin`, `current_user_role`, `current_user_sube_id` fonksiyonlarının oluştuğunu/güncellendiğini doğrula.

### Adım 3 — Cleanup (Riskli Policy Temizliği)

1. `db/tenant_rls_staging_cleanup_real.sql` çalıştır.
2. Hedeflenen riskli policy'lerin düştüğünü doğrula (post-apply kontrolünde teyit edilir).

### Adım 4 — Tenant Policy Apply

1. `db/tenant_rls_staging_apply_tenant_policies_real.sql` çalıştır.
2. `*_tenant_select/insert/update` ve özel policy'lerin (firmalar, kullanici_profiller, subeler) oluştuğunu doğrula.

### Adım 5 — Post-Apply (Apply Sonrası Doğrulama)

1. `db/staging_rls_post_apply_checks.sql` çalıştır.
2. Sonuçları `db/staging_rls_manual_test_results.md` post-apply bölümüne işle.
3. Beklenen: riskli policy'ler kalmamış, tenant policy'ler mevcut, helper fonksiyonlar dört adet de var.

### Adım 6 — Uygulama Smoke + Negatif Testler

1. `npx.cmd tsc --noEmit` ve `npm run build` geçtiğini doğrula.
2. Localhost/staging uygulamasını çalıştır.
3. `db/tenant_rls_staging_test_matrix_real.md` matrisini doldur.
4. `db/staging_rls_manual_test_results.md` içindeki negatif testleri tamamla.

### Adım 7 — Rollback Provası

1. `db/tenant_rls_staging_rollback_real.sql` çalıştır.
2. Tenant policy'lerin kalktığını doğrula.
3. Gerekirse snapshot restore ile tam geri dönüşü test et.
4. Rollback sonrası uygulama smoke testlerini tekrarla.

### Adım 8 — Karar

1. Tüm sonuçları `db/staging_rls_manual_test_results.md` üzerinden topla.
2. `db/staging_rls_go_no_go_report.md` üzerinden Go/No-Go kararını ver.
3. `db/tenant_rls_production_readiness_gate.md` kapılarını işaretle.

## Özet Akış

```txt
0. Ortam + snapshot + tenant_audit_checks.sql
1. staging_rls_preflight_checks.sql
2. tenant_rls_helper_upgrade_staging.sql
3. tenant_rls_staging_cleanup_real.sql
4. tenant_rls_staging_apply_tenant_policies_real.sql
5. staging_rls_post_apply_checks.sql
6. tsc + build + uygulama smoke + negatif testler
7. tenant_rls_staging_rollback_real.sql (rollback provası)
8. staging_rls_go_no_go_report.md (karar)
```

## Durdurma Kuralı

Herhangi bir adımda beklenen sonuç alınmazsa (ör. tenant izolasyonu sağlanmıyor, helper null/yanlış firma dönüyor, riskli policy kalmış) dry-run durdurulur, rollback uygulanır ve karar **No-Go** olarak işaretlenir.
