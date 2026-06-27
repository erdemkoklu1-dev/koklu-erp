# Staging RLS Dry-Run Environment Template

Bu dosya gerçek `.env` değildir. Secret içermez.

Staging/local RLS dry-run için gerekli environment alanları:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-STAGING-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_STAGING_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_STAGING_SERVICE_ROLE_KEY
```

## Güvenlik Notları

- Production key buraya yazılmayacak.
- Gerçek `.env.local` dosyası commit edilmeyecek (`.gitignore` içinde `.env*` zaten hariç tutulmuştur).
- Service role key hiçbir dokümana yapıştırılmayacak.
- Testten önce Supabase Dashboard'daki project adı kontrol edilecek.

## Kontrol

Aşağıdaki komutla local env kontrol edilebilir:

```bash
node scripts/verify-staging-env.mjs
```

Script, çalışma dizinindeki `.env.local` dosyasını okur (varsa) ve `process.env` değerlerini de dikkate alır. Secret'ları ekrana yazmaz; yalnızca maskelenmiş özet, eksik alan ve production ipucu raporlar.
