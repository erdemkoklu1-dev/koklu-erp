# GÖREV: Canlıda "Unexpected token 'R'" Hatası — ACİL FIX

## 🔴 Hata
```
Unexpected token 'R', "Request En"... is not valid JSON
```
Bu hata FRONTEND'te oluşuyor. API route çöktüğünde Vercel düz text döndürüyor ("Request Entity Too Large" veya benzeri), frontend bunu `response.json()` ile parse etmeye çalışıyor ve çöküyor.

## ✅ Yapılacak — 2 Yer

### 1. Frontend'te API çağrısını düzelt

Gelen fatura upload bileşenini bul:
```bash
grep -rn "gelen-pdf-parse\|parse-fatura\|parse-invoice\|upload.*fatura\|fatura.*upload" src/app/(dashboard)/cari-hesap/ --include="*.tsx" --include="*.ts"
grep -rn "fetch.*parse\|fetch.*fatura\|fetch.*gelen" src/app/(dashboard)/cari-hesap/ --include="*.tsx" --include="*.ts"
```

API fetch çağrısını şu şekilde güvenli hale getir:

```typescript
// ESKİ (HATALI) — muhtemelen şöyle:
const response = await fetch('/api/gelen-pdf-parse', {
  method: 'POST',
  body: formData,
});
const data = await response.json(); // ← BURADA ÇÖKÜYOR

// YENİ (DOĞRU):
const response = await fetch('/api/gelen-pdf-parse', {
  method: 'POST',
  body: formData,
});

// Önce response'un OK olup olmadığını kontrol et
if (!response.ok) {
  // JSON olmayabilir, önce text olarak oku
  let errorMessage = 'Fatura parse edilemedi';
  try {
    const errorText = await response.text();
    // JSON olabilir mi dene
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorMessage;
    } catch {
      // JSON değil, düz text
      errorMessage = errorText.substring(0, 200) || `Sunucu hatası: ${response.status}`;
    }
  } catch {
    errorMessage = `Sunucu hatası: ${response.status}`;
  }
  throw new Error(errorMessage);
}

// Şimdi güvenle JSON parse et
const data = await response.json();
```

**BU DEĞİŞİKLİĞİ TÜM fetch çağrılarına uygula:**
- Gelen fatura parse fetch
- Giden fatura parse fetch
- Teklif parse fetch
- Fatura import fetch

### 2. API Route'larda TÜM hata yollarında JSON dön

Tüm parse API route'larını kontrol et:
```bash
grep -rn "route.ts" src/app/api/ --include="*.ts" -l | grep -i "parse\|fatura\|gelen\|invoice"
```

Her route'ta en dıştaki try-catch'in catch bloğunda JSON döndüğünden emin ol:

```typescript
// src/app/api/gelen-pdf-parse/route.ts (ve diğer parse route'ları)

export async function POST(request: NextRequest) {
  try {
    // ... tüm parse mantığı ...
    
    return NextResponse.json({ success: true, invoices: [...] });
  } catch (error: any) {
    // ÖNEMLİ: Her zaman JSON dön!
    console.error('Parse API hatası:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Bilinmeyen hata',
        invoices: [] // Boş array dön, frontend çökmesin
      },
      { status: 500 }
    );
  }
}
```

**KRİTİK:** Route'un EN DIŞ bloğunda bu try-catch olmalı. İç fonksiyonlar hata fırlatsa bile en dış catch JSON yanıt döndürmeli.

### 3. Vercel body size limiti kontrolü

Vercel Hobby plan'da request body limiti 4.5MB. ZIP dosyası bundan büyükse hata verir. Frontend'de dosya boyutu kontrolü ekle:

```typescript
// Dosya seçildiğinde:
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (güvenli sınır)

if (file.size > MAX_FILE_SIZE) {
  setError(`Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimum 4MB yüklenebilir. Daha küçük ZIP dosyaları deneyin.`);
  return;
}
```

## 🔍 Kontrol
- [ ] Canlıda gelen fatura ZIP yüklenince hata çıkmıyor mu?
- [ ] AI başarısız olsa bile regex fallback çalışıyor mu?
- [ ] Hata mesajı kullanıcı dostu mu (JSON parse hatası DEĞİL)?
- [ ] 4MB'den büyük dosyalar için uyarı gösteriliyor mu?
- [ ] Local'de hâlâ düzgün çalışıyor mu?