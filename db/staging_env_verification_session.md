# Staging Env Verification Session

> Sprint 2.6 oturum şablonudur. Bu dosya secret içermez ve SQL çalıştırmaz.

## Amaç

Staging project açıldıktan sonra local `.env.local` değerlerinin production'a değil staging Supabase project'e bağlı olduğunu doğrulamak.

## Kesin Kurallar

- Production Supabase üzerinde işlem yapılmaz.
- Staging Supabase üzerinde SQL çalıştırılmaz.
- Secret, anon key, service role key veya database password bu dosyaya yazılmaz.
- `.env.local` veya başka `.env` dosyası commit'e alınmaz.

## Oturum Bilgisi

| Alan | Değer |
| --- | --- |
| Tarih | |
| Yürüten | |
| Staging project adı | |
| Staging project ref son 4 karakter | |
| Production'dan farklı olduğu doğrulandı mı? | |
| Kullanılan branch | |

## Ön Kontroller

- [ ] Supabase Dashboard'da staging project açık.
- [ ] Project adı production project adından farklı.
- [ ] Project URL production URL'den farklı.
- [ ] `.env.local` sadece local makinede güncellendi.
- [ ] Secret değerleri dokümana yazılmadı.
- [ ] `.env.local` git status çıktısında commit adayı değil.

## Komut

```bash
node scripts/verify-staging-env.mjs
```

## Komut Sonucu

| Kontrol | Sonuç | Not |
| --- | --- | --- |
| Komut exit kodu | | |
| Production hint var mı? | | |
| Staging project ayrımı net mi? | | |
| Secret sızıntısı yok mu? | | |

## Karar

```txt
[ ] GO     — Schema apply manuel oturumuna geçilebilir.
[ ] NO-GO  — .env.local production hint veriyor veya staging ayrımı kanıtlanamadı.
```

Production hint yakalanırsa görev sonu raporuna şu ifade yazılır:

```txt
NO-GO: .env.local hâlâ production
```

## Oturum Notları

-
