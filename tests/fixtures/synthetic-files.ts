/**
 * **SENTETİK** fatura dosyası üreteçleri (XML dışı türler).
 *
 * `ubl-synthetic.ts` UBL-TR XML metni üretir; bu modül aynı belgeyi ZIP, PDF ve
 * PNG olarak paketler. Gerçek müşteri/tedarikçi verisi YOKTUR.
 *
 * Hem `scripts/generate-smoke-fixtures.mjs` (tarayıcı smoke dosyaları) hem de
 * route contract testleri buradan üretir; iki yerde ayrı fixture tutulmaz.
 */

import { deflateSync, crc32 } from 'node:zlib'

/**
 * Elle kurulmuş, tek sayfalık, sıkıştırılmamış içerik akışı olan PDF.
 *
 * `pdfjs-dist` metin katmanını okuyabilsin diye standart Helvetica kullanılır ve
 * xref offsetleri byte sayımından hesaplanır. `lines` boş verilirse belge geçerli
 * kalır ama **metin katmanı içermez** — taranmış PDF senaryosunun karşılığıdır.
 */
export function syntheticTextLayerPdf(lines: Array<[number, number, string]>): Buffer {
  const content =
    'BT\n/F1 11 Tf\n' +
    lines
      .map(([x, y, text]) => `1 0 0 1 ${x} ${y} Tm (${text.replace(/([()\\])/g, '\\$1')}) Tj\n`)
      .join('') +
    'ET\n'

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}

/** Metin katmanlı, alanları deterministik parser'ın bulabileceği sentetik fatura. */
export const SYNTHETIC_PDF_LINES: Array<[number, number, string]> = [
  [60, 780, 'ORNEK GUVENLIK EKIPMANLARI LTD. STI.'],
  [60, 762, 'VKN: 1000000411'],
  [60, 736, 'Fatura No: KKL2026000000123'],
  [60, 718, 'Fatura Tarihi: 14-03-2026'],
  [60, 700, 'Sayin: DENEME ALICI ANONIM SIRKETI'],
  [60, 682, 'VKN/TCKN: 1000002877'],
  [60, 650, 'Aciklama            Miktar  Birim Fiyat  KDV   Tutar'],
  [60, 632, 'Yangin Sondurme Tupu    2      600,00     %20  1.200,00'],
  [60, 600, 'Mal Hizmet Toplam Tutari: 1.200,00 TL'],
  [60, 582, 'Hesaplanan KDV: 240,00 TL'],
  [60, 564, 'Vergiler Dahil Toplam Tutar: 1.440,00 TL'],
  [60, 546, 'Odenecek Tutar: 1.440,00 TL'],
]

/** Sentetik, geçerli PNG (truecolor, tek renk). */
export function syntheticPng(width = 16, height = 16): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([length, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor

  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xff)]),
    ),
  )

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Sıkıştırmasız (STORE) ZIP üretir.
 *
 * `adm-zip` yerine elle yazılır ki fixture katmanı bağımlılıksız kalsın ve
 * `node --test` altında ek paket olmadan çalışsın.
 */
export function syntheticZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.content) >>> 0
    const size = entry.content.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method: store
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28) // extra length

    const localBlock = Buffer.concat([local, nameBytes, entry.content])
    locals.push(localBlock)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory header
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42)

    centrals.push(Buffer.concat([central, nameBytes]))
    offset += localBlock.length
  }

  const centralBlock = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBlock.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralBlock, end])
}
