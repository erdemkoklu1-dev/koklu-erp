# GÖREV TAMAMLANDI

Teslimatlar modülündeki Tablet Modu ve teslim formu PDF Türkçe karakter düzeltmeleri tamamlandı.

## Yapılanlar

- `Tablet Modu` butonu Teslimatlar ana sayfasında `+ Yeni teslimat` butonunun yanına taşındı.
- Tablet modu teslim formu içindeki lokal state olmaktan çıkarıldı.
- Tablet modu `teslimatlar` route layout seviyesine taşındı ve localStorage ile sayfa geçişlerinde kalıcı hale getirildi.
- Tablet modu dashboard, liste, yeni teslimat, detay ve teslim formu ekranlarına ortak CSS sınıfı üzerinden uygulanıyor.
- Tablet modunda sol menü varsayılan dar hale geliyor; hamburger butonuyla açılıp kapanıyor.
- Teslim formu içindeki tekrar eden Tablet Modu butonu kaldırıldı.
- Teslim formu PDF üretiminde Helvetica yerine Türkçe karakter destekli gömülü Liberation Sans fontu kullanıldı.

## Kontrol

- `npx.cmd tsc --noEmit` başarılı.
- `npm.cmd run build` üretim derlemesini tamamladıktan sonra mevcut Next.js/Windows `.tsbuildinfo` yol normalizasyon hatasında duruyor.
