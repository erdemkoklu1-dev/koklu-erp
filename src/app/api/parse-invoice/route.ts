import { NextRequest, NextResponse } from 'next/server'

const PROMPT = `Bu bir yangın söndürme cihazları satış faturası veya belgesidir. Faturadan aşağıdaki bilgileri çıkar ve SADECE geçerli bir JSON döndür, başka hiçbir şey yazma:

{
  "customer": {
    "full_name": "müşteri adı soyadı veya firma adı",
    "type": "individual veya company (şirket/firma ise company, bireysel ise individual)",
    "tax_number": "vergi no veya TC kimlik no (sadece rakamlar)",
    "phone": "telefon numarası",
    "email": "e-posta adresi",
    "address": "adres"
  },
  "devices": [
    {
      "device_name": "cihaz adı/türü (örn: Kuru Kimyevi Tozlu Yangın Söndürücü)",
      "brand": "marka",
      "capacity": "kapasite (örn: 6 kg, 12 lt)",
      "quantity": 1,
      "serial_number": "seri numarası (varsa, birden fazla cihazda null kullan)",
      "invoice_date": "fatura tarihi YYYY-MM-DD formatında"
    }
  ]
}

ÖNEMLİ KURALLAR:
- Aynı cins, aynı marka ve aynı kapasitedeki cihazları TEK bir satırda topla, quantity alanını kullan (örn: 3 adet 6 kg KKT = quantity: 3).
- Farklı cins, farklı kapasite veya farklı marka cihazlar için AYRI satır oluştur.
- Eğer bir bilgi faturada yoksa veya okunamıyorsa, o alan için null kullan.
- Cihazlar listesi boşsa boş dizi döndür.`

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
      return NextResponse.json({ error: 'Desteklenmeyen dosya türü.' }, { status: 400 })
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
        max_tokens: 1024,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[parse-invoice] Groq HTTP hatası:', response.status, errText.slice(0, 300))
      return NextResponse.json({ error: `AI hatası: ${response.status}` }, { status: 500 })
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      const rawText = await response.text()
      console.error('[parse-invoice] JSON dışı yanıt:', rawText.slice(0, 200))
      return NextResponse.json({ error: 'AI geçersiz yanıt döndü' }, { status: 500 })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Faturadan veri okunamadı. Lütfen tekrar deneyin.' }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('parse-invoice error:', err)
    return NextResponse.json({ error: err.message ?? 'Beklenmeyen hata' }, { status: 500 })
  }
}
