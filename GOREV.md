# GÖREV — Sprint 2.4: Staging Schema Bootstrap ve Minimal Seed Hazırlığı

## Amaç

Ayrı Supabase staging project kurulduktan sonra kullanılacak schema bootstrap runbook, required objects check SQL, minimal anonim seed template, Auth/profile link template, seed verification SQL ve bootstrap checklist oluştur.

Bu sprint yalnızca staging hazırlık dosyaları üretir. Production Supabase üzerinde hiçbir işlem yapılmayacak.

## Kesin Yasaklar

- Production Supabase üzerinde SQL çalıştırma.
- Production service role key kullanma.
- Production verisini staging'e birebir kopyalama.
- Gerçek müşteri adı, telefon, e-posta, vergi no, adres gibi kişisel/ticari verileri seed içine yazma.
- DROP POLICY çalıştırma.
- CREATE POLICY çalıştırma.
- ALTER TABLE çalıştırma.
- INSERT / UPDATE / DELETE / TRUNCATE çalıştırma.
- RLS helper upgrade çalıştırma.
- RLS cleanup çalıştırma.
- Tenant policy apply çalıştırma.
- `.env.local`, `.env.production`, `.env` veya secret içeren dosyaları commit'e alma.
- `src/` uygulama kodunu değiştirme.

## Üretilecek Dosyalar

- `db/staging_schema_bootstrap_runbook.md`
- `db/staging_schema_required_objects_check.sql`
- `db/staging_minimal_seed_template.sql`
- `db/staging_auth_profile_link_template.sql`
- `db/staging_seed_verification.sql`
- `db/staging_bootstrap_execution_checklist.md`

## Güncellenecek Dosyalar

- `db/staging_project_setup_runbook.md`
- `db/staging_minimal_seed_plan.md`
- `db/staging_manual_auth_user_setup.md`
- `db/staging_preflight_before_sql_checklist.md`
- `GOREV.md`

## Testler

- `npx.cmd tsc --noEmit`
- `npm run build`
- `node scripts/verify-staging-env.mjs`

Not: `verify-staging-env.mjs` production hint yakalarsa görev sonu raporunda `NO-GO: .env.local hâlâ production` yaz. Bu sprint dokümantasyon/SQL hazırlığı olarak tamamlanabilir.

## Commit

Commit mesajı:

```txt
docs: add staging schema bootstrap plan
```

Commit sonrası push yapılacak.

## Görev Sonu Kontrolü

- Production'da işlem yapılmadı.
- SQL çalıştırılmadı.
- Secret commit edilmedi.
- `src/` altında değişiklik yapılmadı.
- Yeni staging bootstrap dosyaları oluşturuldu.
- Mevcut staging runbook/checklist dosyaları Sprint 2.4 notlarıyla güncellendi.
