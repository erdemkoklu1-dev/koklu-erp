# GÖREV — Sprint 1.7B: RLS Staging Dry-Run Dosyalarını Commit/Push ile Kapatma ve Read-Only Envanter Hazırlığı

## Amaç

Sprint 1.7 sonunda RLS staging dry-run hazırlık dosyaları üretildi.

Bu görevin amacı:

1. Sprint 1.7 kapsamında üretilen/güncellenen dosyaları kontrol etmek.
2. Sadece ilgili `db/*.md`, `db/*.sql` ve gerekirse `GOREV.md` dosyalarını commit’e almak.
3. `src/` kod dosyalarında gereksiz değişiklik varsa commit’e almamak.
4. TypeScript ve build sonuçlarını doğrulamak.
5. Commit ve push işlemini tamamlamak.
6. Görev sonunda kullanıcıya Supabase’de hangi read-only SQL dosyalarının çalıştırılacağını net olarak raporlamak.

Bu görevde **RLS açılmayacak**. Bu görev sadece dosya kontrolü, commit/push ve sonraki read-only envanter adımını hazırlama görevidir.

---

## 1. Kesin Yasaklar

Bu görevde kesinlikle şunlar yapılmayacak:

```txt
Production Supabase üzerinde RLS açma.
ALTER TABLE ... ENABLE ROW LEVEL SECURITY çalıştırma.
FORCE ROW LEVEL SECURITY çalıştırma.
CREATE POLICY çalıştırma.
DROP POLICY çalıştırma.
firma_id NOT NULL yapma.
Veri silme.
Veri taşıma.
Veri güncelleme.
Parser, hesaplama, teknik rapor formülü, teslimat mantığı veya PDF tasarımı değiştirme.
UI redesign yapma.
```

Supabase tarafında bu görev kapsamında hiçbir SQL çalıştırılmayacak. Sadece repo dosyaları kontrol edilecek.

---

## 2. Beklenen Sprint 1.7 Dosyaları

Aşağıdaki dosyaların mevcut olduğunu kontrol et:

```txt
db/rls_inventory_output_template.md
db/rls_inventory_analysis.md
db/tenant_rls_staging_dry_run_final.sql
db/tenant_rls_staging_drop_permissive_policies.sql
db/tenant_rls_staging_execution_checklist.md
db/tenant_rls_negative_test_plan.md
db/tenant_rls_production_readiness_gate.md
```

Sprint 1.6 dosyaları daha önce commit’e girmediyse onları da kontrol et:

```txt
db/rls_policy_inventory.sql
db/rls_helper_checks.sql
db/tenant_rls_cleanup_plan.md
db/tenant_rls_drop_permissive_policies_draft.sql
db/tenant_rls_staging_test_plan.md
db/tenant_rls_app_risk_report.md
db/tenant_rls_rollback_plan.md
```

Ayrıca `GOREV.md` Sprint 1.7 raporunu içeriyorsa commit’e dahil edilebilir.

---

## 3. İlk Kontrol: Git Status

Önce çalışma alanını kontrol et:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
```

Çıktıyı incele.

Beklenen değişiklikler şunlarla sınırlı olmalı:

```txt
GOREV.md
db/*.md
db/*.sql
```

Eğer `src/` altında değişiklik varsa, bunun Sprint 1.7 ile ilişkili olup olmadığını kontrol et. Bu görevde normalde kod değişikliği beklenmiyor.

Eğer `.claude/settings.local.json`, `.env.local`, geçici dosya, log dosyası, `changed-files.txt`, `git-status.txt` veya benzeri dosyalar görünürse commit’e alma.

---

## 4. Diff Kontrolü

Aşağıdaki komutları çalıştır:

```powershell
git -c core.autocrlf=false --no-pager diff --name-only
```

```powershell
git -c core.autocrlf=false --no-pager diff --stat
```

Kontrol et:

* Değişiklikler dokümantasyon/SQL hazırlık dosyaları mı?
* Production’da RLS açacak aktif SQL var mı?
* `tenant_rls_staging_dry_run_final.sql` dosyasının başında staging-only uyarısı var mı?
* Drop policy dosyaları production’da çalıştırılmayacak şekilde uyarılı mı?
* RLS enable/create policy içeren dosyalar sadece staging/local amaçlı mı?

Özellikle şu dosyalarda en üstte uyarı olmalı:

```txt
db/tenant_rls_staging_dry_run_final.sql
db/tenant_rls_staging_drop_permissive_policies.sql
db/tenant_rls_drop_permissive_policies_draft.sql
```

Uyarı örneği:

```sql
-- DİKKAT:
-- Bu dosya SADECE staging/local Supabase için hazırlanmıştır.
-- Production Supabase üzerinde çalıştırılmayacak.
```

---

## 5. Stage Edilecek Dosyalar

Sadece aşağıdaki dosyaları stage et:

```powershell
git add db/rls_inventory_output_template.md
git add db/rls_inventory_analysis.md
git add db/tenant_rls_staging_dry_run_final.sql
git add db/tenant_rls_staging_drop_permissive_policies.sql
git add db/tenant_rls_staging_execution_checklist.md
git add db/tenant_rls_negative_test_plan.md
git add db/tenant_rls_production_readiness_gate.md
```

Eğer aşağıdaki Sprint 1.6 dosyaları hâlâ untracked ise ve daha önce commit’e girmemişse onları da stage et:

```powershell
git add db/rls_policy_inventory.sql
git add db/rls_helper_checks.sql
git add db/tenant_rls_cleanup_plan.md
git add db/tenant_rls_drop_permissive_policies_draft.sql
git add db/tenant_rls_staging_test_plan.md
git add db/tenant_rls_app_risk_report.md
git add db/tenant_rls_rollback_plan.md
```

`GOREV.md` Sprint 1.7 görev sonu raporunu içeriyorsa stage et:

```powershell
git add GOREV.md
```

Kesinlikle şunları stage etme:

```txt
.claude/settings.local.json
.env.local
changed-files.txt
git-status.txt
node_modules
.next
src/ dosyaları
geçici log/not dosyaları
```

Kod değişikliği zorunlu görünüyorsa bu görevde commit’e alma; raporda ayrıca belirt.

---

## 6. Stage Kontrolü

Stage sonrası kontrol et:

```powershell
git diff --cached --name-only
```

Beklenen:

```txt
GOREV.md
db/rls_inventory_output_template.md
db/rls_inventory_analysis.md
db/tenant_rls_staging_dry_run_final.sql
db/tenant_rls_staging_drop_permissive_policies.sql
db/tenant_rls_staging_execution_checklist.md
db/tenant_rls_negative_test_plan.md
db/tenant_rls_production_readiness_gate.md
```

Varsa Sprint 1.6 dosyaları:

```txt
db/rls_policy_inventory.sql
db/rls_helper_checks.sql
db/tenant_rls_cleanup_plan.md
db/tenant_rls_drop_permissive_policies_draft.sql
db/tenant_rls_staging_test_plan.md
db/tenant_rls_app_risk_report.md
db/tenant_rls_rollback_plan.md
```

Stage listesinde `src/` dosyası varsa dur ve kullanıcıya raporla. Kullanıcı onayı olmadan commit’e alma.

---

## 7. Testler

Commit öncesi çalıştır:

```powershell
npx.cmd tsc --noEmit
```

Sonra:

```powershell
npm run build
```

Beklenen:

```txt
TypeScript geçti.
Build geçti.
```

Build sırasında `pdfjs-dist` kaynaklı opsiyonel canvas uyarıları çıkarsa ama build başarısız olmuyorsa sorun kabul edilmez.

Eğer `.next/dev/types` kaynaklı geçici hata çıkarsa:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx.cmd tsc --noEmit
npm run build
```

---

## 8. Commit

Stage listesi doğru ve testler başarılıysa commit at:

```powershell
git commit -m "docs: prepare tenant RLS staging dry-run gate"
```

Sonra commit’i kontrol et:

```powershell
git log --oneline -5
```

---

## 9. Push

Commit başarılıysa push yap:

```powershell
git push
```

Push sonrası status kontrolü:

```powershell
git -c core.quotePath=false -c core.autocrlf=false --no-pager status --short
```

Beklenen:

```txt
Çalışma alanı temiz olmalı.
```

Eğer sadece lokal ayar/geçici dosya kaldıysa commit’e alma ve raporda belirt.

---

## 10. Görev Sonrası Kullanıcıya Verilecek Sonraki Manuel Adım

Görev sonunda kullanıcıya şunu net olarak raporla:

Production’da RLS açılmadı.

Şimdi Supabase SQL Editor’da sadece read-only olarak şu dosyalardaki sorgular çalıştırılmalı:

```txt
db/rls_policy_inventory.sql
db/rls_helper_checks.sql
```

Kullanıcıdan beklenen çıktı:

```txt
1. RLS açık/kapalı tablo durumu
2. Mevcut policy listesi
3. Fazla izin veren policy listesi
4. Helper fonksiyon var/yok ve fonksiyon içerikleri
5. Kullanıcı profil/rol/firma kontrol sonucu
```

Kesinlikle çalıştırılmayacak dosyalar:

```txt
db/tenant_rls_staging_dry_run_final.sql
db/tenant_rls_staging_drop_permissive_policies.sql
db/tenant_rls_drop_permissive_policies_draft.sql
```

Bunlar staging/local içindir; production’da çalıştırılmayacak.

---

## 11. Kabul Kriterleri

* [ ] Sprint 1.7 dosyaları kontrol edildi.
* [ ] Staging-only SQL dosyalarında production uyarısı var.
* [ ] Yanlışlıkla `src/` dosyaları stage edilmedi.
* [ ] `.claude/settings.local.json`, `.env.local`, geçici dosyalar stage edilmedi.
* [ ] `git diff --cached --name-only` temiz kontrol edildi.
* [ ] `npx.cmd tsc --noEmit` geçti.
* [ ] `npm run build` geçti.
* [ ] Commit atıldı.
* [ ] Push yapıldı.
* [ ] Production’da RLS açılmadı.
* [ ] Production’da policy drop/create yapılmadı.
* [ ] Sonraki adım olarak read-only envanter sorguları raporlandı.

---

## 12. Görev Sonu Rapor Formatı

Görev bitince şu formatta rapor ver:

```md
# Sprint 1.7B Görev Sonu Raporu

## Yapılanlar

- ...

## Commit

- Commit mesajı:
- Commit hash:

## Push

- Push sonucu:

## Testler

- npx.cmd tsc --noEmit:
- npm run build:

## Stage Edilen Dosyalar

- ...

## Stage Edilmeyen Dosyalar

- ...

## Production RLS Durumu

- RLS açıldı mı? Hayır.
- Policy değiştirildi mi? Hayır.
- NOT NULL yapıldı mı? Hayır.

## Sonraki Manuel Adım

Supabase’de sadece read-only olarak çalıştırılacak dosyalar:

- db/rls_policy_inventory.sql
- db/rls_helper_checks.sql

Çalıştırılmayacak dosyalar:

- db/tenant_rls_staging_dry_run_final.sql
- db/tenant_rls_staging_drop_permissive_policies.sql
- db/tenant_rls_drop_permissive_policies_draft.sql

