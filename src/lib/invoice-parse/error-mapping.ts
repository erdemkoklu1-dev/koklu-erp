/**
 * Parse hata kodu → HTTP durumu ve `retryable` eşlemesi.
 *
 * Tek yerde tutulur: `/api/v1/invoices/parse` ile eski `/api/parse-fatura`
 * delegate'i aynı kodu aynı durumla raporlamalı, aksi hâlde istemci iki farklı
 * sözleşme görür.
 *
 * `retryable` **status'tan türetilmez**. Varsayılan "5xx ⇒ tekrar dene" kuralı
 * yanlış sonuç veriyordu: OCR yapılandırılmamışsa 501 döner ama aynı isteği
 * tekrarlamak hiçbir şey değiştirmez — kullanıcıyı boşuna döngüye sokar.
 * Yalnızca gerçekten geçici olan durumlar tekrar denenebilir.
 */

import { PARSE_ERROR, type ParseErrorCode } from './pipeline.ts'

export const STATUS_BY_CODE: Partial<Record<ParseErrorCode, number>> = {
  [PARSE_ERROR.EMPTY_FILE]: 400,
  [PARSE_ERROR.TOO_LARGE]: 413,
  [PARSE_ERROR.UNSUPPORTED_TYPE]: 415,
  [PARSE_ERROR.EXTENSION_MISMATCH]: 415,
  [PARSE_ERROR.CORRUPT_PDF]: 422,
  [PARSE_ERROR.ENCRYPTED_PDF]: 422,
  [PARSE_ERROR.TOO_MANY_ENTRIES]: 413,
  [PARSE_ERROR.TOTAL_TOO_LARGE]: 413,
  [PARSE_ERROR.ENTRY_TOO_LARGE]: 413,
  [PARSE_ERROR.RATIO_SUSPICIOUS]: 422,
  [PARSE_ERROR.PATH_TRAVERSAL]: 422,
  [PARSE_ERROR.NESTED_ARCHIVE]: 422,
  [PARSE_ERROR.UNREADABLE]: 422,
  [PARSE_ERROR.NO_INVOICE_ENTRY]: 422,
  [PARSE_ERROR.UNSUPPORTED_XML]: 422,
  [PARSE_ERROR.PDF_NO_TEXT_LAYER]: 422,
  [PARSE_ERROR.PDF_FIELDS_MISSING]: 422,
  [PARSE_ERROR.OCR_UNAVAILABLE]: 501,
  [PARSE_ERROR.TIMEOUT]: 504,
  [PARSE_ERROR.UNEXPECTED]: 500,
}

/**
 * Aynı isteği tekrarlamak sonucu değiştirebilir mi?
 *
 * Dosyanın kendisinden veya sunucu yapılandırmasından kaynaklanan hiçbir hata
 * tekrar denenebilir DEĞİLDİR; kullanıcı ya farklı bir dosya yüklemeli ya da
 * yönetici yapılandırmayı düzeltmelidir.
 */
export const RETRYABLE_BY_CODE: Partial<Record<ParseErrorCode, boolean>> = {
  [PARSE_ERROR.TIMEOUT]: true,
  [PARSE_ERROR.UNEXPECTED]: true,
}

export function statusForParseError(code: ParseErrorCode): number {
  return STATUS_BY_CODE[code] ?? 422
}

export function retryableForParseError(code: ParseErrorCode): boolean {
  return RETRYABLE_BY_CODE[code] ?? false
}
