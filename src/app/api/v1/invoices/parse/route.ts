import { NextRequest } from 'next/server'
import AdmZip from 'adm-zip'
import { createClient } from '@/lib/supabase/server'
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
import { parseInvoiceBatch } from '@/lib/invoice-parse/server-batch'

/**
 * Fatura yükleme/ayrıştırma için **tek kanonik, versiyonlu** endpoint.
 *
 * ── NEDEN SERVER ACTION DEĞİL ───────────────────────────────────────────────
 * Server Action kimlikleri build'ler arasında değişir; açık kalmış eski bir
 * sekme yeni deploy sonrası HTML 404 alır ve istemci tarafında bu
 * `Unexpected token '<'` olarak görünür. Versiyonlu route + ortak JSON zarfı
 * bu sınıfı yapısal olarak ortadan kaldırır: her yanıt (hata dâhil)
 * `application/json` ve `{ ok, data|error, requestId }` şeklindedir.
 *
 * ── SÖZLEŞME ────────────────────────────────────────────────────────────────
 *   POST /api/v1/invoices/parse
 *   Content-Type: multipart/form-data
 *   Alan: `file` (PDF | XML | ZIP | PNG | JPEG)
 *   Alan: `mode` (opsiyonel) — `satis` | `gelen` (varsayılan `gelen`)
 *         PDF metin katmanında karşı tarafın alıcı mı düzenleyen mi olduğunu
 *         belirler. UBL yolunda etkisizdir: XML tarafları zaten açıkça ayırır.
 *
 *   200 → { ok: true,  data: InvoicePreview, requestId }
 *   4xx → { ok: false, error: { code, message, retryable }, requestId }
 *
 * ── BU ENDPOINT KAYIT OLUŞTURMAZ ────────────────────────────────────────────
 * Yalnızca ön izleme döndürür. `data.autoSaveAllowed === false` ise istemci
 * kullanıcı onayı almadan kaydetmemelidir (GOREV.md §12).
 *
 * ── GÜVENLİK ────────────────────────────────────────────────────────────────
 *   * Oturum zorunlu.
 *   * Dosya türü uzantıdan değil **magic bytes**tan belirlenir.
 *   * ZIP: entry sayısı, açılmış toplam boyut, tek dosya boyutu, sıkıştırma
 *     oranı ve path traversal kontrolü yapılır; iç içe arşiv açılmaz.
 *   * XML: DTD/external entity **yapısal olarak** desteklenmez (XXE imkânsız).
 *   * Ham exception/stack trace istemciye DÖNMEZ; loga yalnızca kod yazılır.
 *   * Fatura içeriği (VKN, unvan, tutar) loglanmaz.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Ayrıştırma için üst sınır; aşılırsa istek iptal edilir. */
const PARSE_TIMEOUT_MS = 30_000

/** `adm-zip` yalnızca burada kullanılır; hat katmanı bağımlılıksız kalır. */
function openArchive(bytes: Uint8Array): ArchiveReader | null {
  let zip: AdmZip
  try {
    zip = new AdmZip(Buffer.from(bytes))
  } catch {
    return null
  }

  let rawEntries: ReturnType<AdmZip['getEntries']>
  try {
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

export type ParseMode = 'satis' | 'gelen'

function makeDeps(mode: ParseMode): PipelineDeps {
  return {
    openArchive,
    parsePdf: (bytes, filename) => parsePdfForPipeline(bytes, filename, mode),
    // OCR bilinçli olarak BAĞLANMADI: yapılandırılmamış bir OCR'ı "çalışıyor" gibi
    // göstermektense taranmış belgeler açık `PARSE_OCR_UNAVAILABLE` hatası alır.
    // Bağlandığında yalnızca burası değişir; hat sözleşmesi aynı kalır.
  }
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId()

  // ── Oturum ───────────────────────────────────────────────────────────────
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return apiFailure('UNAUTHENTICATED', 'Oturum gerekli.', requestId, 401)
    }
  } catch (error) {
    logApiError('invoices/parse', requestId, 'AUTH_FAILED', error)
    return apiFailure('UNAUTHENTICATED', 'Oturum doğrulanamadı.', requestId, 401)
  }

  // ── Gövde ────────────────────────────────────────────────────────────────
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return apiFailure(
      'INVALID_CONTENT_TYPE',
      'Dosya multipart/form-data olarak gönderilmelidir.',
      requestId,
      415,
    )
  }

  let file: File | null = null
  let mode: ParseMode = 'gelen'
  let batch = false
  try {
    const form = await req.formData()
    const candidate = form.get('file')
    file = candidate instanceof File ? candidate : null
    // Bilinmeyen değer sessizce kabul edilmez; varsayılana düşer.
    mode = form.get('mode') === 'satis' ? 'satis' : 'gelen'
    batch = form.get('batch') === 'true'
  } catch (error) {
    logApiError('invoices/parse', requestId, 'FORM_READ_FAILED', error)
    return apiFailure('INVALID_PAYLOAD', 'Yüklenen dosya okunamadı.', requestId, 400)
  }

  if (!file) {
    return apiFailure('INVALID_PAYLOAD', 'Dosya alanı (`file`) zorunludur.', requestId, 400, {
      field: 'file',
    })
  }

  // Bellek koruması: sınır aşılıyorsa içerik hiç okunmaz.
  if (file.size > DEFAULT_MAX_BYTES) {
    return apiFailure(
      PARSE_ERROR.TOO_LARGE,
      `Dosya çok büyük. En fazla ${Math.floor(DEFAULT_MAX_BYTES / (1024 * 1024))} MB yükleyebilirsiniz.`,
      requestId,
      413,
    )
  }

  // ── Ayrıştırma (zaman aşımı korumalı) ────────────────────────────────────
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())

    if (batch) {
      const outcome = await parseInvoiceBatch(bytes, { mode, filename: file.name })
      if (!outcome.ok) {
        return apiFailure(outcome.error.code, outcome.error.message, requestId, outcome.error.status)
      }
      return apiSuccess({ invoices: outcome.invoices }, requestId)
    }

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(PARSE_ERROR.TIMEOUT)), PARSE_TIMEOUT_MS).unref?.()
    })

    const outcome = await Promise.race([
      parseInvoiceFile(bytes, makeDeps(mode), {
        filename: file.name,
        maxBytes: DEFAULT_MAX_BYTES,
        autoSaveThreshold: DEFAULT_AUTOSAVE_THRESHOLD,
      }),
      timeout,
    ])

    if (!outcome.ok) {
      // Kullanıcıya yalnızca stabil kod + hazırlanmış Türkçe mesaj döner.
      logApiError('invoices/parse', requestId, outcome.error.code)
      return apiFailure(
        outcome.error.code,
        outcome.error.message,
        requestId,
        statusForParseError(outcome.error.code),
        { retryable: retryableForParseError(outcome.error.code) },
      )
    }

    return apiSuccess(outcome.value, requestId)
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === PARSE_ERROR.TIMEOUT
    logApiError('invoices/parse', requestId, isTimeout ? PARSE_ERROR.TIMEOUT : PARSE_ERROR.UNEXPECTED, error)
    return isTimeout
      ? apiFailure(PARSE_ERROR.TIMEOUT, 'Fatura ayrıştırma zaman aşımına uğradı.', requestId, 504)
      : apiFailure(
          PARSE_ERROR.UNEXPECTED,
          'Fatura ayrıştırılamadı. Lütfen tekrar deneyin.',
          requestId,
          500,
        )
  }
}

/**
 * GET/PUT/DELETE gibi yanlış metotlar da **JSON zarfı** döndürür.
 * Aksi hâlde Next varsayılan HTML hata sayfası döner ve istemcide
 * `Unexpected token '<'` hatasına dönüşür.
 */
export async function GET() {
  const requestId = newRequestId()
  return apiFailure(
    'METHOD_NOT_ALLOWED',
    'Bu endpoint yalnızca POST kabul eder.',
    requestId,
    405,
  )
}
