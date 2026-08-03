/**
 * Fatura dosyası kabul katmanı (GOREV.md Faz C-7.1).
 *
 * Dosya türü **dosya adına güvenilerek** belirlenmez; içerik (magic bytes) okunur.
 * Bağımlılıksızdır; `node --test` altında doğrudan test edilir.
 */

export const FILE_ERROR = {
  EMPTY_FILE: 'FILE_EMPTY',
  TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_TYPE: 'FILE_UNSUPPORTED_TYPE',
  CORRUPT_PDF: 'FILE_CORRUPT_PDF',
  ENCRYPTED_PDF: 'FILE_ENCRYPTED_PDF',
  EXTENSION_MISMATCH: 'FILE_EXTENSION_MISMATCH',
} as const

export type FileErrorCode = (typeof FILE_ERROR)[keyof typeof FILE_ERROR]

export type DetectedKind = 'pdf' | 'zip' | 'xml' | 'png' | 'jpeg' | 'unknown'

export interface AcceptedFile {
  kind: Exclude<DetectedKind, 'unknown'>
  byteLength: number
  /** PDF şifreli mi (parse edilemez, kontrollü hata). */
  encrypted: boolean
}

export interface FileRejection {
  code: FileErrorCode
  message: string
}

export type AcceptanceResult = { ok: true; value: AcceptedFile } | { ok: false; error: FileRejection }

/** Varsayılan sınır: 20 MB. Büyük dosyalar belleğe alınmadan reddedilir. */
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

const ALLOWED_KINDS: DetectedKind[] = ['pdf', 'zip', 'xml', 'png', 'jpeg']

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

/**
 * İçerikten dosya türünü belirler. Dosya adı hiç kullanılmaz.
 */
export function detectFileKind(bytes: Uint8Array): DetectedKind {
  if (bytes.length === 0) return 'unknown'

  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  // PK\x03\x04 / PK\x05\x06 / PK\x07\x08  (zip, ayrıca e-Fatura paketleri)
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'zip'
  if (startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return 'zip'
  if (startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) return 'zip'
  // \x89PNG\r\n\x1a\n
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  // JPEG SOI
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'

  // XML: BOM'u atla, boşlukları atla, `<?xml` veya `<` ile başlamalı
  let offset = 0
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) offset = 3
  while (offset < bytes.length && (bytes[offset] === 0x20 || bytes[offset] === 0x09 || bytes[offset] === 0x0a || bytes[offset] === 0x0d)) {
    offset++
  }
  if (startsWith(bytes, [0x3c, 0x3f, 0x78, 0x6d, 0x6c], offset)) return 'xml' // <?xml
  if (bytes[offset] === 0x3c) return 'xml' // kök element ile başlayan XML

  return 'unknown'
}

/** PDF `/Encrypt` sözlüğü içeriyorsa metin çıkarma başarısız olur. */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  // Trailer genelde dosyanın sonundadır; son 4 KB yeterli ve ucuzdur.
  const tailStart = Math.max(0, bytes.length - 4096)
  const tail = bytes.subarray(tailStart)
  const needle = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74] // "/Encrypt"
  for (let i = 0; i + needle.length <= tail.length; i++) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (tail[i + j] !== needle[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

/** Geçerli bir PDF `%%EOF` ile biter (sondaki boşluk/newline'lar tolere edilir). */
export function hasPdfEndMarker(bytes: Uint8Array): boolean {
  const tailStart = Math.max(0, bytes.length - 2048)
  const tail = bytes.subarray(tailStart)
  const needle = [0x25, 0x25, 0x45, 0x4f, 0x46] // "%%EOF"
  for (let i = tail.length - needle.length; i >= 0; i--) {
    let match = true
    for (let j = 0; j < needle.length; j++) {
      if (tail[i + j] !== needle[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

export interface AcceptOptions {
  maxBytes?: number
  /** Yalnızca bu türler kabul edilir. Varsayılan: hepsi. */
  allow?: DetectedKind[]
  /** Uzantı ile içerik uyuşmazlığında reddet (varsayılan: yalnızca raporla). */
  filename?: string
}

const EXTENSION_KIND: Record<string, DetectedKind> = {
  pdf: 'pdf',
  zip: 'zip',
  xml: 'xml',
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
}

/**
 * Dosyayı kabul eder veya **kontrollü** bir hata koduyla reddeder.
 * Hiçbir durumda dosya içeriği hata mesajına veya loga yazılmaz.
 */
export function acceptInvoiceFile(bytes: Uint8Array, options: AcceptOptions = {}): AcceptanceResult {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const allow = options.allow ?? ALLOWED_KINDS

  if (bytes.length === 0) {
    return { ok: false, error: { code: FILE_ERROR.EMPTY_FILE, message: 'Yüklenen dosya boş.' } }
  }
  if (bytes.length > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024))
    return {
      ok: false,
      error: { code: FILE_ERROR.TOO_LARGE, message: `Dosya çok büyük. En fazla ${mb} MB yükleyebilirsiniz.` },
    }
  }

  const kind = detectFileKind(bytes)

  if (kind === 'unknown' || !allow.includes(kind)) {
    return {
      ok: false,
      error: {
        code: FILE_ERROR.UNSUPPORTED_TYPE,
        message: 'Desteklenmeyen dosya türü. PDF, XML veya ZIP yükleyin.',
      },
    }
  }

  if (options.filename) {
    const ext = options.filename.split('.').pop()?.toLowerCase() ?? ''
    const expected = EXTENSION_KIND[ext]
    if (expected && expected !== kind) {
      return {
        ok: false,
        error: {
          code: FILE_ERROR.EXTENSION_MISMATCH,
          message: 'Dosya içeriği uzantısıyla uyuşmuyor. Doğru dosyayı yüklediğinizden emin olun.',
        },
      }
    }
  }

  if (kind === 'pdf') {
    if (!hasPdfEndMarker(bytes)) {
      return {
        ok: false,
        error: { code: FILE_ERROR.CORRUPT_PDF, message: 'PDF dosyası bozuk veya eksik indirilmiş görünüyor.' },
      }
    }
    if (isEncryptedPdf(bytes)) {
      return {
        ok: false,
        error: {
          code: FILE_ERROR.ENCRYPTED_PDF,
          message: 'PDF şifre korumalı. Şifresiz bir kopya yükleyin.',
        },
      }
    }
  }

  return { ok: true, value: { kind, byteLength: bytes.length, encrypted: false } }
}
