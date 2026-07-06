# Staging Env Verification Session

> Sprint 2.8 env doğrulama takip oturumudur. Bu dosya secret içermez ve SQL çalıştırmaz.

## Amaç

Staging project açıldıktan sonra local `.env.local` değerlerinin production'a değil staging Supabase project'e bağlı olduğunu doğrulamak.

Sprint 2.8 kapsamında doğrulama sonucu staging env PASS raporuna ve preflight gate kararına taşınır.

## Kesin Kurallar

- Production Supabase üzerinde işlem yapılmaz.
- Staging Supabase üzerinde SQL çalıştırılmaz.
- Secret, anon key, service role key veya database password bu dosyaya yazılmaz.
- `.env.local` veya başka `.env` dosyası commit'e alınmaz.

## Oturum Bilgisi

| Alan | Değer |
| --- | --- |
| Tarih | 2026-07-07 |
| Yürüten | Codex |
| Staging project adı | Doğrulanamadı |
| Staging project ref son 4 karakter | Secret/ref kaydı yapılmadı |
| Production'dan farklı olduğu doğrulandı mı? | Hayır |
| Kullanılan branch | main |

## Ön Kontroller

- [ ] Supabase Dashboard'da staging project açık.
- [ ] Project adı production project adından farklı.
- [ ] Project URL production URL'den farklı.
- [ ] `.env.local` sadece local makinede güncellendi.
- [x] Secret değerleri dokümana yazılmadı.
- [x] `.env.local` git status çıktısında commit adayı değil.

## Komut

```bash
node scripts/verify-staging-env.mjs
```

## Komut Sonucu

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| Komut exit kodu | 1 | `verify-staging-env.mjs` başarısız döndü. |
| Production hint var mı? | Evet | `NEXT_PUBLIC_SUPABASE_URL` için production hint yakalandı. |
| Staging project ayrımı net mi? | Hayır | Staging ayrımı kanıtlanamadı. |
| Secret sızıntısı yok mu? | Evet | Komut çıktısında değerler maskelendi; secret dokümana yazılmadı. |

## Sprint 2.8 Sonuç Takibi

| Takip Alanı | Durum | Not |
| --- | --- | --- |
| Env doğrulama oturumu tamamlandı mı? | Evet | Sprint 2.8 kapsamında komut çalıştırıldı. |
| Karar `GO` ise `db/staging_first_schema_check_session.md` başlatıldı mı? | Uygulanamaz | Karar `NO-GO`. |
| Karar `NO-GO` ise nedeni kaydedildi mi? | Evet | `.env.local` production hint veriyor. |
| Production hint varsa görev sonu raporuna taşındı mı? | Evet | `db/staging_env_pass_report.md` güncellendi. |
| `.env.local` commit dışında bırakıldı mı? | Evet | Git status çıktısında commit adayı değil. |

## Karar

```txt
[ ] GO     — Schema apply manuel oturumuna geçilebilir.
[x] NO-GO  — .env.local production hint veriyor veya staging ayrımı kanıtlanamadı.
```

Production hint yakalanırsa görev sonu raporuna şu ifade yazılır:

```txt
NO-GO: .env.local hâlâ production
```

## Oturum Notları

- 2026-07-07: `node scripts/verify-staging-env.mjs` production hint yakaladı. Karar: `NO-GO: .env.local hâlâ production`.
