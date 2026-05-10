# GÖREV: Fatura Düzenle İyileştirmeleri (Adres, Şube Filtre, Geri Navigasyon)

## 📋 Genel Bakış
Fatura düzenleme modalları ve fatura listeleme sayfalarında 4 iyileştirme yapılacak.

---

## 1️⃣ Giden/Gelen Fatura Düzenle Modalına Adres Alanı Ekle

### Sorun
Giden Faturalar ve Gelen Faturalar sekmelerindeki fatura düzenle modalında (popup) müşteri/tedarikçi adres alanı yok. Adres düzenlenemiyor.

### Yapılacak
Fatura düzenle modalına (muhtemelen `src/app/(dashboard)/cari-hesap/` altında) şu alanları ekle:

**Giden Fatura düzenle modalı:**
- Müşteri Unvanı (mevcut ✅)
- Müşteri VKN (mevcut ✅)
- **Müşteri Adresi** ← YENİ EKLE (textarea, 2-3 satır)
- Fatura No (mevcut ✅)
- Fatura Tarihi (mevcut ✅)
- Vade Tarihi (mevcut ✅)
- Ödenecek Tutar (mevcut ✅)
- Şube (mevcut ✅)

**Gelen Fatura düzenle modalı:**
- Tedarikçi Unvanı
- Tedarikçi VKN
- **Tedarikçi Adresi** ← YENİ EKLE (textarea, 2-3 satır)
- Fatura No, Tarih, Vade, Tutar, Şube

Adres alanı `faturalar` ve `gelen_faturalar` tablolarında saklanmalı. Kolon yoksa migration ekle:
```sql
ALTER TABLE public.faturalar ADD COLUMN IF NOT EXISTS musteri_adres TEXT;
ALTER TABLE public.gelen_faturalar ADD COLUMN IF NOT EXISTS tedarikci_adres TEXT;
```

---

## 2️⃣ Fatura Detay → Fatura Düzenle Sayfasına Adres ve Şube Ekle

### Sorun
Cari Hesap → Faturalar sekmesindeki fatura detay sayfasının "Fatura Düzenle" kısmında (tam sayfa düzenleme, modal değil) adres ve şube düzenleme alanı yok.

### Yapılacak
Fatura Detay → Fatura Düzenle sayfasına (tam sayfa form) şunları ekle:

**Fatura Bilgileri bölümüne:**
- Fatura Tipi (mevcut ✅)
- Fatura Tarihi (mevcut ✅)
- Vade Tarihi (mevcut ✅)
- Açıklama (mevcut ✅)
- Müşteri (mevcut ✅)
- **Müşteri Adresi** ← YENİ EKLE (textarea)
- **Şube** ← YENİ EKLE (dropdown: Erzincan Merkez / İstanbul Şube)

Şube dropdown'u `subeler` tablosundan çekilsin. Mevcut faturanın şube bilgisi seçili gelsin.

---

## 3️⃣ Geri Butonu — Doğru Sekmeye Dönme

### Sorun
Fatura detay sayfasında "← Fatura Detayı" veya "← Faturalar" geri butonuna tıklandığında her zaman ana Faturalar sekmesine dönüyor. Gelen fatura detayından dönünce de Faturalar sekmesi açılıyor — Gelen Faturalar sekmesi değil.

### Yapılacak
Geri butonunun davranışını fatura türüne göre ayarla:

- **Giden fatura** detayından geri → `Giden Faturalar` sekmesine dön
- **Gelen fatura** detayından geri → `Gelen Faturalar` sekmesine dön
- **Normal fatura** (Faturalar sekmesinden açılan) → `Faturalar` sekmesine dön

Implementasyon:
- URL'de query param kullan: `/cari-hesap/fatura/[id]?kaynak=giden` veya `?kaynak=gelen`
- Geri butonunda `kaynak` parametresine göre yönlendir:
  - `kaynak=giden` → `/cari-hesap?tab=giden-faturalar`
  - `kaynak=gelen` → `/cari-hesap?tab=gelen-faturalar`
  - default → `/cari-hesap?tab=faturalar`
- Fatura listesindeki düzenle/detay linklerine `kaynak` parametresini ekle

---

## 4️⃣ Şubeye Göre Fatura Filtreleme

### Sorun
Faturalar, Giden Faturalar ve Gelen Faturalar sekmelerinde şubeye göre filtreleme yok. Hangi şubenin faturası olduğu ayırt edilemiyor.

### Yapılacak
Her üç sekmeye de şube filtresi ekle:

**Filtre UI:**
- Sekme başlığının altına veya mevcut filtrelerin yanına bir dropdown ekle
- Seçenekler: `Tüm Şubeler` (varsayılan) | `Erzincan Merkez` | `İstanbul Şube`
- Şube listesi `subeler` tablosundan dinamik çekilsin
- Filtre seçildiğinde liste anında güncelle (client-side filter veya re-query)

**Faturalar sekmesi:**
```sql
SELECT * FROM faturalar WHERE sube_id = {seçilen şube} ORDER BY created_at DESC
```
`Tüm Şubeler` seçiliyse `sube_id` filtresi uygulanmaz.

**Giden Faturalar sekmesi:**
```sql
SELECT * FROM faturalar WHERE tur = 'giden' AND sube_id = {seçilen şube}
```

**Gelen Faturalar sekmesi:**
```sql
SELECT * FROM gelen_faturalar WHERE sube_id = {seçilen şube}
```

**Şube kolonu tablolarda yoksa ekle:**
```sql
ALTER TABLE public.gelen_faturalar ADD COLUMN IF NOT EXISTS sube_id UUID REFERENCES subeler(id);
```

**Tablo görünümünde** her fatura satırında Şube kolonu da gösterilsin (kısa ad: "Erzincan" / "İstanbul").

---

## ⚠️ Teknik Notlar
- Mevcut projenin yapısına tamamen uy
- Supabase RLS: `auth.uid() IS NOT NULL` mevcut policy yeterli
- Şube dropdown: `subeler` tablosundan `SELECT id, ad FROM subeler ORDER BY ad`
- Tarih formatı: DD.MM.YYYY (Türkçe)
- Dark mode desteğini unutma (dark: prefix'ler)
- Responsive: modal ve filtreler mobile'da da düzgün görünsün

## 🔍 Kontrol Noktaları
- [ ] Giden fatura düzenle modalında adres alanı var mı?
- [ ] Gelen fatura düzenle modalında adres alanı var mı?
- [ ] Fatura detay düzenle sayfasında adres ve şube var mı?
- [ ] Gelen fatura detayından geri → Gelen Faturalar sekmesine dönüyor mu?
- [ ] Giden fatura detayından geri → Giden Faturalar sekmesine dönüyor mu?
- [ ] Faturalar sekmesinde şube filtresi çalışıyor mu?
- [ ] Giden Faturalar sekmesinde şube filtresi çalışıyor mu?
- [ ] Gelen Faturalar sekmesinde şube filtresi çalışıyor mu?
- [ ] Şube filtresi "Tüm Şubeler" seçilince tüm faturalar görünüyor mu?
- [ ] Dark mode'da tüm yeni elemanlar düzgün görünüyor mu?