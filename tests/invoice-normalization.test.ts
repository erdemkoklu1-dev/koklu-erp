import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  acceptInvoiceFile,
  detectFileKind,
  FILE_ERROR,
  hasPdfEndMarker,
  isEncryptedPdf,
} from '../src/lib/invoice-parse/file-acceptance.ts'
import {
  buildDuplicateKey,
  computeTotals,
  isValidTckn,
  isValidVkn,
  normalizeInvoiceNumber,
  parseAmount,
  parseCurrency,
  parseInvoiceDate,
  parseRate,
  parseTaxId,
} from '../src/lib/invoice-parse/normalization.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Dosya kabulü — magic bytes, dosya adına güvenilmez
// ─────────────────────────────────────────────────────────────────────────────

function bytes(...parts: Array<string | number[]>): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(part, c => c.charCodeAt(0)))
    else out.push(...part)
  }
  return new Uint8Array(out)
}

const MINIMAL_PDF = bytes('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')

describe('dosya kabulü: tür içerikten belirlenir', () => {
  test('PDF magic bytes tanınır', () => {
    assert.equal(detectFileKind(MINIMAL_PDF), 'pdf')
  })

  test('ZIP, PNG, JPEG ve XML tanınır', () => {
    assert.equal(detectFileKind(bytes([0x50, 0x4b, 0x03, 0x04, 0x00])), 'zip')
    assert.equal(detectFileKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png')
    assert.equal(detectFileKind(bytes([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
    assert.equal(detectFileKind(bytes('<?xml version="1.0"?><Invoice/>')), 'xml')
    assert.equal(detectFileKind(bytes([0xef, 0xbb, 0xbf], '  <Invoice/>')), 'xml', 'BOM + boşluk')
  })

  test('.pdf adlı ama aslında HTML olan dosya reddedilir', () => {
    const fake = bytes('<html><body>Not a PDF</body></html>')
    // İçerik XML/HTML gibi göründüğü için uzantı uyuşmazlığı yakalanır.
    const result = acceptInvoiceFile(fake, { filename: 'fatura.pdf' })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.EXTENSION_MISMATCH)
  })

  test('desteklenmeyen tür kontrollü hata verir', () => {
    const result = acceptInvoiceFile(bytes([0x00, 0x01, 0x02, 0x03]))
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.UNSUPPORTED_TYPE)
  })

  test('boş dosya reddedilir', () => {
    const result = acceptInvoiceFile(new Uint8Array(0))
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.EMPTY_FILE)
  })

  test('boyut limiti aşılırsa reddedilir ve mesajda limit yazar', () => {
    const result = acceptInvoiceFile(MINIMAL_PDF, { maxBytes: 10 })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.TOO_LARGE)
    assert.match(result.error.message, /MB/)
  })

  test('bozuk PDF (%%EOF yok) reddedilir', () => {
    const truncated = bytes('%PDF-1.7\n1 0 obj\n<<>>\n')
    assert.equal(hasPdfEndMarker(truncated), false)
    const result = acceptInvoiceFile(truncated)
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.CORRUPT_PDF)
  })

  test('şifreli PDF ayrı kodla reddedilir', () => {
    const encrypted = bytes('%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF\n')
    assert.equal(isEncryptedPdf(encrypted), true)
    const result = acceptInvoiceFile(encrypted)
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.ENCRYPTED_PDF)
  })

  test('geçerli PDF kabul edilir', () => {
    const result = acceptInvoiceFile(MINIMAL_PDF, { filename: 'fatura.pdf' })
    assert.equal(result.ok, true)
    assert.equal(result.value.kind, 'pdf')
  })

  test('allow listesi dışındaki tür reddedilir', () => {
    const result = acceptInvoiceFile(MINIMAL_PDF, { allow: ['xml'] })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, FILE_ERROR.UNSUPPORTED_TYPE)
  })

  test('hata mesajları dosya içeriğini sızdırmaz', () => {
    const secretish = bytes('gizli müşteri verisi 1234567890')
    const result = acceptInvoiceFile(secretish)
    assert.equal(result.ok, false)
    assert.equal(result.error.message.includes('gizli'), false)
    assert.equal(result.error.message.includes('1234567890'), false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Sayı / para normalizasyonu
// ─────────────────────────────────────────────────────────────────────────────

describe('tutar normalizasyonu: TR ve EN biçimleri', () => {
  const cases: Array<[string, number]> = [
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89],
    ['1 234,56', 1234.56],
    ['333,34 TL', 333.34],
    ['₺1.500,00', 1500],
    ['€2,500.00', 2500],
    ['0,00', 0],
    ['-1.234,56', -1234.56],
    ['(1.234,56)', -1234.56],
    ['1.234', 1234],
    ['1,234', 1234],
    ['12,5', 12.5],
    ['20', 20],
  ]

  for (const [input, expected] of cases) {
    test(`"${input}" ⇒ ${expected}`, () => {
      const result = parseAmount(input)
      assert.equal(result.value, expected, `"${input}" yanlış çözümlendi`)
    })
  }

  test('okunamayan tutar sessizce 0 olmaz, uyarı üretir', () => {
    const result = parseAmount('okunamadı')
    assert.equal(result.value, null)
    assert.equal(result.issue?.code, 'AMOUNT_UNPARSEABLE')
  })

  test('boş tutar null döner', () => {
    assert.equal(parseAmount('').value, null)
    assert.equal(parseAmount(undefined).value, null)
  })

  test('NaN / Infinity reddedilir', () => {
    assert.equal(parseAmount(Number.NaN).value, null)
    assert.equal(parseAmount(Number.POSITIVE_INFINITY).value, null)
  })
})

describe('oran normalizasyonu', () => {
  test('%20, "20", "%10" kabul edilir', () => {
    assert.equal(parseRate('%20').value, 20)
    assert.equal(parseRate('20').value, 20)
    assert.equal(parseRate('10,5').value, 10.5)
  })

  test('100 üstü veya negatif oran reddedilir', () => {
    assert.equal(parseRate('120').issue?.code, 'RATE_OUT_OF_RANGE')
    assert.equal(parseRate('-5').issue?.code, 'RATE_OUT_OF_RANGE')
  })
})

describe('para birimi', () => {
  test('TL/TRY/₺ ⇒ TRY, $/USD ⇒ USD, €/EURO ⇒ EUR', () => {
    assert.equal(parseCurrency('TL').value, 'TRY')
    assert.equal(parseCurrency('try').value, 'TRY')
    assert.equal(parseCurrency('₺').value, 'TRY')
    assert.equal(parseCurrency('USD').value, 'USD')
    assert.equal(parseCurrency('€').value, 'EUR')
    assert.equal(parseCurrency('Euro').value, 'EUR')
  })

  test('bilinmeyen para birimi reddedilir', () => {
    assert.equal(parseCurrency('GBP').issue?.code, 'CURRENCY_UNSUPPORTED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tarih
// ─────────────────────────────────────────────────────────────────────────────

describe('tarih normalizasyonu', () => {
  const cases: Array<[string, string]> = [
    ['31.12.2026', '2026-12-31'],
    ['01/02/2026', '2026-02-01'],
    ['05-06-2026', '2026-06-05'],
    ['2026-03-15', '2026-03-15'],
    ['2026-03-15T10:22:00Z', '2026-03-15'],
    ['12 Mart 2026', '2026-03-12'],
    ['3 Ağustos 2026', '2026-08-03'],
    ['1.1.26', '2026-01-01'],
  ]

  for (const [input, expected] of cases) {
    test(`"${input}" ⇒ ${expected}`, () => {
      assert.equal(parseInvoiceDate(input).value, expected)
    })
  }

  test('ikinci alan >12 ise ay/gün sırası düzeltilir', () => {
    // 03/25/2026 → ABD biçimi; gün 25 olmalı
    assert.equal(parseInvoiceDate('03/25/2026').value, '2026-03-25')
  })

  test('takvimde olmayan tarih reddedilir', () => {
    assert.equal(parseInvoiceDate('31.02.2026').issue?.code, 'DATE_INVALID')
    assert.equal(parseInvoiceDate('2026-13-01').issue?.code, 'DATE_INVALID')
  })

  test('tanınmayan biçim sessizce bugüne çevrilmez', () => {
    const result = parseInvoiceDate('yakında')
    assert.equal(result.value, null)
    assert.equal(result.issue?.code, 'DATE_UNPARSEABLE')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// VKN / TCKN
// ─────────────────────────────────────────────────────────────────────────────

describe('VKN / TCKN', () => {
  test('algoritmaya uyan VKN kabul edilir', () => {
    // Kontrol hanesi algoritmadan üretilmiş SENTETİK değerler; gerçek firma verisi değildir.
    assert.equal(isValidVkn('1111111115'), true)
    const parsed = parseTaxId('111 111 1115')
    assert.equal(parsed.value?.kind, 'vkn')
    assert.equal(parsed.value?.value, '1111111115')
  })

  test('kontrol hanesi tutmayan VKN reddedilir (uydurma değer üretilmez)', () => {
    const parsed = parseTaxId('1234567890')
    assert.equal(parsed.value, null)
    assert.equal(parsed.issue?.code, 'TAXID_CHECKSUM')
  })

  test('TCKN algoritması uygulanır', () => {
    assert.equal(isValidTckn('10000000146'), true)
    assert.equal(isValidTckn('01234567890'), false, '0 ile başlayamaz')
    assert.equal(parseTaxId('10000000146').value?.kind, 'tckn')
  })

  test('yanlış uzunluk ayrı kodla reddedilir', () => {
    assert.equal(parseTaxId('12345').issue?.code, 'TAXID_LENGTH')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate anahtarı
// ─────────────────────────────────────────────────────────────────────────────

describe('duplicate kontrolü fatura numarasına tek başına güvenmez', () => {
  test('fatura no normalize edilir', () => {
    assert.equal(normalizeInvoiceNumber(' kok-2026 000123 '), 'KOK2026000123')
    assert.equal(normalizeInvoiceNumber('   '), null)
  })

  test('farklı tedarikçilerin aynı numarası duplicate sayılmaz', () => {
    const a = buildDuplicateKey('1111111115', 'FAT-2026-001')
    const b = buildDuplicateKey('10000000146', 'FAT-2026-001')
    assert.notEqual(a, b)
  })

  test('aynı tedarikçi + farklı yazım aynı anahtarı verir', () => {
    assert.equal(
      buildDuplicateKey('111 111 1115', 'FAT-2026-001'),
      buildDuplicateKey('1111111115', 'fat2026001'),
    )
  })

  test('VKN yoksa duplicate anahtarı üretilmez (yanlış eşleşme riskine karşı)', () => {
    assert.equal(buildDuplicateKey(null, 'FAT-2026-001'), null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Toplam tutarlılığı
// ─────────────────────────────────────────────────────────────────────────────

describe('toplam ve KDV hesabı', () => {
  test('iskonto ve KDV içeren kalemlerde toplamlar kuruş bazında hesaplanır', () => {
    const result = computeTotals([
      { quantity: 3, unitPrice: 333.34, kdvRate: 20, lineTotal: 1000.02 },
      { quantity: 1, unitPrice: 250, discountAmount: 25, kdvRate: 10, lineTotal: 225 },
    ])
    assert.equal(result.issues.length, 0)
    assert.equal(result.computedSubtotal, 1225.02)
    assert.equal(result.computedKdv, 222.5)
    assert.equal(result.computedGrandTotal, 1447.52)
  })

  test('satır toplamı miktar × birim fiyat ile uyuşmazsa işaretlenir', () => {
    const result = computeTotals([{ quantity: 2, unitPrice: 100, lineTotal: 250 }])
    assert.equal(result.issues.length, 1)
    assert.equal(result.issues[0].code, 'LINE_TOTAL_MISMATCH')
  })

  test('KDV hariç birim fiyat 1.20’ye bölünmez (regresyon)', () => {
    // e-Fatura "Birim Fiyat" sütunu zaten KDV hariçtir.
    const result = computeTotals([{ quantity: 3, unitPrice: 333.34, kdvRate: 20 }])
    assert.equal(result.computedSubtotal, 1000.02)
    assert.notEqual(result.computedSubtotal, 833.35)
  })
})
