# GÖREV — Sprint 1.8: Production Read-Only RLS Envanter Çıktı Toplama Paketi

> Durum: Sprint 1.8 kapsamında production için yalnızca read-only envanter paketi hazırlanacaktır. Production'da RLS açılmayacak, policy değiştirilmeyecek ve veri değiştirilmeyecektir.

## Amaç

Sprint 1.7 ve 1.7B sonunda RLS staging dry-run hazırlık dosyaları oluşturuldu, testler geçti ve commit/push süreci tamamlandı.

Şu an sıradaki adım:

```txt
Production Supabase üzerinde RLS açmak değil;
yalnızca mevcut RLS/policy/helper durumunu read-only SELECT sorgularıyla çıkarmaktır.
```

Bu görevin amacı:

1. Production Supabase’de çalıştırılacak read-only RLS envanter sorgularını tek ve düzenli bir dosyada toplamak.
2. Kullanıcının SQL Editor’da bölüm bölüm çalıştırabileceği güvenli bir runbook hazırlamak.
3. Policy, helper fonksiyon, profil/rol/firma, fazla izin veren policy ve RLS açık/kapalı tablo çıktılarını toplayacak şablonu netleştirmek.
4. Çıktılar geldikten sonra doldurulacak analiz dosyasını hazırlamak.
5. Production’da RLS, policy, NOT NULL veya veri değişikliği yapılmadığını garanti altına almak.
6. Görev sonunda kullanıcıya hangi sorguları hangi sırayla çalıştıracağını açıkça raporlamak.

Bu sprint sonunda hâlâ production’da RLS açılmayacak.

---

## 1. Kesin Yasaklar

Bu görevde kesinlikle şunlar yapılmayacak:

```txt
ALTER TABLE ... ENABLE ROW LEVEL SECURITY çalıştırma.
ALTER TABLE ... FORCE ROW LEVEL SECURITY çalıştırma.
CREATE POLICY çalıştırma.
DROP POLICY çalıştırma.
ALTER TABLE ... SET NOT NULL çalıştırma.
UPDATE / INSERT / DELETE / TRUNCATE çalıştırma.
Production verisi değiştirme.
RLS policy uygulama.
Staging dry-run SQL dosyalarını production’da çalıştırma.
Parser, fatura hesaplama, teknik rapor formülü, teslimat mantığı, PDF tasarımı değiştirme.
UI veya uygulama kodu değiştirme.
```

Bu görev **yalnızca dosya hazırlığı ve SELECT sorgu paketi oluşturma görevidir**.

---

## 2. Referans Alınacak Önceki Dosyalar

Aşağıdaki dosyaları oku:

```txt
db/rls_policy_inventory.sql
db/rls_helper_checks.sql
db/rls_inventory_output_template.md
db/rls_inventory_analysis.md
db/tenant_rls_cleanup_plan.md
db/tenant_rls_staging_dry_run_final.sql
db/tenant_rls_staging_drop_permissive_policies.sql
db/tenant_rls_negative_test_plan.md
db/tenant_rls_production_readiness_gate.md
db/tenant_audit_checks.sql
db/tenant_visibility_test_report.md
src/lib/auth/tenant-scope.ts
```

Özellikle `rls_policy_inventory.sql` ve `rls_helper_checks.sql` içeriğindeki sorgular bu sprintte tek bir kullanıcı dostu runbook haline getirilecek.

---

## 3. Üretilecek Yeni Dosyalar

Bu görevde aşağıdaki yeni dosyaları oluştur:

```txt
db/rls_production_readonly_collection.sql
db/rls_production_readonly_runbook.md
db/rls_production_inventory_results.md
db/rls_production_inventory_interpretation_guide.md
```

Mevcut şu dosyaları gerekirse küçük düzeltmelerle güncelle:

```txt
db/rls_inventory_output_template.md
db/rls_inventory_analysis.md
db/tenant_rls_production_readiness_gate.md
```

Kod dosyası değiştirme.

---

## 4. rls_production_readonly_collection.sql Oluştur

Yeni dosya:

```txt
db/rls_production_readonly_collection.sql
```

Dosyanın en üstüne büyük uyarı koy:

```sql
-- ==========================================================
-- PRODUCTION READ-ONLY RLS ENVANTER SORGULARI
-- ==========================================================
-- Bu dosya SADECE SELECT sorguları içermelidir.
-- Production Supabase SQL Editor'da bölüm bölüm çalıştırılabilir.
--
-- KESİNLİKLE YAPMAZ:
-- - RLS açmaz
-- - Policy oluşturmaz
-- - Policy silmez
-- - Veri değiştirmez
-- - NOT NULL yapmaz
--
-- Bu dosyada UPDATE / INSERT / DELETE / DROP / ALTER / CREATE POLICY
-- komutları bulunmamalıdır.
-- ==========================================================
```

Bu dosyada yalnızca SELECT sorguları olacak.

### 4.1 Bölüm 1 — Tenant Kritik Tablo Durumu

Aşağıdaki tablolar için tablo var mı, firma_id var mı, RLS açık mı, policy sayısı kaç, boş firma_id var mı bilgisi dönsün:

```txt
firmalar
kullanici_profiller
subeler
customers
devices
service_forms
service_form_items
invoices
invoice_items
invoice_brokers
payments
teslimatlar
teslimat_kalemleri
teklifler
teklif_kalemleri
proforma_faturalar
proforma_fatura_kalemleri
teknik_raporlar
musteri_talepleri
is_planlari
planli_isler
brokers
araci_cari_hareketleri
```

Dinamik SQL veya güvenli SELECT kullanılabilir. Eğer dinamik SQL karmaşık olacaksa tablo/policy/kolon durumunu ayrı sorgularla ver.

Beklenen kolonlar:

```txt
table_name
table_exists
firma_id_column_exists
rls_enabled
force_rls
policy_count
```

### 4.2 Bölüm 2 — RLS Açık/Kapalı Tüm Public Tablolar

Şu sorguyu ekle:

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
```

### 4.3 Bölüm 3 — Mevcut Policy Listesi

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 4.4 Bölüm 4 — Fazla İzin Veren Policy Tespiti

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  CASE
    WHEN qual ILIKE '%auth.uid() IS NOT NULL%' OR with_check ILIKE '%auth.uid() IS NOT NULL%'
      THEN 'auth.uid() IS NOT NULL'
    WHEN qual ILIKE '%true%' OR with_check ILIKE '%true%'
      THEN 'TRUE / overly permissive'
    ELSE 'review'
  END AS risk_pattern
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual ILIKE '%auth.uid() IS NOT NULL%'
    OR with_check ILIKE '%auth.uid() IS NOT NULL%'
    OR qual ILIKE '%true%'
    OR with_check ILIKE '%true%'
  )
ORDER BY tablename, policyname;
```

### 4.5 Bölüm 5 — Helper Fonksiyon Durumu

Şu fonksiyonları kontrol et:

```txt
current_firma_id
is_super_admin
current_user_role
current_user_sube_id
```

Sorgu:

```sql
SELECT
  p.proname AS function_name,
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
```

### 4.6 Bölüm 6 — Kullanıcı Profil / Rol / Firma Kontrolü

`kullanici_profiller.id = auth.users.id` mantığını bozmadan sadece son kullanıcı profillerini kontrol et.

```sql
SELECT
  kp.id,
  kp.firma_id,
  f.ad AS firma_adi,
  kp.sube_id,
  s.ad AS sube_adi,
  kp.aktif,
  kp.rol_id,
  r.ad AS rol_adi,
  kp.created_at
FROM public.kullanici_profiller kp
LEFT JOIN public.firmalar f ON f.id = kp.firma_id
LEFT JOIN public.subeler s ON s.id = kp.sube_id
LEFT JOIN public.roller r ON r.id = kp.rol_id
ORDER BY kp.created_at DESC
LIMIT 50;
```

### 4.7 Bölüm 7 — Veri Temizlik Özet Kontrolü

`tenant_audit_checks.sql` içindeki kritik özetleri sadeleştirerek ekle:

* `firma_id IS NULL`
* parent-child uyumsuzluk
* şube-firma uyumsuzluk

Sorgular çok uzun olacaksa dosyanın sonunda “büyük audit için db/tenant_audit_checks.sql çalıştırılabilir” notu koy.

---

## 5. rls_production_readonly_runbook.md Oluştur

Yeni dosya:

```txt
db/rls_production_readonly_runbook.md
```

Bu dosya kullanıcıya adım adım ne yapacağını anlatacak.

İçerik:

```md
# Production Read-Only RLS Envanter Runbook

## Amaç

Bu runbook production Supabase üzerinde yalnızca SELECT sorgularıyla mevcut RLS/policy/helper durumunu çıkarmak içindir.

## Kesinlikle Çalıştırılmayacak Dosyalar

- db/tenant_rls_staging_dry_run_final.sql
- db/tenant_rls_staging_drop_permissive_policies.sql
- db/tenant_rls_drop_permissive_policies_draft.sql

## Çalıştırılacak Dosya

- db/rls_production_readonly_collection.sql

## Sıra

1. Supabase SQL Editor aç.
2. Yeni query oluştur.
3. `rls_production_readonly_collection.sql` içindeki Bölüm 1’i çalıştır.
4. Sonucu kopyala ve `rls_production_inventory_results.md` içine yapıştır.
5. Bölüm 2, 3, 4, 5, 6 ve 7 için aynı işlemi tekrarla.
6. Hata alınırsa sorguyu durdur ve hata mesajını kaydet.
7. Hiçbir write SQL çalıştırma.

## Beklenen Çıktılar

- RLS açık/kapalı tablo listesi.
- Mevcut policy listesi.
- Fazla izin veren policy listesi.
- Helper fonksiyon durumu.
- Kullanıcı profil/rol/firma durumu.
- Veri temizlik özeti.

## Sonraki Adım

Bu çıktılar geldikten sonra `rls_inventory_analysis.md` doldurulacak ve staging dry-run gerçek policy adlarıyla netleştirilecek.
```

---

## 6. rls_production_inventory_results.md Oluştur

Yeni dosya:

```txt
db/rls_production_inventory_results.md
```

Bu dosya kullanıcı çıktılarını yapıştırmak için olacak.

Şablon:

```md
# Production RLS Inventory Results

## 1. Tenant Kritik Tablo Durumu

| table_name | table_exists | firma_id_column_exists | rls_enabled | force_rls | policy_count |
|---|---|---|---|---|---|

## 2. RLS Açık/Kapalı Tüm Public Tablolar

| schema_name | table_name | rls_enabled | force_rls |
|---|---|---|---|

## 3. Mevcut Policy Listesi

| schemaname | tablename | policyname | permissive | roles | cmd | qual | with_check |
|---|---|---|---|---|---|---|---|

## 4. Fazla İzin Veren Policy Listesi

| schemaname | tablename | policyname | cmd | risk_pattern | qual | with_check |
|---|---|---|---|---|---|---|

## 5. Helper Fonksiyonlar

| function_name | function_definition |
|---|---|

## 6. Kullanıcı Profil/Rol/Firma Kontrolü

| id | firma_id | firma_adi | sube_id | sube_adi | aktif | rol_id | rol_adi |
|---|---|---|---|---|---|---|---|

## 7. Veri Temizlik Özeti

| kontrol | sonuc |
|---|---|

## 8. Hata / Not

- 
```

---

## 7. rls_production_inventory_interpretation_guide.md Oluştur

Yeni dosya:

```txt
db/rls_production_inventory_interpretation_guide.md
```

İçerik:

```md
# RLS Production Inventory Interpretation Guide

## 1. RLS Açık/Kapalı Yorumu

- `rls_enabled = false`: tablo şu anda RLS ile korunmuyor.
- `rls_enabled = true`: tablo RLS altında.
- `force_rls = true`: owner/service davranışı dikkatle incelenmeli.

## 2. Fazla İzin Veren Policy Yorumu

Aşağıdaki patternler risklidir:

- `auth.uid() IS NOT NULL`
- `USING (true)`
- `WITH CHECK (true)`
- herkese açık SELECT/INSERT/UPDATE policy’leri

Bunlar tenant RLS’e geçmeden önce staging’de kaldırılmalı veya tenant policy ile değiştirilmelidir.

## 3. Helper Fonksiyon Yorumu

`current_firma_id()` şu mantığı sağlamalıdır:

- `auth.uid()` ile `kullanici_profiller.id` eşleşmeli.
- Kullanıcı aktif olmalı.
- `firma_id` dolu olmalı.

`is_super_admin()` gerçek rol adlarına göre test edilmelidir.

## 4. Production RLS Kararı

Production RLS ancak şu şartlarda düşünülebilir:

- Tenant audit temiz.
- Mevcut policy envanteri net.
- Fazla izin veren policy’lerin gerçek adları biliniyor.
- Staging dry-run geçti.
- Negatif testler geçti.
- Rollback provası yapıldı.

## 5. Bu Aşamadan Sonra Yapılacaklar

1. Kullanıcı Supabase’den read-only çıktıları alır.
2. Çıktılar `rls_production_inventory_results.md` içine işlenir.
3. `rls_inventory_analysis.md` gerçek verilerle doldurulur.
4. Staging dry-run SQL gerçek policy adlarına göre güncellenir.
5. Staging test yapılır.
```

---

## 8. Mevcut Dosyaları Güncelle

### 8.1 rls_inventory_output_template.md

Bu dosyanın başına şu notu ekle:

```md
> Not: Production çıktıları için artık `db/rls_production_readonly_collection.sql` ve `db/rls_production_inventory_results.md` kullanılacaktır.
```

### 8.2 rls_inventory_analysis.md

Şu bölümü ekle:

```md
## Production Read-Only Çıktı Bekleniyor

Bu analiz dosyası, kullanıcı Supabase SQL Editor’dan read-only çıktıları aldıktan sonra doldurulacaktır.
Henüz production policy temizliği veya RLS uygulanmamıştır.
```

### 8.3 tenant_rls_production_readiness_gate.md

Şu maddeyi ekle:

```md
- [ ] Production read-only RLS inventory çıktıları alındı.
- [ ] Helper fonksiyon çıktıları doğrulandı.
- [ ] Fazla izin veren policy’lerin gerçek adları doğrulandı.
```

---

## 9. Güvenlik Kontrolü

Oluşturulan `rls_production_readonly_collection.sql` dosyasında aşağıdaki kelimelerin write işlem olarak kullanılmadığını kontrol et:

```txt
ALTER TABLE
CREATE POLICY
DROP POLICY
INSERT INTO
UPDATE
DELETE FROM
TRUNCATE
FORCE ROW LEVEL SECURITY
ENABLE ROW LEVEL SECURITY
SET NOT NULL
```

Bu kelimeler sadece yorum satırında geçebilir. Aktif SQL olarak geçmemeli.

---

## 10. Testler

Dosya üretiminden sonra çalıştır:

```powershell
npx.cmd tsc --noEmit
npm run build
```

Bu görevde kod değişikliği olmaması gerektiği için testler normalde geçmeli.

Ayrıca git kontrolü:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
git -c core.autocrlf=false --no-pager diff --name-only
```

Beklenen değişiklikler:

```txt
GOREV.md
db/rls_production_readonly_collection.sql
db/rls_production_readonly_runbook.md
db/rls_production_inventory_results.md
db/rls_production_inventory_interpretation_guide.md
db/rls_inventory_output_template.md
db/rls_inventory_analysis.md
db/tenant_rls_production_readiness_gate.md
```

`src/` dosyası değişmemeli.

---

## 11. Commit

Stage edilecek dosyalar:

```powershell
git add GOREV.md
git add db/rls_production_readonly_collection.sql
git add db/rls_production_readonly_runbook.md
git add db/rls_production_inventory_results.md
git add db/rls_production_inventory_interpretation_guide.md
git add db/rls_inventory_output_template.md
git add db/rls_inventory_analysis.md
git add db/tenant_rls_production_readiness_gate.md
```

Stage kontrolü:

```powershell
git diff --cached --name-only
```

Commit:

```powershell
git commit -m "docs: add production RLS read-only inventory pack"
```

Push:

```powershell
git push
```

---

## 12. Görev Sonu Raporu

Görev bitince şu formatta rapor ver:

```md
# Sprint 1.8 Görev Sonu Raporu

## Yapılanlar

- ...

## Üretilen Dosyalar

- ...

## Güncellenen Dosyalar

- ...

## Güvenlik Kontrolü

- Production RLS açıldı mı? Hayır.
- Policy değiştirildi mi? Hayır.
- Write SQL var mı? Hayır.
- Dosyada sadece SELECT sorguları var mı?

## Testler

- npx.cmd tsc --noEmit:
- npm run build:

## Commit / Push

- Commit mesajı:
- Commit hash:
- Push sonucu:

## Sonraki Manuel Adım

Supabase SQL Editor’da çalıştırılacak dosya:

- db/rls_production_readonly_collection.sql

Çalıştırma yöntemi:

- Bölüm bölüm çalıştır.
- Çıktıları `db/rls_production_inventory_results.md` şablonuna işle.
- Sonuçları kullanıcı ChatGPT’ye gönderecek.

Kesinlikle çalıştırılmayacak dosyalar:

- db/tenant_rls_staging_dry_run_final.sql
- db/tenant_rls_staging_drop_permissive_policies.sql
- db/tenant_rls_drop_permissive_policies_draft.sql
