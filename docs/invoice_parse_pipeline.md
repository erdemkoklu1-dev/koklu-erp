# Fatura Yükleme / Parse Hattı — Tasarım ve Kalan İşler

> Kapsam: GOREV.md Faz G
> Branch: `fix/aggregate-data-loss-and-invoice-parse`
> Staging Gate 0: **NO-GO** ⇒ UI smoke ve staging doğrulaması ÇALIŞTIRILMADI.

---

## 1. Kanonik endpoint

```
POST /api/v1/invoices/parse
Content-Type: multipart/form-data
Alan: file  (PDF | XML | ZIP | PNG | JPEG)
```

Dosya: `src/app/api/v1/invoices/parse/route.ts`

### Neden Server Action değil

Server Action kimlikleri build'ler arasında değişir. Açık kalmış eski bir sekme
yeni deploy sonrası **HTML 404** alır; istemci bunu JSON sanıp parse etmeye
çalışınca kullanıcı `Unexpected token '<'` görür. Versiyonlu route + ortak zarf
bu hata sınıfını yapısal olarak ortadan kaldırır.

### Ortak JSON zarfı

Her yanıt — hata dâhil — `application/json` ve şu şekildedir:

```jsonc
// başarı
{ "ok": true,  "data": { /* InvoicePreview */ }, "requestId": "…" }
// hata
{ "ok": false, "error": { "code": "…", "message": "…", "retryable": false }, "requestId": "…" }
```

`GET` gibi yanlış metotlar da JSON zarfı döndürür (405) — Next'in varsayılan
HTML hata sayfası devreye girmez.

İstemci tarafı zaten mevcut: `readApiResponse` / `requestApi`
(`src/lib/api/envelope.ts`) sırasıyla **HTTP status → content-type → JSON parse**
kontrolü yapar ve timeout / network / build-mismatch ayrımını taşır.

---

## 2. Parser öncelik sırası

```
1. UBL-TR XML (doğrudan)          → src/lib/invoice-parse/ubl-tr.ts     deterministik
2. UBL-TR XML (ZIP içinden)       → aynı; ZIP'te XML varsa PDF HİÇ AÇILMAZ
3. PDF metin katmanı              → src/lib/parsePdfBuffer.ts
4. Taranmış PDF / görüntü → OCR   → BAĞLANMADI (kontrollü 501)
5. AI                             → BAĞLANMADI (yalnızca yardımcı olabilir)
6. Kullanıcı ön izlemesi          → zorunlu (`autoSaveAllowed`)
7. Kayıt                          → bu hattın DIŞINDA
```

Orkestrasyon: `src/lib/invoice-parse/pipeline.ts`.
Bağımlılıklar (`adm-zip`, `pdfjs`) enjekte edilir; hat katmanı bağımlılıksızdır
ve `node --test` altında doğrudan test edilir.

### AI'nin rolü

**AI bu hatta birincil kaynak DEĞİLDİR ve şu anda hiç çağrılmamaktadır.**
Mevcut `src/lib/invoice-ai-parser.ts` eski route'larda kullanılmaya devam ediyor
(bkz. §6). Kanonik hatta bağlanacaksa yalnızca düşük güvenli alanlarda yardımcı
olarak, şema doğrulaması + toplam tutarlılığı + güven skoru kontrolünden sonra
bağlanmalıdır.

---

## 3. Dosya güvenliği

| Kontrol | Nerede | Davranış |
|---|---|---|
| Tür tespiti | `file-acceptance.ts` `detectFileKind` | **magic bytes**; dosya adı kullanılmaz |
| Uzantı ↔ içerik uyuşmazlığı | `acceptInvoiceFile` | `FILE_EXTENSION_MISMATCH` |
| Boyut sınırı | route + hat | 20 MB, aşılırsa içerik hiç okunmaz |
| Bozuk PDF | `hasPdfEndMarker` | `FILE_CORRUPT_PDF` |
| Şifreli PDF | `isEncryptedPdf` | `FILE_ENCRYPTED_PDF` |
| ZIP entry sayısı | `archive.ts` | 50 |
| ZIP açılmış toplam boyut | `archive.ts` | 60 MB |
| ZIP tek dosya boyutu | `archive.ts` | 20 MB |
| ZIP sıkıştırma oranı | `archive.ts` | > 200× ⇒ reddedilir (zip bomb) |
| Path traversal | `isUnsafeEntryName` | `..`, mutlak yol, sürücü harfi, UNC |
| İç içe arşiv | `isNestedArchive` | açılmaz |
| XML DTD / external entity | `xml.ts` | **yapısal olarak desteklenmez** |
| XML derinlik / düğüm sınırı | `xml.ts` | 100 / 200.000 |
| Timeout | route | 30 sn, sonra `PARSE_TIMEOUT` (504) |
| Ham exception / stack trace | route | istemciye **dönmez**, loga yalnızca kod yazılır |

ZIP sınırları **açma yapılmadan**, entry header'ındaki boyutlardan değerlendirilir;
sınır aşılıyorsa içerik belleğe hiç alınmaz.

XXE'ye karşı koruma bir bayrak değil, **yokluk** üzerine kuruludur: okuyucu entity
çözümlemesini hiç uygulamaz, `<!DOCTYPE` ve `<!ENTITY` gören belgeyi reddeder.

---

## 4. Desteklenen UBL-TR alanları

Fatura no · UUID · düzenleme tarihi/saati · fatura türü (`InvoiceTypeCode`) ·
senaryo (`ProfileID`) · düzenleyen ve alıcı unvanı · VKN/TCKN (`schemeID` ile,
yoksa uzunluk + kontrol hanesi) · vergi dairesi · para birimi · kur
(`PricingExchangeRate`) · satır açıklaması, miktar, birim (`unitCode`), birim
fiyat · iskonto/artırım (`AllowanceCharge`, tek işarete indirgenir) · KDV
oran/tutarı · ara toplam · vergi toplamı · vergiler dâhil toplam · ödenecek
tutar · irsaliye ve sipariş referansları.

Bütün eşleme **yerel ad** üzerinden yapılır (`cbc:ID`, `ns7:ID`, `ID` aynıdır),
çünkü UBL-TR üreticileri prefix'leri farklı seçer.

TR sayı/tarih/para normalizasyonu tek ortak katmandadır:
`src/lib/invoice-parse/normalization.ts` (`1.200,00`, `1,200.00`, `1,20`, `%20`,
kuruş yuvarlaması).

---

## 5. Fixture sınıfları ve doğrulama durumu

| Sınıf | Sayı | Sonuç | Not |
|---|---|---|---|
| **Synthetic** | 1 üreteç + 8 varyant (`tests/fixtures/ubl-synthetic.ts`) | ✅ 50 test geçti | Commit edilebilir; gerçek veri içermez |
| **Anonymized real** | **0** | — | Kullanıcı onaylı anonimleştirilmiş örnek YOK |
| **Private local** | **0** | — | Commit edilmez, log'a yazılmaz |

> **BLOKE — GERÇEK ANONİMLEŞTİRİLMİŞ FIXTURE YOK.**
> Altyapı sentetik fixture'larla doğrulanmıştır. Hiçbir **tedarikçi formatı
> doğrulanmış sayılamaz**. Migros, Erkarpaş, Hidropres, Semihler gibi
> `supplierClassifier.ts` içinde adı geçen şablonlar bu sprintte
> **doğrulanmamıştır**.

### Kapsanan geçmiş hata regresyonları

| Regresyon | Test | Sonuç |
|---|---|---|
| `1200` → `1,20` parse edilmemesi | `REGRESYON: 1200 değeri…` | ✅ |
| KDV toplamının ödenecek tutara yansıması | `REGRESYON: KDV toplamı…` | ✅ |
| Tarihin doğru çekilmesi | `zorunlu alanlar` | ✅ |
| Düzenleyen/alıcı tarafın ters yazılmaması | `düzenleyen ve alıcı TERS YAZILMAZ` | ✅ |
| Türkçe karakterlerin bozulmaması | `Türkçe karakterler bozulmaz` | ✅ |
| VKN + normalize fatura no ile duplicate tespiti | `duplicate anahtarı…` | ✅ |
| Bozuk / şifreli / desteklenmeyen dosya | 4 test | ✅ |
| ZIP içindeki XML'in PDF'ten önce kullanılması | `ZIP içindeki XML…` | ✅ |
| Düşük güven skorunda otomatik kayıt yapılmaması | `düşük güven skorunda…` | ✅ |
| 404 / HTML / bozuk JSON / timeout ayrımı | `tests/api-envelope.test.ts` | ✅ (önceki sprint) |
| Mevcut tedarikçinin VKN/normalize unvanla eşleşmesi | — | ❌ gerçek fixture yok |

---

## 6. KALAN İŞ — eski route'ların konsolidasyonu (BU SPRINTTE YAPILMADI)

Repoda hâlâ birbirinden bağımsız parse mantığı taşıyan route'lar var:

```
src/app/api/parse-fatura
src/app/api/parse-invoice
src/app/api/gelen-pdf-parse
src/app/api/pdf-fatura-parse
src/app/api/efatura-import
src/app/api/gelen-fatura-import
```

Bunlar bu sprintte **kanonik endpoint'e delege edilmemiştir** ve bazılarında AI
hâlâ birincil kaynaktır.

**Neden yapılmadı:** her route farklı bir yanıt şekli döndürüyor ve farklı UI
akışları (fatura yükle, gelen fatura içe aktar, e-fatura import) bunlara bağlı.
Hepsini tek zarfa taşımak, staging'de doğrulanamayacak bir davranış değişikliği
olurdu — Gate 0 NO-GO iken bu, kullanıcıyı doğrulanmamış bir akışla baş başa
bırakmak anlamına gelirdi.

**Önerilen sıra (ayrı görev):**

1. Her route için mevcut yanıt şekli ve çağıran UI bileşeni envanterlenir.
2. Route'lar iç mantığı silinerek `parseInvoiceFile` hattına delege eder;
   yanıt şekli geçiş süresince korunur (adapter).
3. UI bileşenleri `requestApi` + ortak zarfa taşınır.
4. Adapter'lar kaldırılır; route'lar ya `/api/v1/invoices/parse`'a 308
   yönlendirir ya da belgelenerek silinir.
5. AI yolu yalnızca §2'deki koşullarla yardımcı olarak bağlanır.

---

## 7. Açık blokajlar

| Blokaj | Etki | Production engeli mi? |
|---|---|---|
| Gerçek anonimleştirilmiş fixture yok | Tedarikçi formatları doğrulanmamış | HAYIR (parser altyapısı hazır) — ama "doğrulandı" denemez |
| OCR bağlanmadı | Taranmış PDF/görüntü işlenemez; kontrollü 501 döner | HAYIR (açık ve dürüst hata) |
| Eski route'lar konsolide edilmedi | AI bazı yollarda hâlâ birincil kaynak | **EVET** — GOREV.md §12 gereği |
| UI smoke testleri | Gate 0 NO-GO | **EVET** |
