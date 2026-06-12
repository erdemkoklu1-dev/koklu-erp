# GÖREV — Bakım ve Takip Formlarında Müşteri Onay Alanını Kaldırma, Kaşe/İmza Yükleme ve Kaşeli/Kaşesiz Çıktı Sistemi

## Amaç

Programın oluşturduğu bakım formu ve müşteri takip formunda alt kısımda bulunan:

- Müşteri Onay İmzası
- Firma Yetkili İmza / Kaşe

alanları yeniden düzenlenecek.

Yeni istenen yapı:

1. Bakım formu ve takip formundan “Müşteri Onay İmzası” alanı kaldırılacak.
2. Sadece “Firma Yetkili İmza / Kaşe” alanı kalacak.
3. Programda merkezi bir “Kaşe / İmza Yükle” alanı oluşturulacak.
4. Kullanıcı kaşe görselini bir defa yükleyecek.
5. Bu kaşe görseli bakım ve takip formlarında firma onay alanına otomatik basılacak.
6. Kullanıcı isterse belgeyi kaşesiz olarak da üretebilecek.
7. Kaşeli / kaşesiz çıktı için toggle eklenecek.
8. Kaşe daha sonra değiştirilebilecek, silinebilecek veya pasifleştirilebilecek.
9. Sistem bakım formu, takip formu, servis formu ve ileride diğer çıktılarda da aynı merkezi kaşe ayarını kullanabilecek.

---

## 1. Mevcut Formlarda Kaldırılacak Alan

Bakım formu ve takip formunun alt kısmında bulunan şu alan kaldırılacak:

```txt
Müşteri Onay İmzası

Ekteki bakım ve takip formlarında alt bölümde **“Müşteri Onay İmzası”** ve **“Firma Yetkili İmza / Kaşe”** alanları birlikte yer alıyor. Yeni yapıda müşteri onay alanını kaldırıp, firma kaşe/imza alanını merkezi yönetilen kaşe görseliyle otomatik dolduracağız.  

````md
# GÖREV — Bakım ve Takip Formlarında Müşteri Onay Alanını Kaldırma, Kaşe/İmza Yükleme ve Kaşeli/Kaşesiz Çıktı Sistemi

## Amaç

Programın oluşturduğu bakım formu ve müşteri takip formunda alt kısımda bulunan:

- Müşteri Onay İmzası
- Firma Yetkili İmza / Kaşe

alanları yeniden düzenlenecek.

Yeni istenen yapı:

1. Bakım formu ve takip formundan “Müşteri Onay İmzası” alanı kaldırılacak.
2. Sadece “Firma Yetkili İmza / Kaşe” alanı kalacak.
3. Programda merkezi bir “Kaşe / İmza Yükle” alanı oluşturulacak.
4. Kullanıcı kaşe görselini bir defa yükleyecek.
5. Bu kaşe görseli bakım ve takip formlarında firma onay alanına otomatik basılacak.
6. Kullanıcı isterse belgeyi kaşesiz olarak da üretebilecek.
7. Kaşeli / kaşesiz çıktı için toggle eklenecek.
8. Kaşe daha sonra değiştirilebilecek, silinebilecek veya pasifleştirilebilecek.
9. Sistem bakım formu, takip formu, servis formu ve ileride diğer çıktılarda da aynı merkezi kaşe ayarını kullanabilecek.

---

## 1. Mevcut Formlarda Kaldırılacak Alan

Bakım formu ve takip formunun alt kısmında bulunan şu alan kaldırılacak:

```txt
Müşteri Onay İmzası
````

Bu alan:

* PDF’te görünmeyecek.
* Yazdırma çıktısında görünmeyecek.
* Boş imza kutusu olarak kalmayacak.
* Alt alanda gereksiz yer kaplamayacak.

---

## 2. Kalacak Alan

Sadece şu alan kalacak:

```txt
Firma Yetkili İmza / Kaşe
```

Bu alan tek başına daha geniş ve kurumsal görünecek.

Önerilen görünüm:

```txt
Firma Yetkili İmza / Kaşe

[ Yüklenen kaşe / imza görseli ]

KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LTD. ŞTİ.
```

Kaşe kapalıysa veya kaşe yüklenmemişse:

```txt
Firma Yetkili İmza / Kaşe

....................................................
```

---

## 3. Kaşe / İmza Yönetim Alanı

Yeni ayar bölümü oluşturulacak.

Önerilen konum:

```txt
Yönetim > Firma Ayarları > Kaşe ve İmza Ayarları
```

Eğer firma ayarları sayfası yoksa:

```txt
Yönetim > Belge / Çıktı Ayarları
```

bölümü oluşturulabilir.

Bu bölümde şu alanlar olacak:

* Kaşe / imza görseli yükle
* Mevcut kaşe önizlemesi
* Kaşeyi değiştir
* Kaşeyi sil
* Varsayılan kaşeli çıktı
* Varsayılan kaşesiz çıktı
* Kaşe genişliği
* Kaşe yüksekliği
* Kaşe opaklığı
* Kaşe aktif / pasif

---

## 4. Desteklenecek Dosya Türleri

Kaşe yükleme alanı şu dosya türlerini kabul etmeli:

```txt
PNG
JPG
JPEG
WEBP
```

Önerilen maksimum boyut:

```txt
2 MB
```

Kullanıcıya açıklama göster:

```txt
En iyi sonuç için arka planı şeffaf PNG formatında kaşe/imza görseli yükleyin.
```

---

## 5. Kaşe Görseli Storage Yapısı

Kaşe görseli Supabase Storage veya mevcut dosya sisteminde saklanacak.

Önerilen bucket:

```txt
company-assets
```

Önerilen klasör:

```txt
company-assets/stamps/
```

Örnek dosya yolu:

```txt
company-assets/stamps/koklu-stamp.png
```

Storage private ise PDF üretimi sırasında signed URL veya base64 kullan.

---

## 6. Veritabanı Ayarları

Mevcut firma ayarları tablosu varsa yeni kolonlar oraya eklenmeli.

Muhtemel tablolar:

```txt
firma_ayarlari
company_settings
app_settings
settings
```

Mevcut tablo yoksa yeni tablo oluşturulabilir.

Önerilen tablo:

```sql
CREATE TABLE IF NOT EXISTS public.company_stamp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  sube_id uuid NULL REFERENCES public.subeler(id),

  title text DEFAULT 'Firma Kaşesi',
  stamp_image_url text NULL,
  stamp_image_path text NULL,

  is_active boolean DEFAULT true,
  is_default boolean DEFAULT true,

  stamp_enabled_by_default boolean DEFAULT true,
  stamp_width_mm numeric DEFAULT 55,
  stamp_height_mm numeric DEFAULT 30,
  stamp_opacity numeric DEFAULT 1,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

Eğer mevcut firma ayarları tablosuna kolon eklenecekse:

```sql
ALTER TABLE public.firma_ayarlari
ADD COLUMN IF NOT EXISTS stamp_image_url text;

ALTER TABLE public.firma_ayarlari
ADD COLUMN IF NOT EXISTS stamp_image_path text;

ALTER TABLE public.firma_ayarlari
ADD COLUMN IF NOT EXISTS stamp_enabled_by_default boolean DEFAULT true;

ALTER TABLE public.firma_ayarlari
ADD COLUMN IF NOT EXISTS stamp_width_mm numeric DEFAULT 55;

ALTER TABLE public.firma_ayarlari
ADD COLUMN IF NOT EXISTS stamp_height_mm numeric DEFAULT 30;

ALTER TABLE public.firma_ayarlari
ADD COLUMN IF NOT EXISTS stamp_opacity numeric DEFAULT 1;
```

Önce mevcut schema kontrol edilecek, gereksiz yeni tablo açılmayacak.

---

## 7. Şube Bazlı Kaşe Desteği

Sistem Erzincan ve İstanbul şubeleriyle çalıştığı için yapı şube bazlı kaşeye uygun olmalı.

Kural:

1. Belgenin şubesine özel kaşe varsa onu kullan.
2. Şube özel kaşe yoksa genel firma kaşesini kullan.
3. Hiç kaşe yoksa boş imza çizgisi göster.

İlk aşamada tek genel kaşe yeterli olabilir, ancak kod yapısı şube bazlı kaşeye engel olmamalı.

---

## 8. Kaşeli / Kaşesiz Çıktı Toggle

Bakım formu ve takip formu yazdırma/PDF ekranlarına toggle eklenecek.

Örnek:

```txt
[✓] Kaşeli çıktı oluştur
```

veya:

```txt
Çıktı türü:
[ Kaşeli ] [ Kaşesiz ]
```

Varsayılan değer firma ayarından gelecek.

```txt
Varsayılan: Kaşeli çıktı
```

Kullanıcı çıktı almadan önce bunu değiştirebilecek.

---

## 9. PDF Route Mantığı

PDF veya yazdır route’unda kaşe durumu query parametreyle yönetilebilir.

Örnek:

```txt
/servis-formlari/[id]/bakim-formu/pdf?stamp=1
/servis-formlari/[id]/bakim-formu/pdf?stamp=0

/servis-formlari/[id]/takip-formu/pdf?stamp=1
/servis-formlari/[id]/takip-formu/pdf?stamp=0
```

Mantık:

```ts
const withStamp =
  searchParams?.stamp != null
    ? searchParams.stamp === '1'
    : companyStampSettings.stamp_enabled_by_default
```

---

## 10. Ortak Firma Kaşe Bileşeni

Her formda ayrı ayrı kaşe kodu yazılmasın.

Yeni ortak bileşen oluştur:

```txt
src/components/print/CompanyStampApproval.tsx
```

Props:

```ts
type CompanyStampApprovalProps = {
  withStamp: boolean
  stampUrl?: string | null
  companyName?: string | null
  title?: string
  stampWidthMm?: number
  stampHeightMm?: number
  opacity?: number
}
```

Örnek kullanım:

```tsx
<CompanyStampApproval
  withStamp={withStamp}
  stampUrl={stampSettings?.stamp_image_url}
  companyName="KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SAN. TİC. LTD. ŞTİ."
  title="Firma Yetkili İmza / Kaşe"
  stampWidthMm={stampSettings?.stamp_width_mm ?? 55}
  stampHeightMm={stampSettings?.stamp_height_mm ?? 30}
  opacity={stampSettings?.stamp_opacity ?? 1}
/>
```

---

## 11. Ortak Kaşe Ayarı Okuma Helper’ı

Yeni helper oluştur:

```txt
src/lib/company-settings/get-company-stamp-settings.ts
```

Fonksiyon:

```ts
export async function getCompanyStampSettings(subeId?: string | null) {
  // 1. Şube bazlı aktif kaşe ara
  // 2. Yoksa genel aktif kaşeyi getir
  // 3. Yoksa null dön
}
```

Dönüş tipi:

```ts
export type CompanyStampSettings = {
  stampImageUrl: string | null
  stampImagePath: string | null
  enabledByDefault: boolean
  widthMm: number
  heightMm: number | null
  opacity: number
}
```

---

## 12. Bakım Formu Güncellemesi

Bakım formunda mevcut iki imza kutusu kaldırılıp tek alan bırakılacak.

Eski yapı:

```txt
Müşteri Onay İmzası        Firma Yetkili İmza / Kaşe
```

Yeni yapı:

```txt
Firma Yetkili İmza / Kaşe

[Kaşe görseli veya boş imza çizgisi]
```

Bakım formu alt kısmında geniş alan olacak.

Önerilen tasarım:

* İnce kırmızı üst çizgi
* Başlık: Firma Yetkili İmza / Kaşe
* Orta kısımda kaşe görseli
* Kaşesiz çıktıdaysa kesikli imza çizgisi
* Altında firma unvanı

---

## 13. Takip Formu Güncellemesi

Müşteri takip formunda da aynı düzen uygulanacak.

Eski yapı:

```txt
Müşteri Onay İmzası        Firma Yetkili İmza / Kaşe
```

Yeni yapı:

```txt
Firma Yetkili İmza / Kaşe

[Kaşe görseli veya boş imza çizgisi]
```

Takip formunda müşteri onay alanı tamamen kaldırılacak.

---

## 14. Kaşe Görseli Boyutu

Varsayılan kaşe boyutu:

```txt
Genişlik: 55 mm
Yükseklik: 30 mm
```

CSS:

```css
.companyStampImage {
  max-width: 55mm;
  max-height: 30mm;
  object-fit: contain;
  opacity: var(--stamp-opacity, 1);
}
```

Ekran önizleme için:

```css
.companyStampImagePreview {
  max-width: 240px;
  max-height: 140px;
  object-fit: contain;
}
```

---

## 15. Kaşe Yoksa Davranış

Kaşe yüklü değilse ve kullanıcı kaşeli çıktı seçerse uyarı göster:

```txt
Firma kaşe/imza görseli yüklenmedi. Belge kaşesiz oluşturulacak.
```

PDF bozulmamalı.

Bu durumda firma onay alanı boş imza çizgisiyle görünmeli.

---

## 16. Kaşe Silme

Kaşe silme butonu olacak.

Silme sırasında kullanıcıya onay sor:

```txt
Yüklü kaşe/imza görselini silmek istediğinize emin misiniz?
```

Silme sonrası:

* DB’de kaşe URL/path null yapılır.
* Storage dosyası mümkünse silinir.
* Çıktılar kaşesiz üretilir.
* Varsayılan kaşeli çıktı açık olsa bile kaşe olmadığı için boş alan basılır.

---

## 17. Kaşe Değiştirme

Yeni kaşe yüklendiğinde:

* Eski kaşe pasifleştirilebilir veya silinebilir.
* Yeni kaşe aktif yapılır.
* Önizleme anında güncellenir.
* Sonraki formlarda yeni kaşe kullanılır.

---

## 18. Yetki Kontrolü

Kaşe görselini sadece yetkili kullanıcı değiştirebilmeli.

Yetki önerisi:

```txt
settings.company_stamp.update
```

Kurallar:

* Admin değiştirebilir.
* Yönetici değiştirebilir.
* Teknik personel kaşe yükleyemez.
* Teknik personel sadece çıktı alırken kaşeli/kaşesiz seçebilir.

---

## 19. Etkilenecek Dosyalar

Projede şu dosyalar aranmalı:

```txt
src/lib/service-form-pdf.tsx
src/lib/bakim-form-pdf.tsx
src/lib/takip-form-pdf.tsx
src/components/service-forms/*
src/components/print/*
src/app/(dashboard)/servis-formlari/[id]/yazdir/page.tsx
src/app/(dashboard)/servis-formlari/[id]/pdf/route.ts
src/app/(dashboard)/musteriler/[id]/takip-formu/*
src/app/(dashboard)/cihazlar/*
```

Gerçek dosya adları projeden bulunmalı.

---

## 20. Form Önizleme Ekranı

Bakım/takip formu görüntüleme ekranında üstte çıktı ayarları olabilir:

```txt
Çıktı Ayarları
[✓] Firma kaşesi ile oluştur
[PDF İndir] [Yazdır]
```

Toggle değişince önizleme anında değişmeli.

---

## 21. PDF Kalitesi

Kaşe görseli PDF çıktısında net görünmeli.

Kontrol edilecekler:

* Public URL erişimi
* Private storage ise signed URL
* Server-side PDF üretiminde görsel erişimi
* Base64 fallback
* Görsel oranının bozulmaması
* Türkçe karakterlerin bozulmaması

---

## 22. Kabul Kriterleri

### Bakım Formu

* [ ] Müşteri Onay İmzası kaldırıldı.
* [ ] Firma Yetkili İmza / Kaşe alanı kaldı.
* [ ] Kaşeli çıktı seçildiğinde kaşe görseli görünüyor.
* [ ] Kaşesiz çıktı seçildiğinde kaşe görünmüyor.
* [ ] Boş imza çizgisi düzgün görünüyor.

### Takip Formu

* [ ] Müşteri Onay İmzası kaldırıldı.
* [ ] Firma Yetkili İmza / Kaşe alanı kaldı.
* [ ] Kaşe görseli otomatik basılıyor.
* [ ] Kaşesiz çıktı alınabiliyor.

### Kaşe Yönetimi

* [ ] Kaşe/imza yükleme alanı var.
* [ ] PNG/JPG/WEBP yüklenebiliyor.
* [ ] Yüklenen kaşe önizleniyor.
* [ ] Kaşe değiştirilebiliyor.
* [ ] Kaşe silinebiliyor.
* [ ] Varsayılan kaşeli/kaşesiz çıktı ayarı var.

### Teknik

* [ ] Ortak CompanyStampApproval bileşeni oluşturuldu.
* [ ] Ortak getCompanyStampSettings helper’ı oluşturuldu.
* [ ] PDF ve yazdırma aynı ayarı kullanıyor.
* [ ] Storage bağlantısı çalışıyor.
* [ ] Yetki kontrolü var.
* [ ] TypeScript geçiyor.
* [ ] Build geçiyor.

---

## 23. Test Senaryoları

### Test 1 — Kaşe yükle

1. Yönetim > Firma Ayarları > Kaşe ve İmza Ayarları aç.
2. PNG kaşe görseli yükle.
3. Kaydet.

Beklenen:

* Kaşe önizlemede görünür.
* DB’ye URL/path yazılır.

### Test 2 — Bakım formu kaşeli çıktı

1. Bir bakım formu aç.
2. Kaşeli çıktı toggle açık olsun.
3. PDF indir.

Beklenen:

* Müşteri Onay İmzası yok.
* Firma Yetkili İmza / Kaşe alanında kaşe var.

### Test 3 — Bakım formu kaşesiz çıktı

1. Aynı bakım formunda kaşeli çıktı toggle kapat.
2. PDF indir.

Beklenen:

* Kaşe görünmez.
* Firma onay alanında boş imza çizgisi görünür.

### Test 4 — Takip formu

1. Takip formu oluştur.
2. Kaşeli PDF indir.

Beklenen:

* Müşteri Onay İmzası yok.
* Firma kaşesi görünüyor.

### Test 5 — Kaşe silme

1. Firma ayarlarından kaşeyi sil.
2. Bakım formu PDF indir.

Beklenen:

* PDF bozulmaz.
* Firma onay alanı boş görünür.

---

## 24. Dokunulmayacak Alanlar

Bu görevde şunlara dokunma:

* Fatura parser
* Cari hesap
* Teknik hesap rapor formülleri
* Teslimatlar
* Operasyon talepleri
* İş planları
* Müşteri import
* Cihaz SKT hesapları
* Servis formu kayıt mantığı

Sadece:

* Bakım formu çıktısı
* Takip formu çıktısı
* Servis formu yazdır/PDF çıktılarındaki imza alanları
* Firma kaşe/imza ayarı
* Kaşe upload/storage
* Kaşeli/kaşesiz çıktı toggle
* Ortak firma kaşe bileşeni

---

## 25. Görev Sonu Raporu

İş bitince şunları yaz:

* Müşteri Onay İmzası hangi formlardan kaldırıldı?
* Firma Yetkili İmza / Kaşe alanı nasıl güncellendi?
* Kaşe yükleme alanı hangi sayfaya eklendi?
* Kaşe hangi storage bucket/path altında tutuluyor?
* Kaşe ayarları hangi tabloda/kolonlarda tutuluyor?
* Kaşeli/kaşesiz çıktı toggle nasıl çalışıyor?
* Bakım formunda test edildi mi?
* Takip formunda test edildi mi?
* PDF çıktıda kaşe net görünüyor mu?
* Hangi dosyalar değişti?
* Migration gerekiyorsa hangi SQL çalıştırılmalı?
* TypeScript sonucu
* Build sonucu

````

Claude Code için kısa prompt:

```text
GOREV.md dosyasını oku ve sadece bu görevi uygula.

