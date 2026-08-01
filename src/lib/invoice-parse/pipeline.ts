/**
 * Fatura parse hattı — **deterministik öncelik sırası** (GOREV.md §12).
 *
 *   1. UBL-TR XML (doğrudan veya ZIP içinden)   ← deterministik, tek doğruluk kaynağı
 *   2. PDF metin katmanı                         ← deterministik alan çıkarımı
 *   3. Taranmış PDF / görüntü → OCR              ← yapılandırılmamışsa kontrollü hata
 *   4. AI                                        ← YALNIZCA yardımcı, asla birincil
 *   5. Kullanıcı ön izlemesi ve doğrulaması      ← zorunlu
 *   6. Kayıt                                     ← bu modülün DIŞINDA
 *
 * Bu modül **hiçbir koşulda kayıt oluşturmaz**. Dönen sonuç bir ön izleme
 * payload'ıdır; `autoSaveAllowed` alanı düşük güven skorunda `false` olur.
 *
 * Bağımlılıklar dışarıdan enjekte edilir (`PipelineDeps`), böylece hat
 * `adm-zip` / `pdfjs-dist` olmadan `node --test` altında doğrudan test edilir.
 */

import {
  ARCHIVE_ERROR,
  DEFAULT_ARCHIVE_LIMITS,
  evaluateArchive,
  pickInvoiceEntry,
  type ArchiveEntryInfo,
  type ArchiveLimits,
} from './archive.ts'
import { FILE_ERROR, acceptInvoiceFile, type DetectedKind } from './file-acceptance.ts'
import { parseUblInvoice, scoreUblConfidence, type UblInvoice } from './ubl-tr.ts'

export const PARSE_ERROR = {
  ...FILE_ERROR,
  ...ARCHIVE_ERROR,
  /** OCR yolu yapılandırılmamış — taranmış belge işlenemez */
  OCR_UNAVAILABLE: 'PARSE_OCR_UNAVAILABLE',
  /** PDF'te metin katmanı yok (taranmış görüntü) */
  PDF_NO_TEXT_LAYER: 'PARSE_PDF_NO_TEXT_LAYER',
  /** XML okundu ama UBL fatura değil */
  UNSUPPORTED_XML: 'PARSE_UNSUPPORTED_XML',
  /** PDF metin katmanından zorunlu alanlar çıkarılamadı */
  PDF_FIELDS_MISSING: 'PARSE_PDF_FIELDS_MISSING',
  /** İşlem zaman aşımına uğradı */
  TIMEOUT: 'PARSE_TIMEOUT',
  /** Beklenmeyen hata — ham ayrıntı istemciye DÖNMEZ */
  UNEXPECTED: 'PARSE_UNEXPECTED',
} as const

export type ParseErrorCode = (typeof PARSE_ERROR)[keyof typeof PARSE_ERROR]

export interface ParseFailure {
  code: ParseErrorCode
  message: string
}

/** Hangi basamağın sonucu ürettiği — ön izlemede kullanıcıya gösterilir. */
export type ParseSource = 'ubl-xml' | 'ubl-xml-in-zip' | 'pdf-text' | 'ocr'

export interface InvoicePreview {
  source: ParseSource
  /** Arşivden seçilen dosyanın adı (varsa). */
  selectedEntry: string | null
  /** UBL yolundan geldiyse tam yapılandırılmış fatura. */
  ubl: UblInvoice | null
  /** PDF metin yolundan geldiyse ham parser çıktısı. */
  pdf: unknown | null
  /** 0–1 arası güven skoru. */
  confidence: number
  /**
   * Otomatik kayıt serbest mi?
   *
   * `false` ⇒ istemci kaydı KULLANICI ONAYI OLMADAN yapamaz. Bu alan bir
   * öneri değil, sözleşmedir (GOREV.md §12: "Düşük güven skorunda otomatik
   * kayıt yapılmaz").
   */
  autoSaveAllowed: boolean
  /** Kullanıcının kontrol etmesi gereken noktalar. */
  warnings: string[]
}

export type ParseOutcome =
  | { ok: true; value: InvoicePreview }
  | { ok: false; error: ParseFailure }

/** PDF metin katmanı okuyucusunun sözleşmesi. */
export interface PdfParseOutcome {
  /** Metin katmanı bulundu mu? `false` ⇒ taranmış belge. */
  hasTextLayer: boolean
  /** Parser çıktısı (ham). */
  data: unknown
  /** Zorunlu alanlar dolu mu? */
  hasRequiredFields: boolean
  warnings?: string[]
}

export interface ArchiveReader {
  entries: ArchiveEntryInfo[]
  /** Seçilen entry'nin içeriğini döndürür; sınır kontrolünden SONRA çağrılır. */
  read(name: string): Uint8Array | null
}

export interface PipelineDeps {
  /** ZIP okuyucusu. `null` ⇒ arşiv okunamadı. */
  openArchive(bytes: Uint8Array): ArchiveReader | null
  parsePdf(bytes: Uint8Array, filename: string): Promise<PdfParseOutcome>
  /** OCR yolu. Tanımlı değilse taranmış belge kontrollü hata verir. */
  runOcr?: (bytes: Uint8Array) => Promise<string | null>
}

export interface PipelineOptions {
  filename?: string
  maxBytes?: number
  archiveLimits?: ArchiveLimits
  /** Bu skorun altında otomatik kayıt serbest DEĞİLDİR. */
  autoSaveThreshold?: number
}

export const DEFAULT_AUTOSAVE_THRESHOLD = 0.85

const ALLOWED_KINDS: DetectedKind[] = ['pdf', 'zip', 'xml', 'png', 'jpeg']

function fail(code: ParseErrorCode, message: string): { ok: false; error: ParseFailure } {
  return { ok: false, error: { code, message } }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/** UBL sonucunu ön izleme payload'ına çevirir. */
function toUblPreview(
  invoice: UblInvoice,
  source: ParseSource,
  selectedEntry: string | null,
  threshold: number,
): InvoicePreview {
  const confidence = scoreUblConfidence(invoice)
  return {
    source,
    selectedEntry,
    ubl: invoice,
    pdf: null,
    confidence,
    autoSaveAllowed: confidence >= threshold && invoice.issues.length === 0,
    warnings: invoice.issues.map(i => i.message),
  }
}

/**
 * Bir dosyayı öncelik sırasına göre ayrıştırır.
 *
 * ZIP içindeki XML, dosyanın kendisi PDF olsa bile **PDF'ten önce** kullanılır;
 * arşivde XML varsa PDF hiç açılmaz.
 */
export async function parseInvoiceFile(
  bytes: Uint8Array,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): Promise<ParseOutcome> {
  const threshold = options.autoSaveThreshold ?? DEFAULT_AUTOSAVE_THRESHOLD

  const accepted = acceptInvoiceFile(bytes, {
    maxBytes: options.maxBytes,
    allow: ALLOWED_KINDS,
    filename: options.filename,
  })
  if (!accepted.ok) {
    return fail(accepted.error.code as ParseErrorCode, accepted.error.message)
  }

  const kind = accepted.value.kind

  // ── 1. Doğrudan XML ───────────────────────────────────────────────────────
  if (kind === 'xml') {
    const parsed = parseUblInvoice(decodeUtf8(bytes))
    if (!parsed.ok) {
      return fail(PARSE_ERROR.UNSUPPORTED_XML, parsed.error.message)
    }
    return { ok: true, value: toUblPreview(parsed.value, 'ubl-xml', options.filename ?? null, threshold) }
  }

  // ── 2. ZIP: önce sınır politikası, sonra XML önceliği ─────────────────────
  if (kind === 'zip') {
    const archive = deps.openArchive(bytes)
    if (!archive) {
      return fail(PARSE_ERROR.UNREADABLE, 'Arşiv dosyası okunamadı veya bozuk.')
    }

    const policy = evaluateArchive(archive.entries, options.archiveLimits ?? DEFAULT_ARCHIVE_LIMITS)
    if (!policy.ok) {
      return fail(policy.error.code, policy.error.message)
    }

    const entry = pickInvoiceEntry(archive.entries)
    if (!entry) {
      return fail(
        PARSE_ERROR.NO_INVOICE_ENTRY,
        'Arşivde işlenebilecek bir fatura dosyası (XML veya PDF) bulunamadı.',
      )
    }

    const content = archive.read(entry.name)
    if (!content || content.length === 0) {
      return fail(PARSE_ERROR.UNREADABLE, 'Arşivdeki fatura dosyası okunamadı.')
    }

    if (/\.xml$/i.test(entry.name)) {
      const parsed = parseUblInvoice(decodeUtf8(content))
      if (!parsed.ok) {
        return fail(PARSE_ERROR.UNSUPPORTED_XML, parsed.error.message)
      }
      return { ok: true, value: toUblPreview(parsed.value, 'ubl-xml-in-zip', entry.name, threshold) }
    }

    // Arşivde XML yok ⇒ PDF yolu. İç içe arşiv `evaluateArchive`te elenmiştir.
    return parsePdfPath(content, entry.name, deps, threshold)
  }

  // ── 3. PDF metin katmanı ──────────────────────────────────────────────────
  if (kind === 'pdf') {
    return parsePdfPath(bytes, options.filename ?? 'fatura.pdf', deps, threshold)
  }

  // ── 4. Görüntü ⇒ yalnızca OCR ─────────────────────────────────────────────
  if (!deps.runOcr) {
    return fail(
      PARSE_ERROR.OCR_UNAVAILABLE,
      'Görüntü dosyaları için OCR desteği yapılandırılmamış. Lütfen PDF veya XML yükleyin.',
    )
  }

  const text = await deps.runOcr(bytes)
  if (!text || text.trim().length === 0) {
    return fail(PARSE_ERROR.OCR_UNAVAILABLE, 'Görüntüden metin çıkarılamadı.')
  }

  // OCR çıktısı asla doğrudan güvenilmez: her zaman kullanıcı doğrulaması ister.
  return {
    ok: true,
    value: {
      source: 'ocr',
      selectedEntry: options.filename ?? null,
      ubl: null,
      pdf: { text },
      confidence: 0.3,
      autoSaveAllowed: false,
      warnings: ['Belge OCR ile okundu. Bütün alanları kaydetmeden önce kontrol edin.'],
    },
  }
}

async function parsePdfPath(
  bytes: Uint8Array,
  filename: string,
  deps: PipelineDeps,
  threshold: number,
): Promise<ParseOutcome> {
  const result = await deps.parsePdf(bytes, filename)

  if (!result.hasTextLayer) {
    if (!deps.runOcr) {
      return fail(
        PARSE_ERROR.PDF_NO_TEXT_LAYER,
        'Bu PDF taranmış görüntü içeriyor ve metin katmanı yok. OCR desteği yapılandırılmadığı için okunamadı.',
      )
    }
    const text = await deps.runOcr(bytes)
    if (!text || text.trim().length === 0) {
      return fail(PARSE_ERROR.OCR_UNAVAILABLE, 'Taranmış PDF’ten metin çıkarılamadı.')
    }
    return {
      ok: true,
      value: {
        source: 'ocr',
        selectedEntry: filename,
        ubl: null,
        pdf: { text },
        confidence: 0.3,
        autoSaveAllowed: false,
        warnings: ['Belge OCR ile okundu. Bütün alanları kaydetmeden önce kontrol edin.'],
      },
    }
  }

  if (!result.hasRequiredFields) {
    return fail(
      PARSE_ERROR.PDF_FIELDS_MISSING,
      'PDF okundu ancak fatura numarası/tarih/tutar gibi zorunlu alanlar çıkarılamadı.',
    )
  }

  const warnings = result.warnings ?? []
  // PDF metin katmanı üreticiye göre değişir; XML kadar güvenilir değildir.
  const confidence = warnings.length === 0 ? 0.8 : 0.6

  return {
    ok: true,
    value: {
      source: 'pdf-text',
      selectedEntry: filename,
      ubl: null,
      pdf: result.data,
      confidence,
      autoSaveAllowed: confidence >= threshold && warnings.length === 0,
      warnings,
    },
  }
}
