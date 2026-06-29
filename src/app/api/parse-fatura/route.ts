import { NextRequest, NextResponse } from 'next/server'

const PROMPT = `Bu bir fatura veya satış belgesidir. Faturadan aşağıdaki bilgileri çıkar ve SADECE geçerli bir JSON döndür, başka hiçbir şey yazma:

{
  "customer": {
    "full_name": "müşteri adı soyadı veya firma adı",
    "tax_number": "vergi no veya TC kimlik no (sadece rakamlar, yoksa null)",
    "phone": "telefon numarası veya null",
    "address": "adres veya null"
  },
  "supplier": {
    "name": "satıcı/tedarikçi firma adı veya null",
    "tax_no": "satıcının vergi numarası veya null"
  },
  "invoice": {
    "invoice_date": "fatura tarihi YYYY-MM-DD formatında veya null",
    "due_date": "vade tarihi YYYY-MM-DD formatında veya null",
    "kdv_rate": KDV oranı (sayısal, örn: 20, 10, 0),
    "stopaj_rate": stopaj oranı (sayısal, yoksa 0)
  },
  "items": [
    {
      "description": "ürün veya hizmet açıklaması",
      "quantity": miktar (sayısal),
      "unit": "adet veya kg veya m veya saat veya set veya paket",
      "unit_price": PDF'deki "Birim Fiyat" sütunundaki değer — ZATEN KDV HARİÇ, olduğu gibi al, bölme yapma (sayısal),
      "kdv_rate": bu kalemin KDV oranı (sayısal)
    }
  ]
}

ÖNEMLİ KURALLAR:
- KRİTİK KDV KURALI: e-Fatura/e-Arşiv PDF'lerinde kalem tablosundaki "Birim Fiyat" sütunu DAİMA KDV HARİÇ'tir. Bu değeri OLDUĞU GİBİ al; ASLA 1.20'ye (veya KDV oranına) BÖLME, KDV'yi tekrar DÜŞME.
- unit_price = PDF'deki "Birim Fiyat" sütunundaki değer (zaten KDV hariç).
- Satır toplamı = quantity × unit_price (KDV hariç) ve PDF'deki "Mal Hizmet Tutarı" sütunuyla eşleşmelidir.
- ÖRNEK: "Birim Fiyat" sütununda "333,34 TL" yazıyorsa unit_price = 333.34 olmalı (277.78 DEĞİL — 1.20'ye bölme!).
- Miktar (quantity) her zaman pozitif sayı olmalı.
- Birim fiyat (unit_price) her zaman pozitif sayı olmalı.
- Eğer bir bilgi faturada yoksa null kullan.
- items listesi boşsa boş dizi döndür.`

export async function POST(req: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY .env.local dosyasında tanımlı değil.' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Desteklenmeyen dosya türü. PDF gönderilmeden önce resme dönüştürülmeli.' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[parse-fatura] Groq HTTP hatası:', response.status, errText.slice(0, 300))
      return NextResponse.json({ error: `AI hatası: ${response.status}` }, { status: 500 })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      const rawText = await response.text()
      console.error('[parse-fatura] JSON dışı yanıt:', rawText.slice(0, 200))
      return NextResponse.json({ error: 'AI geçersiz yanıt döndü' }, { status: 500 })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Faturadan veri okunamadı. Görüntü kalitesini artırıp tekrar deneyin.' }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('parse-fatura error:', err)
    return NextResponse.json({ error: err.message ?? 'Beklenmeyen hata' }, { status: 500 })
  }
}
