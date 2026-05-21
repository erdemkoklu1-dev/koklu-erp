// Groq AI destekli fiyat teklifi parse modülü
// pdfjs-dist ile çıkarılan ham PDF text → Groq → ParsedTeklif formatı

export interface TeklifKalem {
  sira_no: number
  aciklama: string
  miktar: number
  birim: string
  birim_fiyat: number
  toplam: number
}

export interface TeklifGroqResult {
  tedarikci: string
  tarih: string
  ref_no: string
  para_birimi: string
  kalemler: TeklifKalem[]
  ara_toplam: number
  iskonto_toplam: number
  genel_toplam: number
}

const SYSTEM_PROMPT = `Sen bir fiyat teklifi PDF metnini analiz eden yardımcısın.

İki tür teklif olabilir:
1. Köklü Yangın'ın kendi teklifi: "SAYIN" ile müşteri adı gelir, sütunlar "S.NO ADET MALIN CİNSİ B. FİYATI TOPLAM" şeklindedir. Bu durumda tedarikci boş bırak.
2. Tedarikçi teklifi: Köklü Yangın'a gelen teklif. tedarikci = teklifi gönderen firma.

KURALLAR:
1. Kalem tablosundaki HER ürün/hizmet satırını ayrı bir kalem olarak çıkar.
2. "MALIN CİNSİ" veya "Açıklama" veya "Ürün" sütunundaki metni aciklama olarak kullan.
3. "ADET" veya "Miktar" veya "Qty" sütununu miktar olarak kullan.
4. "B. FİYATI" veya "Birim Fiyat" veya "Unit Price" → birim_fiyat.
5. "TOPLAM" veya "Tutar" veya "Amount" → toplam.
6. Tutarları SAYI olarak dön. Türkçe format: 8.500,00 → 8500.00, nokta ondalık ayırıcı.
7. Para birimi: TL/TRY/₺ → "TRY", USD/$ → "USD", EUR/€ → "EUR".
8. KDV Hariç Toplam, Genel Toplam vb. ÖZET SATIRLARINI kalem olarak EKLEME.
9. Bölüm başlıklarını (A. Mekanik Ekipmanlar vb.) kalem olarak EKLEME.
10. Tarihler YYYY-MM-DD formatında. DD.MM.YYYY → dönüştür.
11. Teklif No: "TK-", "TF-", "FT-" ile başlayan numaralar ref_no olarak al.
12. Bilinmiyorsa: string → "", number → 0.

SADECE JSON dön, başka hiçbir şey yazma.`

const USER_PROMPT = `Bu fiyat teklifi PDF'inden çıkarılmış ham metin:

---
{PDF_TEXT}
---

Metinden teklif bilgilerini çıkar ve SADECE şu JSON formatında dön:

{
  "tedarikci": "tedarikçi adı veya boş string",
  "tarih": "YYYY-MM-DD veya boş",
  "ref_no": "teklif no veya boş",
  "para_birimi": "TRY",
  "kalemler": [
    {
      "sira_no": 1,
      "aciklama": "ürün/hizmet tam açıklaması",
      "miktar": 1,
      "birim": "Adet",
      "birim_fiyat": 0.0,
      "toplam": 0.0
    }
  ],
  "ara_toplam": 0.0,
  "iskonto_toplam": 0,
  "genel_toplam": 0.0
}`

async function callGroqApi(body: object): Promise<{ choices?: Array<{ message?: { content?: string } }> }> {
  const groqApiKey = (process.env.GROQ_API_KEY ?? '').trim()
  if (!groqApiKey || groqApiKey.length < 10) {
    throw new Error('GROQ_API_KEY geçersiz veya bulunamadı')
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[teklif-groq] API HTTP hatası:', response.status, errorText.slice(0, 300))
    throw new Error(`Groq API hatası: ${response.status} - ${errorText.slice(0, 100)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const rawText = await response.text()
    console.error('[teklif-groq] JSON dışı yanıt:', rawText.slice(0, 200))
    throw new Error('Groq API geçersiz yanıt döndü (JSON değil)')
  }

  return response.json()
}

export async function parseTeklifWithGroq(pdfText: string): Promise<TeklifGroqResult> {
  const truncated = pdfText.length > 7000 ? pdfText.slice(0, 7000) + '\n...(metin kısaltıldı)' : pdfText
  const userPrompt = USER_PROMPT.replace('{PDF_TEXT}', truncated)

  const data = await callGroqApi({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  })

  const content = data.choices?.[0]?.message?.content ?? ''

  let parsed: TeklifGroqResult
  try {
    const clean = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    parsed = JSON.parse(clean) as TeklifGroqResult
  } catch {
    console.error('[teklif-groq] JSON parse hatası. AI yanıtı:', content.slice(0, 400))
    throw new Error('Groq yanıtı JSON olarak çözümlenemedi')
  }

  if (!Array.isArray(parsed.kalemler) || parsed.kalemler.length === 0) {
    throw new Error('Groq: hiç kalem çıkarılamadı')
  }

  // Sayısal alan temizliği
  parsed.kalemler = parsed.kalemler.map((k, i) => ({
    sira_no:     Number(k.sira_no) || i + 1,
    aciklama:    String(k.aciklama || '').trim(),
    miktar:      Number(k.miktar) || 1,
    birim:       String(k.birim || 'Adet'),
    birim_fiyat: Number(k.birim_fiyat) || 0,
    toplam:      Number(k.toplam) || Math.round((Number(k.miktar) || 1) * (Number(k.birim_fiyat) || 0) * 100) / 100,
  })).filter(k => k.aciklama)

  const araToplam = parsed.kalemler.reduce((s, k) => s + k.toplam, 0)
  parsed.ara_toplam    = Number(parsed.ara_toplam) || araToplam
  parsed.genel_toplam  = Number(parsed.genel_toplam) || araToplam
  parsed.iskonto_toplam = 0
  parsed.tedarikci     = String(parsed.tedarikci || '')
  parsed.tarih         = String(parsed.tarih || '')
  parsed.ref_no        = String(parsed.ref_no || '')
  parsed.para_birimi   = ['TRY', 'EUR', 'USD'].includes(parsed.para_birimi) ? parsed.para_birimi : 'TRY'

  console.log('[teklif-groq] başarılı:', {
    tedarikci: parsed.tedarikci,
    ref_no: parsed.ref_no,
    kalem_sayisi: parsed.kalemler.length,
    toplam: parsed.genel_toplam,
  })

  return parsed
}
