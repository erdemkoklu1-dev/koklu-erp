# GÖREV — Sprint 2.1: Staging Ortam Ayrıştırma ve Preflight Doğrulama

## Amaç

Sprint 2.0 tamamlandı ve staging/local Supabase RLS dry-run için gerekli plan dosyaları oluşturuldu.

Bir sonraki adım, production’a dokunmadan staging/local ortamın gerçekten ayrı olduğunu doğrulamak ve RLS dry-run öncesi **preflight kontrol sürecini** güvenli şekilde hazırlamaktır.

Bu sprintte:

1. Production ve staging/local Supabase bağlantılarının karışmaması için güvenlik kontrolü hazırlanacak.
2. `.env` dosyalarının nasıl yönetileceği belgelenecek.
3. Production secret/key bilgileri kesinlikle commit edilmeyecek.
4. Staging/local ortamda çalıştırılacak preflight kontrolleri için sonuç şablonu hazırlanacak.
5. RLS helper upgrade, cleanup veya tenant policy apply henüz çalıştırılmayacak.
6. Production üzerinde hiçbir SQL çalıştırılmayacak.

Bu sprintin çıktısı: **staging/local preflight’e geçebiliriz / geçemeyiz** kararıdır.

---

## 1. Kesin Yasaklar

Bu görevde kesinlikle yapma:

```txt
Production Supabase üzerinde SQL çalıştırma.
Production üzerinde RLS veya policy değiştirme.
DROP POLICY çalıştırma.
CREATE POLICY çalıştırma.
ALTER TABLE çalıştırma.
INSERT / UPDATE / DELETE / TRUNCATE çalıştırma.
firma_id NOT NULL yapma.
Production service role key’i dosyaya yazma.
.env.local, .env.production, .env gibi secret içeren dosyaları commit’e alma.
src uygulama kodunu değiştirme.
Parser, fatura hesaplama, teknik rapor formülü, teslimat mantığı veya PDF tasarımını değiştirme.
```

Bu sprint **ortam güvenliği ve preflight hazırlığı** sprintidir.

---

## 2. Önceki Dosyaları Oku

Aşağıdaki dosyaları incele:

```txt
db/staging_rls_environment_setup.md
db/staging_rls_execution_order.md
db/staging_rls_preflight_checks.sql
db/staging_rls_post_apply_checks.sql
db/staging_rls_manual_test_results.md
db/staging_rls_go_no_go_report.md

db/tenant_rls_helper_upgrade_staging.sql
db/tenant_rls_staging_cleanup_real.sql
db/tenant_rls_staging_apply_tenant_policies_real.sql
db/tenant_rls_staging_rollback_real.sql
db/tenant_rls_staging_test_matrix_real.md
db/tenant_rls_production_risk_assessment_real.md
db/tenant_rls_production_readiness_gate.md
```

Bu sprintte özellikle şu sıraya hazırlık yapılacak:

```txt
preflight → helper upgrade → cleanup → tenant policy apply → post-apply → manuel testler → rollback → Go/No-Go
```

Ancak bu sprintte yalnızca **preflight öncesi ortam doğrulaması** yapılacak.

---

## 3. Üretilecek Yeni Dosyalar

Aşağıdaki yeni dosyaları oluştur:

```txt
db/staging_rls_env_safety_checklist.md
db/staging_rls_preflight_results.md
db/staging_rls_preflight_interpretation.md
db/staging_rls_dry_run_env_template.md
scripts/verify-staging-env.mjs
```

Mevcut şu dosyaları gerekirse küçük notlarla güncelle:

```txt
db/staging_rls_environment_setup.md
db/staging_rls_execution_order.md
db/staging_rls_go_no_go_report.md
GOREV.md
```

Kod tarafında uygulama mantığı değiştirme. `scripts/verify-staging-env.mjs` yalnızca local environment güvenlik kontrol scripti olacak.

---

## 4. staging_rls_env_safety_checklist.md

Yeni dosya:

```txt
db/staging_rls_env_safety_checklist.md
```

İçerik:

```md
# Staging RLS Environment Safety Checklist

## Amaç

Bu checklist, RLS dry-run işlemlerinin yanlışlıkla production Supabase üzerinde çalıştırılmasını engellemek için hazırlanmıştır.

## 1. Ortam Kararı

Seçilen ortam:

- [ ] Ayrı Supabase staging project
- [ ] Supabase branch
- [ ] Local Supabase
- [ ] Henüz seçilmedi

## 2. Production’dan Ayrışma Kontrolü

Aşağıdaki maddelerin tamamı doğrulanmadan helper upgrade / cleanup / tenant policy apply çalıştırılmayacak.

- [ ] NEXT_PUBLIC_SUPABASE_URL production URL değil.
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY production anon key değil.
- [ ] SUPABASE_SERVICE_ROLE_KEY production service role key değil.
- [ ] Supabase Dashboard’da staging/local project adı doğrulandı.
- [ ] SQL Editor’da görünen proje adı production değil.
- [ ] Test verileri staging/local üzerinde.
- [ ] Production verisi üzerinde işlem yapılmıyor.

## 3. Yasak Dosyalar

Aşağıdaki dosyalar production’da çalıştırılmayacak:

- db/tenant_rls_helper_upgrade_staging.sql
- db/tenant_rls_staging_cleanup_real.sql
- db/tenant_rls_staging_apply_tenant_policies_real.sql
- db/tenant_rls_staging_rollback_real.sql

## 4. İzinli İlk SQL

İlk aşamada yalnızca şu dosya çalıştırılabilir:

- db/staging_rls_preflight_checks.sql

Bu dosya sadece SELECT sorguları içerir.

## 5. Go / No-Go

- [ ] Ortam güvenli: preflight’e geçilebilir.
- [ ] Ortam belirsiz: preflight’e geçilmez.
- [ ] Production riski var: işlem durdurulur.
```

---

## 5. staging_rls_preflight_results.md

Yeni dosya:

```txt
db/staging_rls_preflight_results.md
```

Bu dosya, staging/local üzerinde `db/staging_rls_preflight_checks.sql` çalıştırıldıktan sonra sonuçların yapıştırılacağı şablon olacak.

İçerik:

```md
# Staging RLS Preflight Results

## Ortam Bilgisi

| Alan | Değer |
|---|---|
| Ortam tipi | Staging / Branch / Local |
| Supabase project adı | |
| Production mı? | Hayır |
| Test tarihi | |
| Test eden | |

## 1. Kritik Tablolar Var mı?

| table_name | table_exists |
|---|---|

## 2. firma_id Kolonları Var mı?

| table_name | firma_id_exists |
|---|---|

## 3. Helper Fonksiyon Durumu

| function_name | result_type | security_definer | not |
|---|---|---|---|

## 4. Kullanıcı / Firma / Rol Kontrolü

| id | firma_id | firma_adi | sube_id | sube_adi | aktif | rol_adi |
|---|---|---|---|---|---|---|

## 5. Fazla İzin Veren Policy Sayısı

| permissive_policy_count |
|---|

## 6. Preflight Kararı

- [ ] Temiz, helper upgrade aşamasına geçilebilir.
- [ ] Eksikler var, helper upgrade aşamasına geçilmez.
- [ ] Ortam production olabilir, işlem durduruldu.

## Notlar

-
```

---

## 6. staging_rls_preflight_interpretation.md

Yeni dosya:

```txt
db/staging_rls_preflight_interpretation.md
```

İçerik:

```md
# Staging RLS Preflight Interpretation

## Amaç

Bu dosya, preflight sonuçlarının nasıl yorumlanacağını açıklar.

## 1. Kritik Tablo Kontrolü

Eğer herhangi bir kritik tabloda `table_exists = false` ise RLS dry-run’a geçilmez.

Eksik tablo varsa önce staging schema eşitlemesi yapılmalıdır.

## 2. firma_id Kolon Kontrolü

Aşağıdaki kritik tablolarda `firma_id_exists = true` olmalıdır:

- customers
- devices
- service_forms
- service_form_items
- invoices
- invoice_items
- invoice_brokers
- payments
- teslimatlar
- teslimat_kalemleri
- teklifler
- teklif_kalemleri
- proforma_faturalar
- proforma_fatura_kalemleri
- teknik_raporlar
- musteri_talepleri
- is_planlari
- planli_isler
- brokers
- araci_cari_hareketleri
- subeler
- kullanici_profiller

## 3. Helper Fonksiyon Kontrolü

Preflight aşamasında mevcut helper fonksiyonlar görülebilir.

Helper upgrade sonrasında beklenen fonksiyonlar:

- current_firma_id
- is_super_admin
- current_user_role
- current_user_sube_id

## 4. Kullanıcı / Firma / Rol Kontrolü

En az iki firma ve mümkünse iki kullanıcı olmalıdır.

Minimum test senaryosu:

- Köklü Yangın kullanıcısı
- Test Yangın Firması kullanıcısı

Eğer tek firma varsa negatif tenant testi yapılamaz. Bu durumda staging test verisi hazırlanmalıdır.

## 5. Fazla İzin Veren Policy Sayısı

Production envanterinde fazla izin veren policy sayısı 59 idi.

Staging preflight’te bu sayı benzer olabilir. Cleanup sonrası azalması beklenir.

## 6. Geçiş Kararı

Helper upgrade aşamasına yalnızca şu şartlarda geç:

- Ortam production değil.
- Kritik tablolar var.
- firma_id kolonları var.
- Kullanıcı/firma verisi test için yeterli.
- Preflight SQL hata vermeden çalıştı.
```

---

## 7. staging_rls_dry_run_env_template.md

Yeni dosya:

```txt
db/staging_rls_dry_run_env_template.md
```

Bu dosya `.env` örneği olacak ama gerçek secret içermeyecek.

İçerik:

````md
# Staging RLS Dry-Run Environment Template

Bu dosya gerçek `.env` değildir. Secret içermez.

Staging/local RLS dry-run için gerekli environment alanları:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-STAGING-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_STAGING_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY
````

## Güvenlik Notları

* Production key buraya yazılmayacak.
* Gerçek `.env.local` dosyası commit edilmeyecek.
* Service role key hiçbir dokümana yapıştırılmayacak.
* Testten önce Supabase Dashboard’daki project adı kontrol edilecek.

## Kontrol

Aşağıdaki komutla local env kontrol edilebilir:

```bash
node scripts/verify-staging-env.mjs
```

````

---

## 8. scripts/verify-staging-env.mjs

Yeni dosya:

```txt
scripts/verify-staging-env.mjs
````

Bu script sadece local ortamda `.env.local` değerlerini kontrol edecek. Secret’ları ekrana yazmayacak.

Amaç:

* Production URL gibi görünen değerleri yakalamak.
* Eksik env değerlerini raporlamak.
* Kullanıcıya staging/local olduğundan emin olması gerektiğini hatırlatmak.

İçerik önerisi:

```js
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const productionHints = [
  'koklu-erp',
  'hbcbpirbcpthftddzjau',
];

let hasError = false;

console.log('Staging RLS environment safety check');
console.log('------------------------------------');

for (const key of required) {
  const value = process.env[key];

  if (!value) {
    console.error(`MISSING: ${key}`);
    hasError = true;
    continue;
  }

  const masked =
    value.length > 12
      ? `${value.slice(0, 6)}...${value.slice(-4)}`
      : '***';

  console.log(`FOUND: ${key} = ${masked}`);

  if (key.includes('KEY')) {
    continue;
  }

  const lower = value.toLowerCase();
  for (const hint of productionHints) {
    if (lower.includes(hint.toLowerCase())) {
      console.error(
        `POSSIBLE PRODUCTION VALUE DETECTED in ${key}. Do not run staging RLS dry-run with this environment.`
      );
      hasError = true;
    }
  }
}

if (hasError) {
  console.error('Environment safety check FAILED.');
  process.exit(1);
}

console.log('Environment variables exist and no production hint was detected.');
console.log('Still manually verify Supabase project name before running SQL.');
```

Not:

* Script `.env.local` dosyasını otomatik okumuyorsa raporda belirt.
* Projede dotenv kullanımı varsa gerekirse `dotenv` import etmeden çalışacak şekilde bırak.
* Yeni dependency ekleme.

---

## 9. Mevcut Dosyaları Güncelle

### 9.1 db/staging_rls_environment_setup.md

Şu bölümü ekle:

```md
## Sprint 2.1 Notu

RLS dry-run işleminden önce staging/local ortamın production’dan ayrıştığı doğrulanacaktır.

İlk çalıştırılacak dosya:

- db/staging_rls_preflight_checks.sql

Policy/helper değişikliği yapan dosyalar ancak preflight temizse çalıştırılacaktır.
```

### 9.2 db/staging_rls_execution_order.md

Preflight öncesine şu adımı ekle:

````md
## 0. Environment Safety Check

Önce şu dosyalar incelenir:

- db/staging_rls_env_safety_checklist.md
- db/staging_rls_dry_run_env_template.md

Opsiyonel local kontrol:

```bash
node scripts/verify-staging-env.mjs
````

````

### 9.3 db/staging_rls_go_no_go_report.md

Go/No-Go raporuna şu maddeyi ekle:

```md
### Environment Safety

- [ ] Production URL kullanılmadı.
- [ ] Production anon key kullanılmadı.
- [ ] Production service role key kullanılmadı.
- [ ] Supabase project adı staging/local olarak doğrulandı.
- [ ] Preflight başlamadan önce ortam ayrımı onaylandı.
````

---

## 10. Testler

Kod iş mantığı değişmeyecek. Sadece docs ve küçük local safety script eklenecek.

Çalıştır:

```powershell
npx.cmd tsc --noEmit
npm run build
```

Opsiyonel script kontrolü:

```powershell
node scripts/verify-staging-env.mjs
```

Bu script production hint yakalarsa hata verebilir; bu normaldir. Görev raporunda “production env tespit ettiği için dry-run yapılmadı” şeklinde belirt.

Git kontrolü:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
git -c core.autocrlf=false --no-pager diff --name-only
```

Beklenen değişiklikler:

```txt
GOREV.md
db/staging_rls_env_safety_checklist.md
db/staging_rls_preflight_results.md
db/staging_rls_preflight_interpretation.md
db/staging_rls_dry_run_env_template.md
db/staging_rls_environment_setup.md
db/staging_rls_execution_order.md
db/staging_rls_go_no_go_report.md
scripts/verify-staging-env.mjs
```

`src/` değişmemeli.

---

## 11. Commit

Stage edilecek dosyalar:

```powershell
git add GOREV.md
git add db/staging_rls_env_safety_checklist.md
git add db/staging_rls_preflight_results.md
git add db/staging_rls_preflight_interpretation.md
git add db/staging_rls_dry_run_env_template.md
git add db/staging_rls_environment_setup.md
git add db/staging_rls_execution_order.md
git add db/staging_rls_go_no_go_report.md
git add scripts/verify-staging-env.mjs
```

Kontrol:

```powershell
git diff --cached --name-only
```

Commit:

```powershell
git commit -m "docs: add staging RLS environment safety checks"
```

Push:

```powershell
git push
```

---

## 12. Görev Sonu Raporu

Görev bitince şu formatta rapor ver:

```md
# Sprint 2.1 Görev Sonu Raporu

## Yapılanlar

- Staging RLS environment safety checklist oluşturuldu.
- Preflight sonuç şablonu oluşturuldu.
- Preflight interpretation dokümanı oluşturuldu.
- Dry-run env template oluşturuldu.
- Local env safety script oluşturuldu.
- Execution order ve Go/No-Go raporu güncellendi.

## Production’da İşlem Yapıldı mı?

Hayır.

## SQL Çalıştırıldı mı?

Hayır.

## Kod İş Mantığı Değişti mi?

Hayır.

## Üretilen Dosyalar

- db/staging_rls_env_safety_checklist.md
- db/staging_rls_preflight_results.md
- db/staging_rls_preflight_interpretation.md
- db/staging_rls_dry_run_env_template.md
- scripts/verify-staging-env.mjs

## Güncellenen Dosyalar

- db/staging_rls_environment_setup.md
- db/staging_rls_execution_order.md
- db/staging_rls_go_no_go_report.md
- GOREV.md

## Testler

- npx.cmd tsc --noEmit: PASS
- npm run build: PASS
- node scripts/verify-staging-env.mjs: Çalıştı (sonuç ortamdaki .env.local değerlerine bağlı; production hint yakalanırsa hata vermesi beklenen davranış)

## Commit / Push

- Commit hash:
- Push sonucu:

## Sonraki Adım

Staging/local Supabase ortamı seçilecek.

Production olmayan ortam doğrulandıktan sonra ilk çalıştırılacak SQL:

- db/staging_rls_preflight_checks.sql

Preflight temiz çıkmadan şu dosyalar çalıştırılmayacak:

- db/tenant_rls_helper_upgrade_staging.sql
- db/tenant_rls_staging_cleanup_real.sql
- db/tenant_rls_staging_apply_tenant_policies_real.sql