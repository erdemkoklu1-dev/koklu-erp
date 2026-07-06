# GÖREV — Sprint 2.6: Staging Schema Apply Oturum Hazırlığı

## Amaç

Staging project açıldıktan sonra kullanılacak env doğrulama oturumu, schema apply manuel oturumu, hata logu ve sonraki adımlar dokümanlarını hazırla.

Mevcut schema apply order/checklist/results ve preflight GO gate dosyalarını Sprint 2.6 notlarıyla güncelle.

Bu sprint yalnızca dokümantasyon ve oturum hazırlığı üretir. Production veya staging Supabase üzerinde SQL çalıştırılmayacak.

## Kesin Yasaklar

- Production Supabase üzerinde SQL çalıştırma.
- Staging Supabase üzerinde SQL çalıştırma.
- RLS/policy/veri değişikliği yapma.
- `src/` uygulama kodu değiştirme.
- Secret veya `.env` dosyası commit'e alma.
- `.claude/settings.local.json` ve `.claude/worktrees/` commit'e alma.

## Üretilecek Dosyalar

- `db/staging_env_verification_session.md`
- `db/staging_schema_apply_manual_session.md`
- `db/staging_schema_apply_error_log.md`
- `db/staging_schema_apply_next_steps.md`

## Güncellenecek Dosyalar

- `db/staging_schema_apply_order.md`
- `db/staging_schema_apply_checklist.md`
- `db/staging_schema_apply_results.md`
- `db/staging_preflight_go_gate.md`
- `GOREV.md`

## Testler

- `npx.cmd tsc --noEmit`
- `npm run build`
- `node scripts/verify-staging-env.mjs`

Not: `verify-staging-env.mjs` production hint yakalarsa görev sonu raporunda `NO-GO: .env.local hâlâ production` yaz. Bu sprint dokümantasyon/oturum hazırlığı görevi olarak tamamlanabilir.

## Commit

Commit mesajı:

```txt
docs: add staging schema apply session docs
```

Commit sonrası push yapılacak.

## Görev Sonu Kontrolü

- Production'da SQL çalıştırılmadı.
- Staging'de SQL çalıştırılmadı.
- RLS/policy/veri değişikliği yapılmadı.
- Secret commit edilmedi.
- `src/` altında değişiklik yapılmadı.
- `.claude` değişiklikleri commit edilmedi.
