# GÖREV: Gelen Fatura Import — Son 8 Manuel Kategori + 1 Parse Hatası

---

## 1️⃣ "Genel Gider" Kategorisi Manuel Kategori Sayılmasın

### Sorun
Bazı faturalarda kategori "Genel Gider" olarak atanmış (dropdown'da seçili) ama durum hâlâ "Manuel Kategori". Çünkü kod "Genel Gider"ı varsayılan/boş kategori olarak kabul edip "kategori seçilmedi" sayıyor.

### Yapılacak

Durum hesaplama kodunu bul:
```bash
grep -rn "manuel.*kategori\|Manuel.*Kategori\|Genel Gider\|genel_gider" src/app/(dashboard)/cari-hesap/ --include="*.tsx" --include="*.ts"
```

"Genel Gider" de geçerli bir kategori olarak kabul et:

```typescript
// ESKİ (HATALI) — muhtemelen şöyle bir koşul var:
if (!invoice.gider_kategori || invoice.gider_kategori === 'Genel Gider') {
  status = 'manuel_kategori';
}

// YENİ (DOĞRU):
if (!invoice.gider_kategori) {
  status = 'manuel_kategori';
}
// "Genel Gider" DE geçerli bir kategori — Manuel Kategori DEĞİL
```

Veya:
```typescript
// Eğer bir suggestedCategory varsa (AI veya kural bazlı), 
// Genel Gider olsa bile kabul et:
if (!invoice.gider_kategori && !invoice.suggestedCategory) {
  status = 'manuel_kategori';
} else {
  // Kategori var (öneri dahil Genel Gider) → çözüldü
  status = invoice.existingTedarikci ? 'tedarikci_mevcut' : 'yeni_tedarikci';
}
```

---

## 2️⃣ Kategori Kurallarını Genişlet

Kalan Manuel Kategori faturalarına bakarak yeni kurallar ekle:

```bash
grep -rn "suggestIncomingExpenseCategory\|GIDER_KATEGORILERI\|kategori.*rule\|categoryRules" src/ --include="*.ts" --include="*.tsx"
```

Mevcut kural listesine ekle:

```typescript
// Yeni kurallar:
{ keywords: ['BASINÇLI KAP', 'BASINÇLI', 'DELTA', 'ÇELİK', 'METAL', 'SAC', 'KAYNAK'], category: 'Hammadde' },
{ keywords: ['BELGELENDİR', 'SERTİFİKA', 'TSE', 'ISO', 'NEMACERT', 'TÜRKAK', 'KALIBRASYON'], category: 'Belgelendirme' },
{ keywords: ['ROBOT', 'ELEKTRONİK', 'SENSOR', 'SENSÖR', 'ARDUINO', 'ROBOTZADE'], category: 'Elektronik / Teknik' },
{ keywords: ['REKLAM', 'MATBAA', 'BASIM', 'TABELA', 'KARTVIZIT'], category: 'Reklam / Tanıtım' },
{ keywords: ['MUHASEBE', 'MALİ MÜŞAVİR', 'SMMM', 'YMM', 'DENETIM'], category: 'Muhasebe / Denetim' },
{ keywords: ['HEPSİJET', 'D-FAST', 'TRENDYOL', 'N11', 'GİTTİGİDİYOR'], category: 'Kargo / Nakliye' },
{ keywords: ['PAZARLAMA', 'NH1'], category: 'Genel Gider' },
```

Ayrıca "Belgelendirme" ve "Elektronik / Teknik" kategorilerini dropdown listesine ekle (GIDER_KATEGORILERI sabitine):

```typescript
const GIDER_KATEGORILERI = [
  'Genel Gider',
  'Internet / İletişim',
  'Elektrik',
  'Doğalgaz',
  'Su',
  'Kira',
  'Yakıt / Akaryakıt',
  'Market / Gıda',
  'Kargo / Nakliye',
  'Hammadde',
  'Araç Gideri',
  'Vergi / Resmi',
  'Ofis / Kırtasiye',
  'Belgelendirme',        // YENİ
  'Elektronik / Teknik',  // YENİ
  'Reklam / Tanıtım',     // YENİ
  'Muhasebe / Denetim',   // YENİ
];
```

---

## 3️⃣ "öder" Tedarikçi Adı Düzelt

### Sorun
Bir faturada tedarikçi adı "öder" olarak çıkmış (VKN: 48085137792). Bu hatalı parse.

### Yapılacak
Tedarikçi adı kontrolüne ek kurallar ekle:

```typescript
function isValidTedarikciName(name: string): boolean {
  if (!name || name.trim().length < 4) return false;
  
  const invalidNames = [
    'A.Ş.', 'LTD', 'ŞTİ', 'LTD.', 'A.S.', 'ŞTİ.',
    'öder', 'ÖDER', 'ödeme', 'ÖDEME', 'fatura', 'FATURA'
  ];
  
  if (invalidNames.includes(name.trim())) return false;
  
  // Tamamen küçük harf ise muhtemelen hatalı (unvanlar genelde büyük harf)
  if (name === name.toLowerCase() && name.length < 10) return false;
  
  return true;
}

// Geçersiz isim bulunursa:
if (!isValidTedarikciName(invoice.tedarikci_adi)) {
  invoice.tedarikci_adi = `Tedarikçi (${invoice.tedarikci_vkn || 'bilinmiyor'})`;
  invoice.warnings = [...(invoice.warnings || []), 'Tedarikçi adı otomatik parse edilemedi, lütfen düzeltin'];
}
```

---

## 4️⃣ Parse Hatası — info@ckbogazici.com.tr

### Sorun
Bu faturada hâlâ parse hatası var. Tedarikçi adı olarak e-posta adresi çıkmış.

### Yapılacak
E-posta adresini tedarikçi adı olarak kabul etme:

```typescript
// Tedarikçi adı e-posta mı kontrol et
if (invoice.tedarikci_adi && invoice.tedarikci_adi.includes('@')) {
  // E-posta adresinden firma adı çıkar
  // info@ckbogazici.com.tr → ckbogazici
  const domain = invoice.tedarikci_adi.split('@')[1]?.split('.')[0] || '';
  invoice.tedarikci_adi = domain.toUpperCase() || `Tedarikçi (${invoice.tedarikci_vkn})`;
}
```

Ayrıca bu fatura parse hatası olmadan da import edilebilmeli. Fatura no otomatik oluşturulmuşsa ("IMP-..."), durum "Parse Hatası" yerine normal durum olsun:

```typescript
// Fatura no otomatik oluşturulmuşsa parse hatası YAPMA
if (invoice.fatura_no && invoice.fatura_no.startsWith('IMP-')) {
  // Parse hatası çıkarma, uyarı göster
  invoice.parseError = null;
  invoice.warnings = [...(invoice.warnings || []), 'Fatura numarası otomatik oluşturuldu'];
}
```

---

## 🔍 Kontrol Noktaları
- [ ] Manuel Kategori: 8 → 0 (veya 0-2)?
- [ ] "Genel Gider" kategorili faturalar artık "Manuel Kategori" değil "Tedarikçi Mevcut" mu?
- [ ] DELTA BASINÇLI → "Hammadde" kategorisi mi?
- [ ] NEMACERT → "Belgelendirme" kategorisi mi?
- [ ] "öder" tedarikçi adı düzeltildi mi?
- [ ] info@ckbogazici.com.tr parse hatası çözüldü mü?
- [ ] Parse Hatası: 1 → 0?
- [ ] Tüm faturalar import edilebilir mi?