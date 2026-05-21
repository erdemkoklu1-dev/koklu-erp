# Gelen Fatura Parser v2

## Amaç
Gelen fatura PDF import akışında tüm dosyaların gereksiz şekilde kırmızı parse hatasına düşmesini engellemek ve önce güvenilir header verisini almak. Kalemler eksik olsa bile supplier, fatura no, tarih ve toplam güvenliyse belge `manual_review` seviyesinde düzenlenebilir kalmalıdır.

## Temel Karar
Gelen parser, giden fatura parserından mantıksal olarak ayrılır. Giden faturada Köklü formatı baskındır; gelen faturada tedarikçi şablonları farklıdır. Bu yüzden gelen akışta supplier-template tanıma, header-first parse ve kalite sınıflandırması ayrı bir katman olarak çalışır.

## Akış
1. PDF text extraction mevcut altyapıyla yapılır.
2. `supplierClassifier` metinden supplier/template sinyali üretir.
3. Header parser supplier'dan bağımsız olarak fatura no, tarih, VKN/TCKN ve toplamları arar.
4. Money parser Türkçe formatları güvenli numeric değere çevirir.
5. Mevcut line parser kalem çıkarır; template başlığı görülüp kalem çıkmazsa belge kritik değil `manual_review` olur.
6. Quality layer sonucu `clean`, `manual_review`, `critical_error` olarak sınıflandırır.
7. Mevcut önizleme uyumu için sonuç `temiz_parse`, `manuel_kontrol_gerekli`, `parse_hatasi` değerlerine map edilir.

## Supplier Classifier
Desteklenen template değerleri:

- `migros`
- `erkarpas`
- `hidropres`
- `semihler`
- `unknown`

Tanıma sinyalleri:

- supplier adı
- bilinen anahtar kelimeler
- VKN dışı üst blok firma satırları
- tablo başlıkları

Örnek başlık sinyalleri:

- Migros: `Ürün Kodu`, `Ürün Barkodu`, `Ürün Adı`, `Birim Fiyat`
- Erkarpaş: `# Stok Kodu`, `Mal / Hizmet`
- Hidropres: `Hizmet / Ürün Adı`, `Fatura Numarası`
- Semihler: `Malzeme / Hizmet Kodu`, `Malzeme / Hizmet Açıklaması`

## Header-First Parse
Header parser aşağıdaki alanları kalemlerden bağımsız almaya çalışır:

- `supplier_name`
- `tax_number`
- `invoice_no`
- `invoice_date`
- `due_date`
- `subtotal`
- `vat_total`
- `payable_total`

Desteklenen fatura no varyasyonları:

- `Fatura No`
- `FATURA NO`
- `Fatura Numarası`
- `Fatura Numarasi`

Desteklenen tarih varyasyonları:

- `05-04-2026`
- `01.04.2026 - 11:58:05`
- `10- 04- 2026`
- `04/04/2026`

Öncelik:

1. `Fatura Tarihi`
2. `Düzenleme Tarihi`
3. `Son Ödeme Tarihi` / `Vade Tarihi`

## Money Parser
Gelen parser money parser şu örnekleri destekler:

- `2.500TL` -> `2500`
- `1.200TL` -> `1200`
- `600TL` -> `600`
- `108,91089109TL` -> `108.91`
- `1.583,3333 TL` -> `1583.33`
- `0,788 kg` -> `0.79`
- `%20,00` -> `20`

`1.200` hiçbir zaman `1.20` olarak yorumlanmaz; nokta 3 haneli son grup içeriyorsa binlik ayırıcı kabul edilir.

## Template Line Detection
Bu fazda template başlığı algılanır. Kalem parser mevcut altyapıyla çalışır. Template başlığı bulunmasına rağmen kalem çıkarılamazsa kalite uyarısı `line_items_missing_template_header_found` olur ve header güvenliyse belge `manual_review` seviyesinde kalır.

## Quality Layer
Belge kalite seviyeleri:

- `clean`: header, toplam ve kalemler güvenli.
- `manual_review`: header doğru ama kalemler eksik, tax number eksik veya küçük OCR kusuru var.
- `critical_error`: supplier, fatura no veya tarih gibi temel header alanları yok; ödeme toplamı anlamsız.

Önemli kural: `line_items_missing` tek başına `critical_error` değildir.

## Generic Fallback
Supplier template bilinmiyorsa parser yine generic header pattern'larını çalıştırır. Üst bloktaki alıcı, e-posta, adres ve Köklü VKN satırları supplier olarak alınmaz.

## Toplu ZIP Stratejisi
Her PDF bağımsız parse edilir. Bir dosyanın `critical_error` olması diğer dosyaları etkilemez. Kullanıcı her dosya için ayrı kalite seviyesi görür:

- temiz
- manuel kontrol
- kritik hata

## AI Denetçi
AI ana parser değildir. Kullanılacaksa sadece:

- şüpheli satır uyarısı
- supplier/template önerisi
- ürün normalizasyon önerisi
- kalite/güven önerisi

üretir. Deterministic parser sonucunu sessizce ezmez.
