# GÖREV: Groq API Hata Yönetimi — Vercel'de Çalışmıyor

## 🔴 Sorun
Canlı ortamda (Vercel) gelen fatura yüklenince hata çıkıyor:
```
Unexpected token 'R', "Request En"... is not valid JSON
```
Groq API çağrısı başarısız oluyor ve tüm parse işlemi çöküyor.

## ✅ Yapılacak — 2 Adım

### ADIM 1: Tüm Groq API çağrılarına try-catch + fallback ekle

Groq API kullanan TÜM dosyaları bul:
```bash
grep -rn "api.groq.com\|parseGelenFaturaWithAI\|parseInvoiceWithAI\|parseTeklifWithAI\|GROQ_API_KEY" src/ --include="*.ts" --include="*.tsx" -l
```

Her Groq API çağrısını try-catch ile sar. AI başarısız olursa mevcut regex parse'a fallback yapsın:

```typescript
// HER API route'ta bu pattern'i uygula:

let parsedResult = null;

// Önce AI dene
try {
  if (process.env.GROQ_API_KEY) {
    parsedResult = await parseWithAI(pdfText);
    console.log('AI parse başarılı');
  }
} catch (aiError) {
  console.error('AI parse başarısız, regex fallback kullanılacak:', aiError);
  parsedResult = null; // Fallback'e düşür
}

// AI başarısız olduysa veya GROQ_API_KEY yoksa → regex parse
if (!parsedResult) {
  try {
    parsedResult = await parseWithRegex(pdfText); // Mevcut regex parse fonksiyonu
    console.log('Regex parse kullanıldı');
  } catch (regexError) {
    console.error('Regex parse de başarısız:', regexError);
    // Son çare: minimal bilgi dön
    parsedResult = {
      tedarikci_adi: 'Parse edilemedi',
      fatura_no: fileName || 'Bilinmiyor',
      tutar: 0,
      kalemler: [],
      parseError: 'Fatura otomatik parse edilemedi, lütfen manuel girin'
    };
  }
}
```

### ADIM 2: Groq API response'u kontrol et

API çağrısından önce response'un gerçekten JSON olup olmadığını kontrol et:

```typescript
// invoice-ai-parser.ts ve diğer AI parser dosyalarında:

const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [...],
    temperature: 0,
    max_tokens: 4096,
  }),
});

// Response kontrolü — JSON olmayabilir!
if (!response.ok) {
  const errorText = await response.text(); // .json() DEĞİL .text()!
  console.error('Groq API HTTP hatası:', response.status, errorText);
  throw new Error(`Groq API hatası: ${response.status} - ${errorText.substring(0, 200)}`);
}

// Content-Type kontrolü
const contentType = response.headers.get('content-type') || '';
if (!contentType.includes('application/json')) {
  const rawText = await response.text();
  console.error('Groq API JSON dönmedi:', rawText.substring(0, 200));
  throw new Error('Groq API geçersiz yanıt döndü');
}

const data = await response.json();
```

### ADIM 3: API Key kontrolü

```typescript
// API key'in geçerli olup olmadığını kontrol et
const apiKey = (process.env.GROQ_API_KEY || '').trim();

if (!apiKey || apiKey.length < 10) {
  console.warn('GROQ_API_KEY geçersiz veya çok kısa, regex parse kullanılacak');
  // Regex fallback'e düş
}
```

## 🔍 Kontrol
- [ ] Canlı ortamda (koklu-erp.vercel.app) gelen fatura yükleme çalışıyor mu?
- [ ] AI başarısız olunca regex fallback devreye giriyor mu?
- [ ] GROQ_API_KEY olmadan da faturalar parse ediliyor mu?
- [ ] Hata mesajı kullanıcı dostu mu?

## ⚠️ Teknik Not
- Bu değişiklik sonrası canlı ortamda AI çalışmazsa regex parse devreye girer
- Local'de AI çalışıyorsa orada daha iyi sonuç verir, canlıda regex ile kabul edilebilir sonuç
- Vercel Hobby plan'da serverless function timeout 10 saniye — 30+ PDF'lik ZIP'te AI timeout alabilir