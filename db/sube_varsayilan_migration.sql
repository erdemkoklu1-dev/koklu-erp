# GÖREV: Giden Fatura ZIP/PDF Parse Hatası Düzeltme

## 🐛 Sorun (KRİTİK)

Giden fatura ZIP yüklemede 2 büyük hata var:

### Hata 1: Müşteri Adı Yanlış Çıkıyor
- Şu an "Bilinmiyor" + VKN: 5830028164 gösteriyor
- **5830028164 Köklü Yangın'ın kendi VKN'si** — müşterinin değil!
- Parser, satıcı bilgisini (Köklü Yangın) müşteri olarak alıyor
- Gerçek müşteri bilgisi "SAYIN" bloğunun altında, orası okunmuyor

### Hata 2: Fatura Kalemleri (Ürünler) Yok
- Kalem sayısı hep 0 gösteriyor
- Fatura içindeki ürün tablosu parse edilmiyor

## 📄 PDF Yapısı (Giden Fatura)

Köklü Yangın'ın kestiği giden faturalarda yapı şu şekilde:

```
┌─────────────────────────────────────────────────┐
│ KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE      │  ← SATICI (BİZ)
│ TİCARET LİMİTED ŞİRKETİ                        │
│ KARAAĞAÇ MAH.774.SOK.NO:49                      │
│ Tel: 5343114905                                  │
│ VKN: 5830028164                                  │  ← BU BİZİM VKN
│                                                   │
│ SAYIN                                             │  ← MÜŞTERİ BAŞLANGIÇ İŞARETİ
│ ENFES LEZZETLER TARIM HAYV. GIDA İNŞ.           │  ← MÜŞTERİ UNVANI
│ DAY.TÜK.MALL.SAN VE TİC LTD ŞTİ                │
│ İnönü Mah. Mengüceli Cad. No: 2/401             │  ← MÜŞTERİ ADRES
│ Vergi Dairesi: FEVZİPAŞA VERGİ DAİRESİ         │
│ VKN: 3350496619                                  │  ← MÜŞTERİ VKN
│                                                   │
│ ┌─────────────────────────────────────┐           │
│ │ Fatura No:  KYS2025000000432       │           │
│ │ Fatura Tarihi: 15-12-2025          │           │
│ │ Fatura Tipi: SATIS                 │           │
│ └─────────────────────────────────────┘           │
│                                                   │
│ ┌──────┬────────────┬───────┬──────┬──────┐      │
│ │SıraNo│ Mal Hizmet │Miktar │Birim │Tutar │      │  ← KALEM TABLOSU
│ │  1   │ 6 Kg KKT   │  8   │Adet  │3.333 │      │
│ │      │ Yangın Sön.│      │      │      │      │
│ └──────┴────────────┴───────┴──────┴──────┘      │
│                                                   │
│ Mal Hizmet Toplam Tutarı:     3.333,36 TL        │
│ KDV Matrahı:                  3.333,36 TL        │
│ Hesaplanan KDV(%20):            666,67 TL        │
│ Ödenecek Tutar:               4.000,03 TL        │
└─────────────────────────────────────────────────┘
```

## ✅ Düzeltme Talimatları

### Adım 1: Parse Fonksiyonunu Bul
Giden fatura parse fonksiyonunu bul. Muhtemel konumlar:
- `src/app/api/parse-invoice/route.ts`
- `src/app/api/fatura-parse/route.ts`
- `src/lib/actions/` altında bir dosya
- `src/app/(dashboard)/cari-hesap/` altında bir yardımcı dosya

Anahtar: `pdfjs-dist` kullanan ve PDF text'inden fatura bilgilerini çıkaran fonksiyonu bul.

### Adım 2: Müşteri Bilgisi Parse'ını Düzelt

**Köklü Yangın'ın VKN'sini HARDCODE olarak tanımla ve atla:**

```typescript
const KOKLU_VKN = '5830028164'; // Köklü Yangın'ın kendi VKN'si — bu satıcı, müşteri değil
```

**Müşteri unvanını "SAYIN" bloğundan çıkar:**

```typescript
function parseMusteriGiden(text: string) {
  // "SAYIN" kelimesini bul
  const sayinIndex = text.indexOf('SAYIN');
  if (sayinIndex === -1) {
    // Alternatif: "Sayın" veya "SAYINLAR" ara
    // ...
  }
  
  // SAYIN'dan sonraki satırlar müşteri bilgisi
  const afterSayin = text.substring(sayinIndex + 5).trim();
  
  // Müşteri unvanı: SAYIN'dan sonraki ilk anlamlı satır(lar)
  // Genellikle "LTD", "A.Ş.", "ŞTİ", "ŞİRKETİ" ile biter
  // ...
  
  // Müşteri VKN: "VKN:" veya "T.C. Kimlik" pattern'ı ile bul
  // AMA Köklü'nün VKN'sini (5830028164) atla!
  const vknMatches = text.match(/VKN:\s*(\d{10,11})/g);
  let musteriVkn = '';
  for (const match of vknMatches || []) {
    const vkn = match.replace(/VKN:\s*/, '');
    if (vkn !== KOKLU_VKN) {
      musteriVkn = vkn;
      break;
    }
  }
  
  // Müşteri adresini çıkar (SAYIN bloğu ile fatura bilgi kutusu arasındaki kısım)
  // ...
  
  return {
    musteri_unvan: extractedUnvan,
    musteri_vkn: musteriVkn,
    musteri_adres: extractedAdres,
    musteri_vergi_dairesi: extractedVD,
  };
}
```

**Önemli kurallar:**
- PDF'te genellikle 2 tane VKN olur: Birincisi satıcı (Köklü, 5830028164), ikincisi müşteri
- `5830028164` VKN'sini her zaman atla — bu bizim VKN'miz
- Müşteri unvanı "SAYIN" kelimesinden sonra başlar
- Unvan genellikle "LTD ŞTİ", "A.Ş.", "ANONİM ŞİRKETİ", "LİMİTED ŞİRKETİ" ile biter
- Adres unvandan sonra, VKN'den önce gelir

### Adım 3: Fatura Kalemlerini Parse Et

Fatura kalem tablosunu çıkar:

```typescript
function parseKalemler(text: string) {
  const kalemler = [];
  
  // "Sıra" veya "S.No" veya "SıraNo" ile başlayan tablo header'ını bul
  // Header'dan sonraki satırlar kalemler
  
  // Her kalem satırında:
  // - Sıra no (1, 2, 3...)
  // - Mal/Hizmet adı
  // - Miktar
  // - Birim (Adet, Kg, Lt, Metre)
  // - Birim Fiyat
  // - İskonto oranı/tutarı (opsiyonel)
  // - KDV oranı
  // - KDV tutarı
  // - Mal Hizmet Tutarı
  
  // Kalem tablosu "Mal Hizmet Toplam Tutarı" satırına kadar devam eder
  
  // Regex ile veya satır satır parse et
  // Dikkat: Mal/Hizmet adı birden fazla satıra yayılabilir
  // Örnek: "6 Kg KKT Yangın\nSöndürme Cihazı\nDolumu" tek üründür
  
  return kalemler;
}
```

**Kalem parse kuralları:**
- Kalem tablosu "Sıra" header'ından "Mal Hizmet Toplam" satırına kadar
- Sıra numarası ile başlayan satır yeni bir kalemdir
- Sıra numarası olmayan ama önceki kalemin devamı olan satırlar mal/hizmet adına eklenir
- Miktar ve fiyat sayısal değerlerdir (virgüllü Türkçe format: 416,67)
- KDV oranı genellikle %20
- Birim: Adet, Kg, Lt, Metre, Kutu

### Adım 4: Önizleme Tablosunu Güncelle

Parse sonucu dönen veride şu alanlar olmalı:

```typescript
interface ParsedFatura {
  fatura_no: string;
  fatura_tarihi: string;
  vade_tarihi: string;
  
  // MÜŞTERİ BİLGİSİ (düzeltilmiş)
  musteri_unvan: string;      // "ENFES LEZZETLER TARIM HAYV..." 
  musteri_vkn: string;        // "3350496619" (Köklü'nün VKN'si DEĞİL)
  musteri_adres: string;
  musteri_vergi_dairesi: string;
  
  // TOPLAMLAR
  ara_toplam: number;
  kdv_tutari: number;
  toplam_tutar: number;
  
  // KALEMLER (yeni eklenen)
  kalemler: Array<{
    sira_no: number;
    mal_hizmet: string;       // "6 Kg KKT Yangın Söndürme Cihazı Dolumu"
    miktar: number;           // 8
    birim: string;            // "Adet"
    birim_fiyat: number;      // 416.67
    iskonto_orani: number;    // 0
    kdv_orani: number;        // 20
    kdv_tutari: number;       // 666.67
    toplam: number;           // 3333.36
  }>;
  
  // ŞUBE
  sube_id: string;
}
```

Önizleme tablosunda:
- **MÜŞTERİ ADI** kolonunda gerçek müşteri unvanını göster
- **KALEM** kolonunda kalem sayısını göster (0 yerine gerçek değer)
- Düzenle butonunda kalemleri de göster/düzenle

### Adım 5: Gelen Fatura Parse'ı da Kontrol Et

Gelen faturalarda yapı farklı olabilir — orada Köklü Yangın alıcı pozisyonunda:
- Satıcı: Tedarikçi firma (Migros, Erkarpaş vb.)
- Alıcı: Köklü Yangın

Gelen faturada müşteri bilgisi = satıcı (tedarikçi) bilgisi olmalı.
Aynı "SAYIN" bloğu mantığını ters çevir.

## 🧪 Test

Düzeltme sonrası test:
1. Giden fatura ZIP yükle (turmo'dan indirilen)
2. Önizlemede müşteri unvanı doğru göründüğünü kontrol et
3. VKN'nin müşterinin VKN'si olduğunu kontrol et (5830028164 OLMAMALI)
4. Kalem sayısının 0'dan farklı olduğunu kontrol et
5. Düzenle butonuyla kalemleri görebildiğini kontrol et
6. "Tümünü İçe Aktar" butonuyla faturaları kaydet
7. Giden Faturalar listesinde müşteri adının doğru göründüğünü kontrol et

## ⚠️ DİKKAT
- Mevcut parse formatlarını (Migros, Erkarpaş, Hidropres, Semihler) bozma — bunlar GELEN fatura formatları
- GİDEN faturalar hep Köklü Yangın formatında (KYS... fatura no ile)
- pdfjs-dist kullanmaya devam et (pdf-parse Vercel'de çalışmıyor)
- Türkçe karakter sorunlarına dikkat (İ, Ş, Ğ, Ü, Ö, Ç)
- Tutar formatı: 3.333,36 → 3333.36 dönüşümü doğru yapılmalı