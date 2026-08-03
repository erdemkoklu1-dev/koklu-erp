import AdmZip from 'adm-zip'
import { parsePdfBuffer } from '@/lib/parsePdfBuffer'
import { acceptInvoiceFile } from '@/lib/invoice-parse/file-acceptance'
import {
  ARCHIVE_ERROR,
  DEFAULT_ARCHIVE_LIMITS,
  evaluateArchive,
  listInvoiceEntries,
  type ArchiveEntryInfo,
} from '@/lib/invoice-parse/archive'
import { parseUblInvoice } from '@/lib/invoice-parse/ubl-tr'
import {
  mergeAiGaps,
  tagPdfResult,
  ublToParseResult,
  type AiGapFields,
  type LegacyParseResult,
} from '@/lib/invoice-parse/legacy-adapter'

/**
 * Toplu fatura ayrıştırma — **sunucu tarafı** ortak uygulama.
 *
 * `/api/pdf-fatura-parse` (satış) ve `/api/gelen-pdf-parse` (gelen) route'ları
 * artık kendi parser mantıklarını taşımaz; ikisi de buraya delege eder.
 * Böylece GOREV.md §12'nin "birbirinden farklı parser mantıkları taşımamalı"
 * koşulu sağlanır ve öncelik sırası tek yerde tanımlıdır:
 *
 *     ZIP içindeki XML → ZIP içindeki PDF → tekil XML → tekil PDF
 *     (AI hiçbir basamakta birincil DEĞİLDİR)
 *
 * Dış sözleşme (`{ invoices: [...] }`) bilinçli olarak korunur: yanıt şeklini
 * değiştirmek, Gate 0 NO-GO iken staging'de doğrulanamayacak bir UI davranış
 * değişikliği olurdu.
 */

export const BATCH_ERROR = {
  FILE_MISSING: 'FILE_MISSING',
  UNSUPPORTED_TYPE: 'FILE_UNSUPPORTED_TYPE',
  NO_INVOICE: 'BATCH_NO_INVOICE_FOUND',
  ARCHIVE_UNREADABLE: 'ZIP_UNREADABLE',
} as const

export interface BatchFailure {
  code: string
  message: string
  status: number
}

export type BatchOutcome =
  | { ok: true; invoices: LegacyParseResult[] }
  | { ok: false; error: BatchFailure }

export interface BatchOptions {
  mode: 'satis' | 'gelen'
  filename: string
  /**
   * AI **boşluk doldurucu**. Yalnızca deterministik parse'tan sonra ve yalnızca
   * boş kalan alanlar için çağrılır (`mergeAiGaps`). Tanımlı değilse AI hiç
   * çalışmaz ve sonuç tamamen deterministik olur.
   */
  aiFill?: (pdfBuffer: Buffer, base: LegacyParseResult) => Promise<AiGapFields | null>
  /** Toplu işlemde ardışık AI çağrıları arasına konan gecikme (rate limit). */
  aiDelayMs?: number
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function failure(code: string, message: string, status: number): { ok: false; error: BatchFailure } {
  return { ok: false, error: { code, message, status } }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/**
 * XML'i deterministik olarak ayrıştırır. Başarısızsa `null` döner ve çağıran
 * bu entry'yi atlar — tek bozuk XML bütün paketi düşürmez.
 */
function parseXmlEntry(bytes: Uint8Array, name: string, mode: 'satis' | 'gelen'): LegacyParseResult | null {
  const parsed = parseUblInvoice(decodeUtf8(bytes))
  if (!parsed.ok) return null
  return ublToParseResult(parsed.value, name, mode)
}

async function parsePdfEntry(
  buffer: Buffer,
  name: string,
  options: BatchOptions,
): Promise<LegacyParseResult> {
  // 1) DETERMİNİSTİK yol daima önce çalışır.
  const deterministic = tagPdfResult(await parsePdfBuffer(buffer, name, options.mode))

  // 2) AI yalnızca BOŞ alanları doldurur; dolu alanı ezmez, hatayı silmez.
  if (!options.aiFill) return deterministic

  try {
    const ai = await options.aiFill(buffer, deterministic)
    return mergeAiGaps(deterministic, ai)
  } catch (error) {
    // AI hatası deterministik sonucu DÜŞÜRMEZ; içerik loglanmaz.
    console.error('[invoice-batch] ai-fill başarısız:', error instanceof Error ? error.message : 'bilinmeyen')
    return deterministic
  }
}

export async function parseInvoiceBatch(
  bytes: Uint8Array,
  options: BatchOptions,
): Promise<BatchOutcome> {
  // ── Tür: dosya adına değil, magic bytes'a bakılır ────────────────────────
  const accepted = acceptInvoiceFile(bytes, {
    allow: ['pdf', 'zip', 'xml'],
    filename: options.filename,
  })
  if (!accepted.ok) {
    return failure(
      accepted.error.code,
      accepted.error.message,
      accepted.error.code === 'FILE_TOO_LARGE' ? 413 : 400,
    )
  }

  const invoices: LegacyParseResult[] = []

  // ── Tekil XML ────────────────────────────────────────────────────────────
  if (accepted.value.kind === 'xml') {
    const result = parseXmlEntry(bytes, options.filename, options.mode)
    if (!result) {
      return failure(
        BATCH_ERROR.UNSUPPORTED_TYPE,
        'Yüklenen XML bir UBL-TR fatura belgesi olarak okunamadı.',
        422,
      )
    }
    return { ok: true, invoices: [result] }
  }

  // ── Tekil PDF ────────────────────────────────────────────────────────────
  if (accepted.value.kind === 'pdf') {
    invoices.push(await parsePdfEntry(Buffer.from(bytes), options.filename, options))
    return { ok: true, invoices }
  }

  // ── ZIP ──────────────────────────────────────────────────────────────────
  let zip: AdmZip
  let rawEntries: ReturnType<AdmZip['getEntries']>
  try {
    zip = new AdmZip(Buffer.from(bytes))
    rawEntries = zip.getEntries()
  } catch {
    return failure(BATCH_ERROR.ARCHIVE_UNREADABLE, 'Arşiv dosyası okunamadı veya bozuk.', 422)
  }

  // Boyutlar entry header'ından okunur ⇒ sınır kontrolü AÇMA YAPILMADAN.
  const infos: ArchiveEntryInfo[] = rawEntries.map(entry => ({
    name: entry.entryName,
    size: Number(entry.header.size ?? 0),
    compressedSize: Number(entry.header.compressedSize ?? 0),
    isDirectory: entry.isDirectory,
  }))

  const policy = evaluateArchive(infos, DEFAULT_ARCHIVE_LIMITS)
  if (!policy.ok) {
    const status = policy.error.code === ARCHIVE_ERROR.PATH_TRAVERSAL ? 422 : 413
    return failure(policy.error.code, policy.error.message, status)
  }

  // XML'ler PDF'lerden ÖNCE gelir (deterministik yol önceliklidir).
  const targets = listInvoiceEntries(infos)
  let aiCallCount = 0

  for (const target of targets) {
    const raw = rawEntries.find(entry => entry.entryName === target.name)
    if (!raw) continue

    let content: Buffer
    try {
      content = raw.getData()
    } catch {
      continue // tek bozuk entry bütün paketi düşürmez
    }
    if (content.length === 0) continue

    if (/\.xml$/i.test(target.name)) {
      const result = parseXmlEntry(new Uint8Array(content), target.name, options.mode)
      if (result) invoices.push(result)
      continue
    }

    if (options.aiFill && aiCallCount > 0 && options.aiDelayMs) {
      await delay(options.aiDelayMs)
    }
    invoices.push(await parsePdfEntry(content, target.name, options))
    if (options.aiFill) aiCallCount++
  }

  if (invoices.length === 0) {
    return failure(
      BATCH_ERROR.NO_INVOICE,
      'Arşivde işlenebilecek bir fatura dosyası (XML veya PDF) bulunamadı.',
      422,
    )
  }

  return { ok: true, invoices }
}
