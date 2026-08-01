import { NextRequest, NextResponse } from 'next/server'
import { acceptInvoiceFile } from '@/lib/invoice-parse/file-acceptance'
import { newRequestId } from '@/lib/api/response'

/**
 * Fatura görselinden **cihaz kaydı** çıkarımı (AI vision).
 *
 * Kapsam notu: bu route fatura tutarı/kalemi değil, müşteri + cihaz listesi
 * çıkarır; kanonik fatura parse hattının (`/api/v1/invoices/parse`) alternatifi
 * DEĞİLDİR. Sonuç doğrudan kaydedilmez, kullanıcı ön izleyip onaylar.
 *
 * Bu sprintte kapatılan açıklar:
 *   * Dosya türü istemcinin gönderdiği `file.type` MIME'ına güvenilerek
 *     belirleniyordu; artık **magic bytes** okunuyor.
 *   * Boyut sınırı yoktu.
 *   * AI çağrısında timeout yoktu.
 *   * Hata yolunda **ham exception mesajı** istemciye dönüyordu.
 */

/** Görsel parse için üst sınır. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** AI çağrısı için üst süre. */
const AI_TIMEOUT_MS = 90_000

const PROMPT =`Bu bir yangın söndürme cihazları satış faturası veya belgesidir. Faturadan aşağıdaki bilgileri çıkar ve SADECE geçerli bir JSON döndür, başka hiçbir şey yazma:

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
  const requestId = newRequestId()

  if (!process.env.GROQ_API_KEY) {
    // Secret değeri değil, yalnızca yapılandırma eksikliği bildirilir.
    return NextResponse.json({ error: 'Fatura okuma servisi yapılandırılmamış.' }, { status: 503 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Tür istemcinin `file.type` değerinden DEĞİL, içerikten belirlenir.
    const accepted = acceptInvoiceFile(bytes, {
      maxBytes: MAX_IMAGE_BYTES,
      allow: ['png', 'jpeg'],
    })
    if (!accepted.ok) {
      console.error(`[parse-invoice] requestId=${requestId} code=${accepted.error.code}`)
      return NextResponse.json({ error: accepted.error.message }, { status: 400 })
    }

    const mimeType = accepted.value.kind === 'png' ? 'image/png' : 'image/jpeg'
    const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`

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
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    })

    if (!response.ok) {
      // Yanıt gövdesi loglanmaz: fatura içeriği/PII taşıyabilir.
      console.error(`[parse-invoice] requestId=${requestId} code=AI_HTTP_${response.status}`)
      return NextResponse.json(
        { error: 'Fatura okuma servisi geçici olarak yanıt vermiyor. Lütfen tekrar deneyin.' },
        { status: 502 },
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      console.error(`[parse-invoice] requestId=${requestId} code=AI_NON_JSON`)
      return NextResponse.json(
        { error: 'Fatura okuma servisi beklenmeyen bir yanıt döndü.' },
        { status: 502 },
      )
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Faturadan veri okunamadı. Lütfen tekrar deneyin.' }, { status: 422 })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      console.error(`[parse-invoice] requestId=${requestId} code=PARSE_MALFORMED_JSON`)
      return NextResponse.json(
        { error: 'Fatura verisi çözümlenemedi. Lütfen tekrar deneyin.' },
        { status: 422 },
      )
    }

    // Sonuç doğrudan kaydedilmez; kullanıcı ön izleyip onaylar.
    return NextResponse.json(parsed)
  } catch (err) {
    // Ham exception mesajı ve stack trace istemciye DÖNMEZ.
    const timedOut = (err as { name?: string } | null)?.name === 'TimeoutError'
    console.error(
      `[parse-invoice] requestId=${requestId} code=${timedOut ? 'AI_TIMEOUT' : 'UNEXPECTED'}`,
      err instanceof Error ? err.message : 'bilinmeyen',
    )
    return NextResponse.json(
      {
        error: timedOut
          ? 'Fatura okuma zaman aşımına uğradı. Lütfen tekrar deneyin.'
          : 'Beklenmeyen bir hata oluştu.',
      },
      { status: timedOut ? 504 : 500 },
    )
  }
}
