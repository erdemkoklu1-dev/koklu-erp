# GÖREV — Sprint 2.5: Staging Schema Apply Planı ve SQL Güvenlik Matrisi

## Amaç

Repo içindeki `db/*.sql` dosyalarını staging schema kurulumu açısından sınıflandır, staging schema apply sırasını ve SQL güvenlik matrisini oluştur.

Bu sprint yalnızca dokümantasyon ve analiz üretir. Production veya staging Supabase üzerinde SQL çalıştırılmayacak.

## Kesin Yasaklar

- Production Supabase üzerinde SQL çalıştırma.
- Staging Supabase üzerinde SQL çalıştırma.
- RLS/policy/veri değişikliği yapma.
- `src/` uygulama kodu değiştirme.
- Secret veya `.env` dosyası commit'e alma.
- `.claude/settings.local.json` ve `.claude/worktrees/` commit'e alma.

## Üretilecek Dosyalar

- `db/staging_migration_inventory.md`
- `db/staging_schema_apply_order.md`
- `db/staging_schema_apply_checklist.md`
- `db/staging_schema_apply_results.md`
- `db/staging_sql_file_safety_matrix.md`
- `db/staging_preflight_go_gate.md`

## Güncellenecek Dosyalar

- `db/staging_schema_bootstrap_runbook.md`
- `db/staging_bootstrap_execution_checklist.md`
- `db/staging_project_setup_runbook.md`
- `GOREV.md`

## Testler

- `npx.cmd tsc --noEmit`
- `npm run build`
- `node scripts/verify-staging-env.mjs`

Not: `verify-staging-env.mjs` production hint yakalarsa görev sonu raporunda `NO-GO: .env.local hâlâ production` yaz. Bu sprint dokümantasyon/analiz görevi olarak tamamlanabilir.

## Commit

Commit mesajı:

```txt
docs: add staging schema apply plan
```

Commit sonrası push yapılacak.

## Görev Sonu Kontrolü

- Production'da SQL çalıştırılmadı.
- Staging'de SQL çalıştırılmadı.
- RLS/policy/veri değişikliği yapılmadı.
- Secret commit edilmedi.
- `src/` altında değişiklik yapılmadı.
- `.claude` değişiklikleri commit edilmedi.
