# GÖREV — Teknik Hesap & Raporlar Modülüne Havalandırma Test Raporu Ekleme

## Amaç

ERP içindeki `Teknik Hesap & Raporlar` modülüne yeni bir rapor türü eklenecek:

```txt
Havalandırma Test Raporu
```

Bu rapor; yangın güvenliği, gazlı söndürme sistemleri, mahal havalandırması, cihaz/oda hava tahliyesi, davlumbaz/egzoz hattı, mekanik havalandırma kontrolü gibi işlerde kullanılacak.

Rapor; sahada tekniker tarafından yapılan ölçümleri kayıt altına alacak, giriş ve çıkış noktalarında 5 nokta hız ölçümü yapılmasını sağlayacak, debi ve uygunluk değerlendirmesi oluşturacak, sonuç formunu PDF/yazdırılabilir kurumsal rapor formatında üretecek.

Ekteki mevcut `Köklü Havalandırma Tesisatı Raporu` yapısı referans alınacak. Birebir kopya şart değil; ancak kurumsal başlık, müşteri/test bilgileri, ölçüm bilgileri, sonuç değerlendirmesi ve imza/onay alanları benzer mantıkta olmalı.

---

## 1. Modüle Yeni Rapor Türü Ekle

Mevcut modül:

```txt
Teknik Hesap & Raporlar
```

Mevcut rapor türleri arasında şunlar var:

* Yangın Alarm Sistemi İhtiyaç Hesabı
* Genel Keşif ve İhtiyaç Listesi Raporu
* Oda Sızdırmazlık Test Raporu
* Yangın Dolabı / Hidrant / Pompa Hesabı
* Sulu Sistem Hidrolik Ön Keşif Raporu

Bunlara yeni kart eklenecek:

```txt
Havalandırma Test Raporu
```

Kart açıklaması:

```txt
Giriş ve çıkış hava hızı ölçümleri, kanal uzunluğu, kesit bilgisi ve debi hesabına göre havalandırma uygunluk raporu oluşturur.
```

Route önerisi:

```txt
/teknik-raporlar/havalandirma-testi
```

veya mevcut teknik rapor yapısına uygun route kullanılmalı.

---

## 2. Rapor Tipi Standardı

Yeni rapor tipi sistemde şu isimlerle tanımlansın:

```ts
report_type: 'ventilation_test'
report_type_label: 'Havalandırma Test Raporu'
```

Eğer rapor türleri merkezi bir dosyada tutuluyorsa buraya eklensin:

```txt
src/lib/technical-reports/report-types.ts
```

Örnek:

```ts
export const TECHNICAL_REPORT_TYPES = [
  ...
  {
    value: 'ventilation_test',
    label: 'Havalandırma Test Raporu',
    description: 'Giriş/çıkış 5 nokta hava hızı ölçümü ve debi uygunluk raporu.',
  },
]
```

---

## 3. Genel Bilgiler Formu

Havalandırma test raporunda ilk bölüm `Genel Bilgiler` olacak.

Alanlar:

### Müşteri / Kurum Bilgileri

* Kayıtlı müşteri seçimi
* Manuel müşteri girişi
* Firma / kurum adı *
* Yetkili kişi
* Telefon
* E-posta
* Vergi no / TC no
* Adres
* İl
* İlçe
* Şube *

Kural:

* Kayıtlı müşteri seçilirse bilgiler otomatik gelsin.
* Manuel müşteri seçeneği mutlaka olsun.
* Şehir/adres varsa şube önerisi çalışsın.
* Tek şubeli kullanıcıda şube otomatik ve kilitli gelsin.
* Admin kullanıcı şubeyi değiştirebilsin.

---

## 4. Test Bilgileri Formu

İkinci bölüm `Test Bilgileri` olacak.

Alanlar:

* Rapor başlığı *
* Rapor tarihi *
* Test tarihi *
* Test saati
* Test yapılan mahal / alan *
* Test edilen sistem tipi *
* Havalandırma kullanım amacı
* Havalandırma hattı açıklaması
* Test cihazı / ölçüm cihazı
* Cihaz marka/model
* Cihaz seri no
* Ölçüm sıcaklığı °C
* Ortam nemi %
* Ortam basıncı, opsiyonel
* Ölçüm yöntemi
* Test notları

Sistem tipi seçenekleri:

```txt
Genel Havalandırma
Egzoz Havalandırması
Taze Hava Hattı
Davlumbaz Havalandırması
Gazlı Söndürme Odası Havalandırması
Pano / Sistem Odası Havalandırması
Depo / Mahal Havalandırması
Diğer
```

Ölçüm yöntemi seçenekleri:

```txt
Anemometre ile hız ölçümü
Menfez/kesit alanı üzerinden debi hesabı
Giriş/çıkış karşılaştırmalı ölçüm
Sanal çıkış kaybı tahmini dahil ölçüm
Diğer
```

---

## 5. Tekniker Bilgileri

Rapor için testi yapan tekniker bilgileri zorunlu olmalı.

Alanlar:

* Tekniker adı soyadı *
* Ekipnet numarası
* Görev / ünvan
* Telefon
* Ölçümü yapan personel sistemde kayıtlı personelden seçilebilir
* Manuel tekniker girişi de yapılabilir

Örnek alanlar:

```txt
Tekniker: Zekeriya Satık
Ekipnet No: K2024229484
Ölçüm Cihazı: Uni-T Anemometre
```

Personel seçildiğinde sistemde kayıtlı telefon/unvan otomatik gelsin.

---

## 6. Havalandırma Kanal / Menfez Bilgileri

Bu bölüm ölçüm hesabının temelidir.

Alanlar:

* Kanal / menfez tipi
* Kesit tipi
* Giriş kesit ölçüsü
* Çıkış kesit ölçüsü
* Kanal uzunluğu
* Dirsek sayısı
* Menfez tipi
* Ölçüm noktası açıklaması
* Giriş ulaşılabilir mi?
* Çıkış ulaşılabilir mi?
* Çıkış ölçümü gerçek mi / sanal tahmin mi?

### Kesit tipi seçenekleri

```txt
Dairesel
Dikdörtgen
Kare
Manuel alan girişi
```

### Dairesel kesit

Alanlar:

* Çap mm veya cm

Hesap:

```txt
Alan = π x r²
```

### Dikdörtgen / kare kesit

Alanlar:

* En
* Boy

Hesap:

```txt
Alan = en x boy
```

### Manuel alan

Alan:

* Kesit alanı m²

---

## 7. 5 Nokta Giriş Ölçümü

Kullanıcıyı yönlendiren görsel bir ölçüm şablonu yapılmalı.

Giriş ölçümü için 5 nokta:

```txt
Üst
Alt
Sağ
Sol
Orta
```

Görsel şablonda menfez/kanal görünümü olmalı.

Önerilen UI:

```txt
          ÜST
           ↑
   SOL ← ORTA → SAĞ
           ↓
          ALT
```

Her noktanın yanında hız girişi:

* Üst hız m/s
* Alt hız m/s
* Sağ hız m/s
* Sol hız m/s
* Orta hız m/s

Alanlar:

```txt
Giriş Üst m/s
Giriş Alt m/s
Giriş Sağ m/s
Giriş Sol m/s
Giriş Orta m/s
```

Sistem otomatik hesaplasın:

* Giriş ortalama hız
* Giriş minimum hız
* Giriş maksimum hız
* Giriş hız farkı
* Giriş ölçüm tutarlılığı

---

## 8. 5 Nokta Çıkış Ölçümü

Çıkış için de aynı görsel şablon olacak.

Alanlar:

```txt
Çıkış Üst m/s
Çıkış Alt m/s
Çıkış Sağ m/s
Çıkış Sol m/s
Çıkış Orta m/s
```

Eğer çıkışa ulaşılamıyorsa:

```txt
Çıkış ölçümü yapılamadı
```

seçeneği olmalı.

Bu durumda sistem şu seçenekleri sunmalı:

1. Çıkış ölçümü boş bırak
2. Giriş ölçümüne göre tahmini çıkış hızı hesapla
3. Kanal uzunluğu ve kayıp oranına göre sanal çıkış ölçümü oluştur

---

## 9. Sanal Çıkış Ölçümü / Kayıp Hesabı

Sahada çıkış çok yüksekte veya erişilemez olabiliyor. Bu nedenle opsiyonel bir sanal çıkış hesabı eklenmeli.

Alanlar:

* Sanal çıkış hesabı kullanılsın mı?
* Kanal uzunluğu m
* Tahmini kayıp oranı %
* Dirsek/menfez kayıp katsayısı
* Ek açıklama

Örnek:

```txt
Kanal uzunluğu: 12 m
Doğal kayıp oranı: %10
Giriş ortalama hız: 1.48 m/s
Tahmini çıkış hızı: 1.33 m/s
```

Ancak kullanıcı isterse sanal çıkış hızını manuel de girebilmeli.

Önemli not:

Sanal çıkış ölçümü gerçek ölçüm gibi gösterilmemeli. Raporda açıkça şu ifade yer almalı:

```txt
Çıkış noktası fiziksel olarak erişilebilir olmadığından, çıkış hızı kanal uzunluğu ve tahmini kayıp oranı dikkate alınarak hesaplanmıştır. Bu değer sanal/tahmini ölçüm olarak değerlendirilmelidir.
```

---

## 10. Debi Hesapları

Sistem otomatik debi hesaplayacak.

Temel hesap:

```txt
Debi (m³/s) = Ortalama Hız (m/s) x Kesit Alanı (m²)
Debi (m³/h) = Debi (m³/s) x 3600
```

Hesaplanacak değerler:

### Giriş

* Giriş kesit alanı
* Giriş ortalama hız
* Giriş debisi m³/s
* Giriş debisi m³/h

### Çıkış

* Çıkış kesit alanı
* Çıkış ortalama hız
* Çıkış debisi m³/s
* Çıkış debisi m³/h

### Karşılaştırma

* Giriş/çıkış debi farkı
* Kayıp yüzdesi
* Hız farkı
* Uygunluk değerlendirmesi

Örnek:

```txt
Giriş Ortalama Hız: 1,48 m/s
Giriş Kesit Alanı: 0,049 m²
Giriş Debisi: 0,0725 m³/s
Giriş Debisi: 261 m³/h
```

---

## 11. Uygunluk Değerlendirmesi

Rapor sonucunda uygunluk durumu verilmeli.

Seçenekler:

```txt
Uygun
Şartlı Uygun
Uygun Değil
Manuel Değerlendirme Gerekli
```

Otomatik değerlendirme kriterleri teknik ayarlardan yönetilebilir olmalı.

Önerilen temel kriterler:

* Ortalama hız hedef minimum değerin altındaysa uygun değil
* Giriş/çıkış debi farkı çok yüksekse şartlı uygun veya uygun değil
* Çıkış ölçümü sanal ise sonuç “şartlı uygun” veya “manuel değerlendirme gerekli” olabilir
* Ölçüm noktaları arasında çok yüksek fark varsa ölçüm dengesizliği uyarısı verilmeli
* Kanal uzunluğu fazla ve çıkış ölçümü yoksa uyarı eklenmeli

---

## 12. Teknik Ayarlar

`Teknik Hesap & Raporlar > Teknik Ayarlar` kısmına havalandırma parametreleri eklenmeli.

Ayarlar:

```txt
havalandirma_min_hiz_ms
havalandirma_ideal_hiz_ms
havalandirma_max_debi_kayip_yuzdesi
havalandirma_olcum_tutarsizlik_yuzdesi
havalandirma_varsayilan_kayip_orani
havalandirma_uzunluk_basi_kayip_orani
havalandirma_sanal_cikis_uyari_metni
```

Örnek varsayılanlar:

```txt
Minimum hız: 1.0 m/s
İdeal hız: 1.5 m/s
Maksimum kabul edilebilir debi kaybı: %25
Ölçüm noktası tutarsızlık uyarısı: %35
Varsayılan kayıp oranı: %10
Uzunluk başı kayıp oranı: %0.5 / metre
```

Bu değerler düzenlenebilir olmalı.

---

## 13. Ölçüm Kalite Kontrolü

Sistem kullanıcıyı hatalı girişlere karşı uyarmalı.

Kontroller:

* Hız değeri negatif olamaz.
* Hız değeri 0 ise kullanıcı uyarılır.
* 5 ölçüm noktasından en az 3 tanesi girilmeli.
* Kesit alanı olmadan debi hesaplanmamalı.
* Şube olmadan rapor kaydedilmemeli.
* Tekniker adı olmadan rapor kaydedilmemeli.
* Test yapılan firma/kurum olmadan rapor kaydedilmemeli.
* Çıkış ölçümü yoksa sonuç kısmında bu açıkça belirtilmeli.
* Sanal çıkış hesabı varsa raporda “tahmini” etiketi kullanılmalı.

---

## 14. Görsel Ölçüm Giriş Şablonu

Formun en önemli kısmı 5 nokta ölçüm görseli olmalı.

UI önerisi:

* Sol tarafta Giriş Ölçümü
* Sağ tarafta Çıkış Ölçümü
* Her iki tarafta kanal/menfez şeması
* Şemadaki her nokta input alanıyla bağlantılı
* Kullanıcı hangi noktaya değer girdiğini görsel olarak anlayacak

Örnek:

```txt
GİRİŞ ÖLÇÜMÜ

        [ Üst: 1.3 m/s ]

[ Sol: 1.6 ] [ Orta: 1.6 ] [ Sağ: 1.5 ]

        [ Alt: 1.4 m/s ]

Ortalama: 1.48 m/s
Min: 1.30 m/s
Max: 1.60 m/s
```

Çıkış için aynı yapı.

---

## 15. Hızlı Veri Girişi

Sahada tablet kullanımı için hızlı giriş desteklenmeli.

Özellikler:

* Büyük input alanları
* Numerik klavye açılmalı
* m/s birimi input yanında sabit görünmeli
* Bir sonraki alana otomatik geçiş opsiyonu
* “Giriş ölçümünü kopyala” seçeneği
* “Çıkış ölçümünü sanal oluştur” butonu
* “Tüm değerleri temizle” butonu
* Tablet uyumlu görünüm

---

## 16. Sonuç Özeti

Hesaplama sonrası kullanıcıya özet kartlar gösterilmeli:

```txt
Giriş Ortalama Hız
Çıkış Ortalama Hız
Giriş Debisi
Çıkış Debisi
Kayıp Oranı
Uygunluk
```

Örnek:

```txt
Giriş Ortalama Hız: 1,48 m/s
Çıkış Ortalama Hız: 1,33 m/s
Giriş Debisi: 261 m³/h
Çıkış Debisi: 235 m³/h
Kayıp: %10
Sonuç: Şartlı Uygun
```

---

## 17. Rapor Açıklama / Değerlendirme Metni

Sistem otomatik değerlendirme metni üretsin.

Örnek uygun:

```txt
Yapılan 5 nokta hava hızı ölçümlerinde giriş ve çıkış değerleri kabul edilebilir aralıkta bulunmuştur. Hesaplanan hava debisi ve ölçüm noktaları arasındaki farklar değerlendirildiğinde havalandırma tesisatının mevcut kullanım için uygun olduğu kanaatine varılmıştır.
```

Örnek şartlı uygun:

```txt
Yapılan ölçümlerde havalandırma hattında debi kaybı tespit edilmiştir. Çıkış noktasındaki ölçüm değeri girişe göre düşük olmakla birlikte sistemin çalışır durumda olduğu görülmüştür. Kanal uzunluğu, menfez yapısı ve kayıp oranı dikkate alınarak sistemin şartlı uygun olduğu değerlendirilmiştir.
```

Örnek uygun değil:

```txt
Yapılan ölçümlerde hava hızı ve debi değerleri hedeflenen minimum seviyenin altında kalmıştır. Havalandırma hattında yetersiz hava akışı bulunduğundan sistemin bakım, temizlik, fan kontrolü veya kanal/menfez revizyonu sonrası tekrar test edilmesi önerilir.
```

---

## 18. Öneriler Bölümü

Rapor sonucunda öneriler otomatik ve manuel oluşturulmalı.

Otomatik öneriler:

* Fan performansı kontrol edilsin
* Menfez temizliği yapılsın
* Kanal kaçakları kontrol edilsin
* Filtre temizliği/değişimi yapılsın
* Çıkış noktası erişilebilir hale getirilsin
* Daha güçlü fan değerlendirmesi yapılsın
* Kanal çapı/kesiti kontrol edilsin
* Periyodik bakım planına alınsın

Kullanıcı manuel öneri ekleyebilsin.

---

## 19. Rapor Çıktı Formatı

PDF/yazdırma çıktısı ekteki kurumsal rapor formatına benzer olmalı.

Rapor sayfasında şu bölümler olmalı:

### Üst Başlık

* Köklü Yangın Söndürme Cihazları San. Tic. Ltd. Şti.
* Rapor başlığı: Havalandırma Test Raporu
* Rapor no
* Rapor tarihi
* Şube
* Durum

### Firma / Kurum Bilgileri

* Firma adı
* Yetkili
* Adres
* Telefon
* Vergi no

### Test Bilgileri

* Test tarihi
* Test yapılan mahal
* Test sistemi
* Ölçüm cihazı
* Ölçüm sıcaklığı
* Tekniker
* Ekipnet no

### Havalandırma Bilgileri

* Kanal/menfez tipi
* Kesit tipi
* Giriş kesiti
* Çıkış kesiti
* Kanal uzunluğu
* Ölçüm yöntemi

### Ölçüm Tablosu

Giriş ölçümleri:

| Nokta | Hız     |
| ----- | ------- |
| Üst   | ... m/s |
| Alt   | ... m/s |
| Sağ   | ... m/s |
| Sol   | ... m/s |
| Orta  | ... m/s |

Çıkış ölçümleri:

| Nokta | Hız     |
| ----- | ------- |
| Üst   | ... m/s |
| Alt   | ... m/s |
| Sağ   | ... m/s |
| Sol   | ... m/s |
| Orta  | ... m/s |

### Hesap Sonuçları

* Giriş ortalama hız
* Çıkış ortalama hız
* Giriş debisi
* Çıkış debisi
* Kayıp oranı
* Uygunluk sonucu

### Değerlendirme

Otomatik veya manuel açıklama metni.

### Öneriler

Madde madde öneriler.

### İmza Alanı

* Testi yapan tekniker
* Ekipnet no
* Firma yetkilisi
* Kaşe / imza alanı

---

## 20. PDF / Yazdırma

Aksiyonlar:

* Kaydet
* Kaydet ve Yazdır
* PDF Önizle
* PDF İndir
* Raporu Kopyala
* Teklife Aktar
* İptal Et / Sil

Route önerileri:

```txt
/teknik-raporlar/havalandirma-testi/yeni
/teknik-raporlar/[id]
/teknik-raporlar/[id]/duzenle
/teknik-raporlar/[id]/yazdir
/teknik-raporlar/[id]/pdf
```

---

## 21. Rapor Arşivi

Teknik raporlar listesinde Havalandırma Test Raporu da görünmeli.

Filtreler:

* Rapor türü
* Müşteri
* Şube
* Tekniker
* Tarih aralığı
* Sonuç durumu
* Uygun / şartlı uygun / uygun değil

Liste kolonları:

```txt
Rapor No
Rapor Türü
Müşteri / Kurum
Şube
Test Tarihi
Tekniker
Sonuç
Aksiyon
```

---

## 22. Teklife Aktarma

Havalandırma test raporundan teklif oluşturma opsiyonu olsun.

Eğer sonuç `Uygun Değil` veya `Şartlı Uygun` ise önerilere göre teklif kalemi oluşturulabilir.

Örnek teklif kalemleri:

* Havalandırma fan bakım hizmeti
* Menfez/kanal temizlik hizmeti
* Kanal kaçak kontrolü
* Fan değişimi
* Menfez revizyonu
* Periyodik bakım hizmeti

İlk aşamada `Teklife Aktar` butonu sadece önerilen kalemleri teklif taslağına aktarsın.

---

## 23. Veritabanı Yapısı

Mevcut teknik rapor sistemi `technical_reports` tablosunu kullanıyorsa aynı tablo kullanılmalı.

Rapor girdileri JSON olarak tutuluyorsa:

```txt
input_data
result_data
items
```

kullanılabilir.

Yeni tablo gerekiyorsa:

```sql
CREATE TABLE IF NOT EXISTS public.ventilation_test_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technical_report_id uuid REFERENCES public.technical_reports(id) ON DELETE CASCADE,

  customer_id uuid NULL,
  manual_customer_name text NULL,

  sube_id uuid NULL REFERENCES public.subeler(id),

  report_no text NULL,
  report_date date NULL,
  test_date date NULL,
  test_time time NULL,

  test_location text NULL,
  system_type text NULL,
  ventilation_purpose text NULL,

  technician_name text NULL,
  technician_ekipnet_no text NULL,
  technician_phone text NULL,

  device_brand_model text NULL,
  device_serial_no text NULL,
  measurement_temperature numeric NULL,
  measurement_humidity numeric NULL,

  duct_type text NULL,
  section_type text NULL,
  inlet_width numeric NULL,
  inlet_height numeric NULL,
  inlet_diameter numeric NULL,
  inlet_area numeric NULL,

  outlet_width numeric NULL,
  outlet_height numeric NULL,
  outlet_diameter numeric NULL,
  outlet_area numeric NULL,

  duct_length numeric NULL,
  elbow_count integer NULL,

  inlet_measurements jsonb DEFAULT '{}'::jsonb,
  outlet_measurements jsonb DEFAULT '{}'::jsonb,

  use_virtual_outlet boolean DEFAULT false,
  virtual_outlet_loss_percent numeric NULL,
  virtual_outlet_note text NULL,

  result_data jsonb DEFAULT '{}'::jsonb,
  recommendations jsonb DEFAULT '[]'::jsonb,

  suitability text NULL,
  evaluation_text text NULL,

  notes text NULL,

  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz NULL
);
```

Ancak mevcut teknik rapor mimarisi JSON tabanlıysa ayrı tablo yerine `technical_reports` içinde `report_type = ventilation_test` ve `input_data/result_data` kullanılması daha uygun olabilir.

Önce mevcut mimari incelenmeli, gereksiz yeni tablo açılmamalı.

---

## 24. TypeScript Tipleri

Yeni tip dosyası önerisi:

```txt
src/lib/technical-reports/ventilation-test/types.ts
```

Tipler:

```ts
export type VentilationSuitability =
  | 'suitable'
  | 'conditional'
  | 'not_suitable'
  | 'manual_review'

export interface FivePointMeasurement {
  top?: number | null
  bottom?: number | null
  left?: number | null
  right?: number | null
  center?: number | null
}

export interface VentilationTestInput {
  customerId?: string | null
  manualCustomerName?: string | null
  branchId: string

  reportTitle: string
  reportDate: string
  testDate: string
  testTime?: string | null

  testLocation: string
  systemType: string
  ventilationPurpose?: string | null

  technicianName: string
  technicianEkipnetNo?: string | null
  technicianPhone?: string | null

  measurementDevice?: string | null
  measurementTemperature?: number | null
  measurementHumidity?: number | null

  sectionType: 'circular' | 'rectangular' | 'square' | 'manual'

  inletWidth?: number | null
  inletHeight?: number | null
  inletDiameter?: number | null
  inletArea?: number | null

  outletWidth?: number | null
  outletHeight?: number | null
  outletDiameter?: number | null
  outletArea?: number | null

  ductLength?: number | null
  elbowCount?: number | null

  inletMeasurements: FivePointMeasurement
  outletMeasurements?: FivePointMeasurement | null

  useVirtualOutlet?: boolean
  virtualOutletLossPercent?: number | null
  virtualOutletNote?: string | null

  notes?: string | null
}

export interface VentilationTestResult {
  inletAverageVelocity: number
  outletAverageVelocity?: number | null

  inletMinVelocity: number
  inletMaxVelocity: number

  outletMinVelocity?: number | null
  outletMaxVelocity?: number | null

  inletArea: number
  outletArea?: number | null

  inletFlowM3s: number
  inletFlowM3h: number

  outletFlowM3s?: number | null
  outletFlowM3h?: number | null

  lossPercent?: number | null

  suitability: VentilationSuitability
  evaluationText: string
  warnings: string[]
  recommendations: string[]
}
```

---

## 25. Hesap Fonksiyonları

Yeni hesap dosyası:

```txt
src/lib/technical-reports/ventilation-test/calculations.ts
```

Fonksiyonlar:

```ts
calculateSectionArea()
calculateFivePointAverage()
calculateFlowRate()
calculateLossPercent()
evaluateVentilationSuitability()
generateVentilationEvaluationText()
generateVentilationRecommendations()
```

Örnek:

```ts
export function calculateFivePointAverage(values: FivePointMeasurement): number {
  const nums = [
    values.top,
    values.bottom,
    values.left,
    values.right,
    values.center,
  ].filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))

  if (!nums.length) return 0

  return nums.reduce((sum, value) => sum + value, 0) / nums.length
}
```

---

## 26. Form Validasyonu

Yeni validasyon dosyası:

```txt
src/lib/technical-reports/ventilation-test/validation.ts
```

Kurallar:

* Firma/kurum zorunlu
* Şube zorunlu
* Test tarihi zorunlu
* Tekniker adı zorunlu
* En az 3 giriş ölçüm noktası zorunlu
* Kesit alanı zorunlu
* Hız değerleri negatif olamaz
* Sanal çıkış seçildiyse kanal uzunluğu veya kayıp oranı girilmeli
* Çıkış ölçümü yoksa raporda uyarı üret

---

## 27. Kullanıcı Deneyimi

Form karmaşık olmamalı. Bölümler adım adım olabilir:

```txt
1. Genel Bilgiler
2. Test ve Tekniker Bilgileri
3. Kanal / Kesit Bilgileri
4. Giriş Ölçümü
5. Çıkış Ölçümü
6. Sonuç ve Değerlendirme
7. Kaydet / Yazdır
```

Üstte ilerleme göstergesi olabilir.

Tek sayfa yapılacaksa bölümler kart kart ayrılmalı.

---

## 28. Tablet Kullanımı

Saha kullanımı için tablet uyumlu görünüm şart.

Özellikler:

* Büyük inputlar
* Büyük butonlar
* Sayısal klavye
* Ölçüm alanlarında hızlı geçiş
* Sticky alt bar:

  * Hesapla
  * Kaydet
  * Kaydet ve Yazdır
* Görsel 5 nokta şablonu mobilde dikey hizalansın

---

## 29. Rapor Numarası

Rapor numarası otomatik üretilsin.

Örnek format:

```txt
HTR-20260608-0001
```

veya mevcut teknik rapor numara standardına uygun:

```txt
GIR-20260608-0001
```

Havalandırma için öneri:

```txt
HTR-YYYYMMDD-XXXX
```

---

## 30. Kabul Kriterleri

### Modül

* [ ] Teknik Hesap & Raporlar içine Havalandırma Test Raporu kartı eklendi.
* [ ] Yeni rapor formu açılıyor.
* [ ] Rapor arşivinde bu rapor türü listeleniyor.
* [ ] Detay, düzenle, yazdır ve PDF indir aksiyonları çalışıyor.

### Form

* [ ] Firma/kurum bilgisi girilebiliyor.
* [ ] Kayıtlı müşteri seçilebiliyor.
* [ ] Manuel müşteri girilebiliyor.
* [ ] Şube seçilebiliyor.
* [ ] Test yapılan mahal girilebiliyor.
* [ ] Tekniker adı soyadı girilebiliyor.
* [ ] Ekipnet numarası girilebiliyor.
* [ ] Ölçüm cihazı bilgisi girilebiliyor.
* [ ] Kanal uzunluğu girilebiliyor.
* [ ] Kesit tipi ve ölçüleri girilebiliyor.
* [ ] Giriş 5 nokta ölçümü girilebiliyor.
* [ ] Çıkış 5 nokta ölçümü girilebiliyor.
* [ ] Çıkış erişilemiyorsa sanal çıkış hesabı kullanılabiliyor.

### Hesap

* [ ] Giriş ortalama hız hesaplanıyor.
* [ ] Çıkış ortalama hız hesaplanıyor.
* [ ] Kesit alanı hesaplanıyor.
* [ ] Debi m³/s hesaplanıyor.
* [ ] Debi m³/h hesaplanıyor.
* [ ] Kayıp oranı hesaplanıyor.
* [ ] Uygunluk sonucu üretiliyor.
* [ ] Uyarılar oluşturuluyor.
* [ ] Öneriler oluşturuluyor.

### Rapor

* [ ] Yazdırma sayfası kurumsal görünüyor.
* [ ] PDF çıktı alınabiliyor.
* [ ] Rapor başlığı düzgün.
* [ ] Müşteri/firma bilgileri görünüyor.
* [ ] Test bilgileri görünüyor.
* [ ] Tekniker ve Ekipnet bilgileri görünüyor.
* [ ] Ölçüm tabloları görünüyor.
* [ ] Hesap sonuçları görünüyor.
* [ ] Değerlendirme metni görünüyor.
* [ ] Öneriler görünüyor.
* [ ] İmza alanları var.
* [ ] Türkçe karakter sorunu yok.

### Yetki / Şube

* [ ] Tek şubeli kullanıcı kendi şubesine kayıt açıyor.
* [ ] Admin tüm şubeleri seçebiliyor.
* [ ] Yetkisiz şubeye rapor kaydedilemiyor.
* [ ] Rapor listesinde şube filtresi çalışıyor.

### Teknik

* [ ] TypeScript hatasız.
* [ ] Build başarılı.
* [ ] Var olan teknik raporlar bozulmadı.
* [ ] Mevcut rapor türleri çalışmaya devam ediyor.

---

## 31. Test Senaryoları

### Test 1 — Basit giriş ölçümü

1. Havalandırma Test Raporu aç.
2. Firma adı gir.
3. Tekniker ve Ekipnet gir.
4. Giriş 5 nokta hızları gir.
5. Kesit alanı gir.
6. Hesapla.

Beklenen:

* Ortalama hız hesaplanır.
* Debi hesaplanır.
* Sonuç değerlendirmesi oluşur.

### Test 2 — Giriş ve çıkış ölçümü

1. Giriş 5 nokta değerleri gir.
2. Çıkış 5 nokta değerleri gir.
3. Kanal uzunluğu gir.
4. Hesapla.

Beklenen:

* Giriş/çıkış debileri hesaplanır.
* Kayıp yüzdesi hesaplanır.
* Uygunluk sonucu oluşur.

### Test 3 — Çıkış erişilemez / sanal ölçüm

1. Çıkış ölçümü yapılamadı seç.
2. Sanal çıkış hesabı kullan.
3. Kanal uzunluğu ve kayıp oranı gir.
4. Hesapla.

Beklenen:

* Tahmini çıkış hızı hesaplanır.
* Raporda bunun sanal/tahmini olduğu açıkça belirtilir.

### Test 4 — PDF çıktı

1. Raporu kaydet.
2. PDF önizle.
3. PDF indir.

Beklenen:

* Kurumsal rapor düzgün oluşur.
* Türkçe karakterler bozulmaz.
* Ölçüm değerleri ve sonuçlar görünür.

### Test 5 — Şube yetkisi

1. İstanbul şube kullanıcısıyla giriş yap.
2. Rapor oluştur.

Beklenen:

* Şube İstanbul seçili ve kilitli gelir.
* Erzincan şubesi seçilemez.

---

## 32. Dokunulmayacak Alanlar

Bu görevde şunlara dokunma:

* Fatura parser
* Cari hesap
* Teslimat hesapları
* Operasyon iş planı mantığı
* Müşteri import sistemi
* Mevcut yangın alarm hesap formülleri
* Mevcut sulu sistem hesap formülleri
* Mevcut oda sızdırmazlık testi formülleri

Sadece:

* Teknik Hesap & Raporlar modülü
* Yeni Havalandırma Test Raporu
* Havalandırma ölçüm formu
* Havalandırma hesap fonksiyonları
* Havalandırma rapor çıktısı
* Rapor arşivi entegrasyonu
* Teknik ayarlar entegrasyonu

---

## 33. Görev Sonu Raporu

İş bitince şunları yaz:

* Havalandırma Test Raporu hangi route’a eklendi?
* Hangi form alanları eklendi?
* 5 nokta ölçüm şablonu nasıl tasarlandı?
* Giriş/çıkış hesapları hangi dosyada?
* Debi hesabı nasıl yapılıyor?
* Sanal çıkış hesabı nasıl çalışıyor?
* Uygunluk değerlendirmesi nasıl belirleniyor?
* Teknik ayarlara hangi parametreler eklendi?
* PDF/yazdırma çıktısı hangi dosyada?
* Rapor arşivine nasıl bağlandı?
* Migration gerekiyorsa hangi SQL çalıştırılmalı?
* TypeScript sonucu
* Build sonucu
