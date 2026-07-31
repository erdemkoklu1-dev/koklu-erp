import { NextRequest } from 'next/server'
import { apiFailure, apiSuccess, logApiError, newRequestId } from '@/lib/api/response'
import { acceptInvoiceFile } from '@/lib/invoice-parse/file-acceptance'

/** Görsel parse için üst sınır; büyük dosyalar belleğe alınmadan reddedilir. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** AI çağrısı için üst süre; aşılırsa kontrollü timeout hatası döner. */
const AI_TIMEOUT_MS = 90_000

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
  const requestId = newRequestId()

  if (!process.env.GROQ_API_KEY) {
    logApiError('parse-fatura', requestId, 'AI_NOT_CONFIGURED')
    return apiFailure(
      'AI_NOT_CONFIGURED',
      'Fatura okuma servisi yapılandırılmamış. Sistem yöneticisine bildirin.',
      requestId,
      503,
      { retryable: false },
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return apiFailure('FILE_MISSING', 'Dosya bulunamadı.', requestId, 400)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    // Tür yalnızca dosya adına/`file.type`'a bakılarak değil, içerikten belirlenir.
    const accepted = acceptInvoiceFile(bytes, {
      maxBytes: MAX_IMAGE_BYTES,
      allow: ['png', 'jpeg'],
    })
    if (!accepted.ok) {
      logApiError('parse-fatura', requestId, accepted.error.code)
      return apiFailure(accepted.error.code, accepted.error.message, requestId, 400)
    }

    const mimeType = accepted.value.kind === 'png' ? 'image/png' : 'image/jpeg'
    const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`

    let response: Response
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      })
    } catch (fetchError) {
      const timedOut = (fetchError as { name?: string } | null)?.name === 'TimeoutError'
      logApiError('parse-fatura', requestId, timedOut ? 'AI_TIMEOUT' : 'AI_UNREACHABLE')
      return apiFailure(
        timedOut ? 'AI_TIMEOUT' : 'AI_UNREACHABLE',
        timedOut
          ? 'Fatura okuma zaman aşımına uğradı. Lütfen tekrar deneyin.'
          : 'Fatura okuma servisine ulaşılamadı. Lütfen tekrar deneyin.',
        requestId,
        504,
        { retryable: true },
      )
    }

    if (!response.ok) {
      // Yanıt gövdesi loglanmaz: fatura içeriği/PII taşıyabilir.
      logApiError('parse-fatura', requestId, `AI_HTTP_${response.status}`)
      return apiFailure(
        'AI_HTTP_ERROR',
        'Fatura okuma servisi geçici olarak yanıt vermiyor. Lütfen tekrar deneyin.',
        requestId,
        502,
        { retryable: true },
      )
    }

    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      logApiError('parse-fatura', requestId, 'AI_NON_JSON')
      return apiFailure(
        'AI_NON_JSON',
        'Fatura okuma servisi beklenmeyen bir yanıt döndü.',
        requestId,
        502,
        { retryable: true },
      )
    }

    const aiBody = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = aiBody.choices?.[0]?.message?.content ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      logApiError('parse-fatura', requestId, 'PARSE_NO_JSON')
      return apiFailure(
        'PARSE_NO_JSON',
        'Faturadan veri okunamadı. Görüntü kalitesini artırıp tekrar deneyin.',
        requestId,
        422,
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      logApiError('parse-fatura', requestId, 'PARSE_MALFORMED_JSON')
      return apiFailure(
        'PARSE_MALFORMED_JSON',
        'Fatura verisi çözümlenemedi. Lütfen tekrar deneyin.',
        requestId,
        422,
        { retryable: true },
      )
    }

    // Parse sonucu doğrudan kaydedilmez; kullanıcı ön izleyip onaylar.
    return apiSuccess(parsed, requestId)
  } catch (err) {
    logApiError('parse-fatura', requestId, 'UNEXPECTED', err)
    return apiFailure('UNEXPECTED', 'Beklenmeyen bir hata oluştu.', requestId, 500, { retryable: true })
  }
}
