# Tenant RLS Negative Test Plan

## Test Prensibi

Bir kullanıcı kendi firmasına ait olmayan kayıtları:

- listede görmemeli
- detay URL ile açamamalı
- API ile okuyamamalı
- update/delete edememeli
- PDF/yazdırma üretememeli

## Test Verisi

| Alan | Değer |
| --- | --- |
| Firma A | Köklü Yangın |
| Firma B | Test Yangın Firması |
| Kullanıcı A | Köklü firması normal/admin kullanıcısı |
| Kullanıcı B | Test firması kullanıcısı |
| Şube kısıtlı kullanıcı | Varsa ayrıca test edilir |

## Test Edilecek Modüller

### 1. customers

- Başka firmaya ait müşteri ID'si ile detay aç.
- Başka firmaya ait müşteri ID'si ile edit sayfası aç.
- Başka firmaya ait müşteri için API GET/DELETE dene.
- Beklenen: 404 / yetkisiz / kayıt yok / güvenli hata.

### 2. devices

- Başka firma müşterisine bağlı cihaz listesi.
- Başka firmaya ait cihaz detay URL'si.
- Cihaz oluşturma ekranındaki müşteri seçim listesi.
- Beklenen: görünmez veya yetkisiz.

### 3. service_forms

- Başka firma servis formu detay.
- Başka firma servis formu edit.
- Başka firma servis formu PDF bakım/takip.
- Beklenen: erişim yok.

### 4. invoices/payments

- Başka firma fatura detayı.
- Başka firma faturasına ödeme ekleme.
- Başka firma faturasını silme/pasife alma denemesi.
- Beklenen: 403 veya güvenli hata.

### 5. teslimatlar

- Başka firma teslimat detay.
- Başka firma teslimat PDF.
- Başka firma teslimat düzenleme.
- Beklenen: erişim yok.

### 6. teklifler/proforma

- Başka firma teklif detay/PDF.
- Başka firma proforma detay/PDF.
- Başka firma tekliften işlem üretme denemesi.
- Beklenen: erişim yok.

### 7. teknik_raporlar

- Başka firma teknik rapor detay/yazdır.
- Başka firma teknik rapor copy.
- Başka firma teknik rapor quote.
- Başka firma teknik rapor cancel.
- Beklenen: işlem engellenmeli.

### 8. operasyon

- Başka firma müşteri talebi detay/düzenle/yazdır.
- Başka firma iş planı detay.
- Başka firma planlı iş listesi.
- Beklenen: erişim yok.

### 9. brokers/araci_cari

- Başka firma aracı detay.
- Başka firma aracı cari hareketleri.
- Başka firma aracısına hareket ekleme denemesi.
- Beklenen: görünmez veya güvenli hata.

### 10. dashboard

- Başka firma müşteri, fatura, teklif, teslimat, operasyon, teknik rapor sayıları aggregate içinde görünmemeli.
- Şube kullanıcısında önce firma, sonra şube filtresi uygulanmalı.

## API Negatif Testleri

| Route | Test | Beklenen |
| --- | --- | --- |
| `/api/customers/[id]` | Başka firma müşteri id | 403/404/kayıt yok |
| `/api/invoices/[id]` | Başka firma fatura id | 403/404/kayıt yok |
| `/api/odeme-kaydet` | Başka firma faturasına ödeme | 403/güvenli hata |
| `/api/toplu-odeme` | Başka firma faturalarını içerir payload | 403/güvenli hata |
| `/api/teknik-raporlar/[id]/copy` | Başka firma rapor | 403/güvenli hata |
| `/api/teknik-raporlar/[id]/quote` | Başka firma rapor | 403/güvenli hata |
| `/api/teknik-raporlar/[id]/cancel` | Başka firma rapor | 403/güvenli hata |
| `/api/teslimatlar/[id]/pdf` | Başka firma teslimat | 403/404/kayıt yok |

## Test Sonuç Tablosu

| Modül | Test | Beklenen | Sonuç | Not |
| --- | --- | --- | --- | --- |
| customers | Başka firma detay | 404/yetkisiz |  |  |
| devices | Başka firma cihaz | görünmez |  |  |
| service_forms | Başka firma PDF | erişim yok |  |  |
| invoices/payments | Başka firma ödeme | 403 |  |  |
| teslimatlar | Başka firma PDF | erişim yok |  |  |
| teklifler/proforma | Başka firma PDF | erişim yok |  |  |
| teknik_raporlar | Başka firma cancel | 403 |  |  |
| brokers/araci_cari | Başka firma hareket | görünmez |  |  |
| dashboard | Başka firma aggregate | dahil değil |  |  |
