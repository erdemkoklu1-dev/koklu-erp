# Staging Supabase Project Kurulum Runbook

> Yalnızca production'dan ayrı bir staging Supabase projesi kurmak içindir. Production projesi üzerinde hiçbir SQL/değişiklik yapılmaz.

Bu runbook, RLS dry-run için production'dan tamamen izole bir Supabase staging projesinin nasıl kurulacağını adım adım anlatır.

## 0. Ön Kurallar

```txt
Production projesine bağlanılmaz.
Production verisi staging'e kopyalanmaz.
Production URL / anon key / service role key staging kurulumunda kullanılmaz.
Gerçek müşteri verisi staging'e taşınmaz; anonim/sentetik veri kullanılır.
```

## 1. Yeni Staging Projesi Oluştur

1. Supabase Dashboard → **New project**.
2. Proje adı: `koklu-erp-staging` (production'dan açıkça ayrışan bir isim).
3. Production'dan farklı bir **organizasyon** veya en azından net ayrılabilir bir isim seç.
4. Güçlü bir database şifresi belirle (bu şifre hiçbir dokümana veya commit'e yazılmaz).
5. Region seçip projeyi oluştur.
6. Proje oluşunca **Project Ref** ve **URL**'in production'dan farklı olduğunu not et (secret değil, ama yine de commit'e yazma).

## 2. Şemayı Migration'lardan Kur

Staging projesinde, production'daki migration dosyalarını **kronolojik sırayla** uygula. Bu repodaki `db/*_migration.sql` dosyaları kaynak alınır.

Önerilen yaklaşım:

1. Supabase Dashboard → **SQL Editor** (staging projesinde olduğunu doğrula).
2. Temel tablo migration'larını sırayla çalıştır. Tenant ve RBAC için kritik sıra:
   - `db/rbac_migration.sql` (roller, kullanici_profiller, modul_izinleri)
   - `db/subeler_migration.sql`
   - Modül migration'ları (customers/devices/service_forms/invoices/teklifler/teslimatlar/proforma/teknik_raporlar/operasyon/araci vb.)
   - `db/tenant_migration.sql` (firmalar tablosu + tüm tenant tablolarına `firma_id` ekler)
3. **RLS dry-run dosyalarını bu aşamada UYGULAMA.** Aşağıdakiler kurulum aşamasında çalıştırılmaz:
   - `db/tenant_rls_helper_upgrade_staging.sql`
   - `db/tenant_rls_staging_cleanup_real.sql`
   - `db/tenant_rls_staging_apply_tenant_policies_real.sql`
   - `db/tenant_rls_staging_rollback_real.sql`

> Not: `db/tenant_migration.sql` çalıştığında `firmalar` tablosuna `Köklü Yangın` (slug: `koklu-yangin`) firması seed edilir ve mevcut tüm tenant kayıtları bu firmaya bağlanır. Staging'de ikinci bir test firması ayrıca eklenir (bkz. `db/staging_minimal_seed_plan.md`).

## 3. Şema Doğrulaması

Migration'lar sonrası staging'de hızlı kontrol:

- `firmalar`, `roller`, `kullanici_profiller`, `subeler` tabloları mevcut.
- `roller` tablosunda seed roller var (Admin, Saha Tekniker, İdari Çalışan, Pazarlamacı, Fabrika).
- Kritik tenant tablolarında `firma_id` kolonu mevcut.

Bu doğrulamanın resmi adımı için bkz. `db/staging_rls_preflight_checks.sql` ve `db/staging_preflight_before_sql_checklist.md`.

## 4. Auth Kullanıcıları

Staging'de en az iki Auth kullanıcısı manuel oluşturulur ve `kullanici_profiller` ile eşlenir. Bkz. `db/staging_manual_auth_user_setup.md`.

## 5. Minimum Seed Verisi

İki firma + her firmada test kayıtları için bkz. `db/staging_minimal_seed_plan.md`.

## 6. Env Bağlantısı

Local uygulamayı staging'e bağlamak için `.env.local` switching adımları: bkz. `db/staging_env_switching_guide.md`. Bağlantı sonrası mutlaka:

```bash
node scripts/verify-staging-env.mjs
```

Script production hint yakalarsa kurulum tamamlanmış sayılmaz ve RLS dry-run başlatılmaz.

## 7. Kurulum Sonrası Durum

Bu runbook tamamlandığında:

- Production'dan ayrı bir staging projesi mevcut.
- Şema migration'lardan kurulmuş.
- En az iki firma, iki kullanıcı, roller hazır.
- RLS policy/helper dosyaları **henüz çalıştırılmamış**.

Sonraki adım, `db/staging_preflight_before_sql_checklist.md` tamamlanıp `db/staging_rls_preflight_checks.sql` çalıştırılmasıdır.

## Sprint 2.4 Bootstrap Notu

Staging project oluşturulduktan sonra schema ve seed hazırlığı için şu dosyalar kullanılacaktır:

- db/staging_schema_bootstrap_runbook.md
- db/staging_schema_required_objects_check.sql
- db/staging_minimal_seed_template.sql
- db/staging_auth_profile_link_template.sql
- db/staging_seed_verification.sql
- db/staging_bootstrap_execution_checklist.md
