# GÖREV — Sprint 2.0: Staging/Local Supabase RLS Dry-Run Ortam Hazırlığı

## Amaç

Sprint 1.8 ve Sprint 1.9 tamamlandı.

Hazır olan dosyalar:

```txt
db/tenant_rls_helper_upgrade_staging.sql
db/tenant_rls_staging_cleanup_real.sql
db/tenant_rls_staging_apply_tenant_policies_real.sql
db/tenant_rls_staging_test_matrix_real.md
db/tenant_rls_staging_rollback_real.sql
db/tenant_rls_production_risk_assessment_real.md
```

Bu sprintin amacı production’a dokunmadan, **staging/local Supabase ortamında RLS dry-run yapılabilmesi için güvenli çalışma planı ve ortam kontrol dosyalarını hazırlamaktır.**

Bu görevde production Supabase üzerinde hiçbir SQL çalıştırılmayacak.

---

## 1. Kesin Yasaklar

Kesinlikle yapma:

```txt
Production Supabase üzerinde SQL çalıştırma.
Production üzerinde DROP POLICY çalıştırma.
Production üzerinde CREATE POLICY çalıştırma.
Production üzerinde ALTER TABLE çalıştırma.
Production üzerinde RLS enable/disable yapma.
Production verisi üzerinde INSERT / UPDATE / DELETE / TRUNCATE yapma.
firma_id NOT NULL yapma.
src kod dosyalarını değiştirme.
Parser, fatura hesaplama, teknik rapor formülü, teslimat mantığı veya PDF tasarımı değiştirme.
```

Bu sprint sadece staging/local hazırlık sprintidir.

---

## 2. Ön Temizlik

Repo içinde şu eski/untracked dosya varsa kontrol et:

```txt
db/tenant_rls_staging_dry_run.sql
```

Bu dosya Sprint 1.9 kapsamında commit’e alınmadı ve yeni gerçek dry-run dosyalarının yerine kullanılmamalı.

Eğer artık kullanılmıyorsa sil:

```powershell
Remove-Item db/tenant_rls_staging_dry_run.sql -Force -ErrorAction SilentlyContinue
```

Sonra status kontrolü:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
```

---

## 3. Üretilecek Dosyalar

Aşağıdaki yeni dosyaları oluştur:

```txt
db/staging_rls_environment_setup.md
db/staging_rls_execution_order.md
db/staging_rls_preflight_checks.sql
db/staging_rls_post_apply_checks.sql
db/staging_rls_manual_test_results.md
db/staging_rls_go_no_go_report.md
```

Kod dosyası değiştirme.

---

## 4. staging_rls_environment_setup.md

Yeni dosya oluştur:

```txt
db/staging_rls_environment_setup.md
```

İçerik:

```md
# Staging RLS Environment Setup

## Amaç

Bu dosya production’a dokunmadan RLS dry-run yapabilmek için staging/local Supabase ortamının nasıl hazırlanacağını açıklar.

## Ortam Seçenekleri

### Seçenek A — Supabase Staging Project

Önerilen yöntem.

- Yeni Supabase project oluşturulur.
- Production schema migration’ları staging’e uygulanır.
- Gerekli test verileri eklenir.
- `.env.local` staging URL ve anon/service key ile çalıştırılır.

### Seçenek B — Supabase Branch

Supabase branch özelliği kullanılabiliyorsa tercih edilebilir.

- Production benzeri branch oluşturulur.
- RLS dry-run branch üzerinde yapılır.
- Başarılı olursa production için ayrı maintenance plan hazırlanır.

### Seçenek C — Local Supabase

Geliştirici makinesinde local Supabase kullanılabilir.

- `supabase start`
- Migration’lar uygulanır.
- Seed/test verisi hazırlanır.

## Kesin Uyarı

Production bağlantı bilgileriyle bu dry-run dosyaları çalıştırılmayacak.

Kontrol edilecek `.env.local` değerleri:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Bu değerler production değil staging/local olmalı.
```

---

## 5. staging_rls_execution_order.md

Yeni dosya oluştur:

```txt
db/staging_rls_execution_order.md
```

İçerik:

````md
# Staging RLS Execution Order

## Amaç

Staging/local Supabase üzerinde gerçek RLS cleanup ve tenant policy dry-run çalıştırma sırasını belirlemek.

## Çalıştırma Sırası

### 1. Preflight Kontroller

```txt
db/staging_rls_preflight_checks.sql
````

Beklenen:

* Ortam production değil.
* Kritik tablolar var.
* firma_id kolonları var.
* Helper fonksiyonların mevcut durumu görüldü.
* Tenant audit temiz.

### 2. Helper Upgrade

```txt
db/tenant_rls_helper_upgrade_staging.sql
```

Amaç:

* current_firma_id aktif kullanıcı kontrolüyle iyileştirilir.
* is_super_admin Admin / Super Admin rol adlarını tanır.
* current_user_role oluşturulur.
* current_user_sube_id oluşturulur.

### 3. Riskli Policy Cleanup

```txt
db/tenant_rls_staging_cleanup_real.sql
```

Amaç:

* Gerçek production policy adlarına göre staging’de fazla izin veren policy’ler kaldırılır.

### 4. Tenant Policy Apply

```txt
db/tenant_rls_staging_apply_tenant_policies_real.sql
```

Amaç:

* Tenant tablolarına firma_id tabanlı SELECT / INSERT / UPDATE policy’leri eklenir.
* DELETE policy varsayılan olarak eklenmez.

### 5. Post Apply Kontroller

```txt
db/staging_rls_post_apply_checks.sql
```

Beklenen:

* Kritik tenant tablolarında tenant policy’ler var.
* Fazla izin veren policy’ler staging’de kalktı.
* Helper fonksiyonlar var.
* Veri audit temiz.

### 6. Manuel Uygulama Testleri

```txt
db/tenant_rls_staging_test_matrix_real.md
db/staging_rls_manual_test_results.md
```

### 7. Rollback Provası

```txt
db/tenant_rls_staging_rollback_real.sql
```

Rollback sonrası uygulama tekrar test edilir.

## Go / No-Go

Son karar:

```txt
db/staging_rls_go_no_go_report.md
```

````

---

## 6. staging_rls_preflight_checks.sql

Yeni dosya oluştur:

```txt
db/staging_rls_preflight_checks.sql
````

Bu dosya sadece SELECT sorguları içermeli.

En üste uyarı koy:

```sql
-- ==========================================================
-- STAGING / LOCAL PREFLIGHT CHECKS
-- Sadece SELECT sorguları içerir.
-- Production üzerinde çalıştırılması amaçlanmamıştır.
-- Veri değiştirmez.
-- ==========================================================
```

İçerik:

```sql
-- 1. Kritik tablolar var mı?
WITH required_tables(table_name) AS (
  VALUES
    ('firmalar'),
    ('kullanici_profiller'),
    ('subeler'),
    ('customers'),
    ('devices'),
    ('service_forms'),
    ('service_form_items'),
    ('invoices'),
    ('invoice_items'),
    ('invoice_brokers'),
    ('payments'),
    ('teslimatlar'),
    ('teslimat_kalemleri'),
    ('teklifler'),
    ('teklif_kalemleri'),
    ('proforma_faturalar'),
    ('proforma_fatura_kalemleri'),
    ('teknik_raporlar'),
    ('musteri_talepleri'),
    ('is_planlari'),
    ('planli_isler'),
    ('brokers'),
    ('araci_cari_hareketleri')
)
SELECT
  rt.table_name,
  to_regclass('public.' || rt.table_name) IS NOT NULL AS table_exists
FROM required_tables rt
ORDER BY rt.table_name;

-- 2. Kritik firma_id kolonları var mı?
WITH tenant_tables(table_name) AS (
  VALUES
    ('kullanici_profiller'),
    ('subeler'),
    ('customers'),
    ('devices'),
    ('service_forms'),
    ('service_form_items'),
    ('invoices'),
    ('invoice_items'),
    ('invoice_brokers'),
    ('payments'),
    ('teslimatlar'),
    ('teslimat_kalemleri'),
    ('teklifler'),
    ('teklif_kalemleri'),
    ('proforma_faturalar'),
    ('proforma_fatura_kalemleri'),
    ('teknik_raporlar'),
    ('musteri_talepleri'),
    ('is_planlari'),
    ('planli_isler'),
    ('brokers'),
    ('araci_cari_hareketleri')
)
SELECT
  tt.table_name,
  c.column_name IS NOT NULL AS firma_id_exists
FROM tenant_tables tt
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = tt.table_name
 AND c.column_name = 'firma_id'
ORDER BY tt.table_name;

-- 3. Helper fonksiyon durumu
SELECT
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_firma_id',
    'is_super_admin',
    'current_user_role',
    'current_user_sube_id'
  )
ORDER BY p.proname;

-- 4. Kullanıcı / firma / rol kontrolü
SELECT
  kp.id,
  kp.firma_id,
  f.ad AS firma_adi,
  kp.sube_id,
  s.ad AS sube_adi,
  kp.aktif,
  r.ad AS rol_adi
FROM public.kullanici_profiller kp
LEFT JOIN public.firmalar f ON f.id = kp.firma_id
LEFT JOIN public.subeler s ON s.id = kp.sube_id
LEFT JOIN public.roller r ON r.id = kp.rol_id
ORDER BY kp.created_at DESC
LIMIT 50;

-- 5. Fazla izin veren policy sayısı
SELECT
  COUNT(*) AS permissive_policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
    OR COALESCE(qual, '') ILIKE '%true%'
    OR COALESCE(with_check, '') ILIKE '%true%'
  );
```

---

## 7. staging_rls_post_apply_checks.sql

Yeni dosya oluştur:

```txt
db/staging_rls_post_apply_checks.sql
```

Bu dosya da sadece SELECT sorguları içermeli.

İçerik:

```sql
-- ==========================================================
-- STAGING / LOCAL POST APPLY CHECKS
-- Sadece SELECT sorguları içerir.
-- Veri değiştirmez.
-- ==========================================================

-- 1. Yeni tenant policy’ler var mı?
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname ILIKE '%tenant%'
ORDER BY tablename, policyname;

-- 2. Kalan fazla izin veren policy’ler
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(with_check, '') ILIKE '%auth.uid() IS NOT NULL%'
    OR COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
    OR COALESCE(qual, '') ILIKE '%true%'
    OR COALESCE(with_check, '') ILIKE '%true%'
  )
ORDER BY tablename, policyname;

-- 3. Kritik tablolarda policy sayısı
WITH tenant_tables(table_name) AS (
  VALUES
    ('customers'),
    ('devices'),
    ('service_forms'),
    ('service_form_items'),
    ('invoices'),
    ('invoice_items'),
    ('invoice_brokers'),
    ('payments'),
    ('teslimatlar'),
    ('teslimat_kalemleri'),
    ('teklifler'),
    ('teklif_kalemleri'),
    ('proforma_faturalar'),
    ('proforma_fatura_kalemleri'),
    ('teknik_raporlar'),
    ('musteri_talepleri'),
    ('is_planlari'),
    ('planli_isler'),
    ('brokers'),
    ('araci_cari_hareketleri')
)
SELECT
  t.table_name,
  COUNT(p.policyname) AS policy_count
FROM tenant_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.table_name
GROUP BY t.table_name
ORDER BY t.table_name;

-- 4. Helper fonksiyonlar
SELECT
  p.proname AS function_name,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_firma_id',
    'is_super_admin',
    'current_user_role',
    'current_user_sube_id'
  )
ORDER BY p.proname;
```

---

## 8. staging_rls_manual_test_results.md

Yeni dosya oluştur:

```txt
db/staging_rls_manual_test_results.md
```

İçerik:

```md
# Staging RLS Manual Test Results

## Ortam

| Alan | Değer |
|---|---|
| Ortam | Staging / Local |
| Supabase URL | |
| Test tarihi | |
| Test eden | |
| Production mı? | Hayır |

## Test Sonuçları

| Modül | Test | Beklenen | Sonuç | Not |
|---|---|---|---|---|
| customers | Kendi firma müşteri listesi | Görünür |  |  |
| customers | Başka firma müşteri detayı | 404/yetkisiz |  |  |
| devices | Kendi firma cihazları | Görünür |  |  |
| service_forms | Kendi firma servis formları | Görünür |  |  |
| service_forms | Başka firma servis formu PDF | Engellenir |  |  |
| invoices | Kendi firma faturaları | Görünür |  |  |
| payments | Kendi firma faturasına ödeme | Başarılı |  |  |
| payments | Başka firma faturasına ödeme | Engellenir |  |  |
| teslimatlar | Kendi firma teslimatları | Görünür |  |  |
| teklifler | Kendi firma teklifleri | Görünür |  |  |
| proforma | Kendi firma proformaları | Görünür |  |  |
| teknik_raporlar | Kendi firma raporları | Görünür |  |  |
| teknik_raporlar | Başka firma rapor copy/quote/cancel | Engellenir |  |  |
| dashboard | Sayılar sadece kendi firma | Doğru |  |  |
```

---

## 9. staging_rls_go_no_go_report.md

Yeni dosya oluştur:

```txt
db/staging_rls_go_no_go_report.md
```

İçerik:

```md
# Staging RLS Go / No-Go Report

## Özet

Bu rapor staging/local RLS dry-run sonucuna göre production’a geçilip geçilmeyeceğini değerlendirir.

## Kontrol Listesi

### Ortam

- [ ] Production kullanılmadı.
- [ ] Staging/local Supabase kullanıldı.
- [ ] Backup/snapshot alındı.
- [ ] Test kullanıcıları hazırlandı.
- [ ] En az iki firma test edildi.

### SQL Uygulama

- [ ] Helper upgrade uygulandı.
- [ ] Riskli policy cleanup uygulandı.
- [ ] Tenant policy apply uygulandı.
- [ ] Post apply kontroller temiz.

### Uygulama Testleri

- [ ] Liste ekranları çalışıyor.
- [ ] Detay ekranları çalışıyor.
- [ ] Yeni kayıt oluşturma çalışıyor.
- [ ] Güncelleme çalışıyor.
- [ ] PDF/yazdırma çalışıyor.
- [ ] Dashboard doğru.
- [ ] Negatif tenant testleri geçti.

### Rollback

- [ ] Rollback SQL çalıştı.
- [ ] Rollback sonrası sistem eski davranışına döndü.
- [ ] Rollback sonrası build/test tekrar kontrol edildi.

## Karar

- [ ] GO — Production planı hazırlanabilir.
- [ ] NO-GO — Eksikler var.
- [ ] Tekrar staging testi gerekli.

## Notlar

-
```

---

## 10. Mevcut Dosyaları Güncelle

Aşağıdaki dosyalara Sprint 2.0 staging hazırlığı notu ekle:

```txt
db/tenant_rls_staging_test_matrix_real.md
db/tenant_rls_production_risk_assessment_real.md
db/tenant_rls_production_readiness_gate.md
```

Özellikle readiness gate içine şu maddeleri ekle:

```md
- [ ] Staging/local ortam production’dan ayrıştırıldı.
- [ ] Staging preflight checks temiz.
- [ ] Staging post apply checks temiz.
- [ ] Manual test results dolduruldu.
- [ ] Go/No-Go raporu tamamlandı.
```

---

## 11. Testler

Kod değişikliği beklenmiyor.

Yine de çalıştır:

```powershell
npx.cmd tsc --noEmit
npm run build
```

Git kontrolü:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
git -c core.autocrlf=false --no-pager diff --name-only
```

Beklenen değişiklikler:

```txt
GOREV.md
db/staging_rls_environment_setup.md
db/staging_rls_execution_order.md
db/staging_rls_preflight_checks.sql
db/staging_rls_post_apply_checks.sql
db/staging_rls_manual_test_results.md
db/staging_rls_go_no_go_report.md
db/tenant_rls_staging_test_matrix_real.md
db/tenant_rls_production_risk_assessment_real.md
db/tenant_rls_production_readiness_gate.md
```

`src/` değişmemeli.

---

## 12. Commit

Stage edilecek dosyalar:

```powershell
git add GOREV.md
git add db/staging_rls_environment_setup.md
git add db/staging_rls_execution_order.md
git add db/staging_rls_preflight_checks.sql
git add db/staging_rls_post_apply_checks.sql
git add db/staging_rls_manual_test_results.md
git add db/staging_rls_go_no_go_report.md
git add db/tenant_rls_staging_test_matrix_real.md
git add db/tenant_rls_production_risk_assessment_real.md
git add db/tenant_rls_production_readiness_gate.md
```

Kontrol:

```powershell
git diff --cached --name-only
```

Commit:

```powershell
git commit -m "docs: add staging RLS dry-run execution plan"
```

Push:

```powershell
git push
```

---

## 13. Görev Sonu Raporu

Görev bitince şu formatta rapor ver:

```md
# Sprint 2.0 Görev Sonu Raporu

## Yapılanlar

- Staging/local RLS ortam hazırlık dokümanı oluşturuldu.
- Execution order hazırlandı.
- Preflight check SQL oluşturuldu.
- Post apply check SQL oluşturuldu.
- Manual test results şablonu oluşturuldu.
- Go/No-Go raporu oluşturuldu.

## Production’da İşlem Yapıldı mı?

- Hayır.

## Kod Değişikliği Yapıldı mı?

- Hayır.

## Üretilen Dosyalar

- db/staging_rls_environment_setup.md
- db/staging_rls_execution_order.md
- db/staging_rls_preflight_checks.sql
- db/staging_rls_post_apply_checks.sql
- db/staging_rls_manual_test_results.md
- db/staging_rls_go_no_go_report.md

## Güncellenen Dosyalar

- db/tenant_rls_staging_test_matrix_real.md
- db/tenant_rls_production_risk_assessment_real.md
- db/tenant_rls_production_readiness_gate.md
- GOREV.md

## Testler

- npx.cmd tsc --noEmit: PASS
- npm run build: PASS

## Commit / Push

- Commit hash:
- Push sonucu:

## Sonraki Adım

Production değil, staging/local Supabase üzerinde şu sırayla ilerlenmeli:

1. staging_rls_preflight_checks.sql
2. tenant_rls_helper_upgrade_staging.sql
3. tenant_rls_staging_cleanup_real.sql
4. tenant_rls_staging_apply_tenant_policies_real.sql
5. staging_rls_post_apply_checks.sql
6. tenant_rls_staging_test_matrix_real.md
7. staging_rls_manual_test_results.md
8. tenant_rls_staging_rollback_real.sql
9. staging_rls_go_no_go_report.md