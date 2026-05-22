# GÖREV

Tamamlandı.

## Sonuç

- Gelen fatura import save route'u: `/api/gelen-pdf-save`
- Hedef tablo: `public.invoices`
- Kayıt tipi: `invoice_type = 'alis'`
- Kök neden: save payload'ı `invoices` tablosunda bulunmayan `tedarikci_adres` alanını insert etmeye çalışıyordu.
- Uygulanan fix: `tedarikci_adres` alanı `invoices` insert payload'ından çıkarıldı.
- Parser, preview ekranı, duplicate mantığı ve supplier matching değiştirilmedi.
