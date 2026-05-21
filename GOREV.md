# GÖREV: Gelen Fatura ZIP Import — AI Parse + Duplicate + Kategori

## 📋 Mevcut Durum
Gelen fatura ZIP yüklendiğinde:
- 4 Parse Hatası (kalemler parse edilemedi)
- 29 Manuel Kategori (kategori atanmamış)
- Duplicate sadece 9 (daha önce yüklenmiş faturalar tekrar "Eklenecek" gösteriyor)
- Bazı faturalarda tarih/tutar boş

## ✅ Yapılacak — 3 Ana İş

---

## 1️⃣ Gelen Fatura Parse'ı AI Destekli Yap

Giden fatura parse'ı Groq AI ile yapılıyor. Aynı mantığı gelen fatura parse'ına da ekle.

### A) Gelen fatura parse kodunu bul:
```bash
grep -rn "gelen.*fatura\|GelenFatura\|gelen_fatura" src/app/api/ --include="*.ts" -l
grep -rn "parse.*gelen\|gelen.*parse" src/ --include="*.ts" -l
grep -rn "adm-zip\|AdmZip" src/ --include="*.ts" -l
```

### B) Gelen fatura için AI parse fonksiyonu:

`src/lib/invoice-ai-parser.ts` dosyasına (zaten var) gelen fatura parse fonksiyonu ekle:

```typescript
// Gelen fatura için system prompt
const GELEN_FATURA_SYSTEM_PROMPT = `Sen bir Türk e-Fatura/e-Arşiv PDF'inden çıkarılmış ham text'i analiz eden bir yardımcısın.

Bu bir GELEN faturadır — yani başka bir firma Köklü Yangın'a kesmiş. 

KURALLAR:
1. TEDARİKÇİ (satıcı): Faturayı kesen firma. VKN/TCKN, unvan, adres bilgilerini çıkar.
2. ALICI: Köklü Yangın Söndürme Cihazları (VKN: 5830028164) — bunu tedarikçi olarak ALMA.
3. Tarihler YYYY-MM-DD formatında.
4. Tutarları sayı olarak dön (nokta ondalık: 1200.00).
5. KATEGORİ: Fatura içeriğine göre otomatik kategori öner:
   - "Internet / İletişim" → TTNET, TurkNet, Vodafone, Türk Telekom, internet, telefon
   - "Elektrik" → elektrik, enerji, EDAŞ, EPAŞ
   - "Doğalgaz" → doğalgaz, gaz dağıtım
   - "Su" → su, ASKİ, İSKİ
   - "Kira" → kira, gayrimenkul
   - "Yakıt / Akaryakıt" → benzin, motorin, akaryakıt, petrol, Opet, Shell, BP
   - "Market / Gıda" → BİM, A101, ŞOK, Migros, market, gıda
   - "Kargo / Nakliye" → kargo, nakliye, Yurtiçi, Aras, MNG, PTT
   - "Hammadde" → çelik, boru, vana, manometre, toz, köpük, kimyasal
   - "Araç Gideri" → araç, tamir, lastik, sigorta, muayene, otopark
   - "Vergi / Resmi" → vergi, SGK, bağkur, noter, harç
   - "Ofis / Kırtasiye" → kırtasiye, toner, yazıcı, kağıt
   - "Genel Gider" → yukarıdakilerin hiçbirine uymuyorsa
6. Kalem açıklamalarını tam yaz, özet satırlarını (Toplam, KDV, Ödenecek) kalem olarak EKLEME.
7. Çok satırlı açıklamaları birleştir.

SADECE JSON dön, Markdown backtick kullanma.`;

const GELEN_FATURA_USER_PROMPT = `Bu GELEN fatura PDF'inden çıkarılmış ham text:

---
{PDF_TEXT}
---

JSON formatında dön:

{
  "tedarikci_adi": "string (faturayı kesen firma)",
  "tedarikci_vkn": "string",
  "tedarikci_adres": "string",
  "tedarikci_il": "string",
  "vergi_dairesi": "string",
  "fatura_no": "string",
  "fatura_tarihi": "YYYY-MM-DD",
  "vade_tarihi": "YYYY-MM-DD veya boş",
  "toplam_tutar": number,
  "kdv_toplam": number,
  "kategori": "string (yukarıdaki kategorilerden biri)",
  "kalemler": [
    {
      "sira_no": number,
      "aciklama": "string",
      "miktar": number,
      "birim": "string",
      "birim_fiyat": number,
      "kdv_orani": number,
      "kdv_tutari": number,
      "tutar": number
    }
  ]
}`;

export async function parseGelenFaturaWithAI(pdfText: string): Promise<any> {
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (!groqApiKey) {
    throw new Error('GROQ_API_KEY bulunamadı');
  }

  const userPrompt = GELEN_FATURA_USER_PROMPT.replace('{PDF_TEXT}', pdfText);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: GELEN_FATURA_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API hatası: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  const cleanContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  
  return JSON.parse(cleanContent);
}
```

### C) ZIP parse fonksiyonuna AI entegre et:

ZIP'teki her PDF için:
1. pdfjs-dist ile text çıkar
2. `parseGelenFaturaWithAI(text)` çağır
3. Sonucu mevcut response formatına dönüştür

```typescript
// ZIP parse loop'unda, her PDF dosyası için:
const pdfText = await extractTextFromPdf(pdfBuffer); // mevcut pdfjs-dist fonksiyonu

try {
  const aiResult = await parseGelenFaturaWithAI(pdfText);
  
  invoice.tedarikci_adi = aiResult.tedarikci_adi;
  invoice.tedarikci_vkn = aiResult.tedarikci_vkn;
  invoice.fatura_no = aiResult.fatura_no;
  invoice.fatura_tarihi = aiResult.fatura_tarihi;
  invoice.vade_tarihi = aiResult.vade_tarihi;
  invoice.tutar = aiResult.toplam_tutar;
  invoice.kategori = aiResult.kategori;          // YENİ: otomatik kategori
  invoice.kalemler = aiResult.kalemler;
} catch (aiError) {
  console.error('AI parse hatası, fallback:', aiError);
  // Mevcut regex parse'ı fallback olarak kullan
  // ...
}
```

### ⚠️ Rate Limiting
ZIP'te 30+ fatura olabilir. Groq API rate limit'e takılmamak için:
```typescript
// Her PDF arasında kısa bekleme
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

for (const pdfFile of pdfFiles) {
  // ... parse işlemi ...
  await delay(200); // 200ms bekleme (saniyede max 5 istek)
}
```

---

## 2️⃣ Duplicate Tespiti Düzelt

### Sorun
Daha önce yüklenmiş faturalar "Eklenecek" gösteriyor, "Duplicate" göstermiyor. 60+ faturadan sadece 9'u duplicate olarak algılanıyor.

### Kök Neden
Fatura eşleştirme muhtemelen sadece `fatura_no` ile yapılıyor. Ama gelen faturaların `fatura_no` formatı farklı olabilir (başında/sonunda boşluk, farklı prefix).

### Yapılacak

```bash
grep -rn "duplicate\|Duplicate\|eşleştir\|eslestir\|fatura_no" src/app/(dashboard)/cari-hesap/ --include="*.tsx" --include="*.ts" | head -30
```

Duplicate kontrolünü şöyle güçlendir:

```typescript
async function checkDuplicate(invoice: any, supabase: any): Promise<'duplicate' | 'mevcut' | 'yeni'> {
  const faturaNo = (invoice.fatura_no || '').trim();
  
  if (!faturaNo) return 'yeni';
  
  // 1. Fatura no ile kontrol (gelen_faturalar tablosunda)
  const { data: existingByNo } = await supabase
    .from('gelen_faturalar')
    .select('id')
    .eq('fatura_no', faturaNo)
    .limit(1);
  
  if (existingByNo && existingByNo.length > 0) {
    return 'duplicate';
  }
  
  // 2. Fatura no benzer eşleştirme (başında/sonunda boşluk, tire farkı)
  const { data: similarByNo } = await supabase
    .from('gelen_faturalar')
    .select('id')
    .ilike('fatura_no', faturaNo.replace(/\s/g, '%'))
    .limit(1);
  
  if (similarByNo && similarByNo.length > 0) {
    return 'duplicate';
  }
  
  // 3. Tedarikçi VKN + tutar + tarih kombinasyonu ile kontrol
  if (invoice.tedarikci_vkn && invoice.tutar && invoice.fatura_tarihi) {
    const { data: existingByCombo } = await supabase
      .from('gelen_faturalar')
      .select('id')
      .eq('tedarikci_vkn', invoice.tedarikci_vkn)
      .eq('tutar', invoice.tutar)
      .eq('fatura_tarihi', invoice.fatura_tarihi)
      .limit(1);
    
    if (existingByCombo && existingByCombo.length > 0) {
      return 'duplicate';
    }
  }
  
  // 4. Tedarikçi VKN ile customers/tedarikçiler tablosunda kontrol
  if (invoice.tedarikci_vkn) {
    const { data: existingTedarikci } = await supabase
      .from('customers')
      .select('id')
      .or(`vergi_no.eq.${invoice.tedarikci_vkn},tc_kimlik.eq.${invoice.tedarikci_vkn}`)
      .limit(1);
    
    if (existingTedarikci && existingTedarikci.length > 0) {
      return 'mevcut'; // Tedarikçi mevcut, fatura yeni
    }
  }
  
  return 'yeni';
}
```

**ÖNEMLİ:** Duplicate kontrolü **gelen_faturalar** tablosuna bakmalı (faturalar değil). Tablonun adını kontrol et:
```bash
grep -rn "gelen_faturalar\|gelenFaturalar" src/ --include="*.ts" --include="*.tsx" | head -10
```

---

## 3️⃣ Otomatik Kategori Atama

### Sorun
29 faturada kategori atanmamış ("Manuel Kategori" gösteriyor).

### Yapılacak
AI parse zaten `kategori` alanı döndürecek (Adım 1'de). Ama AI kullanılmayan fallback durumları için de basit kural bazlı kategori önerisi ekle:

```typescript
function suggestCategory(tedarikciAdi: string, faturaText: string): string {
  const text = `${tedarikciAdi} ${faturaText}`.toUpperCase();
  
  const rules: Array<{keywords: string[]; category: string}> = [
    { keywords: ['TTNET', 'TURKNET', 'TURK TELEKOM', 'VODAFONE', 'TURKCELL', 'INTERNET', 'İNTERNET', 'TELEKOMÜNİKASYON'], category: 'Internet / İletişim' },
    { keywords: ['ELEKTRİK', 'ELEKTRIK', 'EDAŞ', 'EPAŞ', 'ENERJİ', 'ENERJI', 'AYEDAŞ', 'BAŞKENT ELEKTRIK'], category: 'Elektrik' },
    { keywords: ['DOĞALGAZ', 'DOGALGAZ', 'GAZ DAĞITIM', 'AKSA', 'İGDAŞ', 'IGDAS', 'ERZINGAZ'], category: 'Doğalgaz' },
    { keywords: ['SU', 'ASKİ', 'İSKİ', 'ASKI', 'ISKI', 'SU KANALIZASYON'], category: 'Su' },
    { keywords: ['KİRA', 'KIRA', 'GAYRİMENKUL'], category: 'Kira' },
    { keywords: ['OPET', 'SHELL', 'BP ', 'TOTAL', 'PETROLİS', 'AKARYAKIT', 'BENZİN', 'MOTORİN', 'PETROL'], category: 'Yakıt / Akaryakıt' },
    { keywords: ['BİM', 'BIM', 'A101', 'ŞOK', 'SOK', 'MİGROS', 'MIGROS', 'MARKET', 'GIDA'], category: 'Market / Gıda' },
    { keywords: ['KARGO', 'NAKLİYE', 'YURTİÇİ', 'ARAS', 'MNG', 'PTT', 'SÜRAT', 'UPS', 'FEDEX'], category: 'Kargo / Nakliye' },
    { keywords: ['ÇELİK', 'BORU', 'VANA', 'MANOMETRE', 'TOZ', 'KÖPÜK', 'KİMYASAL', 'HAMMADDE'], category: 'Hammadde' },
    { keywords: ['ARAÇ', 'TAMİR', 'LASTİK', 'SİGORTA', 'MUAYENE', 'OTOPARK', 'GARAJ', 'OTO '], category: 'Araç Gideri' },
    { keywords: ['VERGİ', 'SGK', 'BAĞKUR', 'NOTER', 'HARÇ', 'RESMİ'], category: 'Vergi / Resmi' },
    { keywords: ['KIRTASİYE', 'TONER', 'YAZICI', 'KAĞIT', 'OFİS'], category: 'Ofis / Kırtasiye' },
  ];
  
  for (const rule of rules) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return rule.category;
    }
  }
  
  return 'Genel Gider';
}
```

Bu fonksiyonu iki yerde kullan:
1. AI parse başarılı olduğunda → AI'ın önerdiği kategoriyi kullan
2. AI parse başarısız olduğunda → `suggestCategory()` ile fallback öneri

Frontend'de kategori dropdown'unda AI/kural önerisini varsayılan seçili getir ama kullanıcı değiştirebilsin.

---

## ⚠️ Teknik Notlar

- Groq API: `llama-3.3-70b-versatile`, temperature: 0
- GROQ_API_KEY mevcut (.env.local + Vercel)
- ZIP parse: `adm-zip` mevcut
- PDF text: `pdfjs-dist` mevcut
- Gelen fatura tablosu: `gelen_faturalar`
- Giden fatura tablosu: `faturalar`
- Rate limiting: ZIP'te 30+ PDF olabilir, her parse arasında 200ms bekle
- Köklü VKN: `5830028164` — gelen faturada ALICI, tedarikçi DEĞİL

## 🧪 Test

`GelenFatura_Pdf_20260415210856_.zip` dosyasını yükle.

Beklenen:
- Parse Hatası: 0 veya çok az (AI ile parse edilmeli)
- Manuel Kategori: 0 veya çok az (otomatik önerilmeli)
- Duplicate: Daha önce yüklenmiş faturalar "Duplicate" olarak görünmeli
- Tarih/tutar: Tüm faturalarda dolu olmalı

## 🔍 Kontrol Noktaları
- [ ] Parse Hatası sayısı azaldı mı? (4 → 0-1)
- [ ] Manuel Kategori sayısı azaldı mı? (29 → 0-5)
- [ ] Duplicate sayısı arttı mı? (daha önce yüklenmiş faturalar)
- [ ] Tedarikçi adları doğru mu?
- [ ] Fatura tarihleri dolu mu?
- [ ] Tutarlar doğru mu?
- [ ] Kategori önerileri mantıklı mı? (TTNET → Internet/İletişim, BİM → Market/Gıda)
- [ ] Kullanıcı kategoriyi değiştirebiliyor mu?
- [ ] Rate limit'e takılmadan tüm faturalar parse ediliyor mu?