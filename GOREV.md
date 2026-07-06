# GÖREV — Sprint 2.7: Staging Env Verification ve Read-only Schema Check Oturum Hazırlığı

## Amaç

Staging project açıldıktan sonra env doğrulama sonucunu takip edecek session dosyalarını ve ilk read-only schema check oturum dosyasını hazırla.

Bu sprint yalnızca dokümantasyon ve oturum hazırlığı üretir. Production veya staging Supabase üzerinde SQL çalıştırılmayacak.

## Kesin Yasaklar

- Production Supabase üzerinde SQL çalıştırma.
- Staging Supabase üzerinde SQL çalıştırma.
- RLS/policy/veri değişikliği yapma.
- `src/` uygulama kodu değiştirme.
- Secret veya `.env` dosyası commit'e alma.
- `.claude/settings.local.json` ve `.claude/worktrees/` commit'e alma.

## Üretilecek Dosyalar

- `db/staging_first_schema_check_session.md`

## Güncellenecek Dosyalar

- `db/staging_env_verification_session.md`
- `db/staging_schema_apply_manual_session.md`
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
docs: add staging env verification session
```

Commit sonrası push yapılacak.

## Görev Sonu Kontrolü

- Production'da SQL çalıştırılmadı.
- Staging'de SQL çalıştırılmadı.
- RLS/policy/veri değişikliği yapılmadı.
- Secret commit edilmedi.
- `src/` altında değişiklik yapılmadı.
- `.claude` değişiklikleri commit edilmedi.
- `db/staging_first_schema_check_session.md` hazırlandı.
