import { NextRequest, NextResponse } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

const SKIP_PREFIXES = [
  'KDV', 'TOPLAM', 'GENEL', 'ARA TOPLAM', 'NOT:', 'TİCARİ',
  'TICARI', 'SAYIN', 'TEKLİF', 'TEKLIF', 'TARİH', 'TARIH',
  'GEÇERLİLİK', 'GECERLILIK', 'OPSIYON', 'ÖDEME', 'ODEME',
  'TESLİMAT', 'TESLIMAT', 'YALNIZ', 'İMZA', 'IMZA',
  'SATICI', 'ALICI', 'KÖKLÜ', 'KOKLU', 'YANGIN',
  'S.NO', 'SIRA', 'ADET', 'MAL', 'B.FİYAT', 'B.FIYAT', 'FİYAT',
]

function parseTutar(s: unknown): number {
  if (!s) return 0
  let str = String(s).trim().replace(/[₺$€TL]/g, '').trim()
  if (!str || str === '-') return 0
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else {
    const parts = str.split('.')
    if (parts.length === 2 && parts[1].length !== 3) {
      // already decimal dot
    } else {
      str = str.replace(/\./g, '')
    }
  }
  return parseFloat(str) || 0
}

function shouldSkip(text: unknown): boolean {
  if (!text) return true
  const upper = String(text).trim().toUpperCase()
  return SKIP_PREFIXES.some(prefix => upper.startsWith(prefix))
}

interface TeklifKalem {
  sira: number
  adet: number
  aciklama: string
  birimFiyat: number
  toplam: number
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false })
  const pdf = await loadingTask.promise
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = (textContent.items as { str: string }[])
      .map(item => item.str)
      .join(' ')
    fullText += pageText + '\n'
  }
  return fullText
}

function parseKalemlerFromText(text: string): TeklifKalem[] {
  const results: TeklifKalem[] = []
  let sira = 1

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || shouldSkip(line)) continue

    const m = line.match(
      /^(\d+)[.\s]+(\d+(?:[.,]\d+)?)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s+(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)$/
    )
    if (m) {
      const aciklama = m[3].trim()
      if (shouldSkip(aciklama)) continue
      results.push({
        sira,
        adet: parseTutar(m[2]),
        aciklama,
        birimFiyat: parseTutar(m[4]),
        toplam: parseTutar(m[5]),
      })
      sira++
    }
  }
  return results
}

// Satırları space ile birleştirdiğimiz için tablo tespiti metin üzerinden yapılır.
// Kalem satırı tespiti: başında sıra no, içinde sayısal değerler var.
function parseKalemlerFromLines(text: string): TeklifKalem[] {
  const results: TeklifKalem[] = []
  let sira = 1

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    if (shouldSkip(line)) continue

    // Sayıları çıkar
    const tokens = line.split(/\s+/)
    const firstIsNum = /^\d+$/.test(tokens[0])
    if (!firstIsNum) continue

    // Fiyat benzeri token'ları bul
    const amounts = tokens
      .map(t => parseTutar(t))
      .filter(v => v > 0)

    if (amounts.length < 2) continue

    // Açıklamayı: sayısal olmayan token'lardan oluştur
    const descTokens = tokens.slice(1).filter(t => {
      const v = parseTutar(t)
      return v === 0 || isNaN(v)
    })
    const aciklama = descTokens.join(' ').trim()
    if (!aciklama || shouldSkip(aciklama)) continue

    const birimFiyat = amounts[amounts.length - 2] ?? 0
    const toplam = amounts[amounts.length - 1] ?? 0
    const adet = amounts.length > 2 ? amounts[0] : 1

    results.push({ sira, adet, aciklama, birimFiyat, toplam })
    sira++
  }
  return results
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Yalnızca PDF dosyası yükleyebilirsiniz' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractTextFromPdf(buffer)

    let kalemler = parseKalemlerFromText(text)
    if (kalemler.length === 0) {
      kalemler = parseKalemlerFromLines(text)
    }

    return NextResponse.json({ items: kalemler })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
