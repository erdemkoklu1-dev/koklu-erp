import { NextRequest, NextResponse } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

export interface ParsedKalem {
  sira_no: number
  aciklama: string
  miktar: number
  birim: string
  birim_fiyat: number
  toplam: number
}

export interface ParsedTeklif {
  tedarikci: string
  tarih: string
  ref_no: string
  para_birimi: string
  kalemler: ParsedKalem[]
  ara_toplam: number
  iskonto_toplam: number
  genel_toplam: number
}

// ── Tipler ────────────────────────────────────────────────────────────────────
type PdfItem = { text: string; x: number; y: number }
type PdfRow  = PdfItem[]

// ── Sabitler ──────────────────────────────────────────────────────────────────
const BIRIM_RE = /^(Adet|Set|Kg|Metre|Takım|Kutu|Paket|Lt|Hizmet)$/i
const PARA_BIRIMI_RE = /^(EUR|USD|TL|TRY)$/i

// Kalem bölümünü bitiren başlıklar
const STOP_PATTERNS = [
  /GENEL\s*T[İI]CAR[İI]\s*[SŞ]ARTLAR/i,
  /T[İI]CAR[İI]\s*[SŞ]ARTLAR/i,
  /GENEL\s*TOPLAM/i,
  /Sayg[ıi]lar[ıi]m[ıi]zla/i,
  /NOTLAR?\s*:/i,
  /OPSIYON\s*:/i,
  /ÖDEMEŞEKLİ/i,
]

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────
function parseTutar(s: string): number {
  let str = s.trim().replace(/[₺$€]/g, '').trim()
  if (!str || str === '-') return 0
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.')
  } else {
    const parts = str.split('.')
    if (parts.length !== 2 || parts[1].length === 3) str = str.replace(/\./g, '')
  }
  return parseFloat(str) || 0
}

const TERMS_STOP = [
  'opsiyon', 'geçerlidir', 'geçersizdir', 'garanti :', 'garanti:',
  'tesisat için', 'periyodik', 'ücretlidir', 'ücret öden', 'imalat hata',
]
const TRAILING_JUNK = /\s+(Set|Adet|Kg|Metre|Takım|Kutu|Paket|Lt|Hizmet|EUR|USD|TRY|TL)\s*$/i

function cleanAciklama(raw: string): string {
  let s = raw.trim()
  const lower = s.toLowerCase()
  let cutIdx = s.length
  for (const stop of TERMS_STOP) {
    const idx = lower.indexOf(stop)
    if (idx > 0 && idx < cutIdx) cutIdx = idx
  }
  s = s.slice(0, cutIdx).replace(TRAILING_JUNK, '').trim()
  if (s.length > 120) s = s.slice(0, 120).trim()
  return s
}

// ── PDF: tüm text item'larını koordinatlarıyla çıkar ─────────────────────────
async function extractPdfItems(file: File): Promise<PdfItem[]> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  })
  const pdf = await loadingTask.promise
  const allItems: PdfItem[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const textContent = await page.getTextContent()
    for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
      const text = item.str.trim()
      if (!text) continue
      allItems.push({
        text,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
      })
    }
  }
  return allItems
}

// Y koordinatına göre satır grupla (tolerance px tolerans)
function groupByY(items: PdfItem[], tolerance = 3): PdfRow[] {
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const rows: PdfRow[] = []
  let currentRow: PdfItem[] = []
  let lastY = sorted[0]?.y ?? 0

  for (const item of sorted) {
    if (Math.abs(item.y - lastY) > tolerance) {
      if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.x - b.x))
      currentRow = []
      lastY = item.y
    }
    currentRow.push(item)
  }
  if (currentRow.length > 0) rows.push(currentRow.sort((a, b) => a.x - b.x))
  return rows
}

// Header satırını bul: "No", "Açıklama", "Miktar" içeren satır
function findHeaderRow(rows: PdfRow[]): { index: number; cols: Record<string, number> } {
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i].map(r => r.text).join(' ').toLowerCase()
    const hasNo       = /\bno\.?\b/.test(rowStr)
    const hasAciklama = rowStr.includes('açıklama') || rowStr.includes('aciklama') || rowStr.includes('tanım')
    const hasMiktar   = rowStr.includes('miktar') || rowStr.includes('qty')

    if (hasNo && hasAciklama && hasMiktar) {
      const cols: Record<string, number> = {}
      for (const item of rows[i]) {
        const t = item.text.toLowerCase()
        if (/^no\.?$/.test(t) || t === 'sıra')                               cols.no         = item.x
        if (t.includes('açıklama') || t.includes('aciklama') || t === 'tanım') cols.aciklama   = item.x
        if (t.includes('miktar') || t === 'qty')                               cols.miktar     = item.x
        if ((t === 'birim' || t === 'br' || t === 'unit') && !t.includes('fiyat')) cols.birim = item.x
        if (t.includes('fiyat') || t.includes('b.fiyat'))                     cols.birimFiyat = item.x
        if (t.includes('tutar') || (t.includes('toplam') && !t.includes('genel'))) cols.tutar = item.x
      }
      return { index: i, cols }
    }
  }
  return { index: -1, cols: {} }
}

// Koordinat bazlı kalem satırlarını parse et
function parseKalemRows(
  rows: PdfRow[],
  headerIdx: number,
  cols: Record<string, number>,
  paraBirimi: string
): ParsedKalem[] {
  const kalemler: ParsedKalem[] = []

  // Kolon sınırları (20px tolerans)
  const aciklamaStart = (cols.no ?? 50) + 15
  const aciklamaEnd   = (cols.miktar ?? cols.birimFiyat ?? 400) - 10
  const miktarStart   = (cols.miktar ?? aciklamaEnd + 10) - 20
  const birimStart    = (cols.birim ?? miktarStart + 35) - 20
  const fiyatStart    = (cols.birimFiyat ?? birimStart + 35) - 20
  const tutarStart    = (cols.tutar ?? fiyatStart + 60) - 20

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row    = rows[i]
    const rowStr = row.map(r => r.text).join(' ')

    // Ticari şartlar veya genel toplam → dur
    if (STOP_PATTERNS.some(p => p.test(rowStr))) break

    // Bölüm başlığı (A. Mekanik Ekipmanlar vb.) → atla
    if (row.length <= 3 && /^[A-ZÇĞİÖŞÜ]/.test(row[0]?.text ?? '') && !rowStr.match(/\d+[.,]\d{2}/)) continue

    // İskonto / ara toplam satırı → atla
    if (/iskonto|ara\s*toplam/i.test(rowStr) && !/^\d+\s/.test(rowStr)) continue

    // İlk kolon: sıra numarası olmalı
    const siraNo = parseInt(row[0]?.text ?? '')
    if (isNaN(siraNo) || siraNo < 1 || siraNo > 999) continue

    // x pozisyonuna göre kalem değerlerini çıkar
    const aciklamaItems: string[] = []
    let miktar    = 0
    let birim     = 'Adet'
    let birimFiyat = 0
    let tutar     = 0

    for (const item of row.slice(1)) {
      const t = item.text

      if (item.x >= aciklamaStart && item.x < aciklamaEnd) {
        // Açıklama sütunu: birim/para birimi/rakam değilse ekle
        if (!BIRIM_RE.test(t) && !PARA_BIRIMI_RE.test(t) && !(/^[\d.,]+$/.test(t))) {
          aciklamaItems.push(t)
        }
      } else if (item.x >= miktarStart && item.x < birimStart) {
        if (!BIRIM_RE.test(t)) miktar = parseTutar(t) || miktar
      } else if (item.x >= birimStart && item.x < fiyatStart) {
        if (BIRIM_RE.test(t)) birim = t
      } else if (item.x >= fiyatStart && item.x < tutarStart) {
        if (/[\d.,]/.test(t) && !BIRIM_RE.test(t) && !PARA_BIRIMI_RE.test(t)) birimFiyat = parseTutar(t)
      } else if (item.x >= tutarStart) {
        if (/[\d.,]/.test(t) && !BIRIM_RE.test(t) && !PARA_BIRIMI_RE.test(t)) tutar = parseTutar(t)
        // para birimi belirleme
        if (PARA_BIRIMI_RE.test(t)) {
          if (t.toUpperCase() === 'EUR') paraBirimi = 'EUR'
          else if (t.toUpperCase() === 'USD') paraBirimi = 'USD'
        }
      }
    }

    const aciklama = cleanAciklama(aciklamaItems.join(' '))
    if (!aciklama) continue

    kalemler.push({
      sira_no:    siraNo,
      aciklama,
      miktar:     miktar || 1,
      birim,
      birim_fiyat: birimFiyat,
      toplam:     tutar || Math.round((miktar || 1) * birimFiyat * 100) / 100,
    })
  }

  return kalemler
}

// Tüm metinden para birimini belirle
function detectParaBirimi(items: PdfItem[]): string {
  const allText = items.map(i => i.text).join(' ')
  if (allText.includes('EUR')) return 'EUR'
  if (allText.includes('USD') || allText.includes('$')) return 'USD'
  return 'TRY'
}

// Genel toplam bul
function findGenelToplam(items: PdfItem[]): number {
  const allText = items.map(i => i.text).join(' ')
  const m = allText.match(/GENEL\s*TOPLAM[^0-9]*([\d.,]+)/i)
  return m ? parseTutar(m[1]) : 0
}

// ── Ana PDF parse fonksiyonu ───────────────────────────────────────────────────
async function parsePdfTeklif(file: File): Promise<ParsedTeklif> {
  const pdfItems = await extractPdfItems(file)
  const paraBirimi = detectParaBirimi(pdfItems)
  const genelToplam = findGenelToplam(pdfItems)

  // Önce Claude dene (varsa)
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    // Claude'a sadece kalem tablosunu gönder (ticari şartlar kesilmiş)
    const rows  = groupByY(pdfItems)
    const lines = rows.map(r => r.map(i => i.text).join('\t'))
    const tableEnd = lines.findIndex(l => STOP_PATTERNS.some(p => p.test(l)))
    const tableText = (tableEnd > 0 ? lines.slice(0, tableEnd) : lines).join('\n')

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: `Tedarikçi teklif tablosu verilecek. Ürün kalemlerini çıkar ve SADECE JSON döndür:
{
  "tedarikci": "firma adı veya boş string",
  "tarih": "YYYY-MM-DD veya boş string",
  "ref_no": "boş string",
  "para_birimi": "TRY veya EUR veya USD",
  "kalemler": [{"sira_no":1,"aciklama":"...","miktar":1,"birim":"Adet","birim_fiyat":0,"toplam":0}],
  "ara_toplam": 0, "iskonto_toplam": 0, "genel_toplam": 0
}
KESİN KURALLAR:
- aciklama: SADECE ürün/hizmet adı. Birim (Set/Adet/Kg), para birimi (EUR/USD), fiyat rakamları, garanti/opsiyon/tesisat/şartname metinleri ASLA ekleme.
- Ticari şartlar (Opsiyon, Garanti, Ödeme, Teslimat, Saygılarımızla) kalem DEĞİL — ekleme.
- Bölüm başlıkları (A. Mekanik, B. Elektronik) kalem DEĞİL — ekleme.
- Toplam/İskonto satırları kalem DEĞİL — ekleme.
- aciklama max 100 karakter.
- birim: Adet/Set/Kg/Metre/Takım/Kutu/Paket/Lt/Hizmet
- Türkçe sayı: 2.100,00 → 2100`,
      messages: [{
        role: 'user',
        content: `PDF teklif tablosundan sadece ürün kalemlerini çıkar:\n\n${tableText.slice(0, 8000)}`,
      }],
    })

    const raw   = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as ParsedTeklif
      if (Array.isArray(parsed.kalemler) && parsed.kalemler.length > 0) {
        const clean = parsed.kalemler
          .map((k, i) => ({
            sira_no:    Number(k.sira_no) || i + 1,
            aciklama:   cleanAciklama(String(k.aciklama || '')),
            miktar:     Number(k.miktar) || 1,
            birim:      String(k.birim || 'Adet'),
            birim_fiyat: Number(k.birim_fiyat) || 0,
            toplam:     Number(k.toplam) || Math.round((Number(k.miktar)||1)*(Number(k.birim_fiyat)||0)*100)/100,
          }))
          .filter(k => k.aciklama)

        const araToplam = clean.reduce((s, k) => s + k.toplam, 0)
        return {
          tedarikci:     String(parsed.tedarikci || ''),
          tarih:         String(parsed.tarih || ''),
          ref_no:        String(parsed.ref_no || ''),
          para_birimi:   ['TRY','EUR','USD'].includes(parsed.para_birimi) ? parsed.para_birimi : paraBirimi,
          kalemler:      clean,
          ara_toplam:    Number(parsed.ara_toplam) || araToplam,
          iskonto_toplam: 0,
          genel_toplam:  Number(parsed.genel_toplam) || genelToplam || araToplam,
        }
      }
    }
  } catch {
    // Claude yok veya hata — koordinat tabanlı parse'a düş
  }

  // Koordinat tabanlı fallback
  return coordBasedParse(pdfItems, paraBirimi, genelToplam)
}

function coordBasedParse(items: PdfItem[], paraBirimi: string, genelToplam: number): ParsedTeklif {
  const rows = groupByY(items)
  const { index: headerIdx, cols } = findHeaderRow(rows)

  let kalemler: ParsedKalem[]

  if (headerIdx >= 0 && cols.aciklama !== undefined) {
    // Kolon pozisyonları bulundu — koordinat bazlı parse
    let curParaBirimi = paraBirimi
    kalemler = parseKalemRows(rows, headerIdx, cols, curParaBirimi)
  } else {
    // Header bulunamadı — basit metin tabanlı parse
    kalemler = simpleTextParse(rows, paraBirimi)
  }

  const araToplam = kalemler.reduce((s, k) => s + k.toplam, 0)
  return {
    tedarikci: '',
    tarih: '',
    ref_no: '',
    para_birimi: paraBirimi,
    kalemler,
    ara_toplam: araToplam,
    iskonto_toplam: 0,
    genel_toplam: genelToplam || araToplam,
  }
}

// Basit metin tabanlı parse (header bulunamazsa)
function simpleTextParse(rows: PdfRow[], paraBirimi: string): ParsedKalem[] {
  const kalemler: ParsedKalem[] = []
  let inTable = false

  for (const row of rows) {
    const rowStr = row.map(r => r.text).join(' ')

    // Ticari şartlar veya toplam → dur
    if (STOP_PATTERNS.some(p => p.test(rowStr))) break

    // Header satırı → tabloya girdik
    if (/\bno\.?\b.*açıklama.*miktar/i.test(rowStr)) { inTable = true; continue }
    if (!inTable) continue

    // İskonto/toplam satırlarını atla
    if (/iskonto|ara\s*toplam/i.test(rowStr) && !/^\d+\s/.test(rowStr)) continue

    // Bölüm başlığı → atla
    if (row.length <= 3 && /^[A-ZÇĞİÖŞÜ]/.test(row[0]?.text ?? '') && !rowStr.match(/\d+[.,]\d{2}/)) continue

    // Kalem satırı: sıra no ile başlıyor
    const siraNo = parseInt(row[0]?.text ?? '')
    if (isNaN(siraNo) || siraNo < 1 || siraNo > 999) continue

    const rest    = row.slice(1).map(r => r.text).join(' ')
    const numbers = row.map(r => parseTutar(r.text)).filter(v => v > 0)
    const birim   = row.find(r => BIRIM_RE.test(r.text))?.text ?? 'Adet'

    // Açıklama: birim/para birimi/sayı olmayan kelimeler
    const aciklamaTokens = row.slice(1)
      .filter(r => !BIRIM_RE.test(r.text) && !PARA_BIRIMI_RE.test(r.text) && !/^[\d.,]+$/.test(r.text))
      .map(r => r.text)
    const aciklama = cleanAciklama(aciklamaTokens.join(' '))
    if (!aciklama) continue

    const birimFiyat = numbers.length >= 2 ? numbers[numbers.length - 2] : 0
    const tutar      = numbers.length >= 1 ? numbers[numbers.length - 1] : 0

    if (paraBirimi === 'TRY' && rest.includes('EUR')) paraBirimi = 'EUR'

    kalemler.push({
      sira_no: siraNo,
      aciklama,
      miktar:     numbers.length >= 3 ? numbers[0] : 1,
      birim,
      birim_fiyat: birimFiyat,
      toplam:     tutar,
    })
  }

  return kalemler
}

// ── Ana POST handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Dosya yüklenmedi' }, { status: 400 })
  }

  const fileName = file.name.toLowerCase()

  try {
    let result: ParsedTeklif
    if (fileName.endsWith('.pdf')) {
      result = await parsePdfTeklif(file)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      result = await parseExcelTeklif(file)
    } else {
      return NextResponse.json(
        { error: 'Desteklenmeyen dosya formatı. PDF veya Excel yükleyin.' },
        { status: 400 }
      )
    }
    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Excel parse ───────────────────────────────────────────────────────────────
async function parseExcelTeklif(file: File): Promise<ParsedTeklif> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][]

  const kalemler: ParsedKalem[] = []
  const fullText = rows.map(r => (r as unknown[])?.join(' ') ?? '').join(' ')

  let paraBirimi = 'TRY'
  if (fullText.includes('EUR')) paraBirimi = 'EUR'
  else if (fullText.includes('USD') || fullText.includes('$')) paraBirimi = 'USD'

  let headerRowIndex = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const rowStr = (rows[i] as unknown[])?.join(' ')?.toLowerCase() || ''
    if (
      (rowStr.includes('no') || rowStr.includes('sıra')) &&
      (rowStr.includes('açıklama') || rowStr.includes('ürün') || rowStr.includes('mal')) &&
      (rowStr.includes('miktar') || rowStr.includes('adet'))
    ) { headerRowIndex = i; break }
  }

  const startRow  = headerRowIndex >= 0 ? headerRowIndex + 1 : 0
  const parseNum  = (val: unknown): number => parseFloat(String(val ?? '').replace(/\./g, '').replace(',', '.')) || 0

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    if (!row || row.length < 3) continue
    const rowStr = row.join(' ').toLowerCase()
    if (STOP_PATTERNS.some(p => p.test(row.join(' ')))) break
    if (rowStr.includes('toplam') && !rowStr.includes('ara')) continue
    const siraNo = parseInt(String(row[0]))
    if (isNaN(siraNo)) continue
    const aciklama = cleanAciklama(String(row[1] || ''))
    if (!aciklama) continue
    kalemler.push({
      sira_no:    siraNo,
      aciklama,
      miktar:     parseFloat(String(row[2])) || 1,
      birim:      String(row[3] || 'Adet').trim(),
      birim_fiyat: parseNum(row[4]),
      toplam:     parseNum(row[5]),
    })
  }

  const araToplam = kalemler.reduce((s, k) => s + k.toplam, 0)
  return { tedarikci: '', tarih: '', ref_no: '', para_birimi: paraBirimi, kalemler, ara_toplam: araToplam, iskonto_toplam: 0, genel_toplam: araToplam }
}
