/**
 * Fatura okuma **route sınırı** contract testleri (GOREV.md §5.1).
 *
 * Bu testler servis fonksiyonunu mock'lamaz: gerçek `multipart/form-data`
 * `Request` nesnesi kurar ve **gerçek route handler'ını** çağırır. Yanıt
 * `Response` olarak okunur; status, `content-type` ve gövde şekli doğrulanır.
 *
 * `@/…` alias'ı ve uzantısız import'lar `tests/helpers/alias-hooks.mjs`
 * tarafından çözülür (`npm test` bunu `--import` ile yükler).
 *
 * ── NEDEN `/api/parse-fatura` ÜZERİNDEN ─────────────────────────────────────
 * `/api/v1/invoices/parse` ile **aynı** hattı (`parseInvoiceFile` + aynı deps)
 * çalıştırır ama oturum gerektirmez; Next `cookies()` çağrısı bir request scope
 * olmadan çalışamayacağı için kanonik route'un parse gövdesi bu süreçte
 * çalıştırılamaz. Kanonik route'un metot ve kimlik sözleşmesi ayrıca burada
 * doğrulanır; uçtan uca parse akışı ise gerçek tarayıcı smoke testiyle
 * kanıtlanır (GOREV.md §5.2).
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { NextRequest } from 'next/server'

import { syntheticUblInvoice, NON_INVOICE_XML } from './fixtures/ubl-synthetic.ts'
import {
  SYNTHETIC_PDF_LINES,
  syntheticPng,
  syntheticTextLayerPdf,
  syntheticZip,
} from './fixtures/synthetic-files.ts'

const { POST, GET } = await import('../src/app/api/parse-fatura/route.ts')
const canonical = await import('../src/app/api/v1/invoices/parse/route.ts')

const ENDPOINT = 'http://localhost/api/parse-fatura'

/** Gerçek multipart gövdesi kurar — route `req.formData()` ile ayrıştırır. */
function multipart(name: string, content: Buffer | string, type: string): NextRequest {
  const form = new FormData()
  form.append('file', new File([content as BlobPart], name, { type }))
  return new NextRequest(ENDPOINT, { method: 'POST', body: form })
}

interface Envelope {
  ok: boolean
  data?: unknown
  error?: { code: string; message: string; retryable: boolean }
  requestId: string
}

/** Yanıtı zarf olarak okur ve taşıma katmanı sözleşmesini doğrular. */
async function readEnvelope(response: Response): Promise<Envelope> {
  const contentType = response.headers.get('content-type') ?? ''
  assert.match(
    contentType,
    /application\/json/,
    `Yanıt JSON değil (${contentType}) — istemcide "Unexpected token '<'" sınıfı hataya yol açar`,
  )

  const raw = await response.text()
  assert.doesNotMatch(raw, /^\s*</, 'Gövde HTML ile başlıyor')

  const body = JSON.parse(raw) as Envelope
  assert.equal(typeof body.requestId, 'string')
  assert.notEqual(body.requestId.length, 0)
  return body
}

describe('Geçerli sentetik UBL-TR XML', () => {
  it('2xx ve ok:true döner; satıcı/tarih/tutar/KDV doğru okunur', async () => {
    const response = await POST(multipart('fatura.xml', syntheticUblInvoice(), 'text/xml'))
    assert.equal(response.status, 200)

    const body = await readEnvelope(response)
    assert.equal(body.ok, true)

    const data = body.data as {
      supplier: { name: string; tax_no: string }
      customer: { full_name: string }
      invoice: { invoice_number: string; invoice_date: string; kdv_rate: number }
      items: Array<{ description: string; quantity: number; unit_price: number; kdv_rate: number }>
    }

    assert.equal(data.invoice.invoice_number, 'KKL2026000000123')
    assert.equal(data.invoice.invoice_date, '2026-03-14')
    assert.equal(data.supplier.name, 'Örnek Güvenlik Ekipmanları Ltd. Şti.')
    assert.equal(data.supplier.tax_no, '1000000411')
    assert.equal(data.customer.full_name, 'Deneme Alıcı Anonim Şirketi')

    assert.equal(data.items.length, 1)
    assert.equal(data.items[0].quantity, 2)
    // Regresyon: "1200 → 1,20" ondalık ayırıcı hatası.
    assert.equal(data.items[0].unit_price, 600)
    assert.equal(data.items[0].kdv_rate, 20)
    assert.equal(data.invoice.kdv_rate, 20)
  })

  it('Türkçe karakterler bozulmadan taşınır', async () => {
    const response = await POST(multipart('fatura.xml', syntheticUblInvoice(), 'text/xml'))
    const body = await readEnvelope(response)
    const data = body.data as { items: Array<{ description: string }> }
    assert.equal(data.items[0].description, 'Yangın Söndürme Tüpü 6 kg — dolum ücreti')
  })
})

describe('ZIP içinde geçerli sentetik UBL XML', () => {
  it('2xx ve ok:true döner (arşivden XML seçilir)', async () => {
    const zip = syntheticZip([
      { name: 'KKL2026000000123.xml', content: Buffer.from(syntheticUblInvoice(), 'utf8') },
    ])

    const response = await POST(multipart('paket.zip', zip, 'application/zip'))
    assert.equal(response.status, 200)

    const body = await readEnvelope(response)
    assert.equal(body.ok, true)
    const data = body.data as { invoice: { invoice_number: string } }
    assert.equal(data.invoice.invoice_number, 'KKL2026000000123')
  })
})

describe('Metin katmanlı sentetik PDF', () => {
  it('2xx ve ok:true döner; fatura no ve tarih okunur', async () => {
    const pdf = syntheticTextLayerPdf(SYNTHETIC_PDF_LINES)

    const response = await POST(multipart('fatura.pdf', pdf, 'application/pdf'))
    const body = await readEnvelope(response)

    assert.equal(response.status, 200, `beklenmeyen hata: ${JSON.stringify(body.error)}`)
    assert.equal(body.ok, true)

    const data = body.data as { invoice: { invoice_number: string; invoice_date: string } }
    assert.equal(data.invoice.invoice_number, 'KKL2026000000123')
    assert.equal(data.invoice.invoice_date, '2026-03-14')
  })
})

describe('Taranmış PDF (metin katmanı yok) ve OCR yapılandırılmamış', () => {
  it('genel 503 değil, ayırt edilebilir kod döner', async () => {
    const response = await POST(multipart('taranmis.pdf', syntheticTextLayerPdf([]), 'application/pdf'))
    const body = await readEnvelope(response)

    assert.equal(body.ok, false)
    // Metin katmanı yokluğu ve OCR yokluğu ayrı kodlardır; ikisi de kabul.
    assert.ok(
      ['PARSE_PDF_NO_TEXT_LAYER', 'PARSE_OCR_UNAVAILABLE', 'PARSE_PDF_FIELDS_MISSING'].includes(
        body.error!.code,
      ),
      `beklenmeyen kod: ${body.error!.code}`,
    )
    assert.notEqual(body.error!.code, 'AI_HTTP_ERROR')
    assert.doesNotMatch(body.error!.message, /geçici olarak yanıt vermiyor/)
  })
})

describe('Görüntü dosyası (OCR yapılandırılmamış)', () => {
  it('OCR yokluğunu açıkça bildirir, AI hatasına dönüşmez', async () => {
    const response = await POST(multipart('fatura.png', syntheticPng(), 'image/png'))
    const body = await readEnvelope(response)

    assert.equal(body.ok, false)
    assert.equal(body.error!.code, 'PARSE_OCR_UNAVAILABLE')
    assert.equal(body.error!.retryable, false)
  })
})

describe('Bozuk / desteklenmeyen dosya', () => {
  it('desteklenmeyen tür 4xx ve typed JSON döner', async () => {
    const response = await POST(multipart('not.txt', 'bu bir fatura degildir', 'text/plain'))
    const body = await readEnvelope(response)

    assert.ok(response.status >= 400 && response.status < 500, `status=${response.status}`)
    assert.equal(body.ok, false)
    assert.equal(body.error!.code, 'FILE_UNSUPPORTED_TYPE')
  })

  it('boş dosya ayrı kodla reddedilir', async () => {
    const response = await POST(multipart('bos.xml', Buffer.alloc(0), 'text/xml'))
    const body = await readEnvelope(response)

    assert.equal(body.ok, false)
    assert.equal(body.error!.code, 'FILE_EMPTY')
  })

  it('fatura olmayan XML ayrı kodla reddedilir', async () => {
    const response = await POST(multipart('katalog.xml', NON_INVOICE_XML, 'text/xml'))
    const body = await readEnvelope(response)

    assert.equal(body.ok, false)
    assert.equal(body.error!.code, 'PARSE_UNSUPPORTED_XML')
  })

  it('uzantı ile içerik uyuşmazlığı reddedilir', async () => {
    // İçerik PDF, ad XML: istemcinin beyanına değil magic bytes'a bakılır.
    const response = await POST(
      multipart('sahte.xml', syntheticTextLayerPdf(SYNTHETIC_PDF_LINES), 'text/xml'),
    )
    const body = await readEnvelope(response)

    assert.equal(body.ok, false)
    assert.equal(body.error!.code, 'FILE_EXTENSION_MISMATCH')
  })

  it('dosya alanı yoksa 400 ve alan adı bildirilir', async () => {
    const form = new FormData()
    form.append('mode', 'satis')
    const response = await POST(new NextRequest(ENDPOINT, { method: 'POST', body: form }))
    const body = await readEnvelope(response)

    assert.equal(response.status, 400)
    assert.equal(body.error!.code, 'FILE_MISSING')
  })
})

describe('Yanlış HTTP metodu', () => {
  it('eski endpoint 405 ve JSON döner (HTML hata sayfası değil)', async () => {
    const response = await GET()
    const body = await readEnvelope(response)

    assert.equal(response.status, 405)
    assert.equal(body.error!.code, 'METHOD_NOT_ALLOWED')
  })

  it('kanonik endpoint 405 ve JSON döner', async () => {
    const response = await canonical.GET()
    const body = await readEnvelope(response)

    assert.equal(response.status, 405)
    assert.equal(body.error!.code, 'METHOD_NOT_ALLOWED')
  })
})

describe('Kanonik endpoint kimlik sözleşmesi', () => {
  it('oturum doğrulanamazsa 401 ve JSON zarfı döner, stack sızmaz', async () => {
    const form = new FormData()
    form.append('file', new File([syntheticUblInvoice()], 'fatura.xml', { type: 'text/xml' }))

    const response = await canonical.POST(
      new NextRequest('http://localhost/api/v1/invoices/parse', { method: 'POST', body: form }),
    )
    const body = await readEnvelope(response)

    assert.equal(response.status, 401)
    assert.equal(body.ok, false)
    assert.equal(body.error!.code, 'UNAUTHENTICATED')
    assert.doesNotMatch(JSON.stringify(body), /at \w+ \(|node:internal/, 'stack trace sızdı')
  })
})

describe('Hata sözleşmesi', () => {
  it('hiçbir hata yolunda ham exception veya stack trace dönmez', async () => {
    const cases: Array<[string, Buffer | string, string]> = [
      ['not.txt', 'x', 'text/plain'],
      ['bos.xml', Buffer.alloc(0), 'text/xml'],
      ['katalog.xml', NON_INVOICE_XML, 'text/xml'],
      ['taranmis.pdf', syntheticTextLayerPdf([]), 'application/pdf'],
      ['bozuk.zip', Buffer.from('PKbozuk', 'latin1'), 'application/zip'],
    ]

    for (const [name, content, type] of cases) {
      const response = await POST(multipart(name, content, type))
      const body = await readEnvelope(response)
      const serialized = JSON.stringify(body)

      assert.equal(body.ok, false, `${name} için hata bekleniyordu`)
      assert.doesNotMatch(serialized, /node:internal|\.ts:\d+|at async /, `${name}: stack sızdı`)
      assert.equal(typeof body.error!.retryable, 'boolean', `${name}: retryable eksik`)
    }
  })

  it('farklı hata sınıfları aynı koda çökmez', async () => {
    const codes = new Set<string>()
    const cases: Array<[string, Buffer | string, string]> = [
      ['not.txt', 'x', 'text/plain'],
      ['bos.xml', Buffer.alloc(0), 'text/xml'],
      ['katalog.xml', NON_INVOICE_XML, 'text/xml'],
      ['fatura.png', syntheticPng(), 'image/png'],
    ]

    for (const [name, content, type] of cases) {
      const body = await readEnvelope(await POST(multipart(name, content, type)))
      codes.add(body.error!.code)
    }

    assert.equal(codes.size, cases.length, `kodlar birbirine karıştı: ${[...codes].join(', ')}`)
  })
})
