# GÖREV: Fatura Import Tutar ve Hata Sınıflandırması — Tamamlandı

Tamamlananlar:

- `Ödenecek Tutar` parser kaynağı öncelikle `Ödenecek Tutar`, sonra `Vergiler Dahil Toplam Tutar` olacak şekilde genişletildi.
- `Mal Hizmet Toplam Tutarı` ödeme tutarı kaynağı olarak kullanılmadı.
- Giden fatura düzenle modalında kalem değişikliği mevcut ödeme tutarını KDV hariç kalem toplamıyla otomatik ezmeyecek şekilde düzeltildi.
- `manuel kontrol gerekli` mesajları kırmızı kritik parse hatası yerine düzenlenebilir uyarı seviyesinde bırakıldı.
- Kritik hata sınıflandırması fatura no yokluğu, kalem yokluğu ve gerçek parser hatalarıyla sınırlı tutuldu.
