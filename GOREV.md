# GÖREV: Fatura Düzenle Müşteri Seçimi + Tablo Sabit Kolon UX

## İki kritik UX sorunu var.

---

## 1️⃣ Fatura Düzenle — Müşteri Seçimi Çalışmıyor

### Sorun
- Giden fatura düzenle ekranında "Değiştir" butonuna basınca müşteri listesi açılıyor
- Listeden müşteri seçilemiyor (tıklama çalışmıyor)
- Manuel yazıp güncelle denince müşteri adı BOŞ kaydediliyor
- Autocomplete dropdown'dan seçim yapılamıyor

### Yapılacak

Fatura düzenle bileşenini bul:
```bash
grep -rn "Değiştir\|degistir\|müşteri.*ara\|musteri.*search\|customer.*select" src/app/(dashboard)/cari-hesap/ --include="*.tsx" -l
```

**A) Müşteri autocomplete'i düzelt:**

Müşteri seçim dropdown'undaki `onClick` handler'ı çalışmıyor olabilir. Kontrol et:

```tsx
// Autocomplete dropdown item'ları tıklanabilir olmalı:
{searchResults.map(customer => (
  <div
    key={customer.id}
    // onClick MUTLAKA olmalı ve çalışmalı:
    onClick={() => {
      setSelectedCustomer(customer);
      setMusteriAdi(customer.full_name);
      setMusteriId(customer.id);
      setShowDropdown(false);
    }}
    // POINTER cursor olmalı:
    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
    // role button erişilebilirlik için:
    role="button"
  >
    {customer.full_name}
    {customer.tax_number && (
      <span className="text-xs text-gray-500 ml-2">{customer.tax_number}</span>
    )}
  </div>
))}
```

**B) Seçilen müşteri ID'si update'e dahil olmalı:**

```typescript
// Güncelle fonksiyonunda:
const handleUpdate = async () => {
  const updateData: any = {
    fatura_tarihi: faturaTarihi,
    vade_tarihi: vadeTarihi,
    aciklama: aciklama,
    sube_id: subeId,
    // ... diğer alanlar
  };
  
  // Müşteri değiştirildiyse:
  if (selectedCustomer) {
    updateData.musteri_id = selectedCustomer.id;
    updateData.musteri_adi = selectedCustomer.full_name;
  } else if (musteriAdi) {
    // Manuel girilen ad
    updateData.musteri_adi = musteriAdi;
  }
  // ÖNEMLİ: musteriAdi boşsa güncelleme nesnesine EKLEME
  
  const { error } = await supabase
    .from('faturalar') // veya gelen_faturalar
    .update(updateData)
    .eq('id', faturaId);
};
```

**C) Dropdown z-index sorunu olabilir:**
```tsx
// Dropdown container'a yüksek z-index ekle:
<div className="relative">
  <input value={searchTerm} onChange={...} />
  {showDropdown && (
    <div className="absolute top-full left-0 w-full bg-white dark:bg-gray-800 
      border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
      {/* dropdown items */}
    </div>
  )}
</div>
```

---

## 2️⃣ Tablo UX — Sabit Kolonlar (Sticky Columns)

### Sorun
Tüm fatura/müşteri tablolarında:
- Detay, Düzenle, Sil butonları tablonun sağ ucunda, ekran dışında
- Yana scroll yapılınca müşteri adı görünmüyor
- Hangi satırın aksiyonuna tıklanacağı karışıyor
- Her seferinde aşağı inip scroll yapıp tekrar yukarı çıkmak gerekiyor

### Çözüm: Sol kolon sabit (sticky) + Sağ aksiyon kolonu sabit

**Tüm ana tabloları bul:**
```bash
grep -rn "overflow-x-auto\|overflow-x: auto\|Detay.*Düzenle\|İŞLEM" src/app/(dashboard)/ --include="*.tsx" -l
```

Uygulanacak sayfalar:
- Faturalar listesi
- Giden Faturalar listesi
- Gelen Faturalar listesi
- Müşteri listesi
- Fiyat Teklifleri listesi
- Proforma Fatura listesi
- Teslimat listesi
- Ön Kayıtlar listesi

**Her tablo için şu yapıyı uygula:**

```tsx
{/* Tablo wrapper */}
<div className="w-full overflow-x-auto relative">
  <table className="w-full text-sm min-w-[800px]">
    <thead>
      <tr className="bg-gray-50 dark:bg-gray-800">
        {/* SOL SABİT KOLON: Müşteri/Tedarikçi adı */}
        <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-left min-w-[200px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
          MÜŞTERİ / TEDARİKÇİ
        </th>
        
        {/* Orta kolonlar — normal scroll */}
        <th className="px-4 py-3 text-left">FATURA NO</th>
        <th className="px-4 py-3 text-left">TARİH</th>
        <th className="px-4 py-3 text-left">VADE</th>
        <th className="px-4 py-3 text-left">ŞUBE</th>
        <th className="px-4 py-3 text-right">TUTAR</th>
        <th className="px-4 py-3 text-right">KALAN</th>
        
        {/* SAĞ SABİT KOLON: Aksiyon butonları */}
        <th className="sticky right-0 z-10 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-center min-w-[150px] shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
          İŞLEM
        </th>
      </tr>
    </thead>
    <tbody>
      {faturalar.map(fatura => (
        <tr key={fatura.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
          {/* SOL SABİT: Müşteri adı */}
          <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-3 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
            {fatura.musteri_adi}
            <div className="text-xs text-gray-500">{fatura.musteri_vkn}</div>
          </td>
          
          {/* Orta kolonlar */}
          <td className="px-4 py-3">{fatura.fatura_no}</td>
          <td className="px-4 py-3">{fatura.tarih}</td>
          <td className="px-4 py-3">{fatura.vade}</td>
          <td className="px-4 py-3">{fatura.sube}</td>
          <td className="px-4 py-3 text-right">₺{fatura.tutar}</td>
          <td className="px-4 py-3 text-right">₺{fatura.kalan}</td>
          
          {/* SAĞ SABİT: Aksiyon butonları */}
          <td className="sticky right-0 z-10 bg-white dark:bg-gray-900 px-4 py-3 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
            <div className="flex gap-2 justify-center">
              <a href={`/cari-hesap/fatura/${fatura.id}`} 
                className="text-blue-600 hover:underline text-sm">
                Detay
              </a>
              <a href={`/cari-hesap/fatura/${fatura.id}/duzenle`} 
                className="text-blue-600 hover:underline text-sm">
                Düzenle
              </a>
              <button onClick={() => handleDelete(fatura.id)} 
                className="text-red-600 hover:underline text-sm">
                Sil
              </button>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

**CSS açıklaması:**
- `sticky left-0` → Sol kolon sabit, scroll ile hareket etmez
- `sticky right-0` → Sağ kolon sabit, her zaman görünür
- `z-10` → Diğer kolonların üstünde kalır
- `shadow-[2px_0_5px_-2px...]` → Sabit kolonun bitişinde gölge efekti (nerede bittiği belli olsun)
- `bg-white dark:bg-gray-900` → Arka plan rengi olmalı yoksa altındaki text görünür

**Hover satırında sticky kolon arka planı da değişmeli:**
```tsx
// Hover için group kullan:
<tr className="group border-b">
  <td className="sticky left-0 bg-white group-hover:bg-gray-50 dark:bg-gray-900 dark:group-hover:bg-gray-800 ...">
```

---

## 🔍 Kontrol Noktaları

### Müşteri Seçimi:
- [ ] Autocomplete dropdown'dan müşteri tıklanınca seçiliyor mu?
- [ ] Seçilen müşteri adı input'a yazılıyor mu?
- [ ] Güncelle sonrası müşteri adı boş değil mi?
- [ ] Dropdown z-index doğru mu (diğer elementlerin üstünde mi)?

### Tablo Sticky Kolonlar:
- [ ] Yatay scroll yapılırken müşteri adı (sol) sabit kalıyor mu?
- [ ] Yatay scroll yapılırken İŞLEM butonları (sağ) sabit kalıyor mu?
- [ ] Sabit kolonlarda gölge efekti var mı?
- [ ] Hover satırında sabit kolonlar da renk değiştiriyor mu?
- [ ] Dark mode'da sabit kolonlar düzgün görünüyor mu?
- [ ] Mobilde düzgün çalışıyor mu?
- [ ] Tüm sayfalara uygulandı mı? (Faturalar, Giden, Gelen, Müşteriler, Teklifler, Teslimatlar)

## ⚠️ Teknik Notlar
- `position: sticky` ile `overflow-x: auto` birlikte çalışır — wrapper div'de overflow olmalı
- Sticky kolon mutlaka `background-color` olmalı, yoksa alttaki içerik görünür
- `z-index` ile sticky kolonlar diğer hücrelerin üstünde kalmalı
- Shadow efekti ile sticky kolonun bitişi belli olur, kullanıcı scroll yapabileceğini anlar
- Mevcut projenin class yapısına uy, yeni CSS dosyası ekleme