# Staging RLS Environment Safety Checklist

## Amaç

Bu checklist, RLS dry-run işlemlerinin yanlışlıkla production Supabase üzerinde çalıştırılmasını engellemek için hazırlanmıştır.

## 1. Ortam Kararı

Seçilen ortam:

- [ ] Ayrı Supabase staging project
- [ ] Supabase branch
- [ ] Local Supabase
- [ ] Henüz seçilmedi

## 2. Production'dan Ayrışma Kontrolü

Aşağıdaki maddelerin tamamı doğrulanmadan helper upgrade / cleanup / tenant policy apply çalıştırılmayacak.

- [ ] `NEXT_PUBLIC_SUPABASE_URL` production URL değil.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` production anon key değil.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` production service role key değil.
- [ ] Supabase Dashboard'da staging/local project adı doğrulandı.
- [ ] SQL Editor'da görünen proje adı production değil.
- [ ] Test verileri staging/local üzerinde.
- [ ] Production verisi üzerinde işlem yapılmıyor.

## 3. Yasak Dosyalar

Aşağıdaki dosyalar production'da çalıştırılmayacak:

- `db/tenant_rls_helper_upgrade_staging.sql`
- `db/tenant_rls_staging_cleanup_real.sql`
- `db/tenant_rls_staging_apply_tenant_policies_real.sql`
- `db/tenant_rls_staging_rollback_real.sql`

## 4. İzinli İlk SQL

İlk aşamada yalnızca şu dosya çalıştırılabilir:

- `db/staging_rls_preflight_checks.sql`

Bu dosya sadece `SELECT` sorguları içerir.

## 5. Otomatik Yardımcı Kontrol

Local ortamda env değerlerini doğrulamak için:

```bash
node scripts/verify-staging-env.mjs
```

Bu script secret'ları ekrana yazmaz; yalnızca eksik değer ve production ipucu (hint) raporlar. Script production ipucu yakalarsa dry-run başlatılmaz.

## 6. Go / No-Go

- [ ] Ortam güvenli: preflight'e geçilebilir.
- [ ] Ortam belirsiz: preflight'e geçilmez.
- [ ] Production riski var: işlem durdurulur.
