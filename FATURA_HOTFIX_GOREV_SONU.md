# Köklü ERP Fatura Hotfix — Production Görev Sonu

## Yetki ve ortam
- Aktif izin profili: Full access / sınırsız dosya sistemi
- Approval policy: `never`
- Repo yolu: `C:\Projects\koklu-erp`
- Production hedefleri (maskeli): Supabase project ref/proje adı CLI oturumu olmadığı için doğrulanamadı; Vercel project/team bağlantısı bulunamadı.
- Kullanılan mevcut CLI/auth oturumları: Git remote kimliği çalışıyor; Supabase access token yok; Vercel’de bulunan token geçersiz.

## Git
- Başlangıç branch/commit: `fix/aggregate-data-loss-and-invoice-parse` / `bec79fa7198d2bb880e953adc43cb084f853a5f1`
- Review aralığı: `bec79fa7198d2bb880e953adc43cb084f853a5f1..b4876ab6cbcd922b9f61b6e60e3e81a6df854508`
- Oluşturulan hotfix commitleri: `fe9b875`, `5d65009`, `b4876ab`
- Feature branch push: PASS — remote HEAD `b4876ab6cbcd922b9f61b6e60e3e81a6df854508`
- Main merge commit: `1716009a1935278e7698f4c20173fcd1694526ba`
- Main push: PASS
- Safety tag/önceki sağlıklı commit: `pre-fatura-hotfix-prod-20260804` → `84e34c4`
- Commit edilen dosyaların tam listesi: `git diff --name-only bec79fa..b4876ab` ile doğrulandı; rapor, RPC/migration, parser, canonical route, import UI/servisleri, generated tipler ve ilgili testler.
- Bilinçli stage edilmeyen dosyalar: `.claude/settings.local.json`, `GOREV.md`, `tests/private-fixtures/`.

## Review bulguları ve düzeltmeler
| Seviye | Dosya/satır | Somut sorun | Uygulanan düzeltme | Doğrulama |
|---|---|---|---|---|
| P0 | `db/invoice_import_atomic_rpc.sql` | SECURITY DEFINER RPC, istemciden gelen `firma_id` değerine güveniyordu. | `auth.uid()` / service-role `p_user_id`, profil üyeliği, tenant ve şube sahipliği kontrolleri eklendi; sabit `search_path` kullanıldı. | SQL contract testleri PASS |
| P0 | Aynı dosya | Her `unique_violation` duplicate sayılıyor, farklı tablo ihlalleri gizleniyordu. | Yalnız `invoices_firma_type_number_uidx` idempotent kabul ediliyor; diğer ihlaller yeniden fırlatılıyor. | SQL contract testleri PASS |
| P0 | Aynı dosya | Unique index mevcut duplicate veride kontrolsüz düşebilirdi. | Sayısal read-only preflight zorunlu kılındı; duplicate varsa migration açık hata ile duruyor. | Sözleşme testi PASS; production metadata BLOKE |
| P0 | Customer payload | Olmayan `customers.ilce` alanı schema-cache hatası üretiyordu. | İlçe adreste korunuyor, şehir canonical `il` alanına gidiyor. | Payload ve Temmuz testleri PASS |
| P1 | Parse/import akışları | Tekli ve toplu ekran farklı parser yollarındaydı. | İkisi canonical `/api/v1/invoices/parse` hattına bağlandı. | Route testleri 16/16 PASS |

## Testler
| Komut/test | Sonuç | Süre | Kanıt/özet |
|---|---|---:|---|
| `npm.cmd test` | PASS | 23 sn | Tüm paket exit 0; yeni atomik güvenlik testleri dahil |
| `npx.cmd tsc --noEmit` | PASS | 69 sn | Exit 0 |
| `npm.cmd run test:route` | PASS | 4 sn | 16/16 |
| Özel Temmuz doğrulaması | PASS | test grubunda | 20/20, failures=0, AI=0, OCR=0 |
| Hedefli ESLint | BASELINE | 34 sn | Yeni değişen satırlarda yeni hata/uyarı yok; raporlanan sorunlar başlangıç commitindeki değişmemiş satırlarda |
| `npm.cmd run lint` | REPO BASELINE FAIL | 160 sn | 439 hata / 80 uyarı; görev öncesi teknik borç |
| `npm.cmd run build` | PASS | 173 sn | Next.js 16.2.1; compile/typecheck ve 124/124 sayfa |

## Temmuz 20 fatura matrisi
| Alan | Beklenen | Geçen | Kalan | Kanıt |
|---|---:|---:|---:|---|
| Fatura no | 20 | 20 | 0 | Private doğrulama scripti |
| Tarih | 20 | 20 | 0 | Aynı |
| Müşteri/VKN | 20 | 20 | 0 | Aynı |
| Adres/şehir | 20 | 20 | 0 | Aynı |
| Kalem sayısı | 20 | 20 | 0 | KOK…118=3, KOK…127=3 |
| Toplam | 20 | 20 | 0 | Aynı |

## Production DB
- Project ref/proje adı (maskeli): Doğrulanamadı; `supabase projects list` access token olmadığı için reddedildi.
- Read-only preflight: BLOKE — production bağlantı kimliği yok.
- İlk ₺600,00 faturanın durumu: Doğrulanamadı.
- Mevcut duplicate/yarım kayıt sonucu: Doğrulanamadı.
- Backup yöntemi/zamanı/doğrulaması: Alınamadı; doğrulanmış backup olmadan migration güvenlik gereği uygulanmadı.
- Uygulanan migration(lar): Yok.
- Migration sonucu: BLOKE.
- RPC/security/search_path/RLS sonucu: Repo sözleşmesi PASS; gerçek production metadata doğrulaması BLOKE.
- Rollback, duplicate/idempotency, concurrency ve tenant izolasyon testleri: Production üzerinde BLOKE.

## Production deploy
- Vercel project/team: Doğrulanamadı; `.vercel/project.json` yok ve CLI token geçersiz.
- Deployment commit SHA: Doğrulanmış deployment yok.
- Deployment kimliği/URL: Yok.
- Durum: BLOKE; Ready/Healthy doğrulanmadı.
- Önceki sağlıklı deployment: Git safety tag dışında Vercel kimliği alınamadı.
- Rollback gerekip gerekmediği: Deployment yapılmadığı için hayır.

## Production smoke
- `/cari-hesap/fatura-import`: Authenticated production smoke BLOKE.
- `/cari-hesap/faturalar/new`: Authenticated production smoke BLOKE.
- Şehir/Şube ayrımı: Local test/kod PASS; production doğrulaması BLOKE.
- Kalem düzenleme/veri koruma: Local regresyon testleri PASS; production doğrulaması BLOKE.
- Network URL/method/status/content-type: Testte canonical multipart `POST /api/v1/invoices/parse`, JSON `2xx`, `ok:true` PASS.
- AI/OCR çağrı sayısı: Private metin katmanlı PDF matrisinde AI=0, OCR=0.
- Log/health sonucu: Production Vercel erişimi olmadığı için BLOKE.

## Son karar
- Local PASS: EVET
- Feature branch PASS: EVET
- Main merge/push PASS: EVET
- Production DB PASS: HAYIR
- Production deploy PASS: HAYIR
- Production smoke PASS: HAYIR
- Genel karar: **PRODUCTION PASS DEĞİL.** Programın canlıda tamamen kullanılabilir olduğu raporlanamaz.
- Tek dış engel kümesi: Köklü ERP production Supabase ve Vercel için geçerli mevcut CLI/auth oturumlarının bu çalışma ortamına sağlanması. Bu olmadan hedef kimliği, backup, migration, deploy ve authenticated smoke güvenli biçimde tamamlanamaz.
