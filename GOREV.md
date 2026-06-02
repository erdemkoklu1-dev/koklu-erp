# GÖREV — Gelen Fatura Şube Filtresi + Rol/Şube Bazlı Yeni Anasayfa Tasarımı

## Amaç

Rol ve şube bazlı yetki sistemi kısmen çalışıyor.

Mevcut durum:

- Kullanıcı şube bazlı atanmış.
- Giden faturalar doğru filtreleniyor.
- İstanbul şube kullanıcısı sadece İstanbul giden faturalarını görebiliyor.
- Ancak Gelen Faturalar sayfası şube filtresini doğru uygulamıyor.
- Anasayfa da şube bazlı çalışmıyor.
- Anasayfada kullanıcının rolüne göre gereksiz kartlar gizlenmiyor.

Bu görevde yapılacaklar:

1. Gelen Faturalar sayfasına şube bazlı veri filtresi uygulanacak.
2. Anasayfa tüm kullanıcılar için rol + şube bazlı yeniden düzenlenecek.
3. Teknik personel finansal/cari bilgileri görmeyecek.
4. Muhasebe kullanıcısı finansal özetleri görecek.
5. Şube yöneticisi sadece kendi şubesinin operasyon, müşteri, fatura ve hatırlatma verilerini görecek.
6. Super admin / admin tüm şubeleri görecek.
7. Yeni modüller anasayfaya kontrollü ve yetki bazlı eklenecek.

---

# 1. Gelen Faturalar Şube Filtresi Düzeltilecek

## Mevcut sorun

`Giden Faturalar` sayfasında şube bazlı filtre doğru çalışıyor.

Ancak `Gelen Faturalar` sayfasında İstanbul şubesine atanmış kullanıcı tüm gelen faturaları veya Erzincan kayıtlarını da görebiliyor.

Bu yanlış.

## Beklenen davranış

Kullanıcı İstanbul Şube’ye atanmışsa:

- Gelen Faturalar sayfasında sadece İstanbul Şube gelen faturaları görünmeli.
- Erzincan Merkez gelen faturaları görünmemeli.
- Toplam Fatura Tutarı, Kalan Borç, Geçmiş gibi üst kartlar sadece İstanbul şubeye göre hesaplanmalı.
- Filtrelerde “Tüm Şubeler” görünmemeli.
- Şube filtresi otomatik İstanbul Şube olmalı ve değiştirilememeli.

Kullanıcı Erzincan Merkez’e atanmışsa:

- Sadece Erzincan gelen faturaları görünmeli.

Super admin / admin:

- Tüm şubeleri görebilir.
- Şube filtresinden seçim yapabilir.

---

# 2. Gelen Fatura Query Kontrolü

Aşağıdaki dosyaları bul ve kontrol et:

- `src/app/(dashboard)/cari-hesap/gelen-faturalar/page.tsx`
- `src/app/(dashboard)/cari-hesap/page.tsx`
- `src/components/cari-hesap/GelenFaturalar...`
- `src/lib/cari-hesap/...`
- `src/lib/invoices/...`
- `src/lib/auth/get-user-permissions.ts`
- `src/lib/auth/permissions.ts`

Dosya isimleri projede farklı olabilir. Gerçek dosya isimlerini bul.

## 2.1. Gelen fatura sorgusunda şube filtresi

Sorguya permissionSet dahil edilmeli.

Örnek:

```ts
const permissionSet = await getCurrentUserPermissionSet();

let query = supabase
  .from('invoices')
  .select('*')
  .eq('invoice_direction', 'incoming');