# Staging Env Verification Session

> Sprint 2.7 env doğrulama takip oturumudur. Bu dosya secret içermez ve SQL çalıştırmaz.

## Amaç

Staging project açıldıktan sonra local `.env.local` değerlerinin production'a değil staging Supabase project'e bağlı olduğunu doğrulamak.

Sprint 2.7 kapsamında bu dosya, doğrulama sonucunu ilk read-only schema check oturumuna gate olarak taşır.

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

## Sprint 2.7 Sonuç Takibi

| Takip Alanı | Durum | Not |
| --- | --- | --- |
| Env doğrulama oturumu tamamlandı mı? | | |
| Karar `GO` ise `db/staging_first_schema_check_session.md` başlatıldı mı? | | |
| Karar `NO-GO` ise nedeni kaydedildi mi? | | |
| Production hint varsa görev sonu raporuna taşındı mı? | | |
| `.env.local` commit dışında bırakıldı mı? | | |

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
