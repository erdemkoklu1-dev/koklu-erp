# Fatura İçe Aktarma Şema ve Kanonik Parse Hotfix — Görev Sonu

## Git
- Branch: `fix/aggregate-data-loss-and-invoice-parse`
- Başlangıç commit: `bec79fa7198d2bb880e953adc43cb084f853a5f1`
- Son commit(ler): `fe9b875` — Fatura içe aktarma şema ve parser hotfix
- Remote branch/push sonucu: Feature branch push adımından sonra doğrulandı.
- Değişen dosyaların tam listesi: Git durumunda ayrıca görülebilir; bu görevde `db/invoice_import_atomic_rpc.sql`, `src/lib/invoice-import/*`, customer/atomic testleri, generated DB tipi ve mevcut parser/import dosyaları değişti.
- Bilinçli stage edilmeyen dosyalar: `.claude/settings.local.json`, `GOREV.md`, `tests/private-fixtures/`, private Temmuz arşivi.

## Kök nedenler
- customers.ilce hatasının kanıtlanan nedeni: Canonical migration, generated tip ve müşteri formunda `customers.ilce` yokken toplu insert payload’ı bu anahtarı gönderiyordu.
- Canonical customers şehir/ilçe kolonları: Şehir `customers.il`; canonical ilçe kolonu kanıtlanmadı. İlçe tam `address` alanında korunuyor.
- Tek PDF'nin AI yoluna düşme nedeni: Tekli ekran eski/ayrı parse yoluna gidiyordu; mevcut değişiklikler onu `/api/v1/invoices/parse` canonical multipart hattına bağlıyor.
- İlk ₺600,00 faturanın kalıcı durumu: Local DB erişilemediği için BLOKE.
- Duplicate/yarım kayıt denetimi: Gerçek DB denetimi BLOKE; forward-only RPC unique index + advisory transaction lock ile hazırlandı.

## Uygulanan düzeltmeler
- Customer payload/schema contract: `ilce` kaldırıldı; `district` kaybolmadan adrese ekleniyor, şehir `il` alanında ve şubeden bağımsız.
- Batch atomiklik/idempotency: Her satır `invoice_import_atomic` RPC transaction’ına gider; tenant+tür+normalize fatura no unique, eşzamanlı çağrı kilitli, satır hataları ayrı raporlanır.
- Canonical parser/route: Tekli ve toplu akış canonical `/api/v1/invoices/parse` route/service hattını kullanıyor.
- AI/OCR fallback davranışı: Metinli PDF ve UBL/ZIP XML deterministik; Temmuz matrisinde AI=0, OCR=0.

## Temmuz 20 fatura matrisi
| Alan | Beklenen | Geçen | Kalan | Kanıt |
|---|---:|---:|---:|---|
| Fatura no | 20 | 20 | 0 | `verify-private-july-archive.ts` |
| Tarih | 20 | 20 | 0 | Aynı |
| Müşteri/VKN | 20 | 20 | 0 | Aynı |
| Adres/şehir | 20 | 20 | 0 | Aynı |
| Kalem sayısı | 20 | 20 | 0 | Aynı |
| Toplam | 20 | 20 | 0 | Aynı |

## Kritik regresyonlar
- KOK2026000000118 kalem sayısı: 3 PASS
- KOK2026000000127 kalem sayısı: 3 PASS
- U+00AD tarih testi: PASS
- Metinli PDF'de AI çağrı sayısı: 0
- Geçersiz GROQ_VISION_MODEL ile metinli PDF sonucu: Route regresyonu PASS; AI bağımlılığı yok.
- İkinci çalıştırmada duplicate sayısı: DB smoke BLOKE; SQL sözleşme testi PASS.

## Testler
| Komut/test | Sonuç | Kanıt/özet |
|---|---|---|
| `npm.cmd test` | PASS | 350/350 |
| `npx.cmd tsc --noEmit` | PASS | exit 0 |
| Temmuz private matris | PASS | 20/20, failures=0, ai=0, ocr=0 |
| `npm.cmd run lint` | REPO BASELINE FAIL | 440 mevcut hata; görev kapsamındaki yeni route/service/test dosyaları hedefli ESLint PASS |
| `npm.cmd run build` | PASS | Next.js 16.2.1 production build, 124/124 sayfa |

## Smoke
- /cari-hesap/fatura-import: Authenticated UI oturumu olmadığı için BLOKE.
- /cari-hesap/faturalar/new: Authenticated UI oturumu olmadığı için BLOKE.
- Network URL/method/status/content-type: Testte `POST /api/v1/invoices/parse`, multipart, 2xx, JSON `ok:true`.
- Auth nedeniyle bloke kalan adım varsa: İki gerçek UI smoke ve gerçek DB kalıcılık/duplicate denetimi.

## Son karar
- Local code hazır mı: EVET
- Feature branch push edildi mi: EVET
- Staging doğrulandı mı: BLOKE
- Production'a hazır mı: HAYIR
- Kalan riskler: RPC local/staging ortamına uygulanıp gerçek transaction testi ve authenticated UI smoke yapılmalı. Repo-geneli lintte hotfix dışı mevcut 440 hata bulunuyor.
