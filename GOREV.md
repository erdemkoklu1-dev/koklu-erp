# GÖREV — Sprint 2.2: Staging Ortam Seçimi, Env Doğrulama ve Preflight Sonuç Toplama

## Amaç

Sprint 2.1 tamamlandı. Staging/local RLS dry-run öncesi environment safety dosyaları, preflight sonuç şablonları ve local env kontrol scripti hazırlandı.

Bu sprintin amacı:

1. Production olmayan bir staging/local Supabase ortamı seçmek.
2. `.env.local` değerlerinin production olmadığını doğrulamak.
3. `scripts/verify-staging-env.mjs` kontrolünü çalıştırmak.
4. Staging/local Supabase SQL Editor’da yalnızca `db/staging_rls_preflight_checks.sql` dosyasını çalıştırmak.
5. Preflight çıktılarını `db/staging_rls_preflight_results.md` dosyasına işlemek.
6. Preflight sonucuna göre helper upgrade aşamasına geçilebilir mi kararını raporlamak.

Bu sprintte **RLS helper upgrade, policy cleanup veya tenant policy apply çalıştırılmayacak.**

---

## 1. Kesin Yasaklar

Kesinlikle yapma:

```txt
Production Supabase üzerinde SQL çalıştırma.
Production `.env.local` ile dry-run yapma.
Production service role key kullanma.
DROP POLICY çalıştırma.
CREATE POLICY çalıştırma.
ALTER TABLE çalıştırma.
ENABLE / DISABLE RLS yapma.
INSERT / UPDATE / DELETE / TRUNCATE çalıştırma.
firma_id NOT NULL yapma.
src uygulama kodunu değiştirme.
Secret veya gerçek key içeren dosyaları commit’e alma.
.env.local, .env.production, .env dosyalarını commit’e alma.
```

Bu sprint yalnızca staging/local ortam doğrulama ve read-only preflight sprintidir.

---

## 2. Önce Mevcut Dosyaları Oku

Aşağıdaki dosyaları incele:

```txt
db/staging_rls_env_safety_checklist.md
db/staging_rls_environment_setup.md
db/staging_rls_execution_order.md
db/staging_rls_dry_run_env_template.md
db/staging_rls_preflight_checks.sql
db/staging_rls_preflight_results.md
db/staging_rls_preflight_interpretation.md
scripts/verify-staging-env.mjs
db/staging_rls_go_no_go_report.md
db/tenant_rls_production_readiness_gate.md
```

---

## 3. Ortam Seçimi

Kullanıcı hangi ortamla ilerleyecekse bunu rapora yaz.

Önerilen sıralama:

```txt
1. Ayrı Supabase staging project — önerilen yöntem
2. Supabase branch — mümkünse kullanılabilir
3. Local Supabase — teknik kurulum uygunsa kullanılabilir
```

Bu sprintte seçilen ortam şu dosyaya işlenecek:

```txt
db/staging_rls_preflight_results.md
```

Şu alanları doldur:

```md
## Ortam Bilgisi

| Alan | Değer |
|---|---|
| Ortam tipi | Staging / Branch / Local |
| Supabase project adı | |
| Production mı? | Hayır |
| Test tarihi | |
| Test eden | Erdem Köklü |
```

Eğer ortam hâlâ seçilmediyse görev sonunda `NO-GO: Staging ortam seçilmedi` diye raporla.

---

## 4. Env Güvenlik Kontrolü

`.env.local` dosyasını **içeriğini ekrana yazmadan** kontrol et.

Şu değerlerin varlığı doğrulanmalı:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Kesinlikle key değerlerini rapora yazma.

Şu komutu çalıştır:

```powershell
node scripts/verify-staging-env.mjs
```

Olası sonuçlar:

### A. Script PASS

Devam et. Ancak yine de raporda şu notu yaz:

```txt
Env script temiz geçti; yine de Supabase Dashboard project adı manuel doğrulanmalıdır.
```

### B. Script production hint yakaladı

Dur. Preflight’e geçme.

Raporla:

```txt
NO-GO: Env production değerine benziyor. Preflight çalıştırılmadı.
```

### C. Env eksik

Dur. Preflight’e geçme.

Raporla:

```txt
NO-GO: Staging env eksik. .env.local staging/local değerlerle ayarlanmalı.
```

---

## 5. Preflight SQL Çalıştırma Hazırlığı

Sadece şu dosya kullanılacak:

```txt
db/staging_rls_preflight_checks.sql
```

Bu dosya yalnızca SELECT sorguları içermelidir.

Kesinlikle çalıştırılmayacak dosyalar:

```txt
db/tenant_rls_helper_upgrade_staging.sql
db/tenant_rls_staging_cleanup_real.sql
db/tenant_rls_staging_apply_tenant_policies_real.sql
db/tenant_rls_staging_rollback_real.sql
```

Codex bu dosyaları çalıştırmayacak. Kullanıcı staging/local Supabase SQL Editor’da bölüm bölüm çalıştıracak.

---

## 6. Kullanıcıya Verilecek Preflight Çalıştırma Sırası

Görev sonunda kullanıcıya şu sırayı açıkça ver:

```txt
1. Staging/local Supabase SQL Editor aç.
2. Production project olmadığını üst bardan doğrula.
3. db/staging_rls_preflight_checks.sql dosyasını aç.
4. Bölüm 1’i çalıştır: Kritik tablolar var mı?
5. Çıktıyı db/staging_rls_preflight_results.md içine işle.
6. Bölüm 2’yi çalıştır: firma_id kolonları var mı?
7. Bölüm 3’ü çalıştır: Helper fonksiyon durumu.
8. Bölüm 4’ü çalıştır: Kullanıcı / firma / rol kontrolü.
9. Bölüm 5’i çalıştır: Fazla izin veren policy sayısı.
10. Tüm çıktıları kullanıcı ChatGPT’ye gönderecek.
```

---

## 7. Preflight Sonuç Dosyasını Güncelle

`db/staging_rls_preflight_results.md` dosyasını şu başlıklarla hazır ve doldurulabilir hale getir:

```md
# Staging RLS Preflight Results

## Ortam Bilgisi

| Alan | Değer |
|---|---|
| Ortam tipi | |
| Supabase project adı | |
| Production mı? | Hayır |
| Test tarihi | |
| Test eden | Erdem Köklü |

## Env Safety Check

| Kontrol | Sonuç | Not |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL var mı? | | Değer yazılmayacak |
| NEXT_PUBLIC_SUPABASE_ANON_KEY var mı? | | Değer yazılmayacak |
| SUPABASE_SERVICE_ROLE_KEY var mı? | | Değer yazılmayacak |
| Production hint var mı? | | |
| scripts/verify-staging-env.mjs sonucu | | |

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

## Preflight Kararı

- [ ] GO — Helper upgrade aşamasına geçilebilir.
- [ ] NO-GO — Eksikler var.
- [ ] NO-GO — Ortam production olabilir.
- [ ] NO-GO — Staging ortam henüz seçilmedi.

## Notlar

-
```

---

## 8. Go / No-Go Mantığı

Preflight sonrası karar şu kurala göre verilecek:

### GO

Aşağıdakilerin tamamı sağlanırsa:

```txt
Ortam production değil.
Env kontrolü production hint vermedi.
Kritik tablolar var.
firma_id kolonları var.
Kullanıcı/firma/rol verisi test için yeterli.
Preflight SQL hata vermedi.
```

### NO-GO

Aşağıdaki durumlardan biri varsa:

```txt
Ortam production olabilir.
Env production hint verdi.
Staging project adı doğrulanamadı.
Kritik tablo eksik.
firma_id kolonu eksik.
Test kullanıcısı/firma verisi yetersiz.
Preflight SQL hata verdi.
```

---

## 9. GOREV.md Görev Sonu Raporu

Görev sonunda `GOREV.md` içine şu formatta rapor ekle:

```md
# Sprint 2.2 Görev Sonu Raporu

## Yapılanlar

- Staging/local ortam seçimi kontrol edildi.
- Env safety kontrolü çalıştırıldı.
- Preflight sonuç şablonu güncellendi.
- Kullanıcıya staging/local SQL Editor’da çalıştırılacak preflight sırası hazırlandı.

## Production’da İşlem Yapıldı mı?

Hayır.

## SQL Çalıştırıldı mı?

Codex tarafından hayır.

## Env Kontrol Sonucu

- node scripts/verify-staging-env.mjs:
- Production hint:
- Eksik env:

## Preflight Durumu

- Preflight SQL çalıştırıldı mı? Kullanıcı tarafından staging/local ortamda çalıştırılacak.
- Sonuçlar işlendi mi?
- GO / NO-GO:

## Güncellenen Dosyalar

- db/staging_rls_preflight_results.md
- db/staging_rls_env_safety_checklist.md
- db/staging_rls_go_no_go_report.md
- GOREV.md

## Sonraki Adım

Eğer GO ise sıradaki sprint:

Sprint 2.3 — Staging Helper Upgrade Uygulama ve Doğrulama

Eğer NO-GO ise önce staging/local ortam eksikleri giderilecek.
```

---

## 10. Testler

Kod iş mantığı değişmeyecek. Yine de çalıştır:

```powershell
npx.cmd tsc --noEmit
npm run build
```

Env script kontrolü:

```powershell
node scripts/verify-staging-env.mjs
```

Bu script production hint yakalarsa hata vermesi beklenen davranıştır. Böyle olursa bunu görev sonu raporunda belirt ve preflight’e geçme.

Git kontrolü:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
git -c core.autocrlf=false --no-pager diff --name-only
```

Beklenen değişiklikler:

```txt
GOREV.md
db/staging_rls_preflight_results.md
db/staging_rls_env_safety_checklist.md
db/staging_rls_go_no_go_report.md
```

`scripts/verify-staging-env.mjs` sadece gerekli küçük düzeltme varsa değişebilir.

`src/` değişmemeli.

---

## 11. Commit

Stage edilecek dosyalar:

```powershell
git add GOREV.md
git add db/staging_rls_preflight_results.md
git add db/staging_rls_env_safety_checklist.md
git add db/staging_rls_go_no_go_report.md
```

Eğer env scriptte küçük düzeltme yapıldıysa:

```powershell
git add scripts/verify-staging-env.mjs
```

Stage kontrolü:

```powershell
git diff --cached --name-only
```

Commit:

```powershell
git commit -m "docs: prepare staging RLS preflight run"
```

Push:

```powershell
git push
```

---

# Sprint 2.3 Görev Sonu Raporu

## Yapılanlar

- Production'dan ayrı Supabase staging project kurulum runbook'u oluşturuldu.
- Minimum anonim seed planı oluşturuldu (iki firma + test verisi).
- Manuel Auth kullanıcı kurulum dokümanı oluşturuldu (auth.users → kullanici_profiller eşleme).
- Preflight öncesi (SQL öncesi) checklist oluşturuldu.
- Env switching guide oluşturuldu (.env.local production ↔ staging güvenli geçiş).
- Mevcut ortam dosyaları Sprint 2.3 referanslarıyla güncellendi.

## Production'da İşlem Yapıldı mı?

Hayır.

## SQL Çalıştırıldı mı?

Hayır. RLS helper upgrade / cleanup / tenant policy apply çalıştırılmadı.

## Kod İş Mantığı Değişti mi?

Hayır. `src/` değişmedi.

## Üretilen Dosyalar

- db/staging_project_setup_runbook.md
- db/staging_minimal_seed_plan.md
- db/staging_manual_auth_user_setup.md
- db/staging_preflight_before_sql_checklist.md
- db/staging_env_switching_guide.md

## Güncellenen Dosyalar

- db/staging_rls_environment_setup.md
- db/staging_rls_env_safety_checklist.md
- db/staging_rls_preflight_results.md
- GOREV.md

## Testler

- npx.cmd tsc --noEmit: PASS
- npm run build: PASS
- node scripts/verify-staging-env.mjs: exit 1 (production hint yakalandı)

## GO / NO-GO

NO-GO — `scripts/verify-staging-env.mjs` mevcut `.env.local` ortamında production hint yakaladı (exit 1). Bu repodaki aktif ortam production'a bağlı olduğu sürece staging kurulumu ve preflight SQL başlatılmaz. GO için production olmayan ayrı bir staging projesi `.env.local`'a tanımlanıp script exit 0 dönmelidir.

## Sonraki Adım

1. `db/staging_project_setup_runbook.md` ile ayrı staging projesi kur.
2. `db/staging_minimal_seed_plan.md` ve `db/staging_manual_auth_user_setup.md` ile veri/kullanıcı hazırla.
3. `db/staging_env_switching_guide.md` ile `.env.local`'ı staging'e al; `node scripts/verify-staging-env.mjs` exit 0 olmalı.
4. `db/staging_preflight_before_sql_checklist.md` tamamla.
5. Ardından `db/staging_rls_preflight_checks.sql` çalıştır.
