/**
 * UBL-TR ayrıştırma, XML güvenliği, arşiv güvenliği ve parse hattı öncelik
 * sırası — GOREV.md §12 regresyon listesi.
 *
 * ── FIXTURE SINIFI: **SYNTHETIC** ───────────────────────────────────────────
 * Bütün belgeler `tests/fixtures/ubl-synthetic.ts` tarafından üretilir. Gerçek
 * müşteri/tedarikçi verisi YOKTUR. Bu testlerin geçmesi altyapının doğru
 * çalıştığını kanıtlar; **belirli bir tedarikçi formatının saha doğrulaması
 * DEĞİLDİR**. Anonimleştirilmiş gerçek fixture sayısı: 0.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { parseXml, XML_ERROR, findAll, textAt } from '../src/lib/invoice-parse/xml.ts'
import { parseUblInvoice, scoreUblConfidence, UBL_ERROR } from '../src/lib/invoice-parse/ubl-tr.ts'
import {
  ARCHIVE_ERROR,
  evaluateArchive,
  isNestedArchive,
  isUnsafeEntryName,
  pickInvoiceEntry,
  type ArchiveEntryInfo,
} from '../src/lib/invoice-parse/archive.ts'
import {
  PARSE_ERROR,
  parseInvoiceFile,
  type ArchiveReader,
  type PipelineDeps,
} from '../src/lib/invoice-parse/pipeline.ts'
import {
  ENTITY_BOMB_XML,
  NON_INVOICE_XML,
  SYNTHETIC_VKN,
  XXE_ATTACK_XML,
  corruptPdfBytes,
  encryptedPdfBytes,
  syntheticPdfBytes,
  syntheticUblInvoice,
} from './fixtures/ubl-synthetic.ts'

const utf8 = (text: string) => new TextEncoder().encode(text)

// ─── XML güvenliği ─────────────────────────────────────────────────────────────

describe('XML güvenliği — XXE yapısal olarak imkânsız', () => {
  it('DOCTYPE içeren belge REDDEDİLİR (external entity vektörü)', () => {
    const result = parseXml(XXE_ATTACK_XML)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, XML_ERROR.DOCTYPE_FORBIDDEN)
  })

  it('entity bombası REDDEDİLİR', () => {
    const result = parseXml(ENTITY_BOMB_XML)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(
        result.error.code === XML_ERROR.DOCTYPE_FORBIDDEN ||
          result.error.code === XML_ERROR.ENTITY_FORBIDDEN,
      )
    }
  })

  it('tanınmayan entity dosya yoluna ÇÖZÜLMEZ', () => {
    const result = parseXml('<Invoice><ID>&gizli;</ID></Invoice>')
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(textAt(result.root, 'ID'), '&gizli;')
    }
  })

  it('öntanımlı entity’ler ve sayısal referanslar çözülür', () => {
    const result = parseXml('<A><B>a &amp; b &lt;c&gt; &#199;</B></A>')
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(textAt(result.root, 'B'), 'a & b <c> Ç')
  })

  it('derinlik sınırı aşılırsa kontrollü hata döner', () => {
    const deep = '<a>'.repeat(60) + 'x' + '</a>'.repeat(60)
    const result = parseXml(deep, { maxDepth: 10 })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, XML_ERROR.TOO_DEEP)
  })

  it('bozuk XML kontrollü hata döner, çökmez', () => {
    for (const bad of ['<a><b></a>', '<a', '', '   ']) {
      const result = parseXml(bad)
      assert.equal(result.ok, false, `beklenen hata: ${JSON.stringify(bad)}`)
    }
  })

  it('namespace prefix’i ne olursa olsun aynı yerel ada indirger', () => {
    const a = parseXml('<Invoice><cbc:ID>X</cbc:ID></Invoice>')
    const b = parseXml('<Invoice><ns7:ID>X</ns7:ID></Invoice>')
    assert.equal(a.ok && b.ok, true)
    if (a.ok && b.ok) {
      assert.equal(textAt(a.root, 'ID'), 'X')
      assert.equal(textAt(b.root, 'ID'), 'X')
    }
  })
})

// ─── UBL-TR alan çıkarımı ──────────────────────────────────────────────────────

describe('UBL-TR zorunlu alanlar', () => {
  const parsed = parseUblInvoice(syntheticUblInvoice())
  assert.equal(parsed.ok, true)
  const invoice = parsed.ok ? parsed.value : null

  it('fatura numarası, UUID, tarih ve tür okunur', () => {
    assert.equal(invoice?.invoiceNumber, 'KKL2026000000123')
    assert.equal(invoice?.uuid, '11111111-2222-3333-4444-555555555555')
    assert.equal(invoice?.issueDate, '2026-03-14')
    assert.equal(invoice?.issueTime, '10:45:00')
    assert.equal(invoice?.invoiceTypeCode, 'SATIS')
    assert.equal(invoice?.profileId, 'TICARIFATURA')
  })

  it('para birimi okunur', () => {
    assert.equal(invoice?.currency, 'TRY')
  })

  it('düzenleyen ve alıcı TERS YAZILMAZ', () => {
    assert.equal(invoice?.supplier.taxId, SYNTHETIC_VKN.supplier)
    assert.equal(invoice?.customer.taxId, SYNTHETIC_VKN.customer)
    assert.notEqual(invoice?.supplier.taxId, invoice?.customer.taxId)
    assert.match(invoice?.supplier.name ?? '', /Güvenlik Ekipmanları/)
    assert.match(invoice?.customer.name ?? '', /Deneme Alıcı/)
  })

  it('Türkçe karakterler bozulmaz', () => {
    assert.equal(invoice?.lines[0]?.description, 'Yangın Söndürme Tüpü 6 kg — dolum ücreti')
    assert.equal(invoice?.supplier.taxOffice, 'Çankaya')
  })

  it('satır alanları (miktar, birim, birim fiyat, KDV) okunur', () => {
    const line = invoice?.lines[0]
    assert.equal(line?.quantity, 2)
    assert.equal(line?.unit, 'C62')
    assert.equal(line?.unitPrice, 600)
    assert.equal(line?.lineTotal, 1200)
    assert.equal(line?.kdvRate, 20)
    assert.equal(line?.kdvAmount, 240)
  })

  it('REGRESYON: 1200 değeri 1,20 olarak parse EDİLMEZ', () => {
    assert.equal(invoice?.subtotal, 1200)
    assert.notEqual(invoice?.subtotal, 1.2)
  })

  it('REGRESYON: KDV toplamı ödenecek tutara yansır', () => {
    assert.equal(invoice?.taxTotal, 240)
    assert.equal(invoice?.payableAmount, 1440)
    assert.equal((invoice?.subtotal ?? 0) + (invoice?.taxTotal ?? 0), invoice?.payableAmount)
  })

  it('duplicate anahtarı düzenleyen VKN + normalize fatura no’dan üretilir', () => {
    assert.equal(invoice?.duplicateKey, `${SYNTHETIC_VKN.supplier}:KKL2026000000123`)
  })

  it('aynı düzenleyen + aynı numara aynı anahtarı verir (yazım farkına rağmen)', () => {
    const a = parseUblInvoice(syntheticUblInvoice({ invoiceNumber: 'KKL-2026-000000123' }))
    const b = parseUblInvoice(syntheticUblInvoice({ invoiceNumber: 'kkl 2026 000000123' }))
    assert.equal(a.ok && b.ok, true)
    if (a.ok && b.ok) assert.equal(a.value.duplicateKey, b.value.duplicateKey)
  })

  it('irsaliye ve sipariş referansları okunur', () => {
    const withRefs = parseUblInvoice(
      syntheticUblInvoice({ despatchId: 'IRS2026000001', orderId: 'SIP2026000009' }),
    )
    assert.equal(withRefs.ok, true)
    if (withRefs.ok) {
      assert.deepEqual(withRefs.value.despatchReferences, ['IRS2026000001'])
      assert.deepEqual(withRefs.value.orderReferences, ['SIP2026000009'])
    }
  })

  it('farklı namespace prefix’iyle üretilmiş belge de okunur', () => {
    const alt = parseUblInvoice(syntheticUblInvoice({ prefix: 'ns5' }))
    assert.equal(alt.ok, true)
    if (alt.ok) assert.equal(alt.value.invoiceNumber, 'KKL2026000000123')
  })

  it('iskonto satırı okunur ve tek işarete indirgenir', () => {
    const withDiscount = parseUblInvoice(
      syntheticUblInvoice({
        lines: [
          {
            id: '1', name: 'Kalem', quantity: '2', unitCode: 'C62',
            unitPrice: '600.00', lineTotal: '1100.00',
            kdvRate: '20', kdvAmount: '220.00', discount: '100.00',
          },
        ],
      }),
    )
    assert.equal(withDiscount.ok, true)
    if (withDiscount.ok) assert.equal(withDiscount.value.lines[0].discountAmount, 100)
  })
})

describe('UBL-TR kontrollü hatalar', () => {
  it('fatura olmayan XML açık kodla reddedilir', () => {
    const result = parseUblInvoice(NON_INVOICE_XML)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, UBL_ERROR.NOT_UBL)
  })

  it('XXE denemesi UBL katmanında da reddedilir', () => {
    const result = parseUblInvoice(XXE_ATTACK_XML)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, UBL_ERROR.XML_INVALID)
  })

  it('toplam uyuşmazlığı SESSİZCE DÜZELTİLMEZ, uyarı üretir', () => {
    const result = parseUblInvoice(syntheticUblInvoice({ payable: '9999.00' }))
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.payableAmount, 9999)
      assert.ok(result.value.issues.some(i => i.code === 'TOTAL_MISMATCH'))
    }
  })

  it('geçersiz VKN uydurulmaz; null + uyarı döner', () => {
    const bad = syntheticUblInvoice().replace(SYNTHETIC_VKN.supplier, '1234567890')
    const result = parseUblInvoice(bad)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.supplier.taxId, null)
      assert.ok(result.value.issues.some(i => i.code.startsWith('TAXID_')))
    }
  })
})

describe('güven skoru', () => {
  it('tam belgede yüksek, eksik belgede düşüktür', () => {
    const full = parseUblInvoice(syntheticUblInvoice())
    assert.equal(full.ok, true)
    if (full.ok) assert.ok(scoreUblConfidence(full.value) >= 0.9)

    const broken = parseUblInvoice(syntheticUblInvoice({ payable: '9999.00' }))
    assert.equal(broken.ok, true)
    if (broken.ok) assert.ok(scoreUblConfidence(broken.value) < 0.9)
  })
})

// ─── Arşiv güvenliği ───────────────────────────────────────────────────────────

const entry = (
  name: string,
  size = 1000,
  compressedSize = 500,
  isDirectory = false,
): ArchiveEntryInfo => ({ name, size, compressedSize, isDirectory })

describe('ZIP güvenlik politikası', () => {
  it('path traversal adları reddedilir', () => {
    for (const bad of ['../x.xml', 'a/../../b.xml', '/etc/passwd', 'C:\\x.xml', '..\\x.xml', '']) {
      assert.equal(isUnsafeEntryName(bad), true, bad)
    }
    for (const good of ['fatura.xml', 'klasor/fatura.xml', './fatura.xml']) {
      assert.equal(isUnsafeEntryName(good), false, good)
    }
  })

  it('iç içe arşiv tespit edilir', () => {
    assert.equal(isNestedArchive('inner.zip'), true)
    assert.equal(isNestedArchive('a.TAR'), true)
    assert.equal(isNestedArchive('fatura.xml'), false)
  })

  it('entry sayısı sınırı uygulanır', () => {
    const many = Array.from({ length: 60 }, (_, i) => entry(`f${i}.xml`))
    const result = evaluateArchive(many)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, ARCHIVE_ERROR.TOO_MANY_ENTRIES)
  })

  it('zip bomb sıkıştırma oranından yakalanır', () => {
    const result = evaluateArchive([entry('bomb.xml', 10 * 1024 * 1024, 1024)])
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, ARCHIVE_ERROR.RATIO_SUSPICIOUS)
  })

  it('tek dosya boyutu sınırı uygulanır', () => {
    const result = evaluateArchive([entry('big.xml', 30 * 1024 * 1024, 25 * 1024 * 1024)])
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, ARCHIVE_ERROR.ENTRY_TOO_LARGE)
  })

  it('açılmış toplam boyut sınırı uygulanır', () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry(`f${i}.xml`, 15 * 1024 * 1024, 14 * 1024 * 1024),
    )
    const result = evaluateArchive(entries)
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, ARCHIVE_ERROR.TOTAL_TOO_LARGE)
  })

  it('iç içe arşiv açılmaz', () => {
    const result = evaluateArchive([entry('fatura.xml'), entry('ek.zip')])
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, ARCHIVE_ERROR.NESTED_ARCHIVE)
  })

  it('güvenli arşiv kabul edilir', () => {
    assert.equal(evaluateArchive([entry('fatura.xml'), entry('klasor/', 0, 0, true)]).ok, true)
  })

  it('XML, PDF’ten ÖNCE seçilir; XSLT şablonu elenir', () => {
    const entries = [entry('gorunum.xslt'), entry('fatura.pdf'), entry('fatura.xml')]
    assert.equal(pickInvoiceEntry(entries)?.name, 'fatura.xml')
  })

  it('yalnızca PDF varsa PDF seçilir', () => {
    assert.equal(pickInvoiceEntry([entry('fatura.pdf')])?.name, 'fatura.pdf')
  })
})

// ─── Parse hattı öncelik sırası ────────────────────────────────────────────────

function zipDeps(entries: Record<string, Uint8Array>, sizes?: Record<string, number>): PipelineDeps {
  const reader: ArchiveReader = {
    entries: Object.keys(entries).map(name => ({
      name,
      size: sizes?.[name] ?? entries[name].length,
      compressedSize: Math.max(1, Math.floor((sizes?.[name] ?? entries[name].length) / 2)),
      isDirectory: false,
    })),
    read: name => entries[name] ?? null,
  }
  return {
    openArchive: () => reader,
    parsePdf: async () => {
      throw new Error('PDF yolu çağrılmamalıydı')
    },
  }
}

/** Gerçek bir ZIP başlığı; içerik `openArchive` tarafından sahte okunur. */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])

describe('parse hattı — öncelik sırası ve kontrollü hatalar', () => {
  const pdfDeps: PipelineDeps = {
    openArchive: () => null,
    parsePdf: async () => ({
      hasTextLayer: true,
      hasRequiredFields: true,
      data: { fatura_no: 'X1' },
      warnings: [],
    }),
  }

  it('doğrudan XML deterministik olarak UBL yolundan geçer', async () => {
    const result = await parseInvoiceFile(utf8(syntheticUblInvoice()), pdfDeps, { filename: 'f.xml' })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.source, 'ubl-xml')
      assert.equal(result.value.ubl?.invoiceNumber, 'KKL2026000000123')
    }
  })

  it('ZIP içindeki XML, PDF’ten ÖNCE kullanılır (PDF hiç açılmaz)', async () => {
    const deps = zipDeps({
      'fatura.pdf': syntheticPdfBytes(),
      'fatura.xml': utf8(syntheticUblInvoice()),
    })
    const result = await parseInvoiceFile(ZIP_MAGIC, deps, { filename: 'paket.zip' })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.source, 'ubl-xml-in-zip')
      assert.equal(result.value.selectedEntry, 'fatura.xml')
    }
  })

  it('ZIP path traversal içeriyorsa açılmaz', async () => {
    const deps = zipDeps({ '../kotu.xml': utf8(syntheticUblInvoice()) })
    const result = await parseInvoiceFile(ZIP_MAGIC, deps, { filename: 'paket.zip' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, ARCHIVE_ERROR.PATH_TRAVERSAL)
  })

  it('PDF metin katmanı yoksa ve OCR yoksa kontrollü hata verir', async () => {
    const deps: PipelineDeps = {
      openArchive: () => null,
      parsePdf: async () => ({ hasTextLayer: false, hasRequiredFields: false, data: null }),
    }
    const result = await parseInvoiceFile(syntheticPdfBytes(), deps, { filename: 'tarali.pdf' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, PARSE_ERROR.PDF_NO_TEXT_LAYER)
  })

  it('OCR bağlıysa taranmış PDF okunur ama OTOMATİK KAYIT SERBEST DEĞİLDİR', async () => {
    const deps: PipelineDeps = {
      openArchive: () => null,
      parsePdf: async () => ({ hasTextLayer: false, hasRequiredFields: false, data: null }),
      runOcr: async () => 'FATURA NO: X',
    }
    const result = await parseInvoiceFile(syntheticPdfBytes(), deps, { filename: 'tarali.pdf' })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.source, 'ocr')
      assert.equal(result.value.autoSaveAllowed, false)
    }
  })

  it('bozuk PDF kontrollü hata verir', async () => {
    const result = await parseInvoiceFile(corruptPdfBytes(), pdfDeps, { filename: 'bozuk.pdf' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, PARSE_ERROR.CORRUPT_PDF)
  })

  it('şifreli PDF kontrollü hata verir', async () => {
    const result = await parseInvoiceFile(encryptedPdfBytes(), pdfDeps, { filename: 'sifreli.pdf' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, PARSE_ERROR.ENCRYPTED_PDF)
  })

  it('desteklenmeyen tür kontrollü hata verir', async () => {
    const result = await parseInvoiceFile(utf8('düz metin, fatura değil'), pdfDeps, { filename: 'x.txt' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, PARSE_ERROR.UNSUPPORTED_TYPE)
  })

  it('boş dosya kontrollü hata verir', async () => {
    const result = await parseInvoiceFile(new Uint8Array(0), pdfDeps, { filename: 'bos.pdf' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, PARSE_ERROR.EMPTY_FILE)
  })

  it('uzantı ile içerik uyuşmazlığı reddedilir', async () => {
    const result = await parseInvoiceFile(syntheticPdfBytes(), pdfDeps, { filename: 'sahte.xml' })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.error.code, PARSE_ERROR.EXTENSION_MISMATCH)
  })

  it('düşük güven skorunda otomatik kayıt SERBEST DEĞİLDİR', async () => {
    const result = await parseInvoiceFile(
      utf8(syntheticUblInvoice({ payable: '9999.00' })),
      pdfDeps,
      { filename: 'f.xml' },
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.value.autoSaveAllowed, false)
      assert.ok(result.value.warnings.length > 0)
    }
  })

  it('hata mesajları ham dosya içeriği veya stack trace SIZDIRMAZ', async () => {
    const result = await parseInvoiceFile(utf8(XXE_ATTACK_XML), pdfDeps, { filename: 'f.xml' })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.ok(!result.error.message.includes('/etc/passwd'))
      assert.ok(!result.error.message.includes('at '))
    }
  })
})

describe('fixture disiplini', () => {
  it('sentetik belgede gerçek firma adı geçmez', () => {
    // Fatura numarası öneki (KKL…) dışında gerçek firma adı bulunmamalıdır.
    const xml = syntheticUblInvoice().replace(/KKL\d+/g, '')
    assert.equal(/koklu|köklü/i.test(xml), false)
  })

  it('sentetik VKN’ler gerçek bir mükellefe değil, kontrol hanesi kuralına uyar', () => {
    const parsed = parseUblInvoice(syntheticUblInvoice())
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      // Geçerli olmasalardı `parseTaxId` null döndürür ve uyarı üretirdi.
      assert.equal(parsed.value.supplier.taxId, SYNTHETIC_VKN.supplier)
      assert.equal(parsed.value.issues.filter(i => i.code.startsWith('TAXID_')).length, 0)
    }
  })

  it('belgede tek kök element ve beklenen satır sayısı vardır', () => {
    const parsed = parseXml(syntheticUblInvoice())
    assert.equal(parsed.ok, true)
    if (parsed.ok) {
      assert.equal(parsed.root.name, 'Invoice')
      assert.equal(findAll(parsed.root, 'InvoiceLine').length, 1)
    }
  })
})
