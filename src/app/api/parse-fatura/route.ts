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
      "unit_price": birim fiyat (KDV hariç, sayısal),
      "kdv_rate": bu kalemin KDV oranı (sayısal)
    }
  ]
}

ÖNEMLİ KURALLAR:
- Tüm fiyatlar KDV HARİÇ (net) olmalı.
- Eğer toplam tutar KDV dahilse, KDV'yi düşerek net tutarı hesapla.
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
      const err = await response.json()
      return NextResponse.json({ error: err.error?.message ?? 'AI hatası' }, { status: 500 })
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
