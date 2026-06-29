# GÖREV: Fatura Yükle — KDV Hesaplama Hatası + musteri_adres Schema Hatası

## ⚠️ KRİTİK KURAL
**Çalışan sistemleri BOZMA.** Sadece bu iki hataya odaklan:
1. KDV hesaplama hatası (sadece tek PDF yükleme akışında)
2. `musteri_adres` schema cache hatası (her iki yükleme akışında)

ZIP yükleme akışı KDV açısından doğru çalışıyor — oraya KDV mantığıyla dokunma.

---

## 🔴 SORUN 1: KDV Yanlış Hesaplanıyor (Tek PDF Yükleme)

### Test PDF: Drilteks_Fatura_102024.pdf

PDF'deki gerçek değerler:
```
1. 6 Kg KKT Yangın Söndürme Cihazı Dolumu      10 Adet × 333,34 TL = 3.333,40 TL (KDV %20 = 666,68 TL)
2. 6 Kg KKT Yangın Söndürme Cihazı T. Vana D.   1 Adet × 100,00 TL =   100,00 TL (KDV %20 =  20,00 TL)
3. Manometre Değişimi                            2 Adet ×  20,00 TL =    40,00 TL (KDV %20 =   8,00 TL)
4. Yangın Söndürme Cihazı Hortum Değişimi        2 Adet ×  50,00 TL =   100,00 TL (KDV %20 =  20,00 TL)

KDV Matrahı (KDV Hariç):  3.573,40 TL
KDV (%20):                  714,68 TL
GENEL TOPLAM (KDV Dahil): 4.288,08 TL
```

Sistemin gösterdiği YANLIŞ değerler:
```
1. Birim Fiyat: 277,78 TL  ❌ (333,34 olmalı)  → 333,34 / 1.20 = 277,78 (KDV'yi tekrar düşmüş)
   Satır Top:  2.777,80 TL ❌
2. Birim Fiyat:  83,33 TL  ❌ (100,00 olmalı)
3. Birim Fiyat:  16,67 TL  ❌ (20,00 olmalı)
4. Birim Fiyat:  41,67 TL  ❌ (50,00 olmalı)
```

### Kök Neden
PDF'deki "Birim Fiyat" KDV hariç. Sistem yine de KDV dahilmiş varsayıp `birim_fiyat / 1.20` yapıyor.

### Yapılacak

**1.1. Tek PDF yükleme parse kodunu bul:**
```bash
grep -rn "cari-hesap/faturalar/new\|fatura.*yeni\|/api/parse-fatura\|parse-single-pdf" src/ --include="*.ts" --include="*.tsx" -l
```

**1.2. KDV hesaplama mantığını incele:**
```bash
grep -rn "kdv_dahil\|kdv_haric\|/ 1\.\?20\|/ 1\.2\|birim_fiyat.*kdv\|kdv.*birim_fiyat" src/ --include="*.ts" --include="*.tsx"
```

**1.3. e-Fatura/e-Arşiv PDF'lerinde KURAL:**

Türk e-Fatura/e-Arşiv PDF formatında **kalem tablosundaki "Birim Fiyat" HER ZAMAN KDV HARİÇ**'tir. Bu standarttır.

Tablo yapısı:
```
Miktar | Birim Fiyat (KDV HARİÇ) | KDV Oranı | KDV Tutarı | Mal Hizmet Tutarı (KDV HARİÇ)
```

Toplam = Miktar × Birim Fiyat (KDV HARİÇ)
KDV Tutarı = Toplam × KDV Oranı
KDV Dahil Toplam = Toplam + KDV Tutarı

**1.4. Parse fonksiyonunda düzeltme:**

```typescript
// HATALI mantık (büyük ihtimalle şu an böyle):
const birimFiyatKdvHaric = pdfBirimFiyat / (1 + kdvOrani / 100); // ❌ YANLIŞ — PDF zaten KDV hariç

// DOĞRU mantık:
const birimFiyatKdvHaric = pdfBirimFiyat; // ✅ PDF'deki birim fiyat ZATEN KDV hariç
const satirTutarKdvHaric = miktar * birimFiyatKdvHaric;
const kdvTutari = satirTutarKdvHaric * (kdvOrani / 100);
const satirTutarKdvDahil = satirTutarKdvHaric + kdvTutari;
```

**1.5. AI parse prompt'una net kural ekle:**

Tek PDF yükleme AI parse kullanıyorsa system prompt'una EKLE:

```
KRİTİK KDV KURALI:
e-Fatura/e-Arşiv PDF'lerinde kalem tablosundaki "Birim Fiyat" DAİMA KDV HARİÇ'tir.
Bu fiyatı asla KDV'den ayırma, asla 1.20'ye bölme.
- birim_fiyat = PDF'deki "Birim Fiyat" sütunundaki değer (KDV HARİÇ)
- satir_tutar_kdv_haric = miktar × birim_fiyat
- kdv_tutari = PDF'deki "KDV Tutarı" sütunundaki değer
- satir_tutar = PDF'deki "Mal Hizmet Tutarı" sütunundaki değer (KDV HARİÇ)
- toplam_kdv_dahil = PDF'deki "Vergiler Dahil Toplam Tutar" veya "Ödenecek Tutar"

ÖRNEK doğru parse (Drilteks faturası):
{
  "kalemler": [
    {
      "aciklama": "6 Kg KKT Yangın Söndürme Cihazı Dolumu",
      "miktar": 10,
      "birim_fiyat": 333.34,  // PDF'deki "333,34TL" — KDV HARİÇ, böl-me!
      "kdv_orani": 20,
      "kdv_tutari": 666.68,
      "tutar": 3333.40
    }
  ],
  "toplam_kdv_haric": 3573.40,
  "kdv_toplam": 714.68,
  "toplam_kdv_dahil": 4288.08
}
```

**1.6. ZIP yükleme akışını KARŞILAŞTIR — değişiklik yapma:**

ZIP yükleme akışında bu sorun YOK. Demek ki ZIP parse fonksiyonu doğru çalışıyor. Tek PDF parse fonksiyonunu ZIP parse mantığıyla aynı hale getir. ZIP koduna DOKUNMA.

```bash
# ZIP parse fonksiyonunu bul ve KDV mantığını incele:
grep -rn "gelen-pdf-parse\|adm-zip\|JSZip" src/app/api/ --include="*.ts"
```

Bu fonksiyondaki KDV/birim fiyat işleme mantığını al, tek PDF parse'a uygula.

---

## 🔴 SORUN 2: `Could not find the 'musteri_adres' column of 'invoices' in the schema cache`

### Kök Neden
Kod hâlâ `invoices` tablosuna yazmaya çalışıyor. Doğru tablo adı `faturalar` veya `gelen_faturalar`. Ayrıca `musteri_adres` kolonu o tabloda yok.

Bu hata iki yerde çıkıyor:
- Cari Hesap → Faturalar → Dosyadan yükle → Kaydet
- Cari Hesap → e-Fatura Import → ZIP yükle → Kaydet

### Yapılacak

**2.1. `invoices` referanslarını bul:**
```bash
grep -rn "'invoices'\|\"invoices\"\|from('invoices')\|.from(\"invoices\")" src/ --include="*.ts" --include="*.tsx"
```

**2.2. Doğru tablo adını kullan:**
- Giden fatura → `faturalar`
- Gelen fatura → `gelen_faturalar`

Bulduğun her `invoices` → uygun tablo adıyla değiştir.

**2.3. `musteri_adres` alanını insert/update'ten çıkar:**

```bash
grep -rn "musteri_adres" src/ --include="*.ts" --include="*.tsx"
```

İki seçenek var:

**Seçenek A (Önerilen — güvenli):** Bu alanı insert/update nesnesinden çıkar. Adres bilgisi `customers.address` tablosundan zaten geliyor, faturaya yazmaya gerek yok.

```typescript
// ÖNCE:
const insertData = {
  musteri_adi: '...',
  musteri_vkn: '...',
  musteri_adres: '...',  // ← BU SATIRI SİL
  fatura_no: '...',
  // ...
};

// SONRA:
const insertData = {
  musteri_adi: '...',
  musteri_vkn: '...',
  fatura_no: '...',
  // musteri_adres yok
};
```

**Seçenek B:** Kolonu DB'ye ekle (eğer adresi faturada saklamak gerçekten gerekiyorsa):

```sql
ALTER TABLE public.faturalar ADD COLUMN IF NOT EXISTS musteri_adres TEXT;
ALTER TABLE public.gelen_faturalar ADD COLUMN IF NOT EXISTS musteri_adres TEXT;

-- Supabase schema cache'i yenile:
NOTIFY pgrst, 'reload schema';
```

**Önerim: Seçenek A** — gereksiz veri çoğaltmayalım, müşteri adresi `customers` tablosundan çekilsin.

**2.4. Aynı sorun başka kolon isimleri için var mı kontrol et:**
```bash
grep -rn "tedarikci_adres\|gider_kategorisi\|firma_id" src/ --include="*.ts" --include="*.tsx" | head -20
```

DB'de olmayan bir kolona yazılmaya çalışılıyorsa çıkar.

---

## 🧪 TEST PLANI

Değişiklikler yapıldıktan SONRA bu testleri sırayla çalıştır:

### Test 1: KDV Hesaplama (Tek PDF)
1. Cari Hesap → Faturalar → Yeni Fatura → Dosyadan yükle
2. `Drilteks_Fatura_102024.pdf` yükle
3. Önizleme ekranında beklenen değerleri kontrol et:
   - [ ] Kalem 1 Birim Fiyat: **333,34 TL** (277,78 DEĞİL)
   - [ ] Kalem 1 Satır Top: **3.333,40 TL**
   - [ ] Kalem 2 Birim Fiyat: **100,00 TL**
   - [ ] Kalem 3 Birim Fiyat: **20,00 TL**
   - [ ] Kalem 4 Birim Fiyat: **50,00 TL**
   - [ ] Ara Toplam (KDV Hariç): **3.573,40 TL**
   - [ ] KDV: **714,68 TL**
   - [ ] Genel Toplam: **4.288,08 TL**

### Test 2: musteri_adres Hatası (Tek PDF Kaydet)
1. Yukarıdaki yüklenen faturayı "Faturayı Kaydet" ile kaydet
2. Beklenen: Hata YOK, fatura başarıyla kaydedildi
3. [ ] "Could not find the 'musteri_adres' column" hatası ÇIKMAMALI
4. [ ] Fatura veritabanına yazılmış olmalı
5. [ ] Faturalar listesinde görünmeli

### Test 3: ZIP Yükleme (Mevcut çalışan akış bozulmamış mı?)
1. e-Fatura Import sekmesine git
2. Bir ZIP dosyası yükle (önceden test ettiğin gibi)
3. [ ] Parse hâlâ doğru çalışıyor
4. [ ] KDV hâlâ doğru hesaplanıyor (bozulmadı)
5. [ ] Bir faturayı içe aktar — `musteri_adres` hatası ÇIKMAMALI
6. [ ] Tedarikçi eşleştirme hâlâ çalışıyor

### Test 4: Genel Bozulma Kontrolü
1. Faturalar listesi açılıyor mu?
2. Mevcut bir faturayı düzenle, kaydet — çalışıyor mu?
3. Müşteri listesi açılıyor mu?
4. Servis formu oluşturma çalışıyor mu?

### Test Sonucu Raporu

Tüm testler ✅ olduktan SONRA git push yap:

```bash
cd C:\Projects\koklu-erp

# Önce değişiklikleri kontrol et
git status
git diff --stat

# Sonra commit ve push
git add .
git commit -m "Fix: Tek PDF yüklemede KDV hesaplama hatası + musteri_adres schema cache hatası"
git push
```

Vercel deploy tamamlanınca canlıda da aynı testleri tekrarla.

---

## ⚠️ Dikkat Edilecekler

- ZIP yükleme akışındaki KDV mantığına DOKUNMA — orası çalışıyor
- Diğer modüllere (müşteri, servis, teklif, teslimat) dokunma
- `musteri_adres` kullanan başka modüller varsa onları da kontrol et ama bozma
- Test 3 ÖNEMLİ — ZIP akışının bozulmadığından emin ol
- Schema cache hatası devam ederse Supabase Dashboard'da Database → Tables'a git, ilgili tablodan "Reload schema" yap

## 📋 Kontrol Özeti

- [ ] Sorun 1 (KDV) — kod düzeltildi
- [ ] Sorun 2 (musteri_adres) — kod düzeltildi
- [ ] Test 1 — KDV hesaplama doğru
- [ ] Test 2 — musteri_adres hatası gitti
- [ ] Test 3 — ZIP akışı bozulmadı
- [ ] Test 4 — diğer modüller etkilenmedi
- [ ] git push yapıldı
- [ ] Vercel canlı deploy tamamlandı
- [ ] Canlıda da tüm testler tekrar yapıldı