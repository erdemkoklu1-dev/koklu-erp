# Staging Env Switching Guide

> Local uygulamayı production ile staging Supabase arasında **güvenli** geçirmek içindir. Gerçek `.env` dosyaları ve secret'lar commit edilmez (`.gitignore` içinde `.env*` zaten hariç tutulmuştur).

## 1. Amaç

RLS dry-run staging projesinde yapılırken, local uygulamanın yanlışlıkla production'a bağlı kalmaması gerekir. Bu rehber, `.env.local` değerlerinin nasıl güvenli değiştirileceğini ve doğrulanacağını anlatır.

## 2. Kullanılan Değişkenler

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Secret'sız örnek için bkz. `db/staging_rls_dry_run_env_template.md`.

## 3. Güvenli Geçiş Yöntemleri

### Yöntem A — İki ayrı dosya (önerilen)

1. Mevcut production değerlerini `.env.local.production.bak` olarak yedekle (bu dosya da `.env*` kuralıyla git dışıdır).
2. Staging değerlerini `.env.local.staging.bak` içinde tut.
3. Dry-run sırasında staging dosyasını `.env.local` olarak kopyala:

```bash
cp .env.local.staging.bak .env.local
```

4. Dry-run bitince production dosyasını geri koy:

```bash
cp .env.local.production.bak .env.local
```

> `.bak` dosyaları da secret içerdiği için commit edilmez. `.env*` glob'u bunları kapsar; yine de `git status` ile sızıntı olmadığını doğrula.

### Yöntem B — Tek dosya, manuel düzenleme

`.env.local` içindeki üç değeri staging değerleriyle elle değiştir. Bu yöntemde production değerlerini ayrı güvenli bir yerde sakla.

## 4. Geçiş Sonrası Zorunlu Doğrulama

Her geçişten sonra:

```bash
node scripts/verify-staging-env.mjs
```

| Çıktı | Anlamı | Aksiyon |
| --- | --- | --- |
| `exit 0`, hint yok | Ortam staging görünüyor | Devam edilebilir (yine de Dashboard project adını doğrula) |
| `exit 1`, "POSSIBLE PRODUCTION VALUE DETECTED" | Production'a bağlı | **Dur.** RLS dry-run çalıştırma |
| `MISSING: ...` | Env eksik | Değerleri tamamla |

Ek olarak Supabase Dashboard'da açık projenin staging olduğunu gözle doğrula.

## 5. Dev Server Yeniden Başlatma

`.env.local` değişince Next.js dev server yeniden başlatılmalıdır ki yeni değerler yüklensin:

```bash
npm run dev
```

## 6. Sık Yapılan Hatalar

- `.env.local` staging'e alındı ama dev server yeniden başlatılmadı → uygulama hâlâ production'a bağlı.
- `.bak` dosyalarının yanlışlıkla farklı isimle (`.env` glob'una uymayan) tutulması → commit riski. İsimlendirmeyi `.env*` kuralına uygun tut.
- Production geri alınmadan dry-run bitirildi → sonraki normal kullanım staging'e gider. Dry-run sonrası mutlaka production dosyasını geri koy.

## 7. Sızıntı Kontrolü

Her zaman commit öncesi:

```bash
git status --short
```

`.env`, `.env.local`, `*.bak` gibi dosyalar staged listede **görünmemeli**.
