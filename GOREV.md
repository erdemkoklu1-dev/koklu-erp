# GÖREV: Proforma Fatura ve Fiyat Teklifi PDF Yazdırma Sorunu Düzeltme

## 🐛 Sorun
Proforma Fatura ve Fiyat Teklifi sayfalarında "Yazdır / PDF Kaydet" butonuyla PDF oluşturulduğunda:
1. Yazılar gri üzerine beyaz gibi görünüyor, okunması çok zor
2. Kalem tablosundaki kırmızı başlık şeridi (S.No, Mal/Hizmet, Miktar vb.) PDF'te kayboluyor
3. Genel olarak renkler/kontrastlar düşük kalıyor

Önizlemede (ekranda) tasarım düzgün, sorun sadece PDF kayıtta oluyor.

## 🔍 Kök Neden
Tarayıcılar varsayılan olarak yazdırma/PDF modunda arka plan renklerini ve görsellerini kaldırır.
CSS'de `print-color-adjust: exact` ve `-webkit-print-color-adjust: exact` eksik.

## ✅ Yapılacaklar

### 1. Global Print CSS Ekle
`src/app/globals.css` dosyasına ekle:

```css
@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
```

### 2. Proforma Fatura Önizleme Sayfasını Düzelt
Proforma fatura önizleme/detay sayfasını bul ve şu düzeltmeleri uygula:

#### a) Tablo başlık satırı (kırmızı şerit) — inline style ile zorla
```jsx
// YANLIŞ - Tailwind bg-red-600 print'te kayboluyor
<tr className="bg-red-600 text-white">

// DOĞRU - inline style ile print'te de korunur
<tr style={{
  backgroundColor: '#dc2626',
  color: '#ffffff',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact'
}}>
```

#### b) Gri/açık metin renklerini koyulaştır
```jsx
// YANLIŞ - print'te çok açık kalıyor
<td className="text-gray-500">5.000,00 TL</td>

// DOĞRU - inline style ile koyu yap
<td style={{ color: '#111827' }}>5.000,00 TL</td>
```

#### c) Alt toplam ve Ödenecek Tutar kırmızı rengi
```jsx
// Kırmızı tutarlar inline style olsun
<span style={{ color: '#dc2626', fontWeight: 'bold' }}>6.000,00 TL</span>
```

#### d) Border'lar
```jsx
<table style={{ borderCollapse: 'collapse' }}>
<td style={{ border: '1px solid #d1d5db', padding: '8px' }}>
```

### 3. Fiyat Teklifi Önizleme Sayfasını Düzelt
Aynı düzeltmeleri Fiyat Teklifi önizleme sayfasında da uygula.
Özellikle:
- Kırmızı tablo başlık şeridi (S.NO, ADET, MALIN CİNSİ, B. FİYATI, TOPLAM)
- GENEL TOPLAM kırmızı tutarı
- Tüm metin renkleri

### 4. Print Area Container
Her iki sayfadaki önizleme container'ına:
```jsx
<div style={{
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact'
}}>
  {/* Fatura/Teklif içeriği */}
</div>
```

### 5. EN ÖNEMLİ KURAL
Önizleme sayfalarındaki tüm kritik renkleri (arka plan, metin, border) Tailwind class yerine **inline style** olarak yaz. Bu print/PDF uyumluluğu için en güvenli yoldur.

Tailwind class'ları ekran görünümü için kalabilir ama kritik renkler mutlaka inline style'da da olmalı:
```jsx
<th className="bg-red-600 text-white" style={{ backgroundColor: '#dc2626', color: '#fff' }}>
```

## 🔎 Kontrol Listesi
Düzeltme sonrası test et:
- [ ] Proforma Fatura PDF: Kırmızı tablo başlığı görünüyor
- [ ] Proforma Fatura PDF: Tüm yazılar koyu ve okunabilir
- [ ] Proforma Fatura PDF: Kırmızı toplam tutarı görünüyor
- [ ] Fiyat Teklifi PDF: Kırmızı tablo başlığı görünüyor
- [ ] Fiyat Teklifi PDF: Tüm yazılar koyu ve okunabilir
- [ ] Fiyat Teklifi PDF: GENEL TOPLAM kırmızı renk görünüyor
- [ ] Her iki sayfanın ekran önizlemesi bozulmamış

## ⚠️ DİKKAT
- Sadece print/PDF render sorununu düzelt, tasarımı değiştirme
- Ekran önizlemesi bozulmasın
- Mevcut fonksiyonelliğe (kaydet, sil, düzenle) dokunma
- Her iki sayfa için de (Proforma + Fiyat Teklifi) fix uygula