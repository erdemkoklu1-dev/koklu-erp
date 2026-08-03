import { NextRequest } from 'next/server'
import AdmZip from 'adm-zip'
import { apiFailure, apiSuccess, logApiError, newRequestId } from '@/lib/api/response'
import {
  DEFAULT_AUTOSAVE_THRESHOLD,
  PARSE_ERROR,
  parseInvoiceFile,
  type ArchiveReader,
  type PipelineDeps,
} from '@/lib/invoice-parse/pipeline'
import { DEFAULT_MAX_BYTES } from '@/lib/invoice-parse/file-acceptance'
import { parsePdfForPipeline } from '@/lib/invoice-parse/pdf-adapter'
import { retryableForParseError, statusForParseError } from '@/lib/invoice-parse/error-mapping'
import { previewToFormFill } from '@/lib/invoice-parse/preview-to-form'

/**
 * Eski fatura okuma endpoint'i — artık **kanonik hatta ince delegate**.
 *
 * ── NEDEN DEĞİŞTİ ───────────────────────────────────────────────────────────
 * Bu route yalnızca Groq vision AI'ına bağlıydı: dosya türü ne olursa olsun
 * PNG/JPEG'e indirgeniyor ve tek bir modele gönderiliyordu. Sağlayıcı o modeli
 * kaldırınca (`model_not_found`) route her istekte 502 `AI_HTTP_ERROR` ve
 * "Fatura okuma servisi geçici olarak yanıt vermiyor" mesajı döndürdü; fatura
 * okuma akışı tamamen bloke oldu. Deterministik UBL-TR XML ve metin katmanlı
 * PDF hiç denenmiyordu.
 *
 * Artık bütün dosyalar `parseInvoiceFile` öncelik sırasından geçer
 * (XML → ZIP içindeki XML → PDF metin katmanı) ve **AI hiç çağrılmaz**. Dış
 * sözleşme (`customer` / `supplier` / `invoice` / `items`) korunur ki bu
 * endpoint'i kullanan eski istemciler kırılmasın.
 *
 * Yeni istemciler `/api/v1/invoices/parse` kullanmalıdır; o endpoint güven
 * skoru, kaynak basamağı ve uyarıları da döndürür.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PARSE_TIMEOUT_MS = 30_000

function openArchive(bytes: Uint8Array): ArchiveReader | null {
  let zip: AdmZip
  let rawEntries: ReturnType<AdmZip['getEntries']>
  try {
    zip = new AdmZip(Buffer.from(bytes))
    rawEntries = zip.getEntries()
  } catch {
    return null
  }

  return {
    // Boyutlar entry header'ından okunur: sınır kontrolü açma YAPILMADAN yapılır.
    entries: rawEntries.map(entry => ({
      name: entry.entryName,
      size: Number(entry.header.size ?? 0),
      compressedSize: Number(entry.header.compressedSize ?? 0),
      isDirectory: entry.isDirectory,
    })),
    read(name) {
      const entry = rawEntries.find(candidate => candidate.entryName === name)
      if (!entry) return null
      try {
        return new Uint8Array(entry.getData())
      } catch {
        return null
      }
    },
  }
}

// OCR bağlanmadı: taranmış belge açık `PARSE_OCR_UNAVAILABLE` alır, sessizce
// boş sonuç dönmez.
const deps: PipelineDeps = {
  openArchive,
  parsePdf: (bytes, filename) => parsePdfForPipeline(bytes, filename, 'satis'),
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId()

  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return apiFailure('FILE_MISSING', 'Dosya bulunamadı.', requestId, 400, { field: 'file' })
    }

    if (file.size > DEFAULT_MAX_BYTES) {
      return apiFailure(
        PARSE_ERROR.TOO_LARGE,
        `Dosya çok büyük. En fazla ${Math.floor(DEFAULT_MAX_BYTES / (1024 * 1024))} MB yükleyebilirsiniz.`,
        requestId,
        413,
      )
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(PARSE_ERROR.TIMEOUT)), PARSE_TIMEOUT_MS).unref?.()
    })

    const outcome = await Promise.race([
      parseInvoiceFile(bytes, deps, {
        filename: file.name,
        maxBytes: DEFAULT_MAX_BYTES,
        autoSaveThreshold: DEFAULT_AUTOSAVE_THRESHOLD,
      }),
      timeout,
    ])

    if (!outcome.ok) {
      logApiError('parse-fatura', requestId, outcome.error.code)
      return apiFailure(
        outcome.error.code,
        outcome.error.message,
        requestId,
        statusForParseError(outcome.error.code),
        { retryable: retryableForParseError(outcome.error.code) },
      )
    }

    const fill = previewToFormFill(outcome.value)

    // Eski dış sözleşme korunuyor; parse sonucu doğrudan kaydedilmez, kullanıcı
    // ön izleyip onaylar.
    return apiSuccess(
      {
        customer: {
          full_name: fill.customer.name,
          tax_number: fill.customer.taxNumber,
          phone: null,
          email: null,
          address: fill.customer.address,
        },
        supplier: {
          name: fill.supplier.name,
          tax_no: fill.supplier.taxNumber,
          address: fill.supplier.address,
        },
        invoice: {
          invoice_number: fill.invoiceNumber,
          invoice_date: fill.invoiceDate,
          due_date: fill.dueDate,
          kdv_rate: fill.kdvRate,
          stopaj_rate: 0,
        },
        items: fill.lines.map(line => ({
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          kdv_rate: line.kdvRate,
        })),
      },
      requestId,
    )
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === PARSE_ERROR.TIMEOUT
    logApiError('parse-fatura', requestId, isTimeout ? PARSE_ERROR.TIMEOUT : 'UNEXPECTED', err)
    return isTimeout
      ? apiFailure(PARSE_ERROR.TIMEOUT, 'Fatura ayrıştırma zaman aşımına uğradı.', requestId, 504)
      : apiFailure('UNEXPECTED', 'Beklenmeyen bir hata oluştu.', requestId, 500, { retryable: true })
  }
}

/** Yanlış metot da JSON zarfı döner; HTML hata sayfası istemciye ulaşmaz. */
export async function GET() {
  return apiFailure(
    'METHOD_NOT_ALLOWED',
    'Bu endpoint yalnızca POST kabul eder.',
    newRequestId(),
    405,
  )
}
