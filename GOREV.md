# GÖREV — Sprint 2.8: Staging Env PASS Raporu ve Gate Güncellemesi

## Amaç

Staging project açıldıktan sonra `.env.local` doğrulama sonucunu kaydedecek staging env PASS raporunu oluşturmak ve ilgili session/gate dosyalarını güncellemek.

Bu sprint yalnızca dokümantasyon ve gate kaydı üretir. Production veya staging Supabase üzerinde SQL çalıştırılmayacak.

## Kesin Yasaklar

- Production Supabase üzerinde SQL çalıştırma.
- Staging Supabase üzerinde SQL çalıştırma.
- RLS/policy/veri değişikliği yapma.
- `src/` uygulama kodu değiştirme.
- Secret veya `.env` dosyası commit'e alma.
- `.claude/settings.local.json` ve `.claude/worktrees/` commit'e alma.

## Üretilecek Dosyalar

- `db/staging_env_pass_report.md`

## Güncellenecek Dosyalar

- `db/staging_env_verification_session.md`
- `db/staging_first_schema_check_session.md`
- `db/staging_schema_apply_results.md`
- `db/staging_preflight_go_gate.md`
- `GOREV.md`

## Testler

- `npx.cmd tsc --noEmit`
- `npm run build`
- `node scripts/verify-staging-env.mjs`

Not: `verify-staging-env.mjs` production hint yakalarsa görev sonu raporunda `NO-GO: .env.local hâlâ production` yaz. Bu sprint dokümantasyon/gate görevi olarak tamamlanabilir.

## Sprint 2.8 Sonucu

`node scripts/verify-staging-env.mjs` çalıştırıldı ve production hint yakaladı.

```txt
NO-GO: .env.local hâlâ production
```

Bu sonuç nedeniyle schema apply, RLS preflight, policy veya veri işlemlerine geçilmez.

## Commit

Commit mesajı:

```txt
docs: record staging env verification gate
```

Commit sonrası push yapılacak.

## Görev Sonu Kontrolü

- [x] Production'da SQL çalıştırılmadı.
- [x] Staging'de SQL çalıştırılmadı.
- [x] RLS/policy/veri değişikliği yapılmadı.
- [x] Secret commit edilmedi.
- [x] `src/` altında değişiklik yapılmadı.
- [x] `.claude` değişiklikleri commit edilmedi.
- [x] `db/staging_env_pass_report.md` hazırlandı.
- [x] Gate kararı `NO-GO: .env.local hâlâ production` olarak kaydedildi.
