/**
 * ZIP (e-Fatura paketi) güvenlik katmanı.
 *
 * e-Fatura paketleri genelde `.zip` içinde bir UBL-TR XML (+ opsiyonel PDF)
 * taşır. Kontrolsüz açma üç somut risk üretir:
 *
 *   1. **Zip bomb**  — küçük arşiv, gigabaytlarca açılmış içerik ⇒ bellek/disk.
 *   2. **Path traversal** — `../../etc/passwd` gibi entry adları.
 *   3. **Nested archive** — arşiv içinde arşiv, sınırsız özyineleme.
 *
 * Bu modülün politika fonksiyonları **bağımlılıksızdır** ve `node --test`
 * altında doğrudan test edilir; yalnızca gerçek açma işlemi `adm-zip` kullanır.
 */

export const ARCHIVE_ERROR = {
  TOO_MANY_ENTRIES: 'ZIP_TOO_MANY_ENTRIES',
  TOTAL_TOO_LARGE: 'ZIP_TOTAL_TOO_LARGE',
  ENTRY_TOO_LARGE: 'ZIP_ENTRY_TOO_LARGE',
  RATIO_SUSPICIOUS: 'ZIP_RATIO_SUSPICIOUS',
  PATH_TRAVERSAL: 'ZIP_PATH_TRAVERSAL',
  NESTED_ARCHIVE: 'ZIP_NESTED_ARCHIVE',
  UNREADABLE: 'ZIP_UNREADABLE',
  NO_INVOICE_ENTRY: 'ZIP_NO_INVOICE_ENTRY',
} as const

export type ArchiveErrorCode = (typeof ARCHIVE_ERROR)[keyof typeof ARCHIVE_ERROR]

export interface ArchiveRejection {
  code: ArchiveErrorCode
  message: string
}

export interface ArchiveLimits {
  /** Arşivdeki azami entry sayısı. */
  maxEntries: number
  /** Bütün entry'lerin açılmış toplam boyutu. */
  maxTotalBytes: number
  /** Tek bir entry'nin açılmış boyutu. */
  maxEntryBytes: number
  /** `açılmış / sıkıştırılmış` oranı üst sınırı (zip bomb sezgisi). */
  maxCompressionRatio: number
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxEntries: 50,
  maxTotalBytes: 60 * 1024 * 1024,
  maxEntryBytes: 20 * 1024 * 1024,
  maxCompressionRatio: 200,
}

/** Politika değerlendirmesi için gereken minimum entry bilgisi. */
export interface ArchiveEntryInfo {
  name: string
  /** Açılmış (uncompressed) boyut — açma YAPILMADAN header'dan okunur. */
  size: number
  compressedSize: number
  isDirectory: boolean
}

const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.gz', '.tar', '.bz2', '.xz']

/**
 * Entry adı arşiv kökünün dışına çıkıyor mu?
 *
 * Mutlak yol, sürücü harfi, UNC yolu ve `..` bileşeni reddedilir. Kontrol hem
 * `/` hem `\` ayracını dikkate alır (Windows'ta üretilmiş paketler `\` taşır).
 */
export function isUnsafeEntryName(name: string): boolean {
  if (!name || name.trim() === '') return true
  const normalized = name.replace(/\\/g, '/')
  if (normalized.startsWith('/')) return true
  if (/^[a-zA-Z]:/.test(normalized)) return true
  if (normalized.startsWith('//')) return true
  return normalized.split('/').some(segment => segment === '..')
}

/** Entry başka bir arşiv mi? (sınırsız özyineleme engellenir) */
export function isNestedArchive(name: string): boolean {
  const lower = name.toLowerCase()
  return ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/**
 * Arşiv politikasını **açma yapmadan** değerlendirir.
 * Sınır aşılırsa içerik hiç belleğe alınmaz.
 */
export function evaluateArchive(
  entries: ArchiveEntryInfo[],
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): { ok: true } | { ok: false; error: ArchiveRejection } {
  const files = entries.filter(entry => !entry.isDirectory)

  if (files.length > limits.maxEntries) {
    return {
      ok: false,
      error: {
        code: ARCHIVE_ERROR.TOO_MANY_ENTRIES,
        message: `Arşivde çok fazla dosya var (en fazla ${limits.maxEntries}).`,
      },
    }
  }

  let totalBytes = 0
  let totalCompressed = 0

  for (const entry of files) {
    if (isUnsafeEntryName(entry.name)) {
      return {
        ok: false,
        error: {
          code: ARCHIVE_ERROR.PATH_TRAVERSAL,
          message: 'Arşiv güvenli olmayan bir dosya yolu içeriyor.',
        },
      }
    }
    if (isNestedArchive(entry.name)) {
      return {
        ok: false,
        error: {
          code: ARCHIVE_ERROR.NESTED_ARCHIVE,
          message: 'Arşiv içinde başka bir arşiv var. İç içe arşivler açılmaz.',
        },
      }
    }
    if (entry.size > limits.maxEntryBytes) {
      return {
        ok: false,
        error: {
          code: ARCHIVE_ERROR.ENTRY_TOO_LARGE,
          message: 'Arşivdeki bir dosya izin verilen boyutu aşıyor.',
        },
      }
    }

    totalBytes += entry.size
    totalCompressed += entry.compressedSize
  }

  if (totalBytes > limits.maxTotalBytes) {
    return {
      ok: false,
      error: {
        code: ARCHIVE_ERROR.TOTAL_TOO_LARGE,
        message: 'Arşivin açılmış toplam boyutu izin verilen sınırı aşıyor.',
      },
    }
  }

  // Oran kontrolü yalnızca anlamlı bir sıkıştırılmış boyut varsa yapılır;
  // birkaç yüz baytlık arşivlerde oran doğal olarak oynaktır.
  if (totalCompressed > 0 && totalBytes / totalCompressed > limits.maxCompressionRatio) {
    return {
      ok: false,
      error: {
        code: ARCHIVE_ERROR.RATIO_SUSPICIOUS,
        message: 'Arşivin sıkıştırma oranı olağandışı yüksek. Güvenlik gereği işlenmedi.',
      },
    }
  }

  return { ok: true }
}

/**
 * Arşivdeki fatura adayını seçer.
 *
 * ÖNCELİK: XML daima PDF'ten ÖNCE gelir (GOREV.md §12). XML deterministik
 * ayrıştırılır; PDF metin katmanı üreticiye göre değişir.
 * `.xsl`/`.xslt` görüntüleme şablonlarıdır, fatura verisi taşımazlar; elenir.
 */
export function pickInvoiceEntry(entries: ArchiveEntryInfo[]): ArchiveEntryInfo | null {
  const files = entries.filter(entry => !entry.isDirectory && !isUnsafeEntryName(entry.name))
  const isStylesheet = (name: string) => /\.xslt?$/i.test(name)

  const xml = files.find(entry => /\.xml$/i.test(entry.name) && !isStylesheet(entry.name))
  if (xml) return xml

  const pdf = files.find(entry => /\.pdf$/i.test(entry.name))
  return pdf ?? null
}
