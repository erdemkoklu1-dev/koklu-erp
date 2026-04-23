// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')
pdfjsLib.GlobalWorkerOptions.workerSrc = ''

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

// ── Sabitler ────────────────────────────────────────────────────

const ADRES_STOP = [
  'özelleştirme no', 'ozellestirme no',
  'senaryo',
  'fatura tipi', 'fatura no', 'fatura numarası',
  'web sitesi', 'e-posta', 'eposta',
  'tel:', 'fax:', 'telefon',
  'vergi no', 'vkn', 'tckn',
  'iban', 'banka',
]

const OZET_SATIRLAR = [
  'mal hizmet toplam',
  'toplam iskonto',
  'kdv matrah',
  'hesaplanan kdv',
  'vergiler dahil',
  'ödenecek tutar', 'odenecek tutar',
  'toplam tutar',
  'genel toplam',
  'ara toplam',
  'vergi toplam',
]

const SATICI_STOP_PREFIXES = [
  'adres:', 'tel:', 'faks:', 'fax:', 'vkn:', 'vergi dairesi:',
  'mersis', 'web sitesi:', 'e-posta:', 'eposta:', 'telefon:',
  'ticaret sicil', 'sayın', 'sayin', 'alıcı', 'alici',
  'fatura no', 'fatura numarası', 'özelleştirme', 'ozellestirme',
  'senaryo:', 'fatura tipi',
]

const GIDER_KATEGORILERI: [string, string[], string[]][] = [
  [
    'Yiyecek & İçecek',
    ['MİGROS', 'MIGROS', 'BİM', 'BIM', 'A101', 'ŞOK', 'SOK', 'CARREFOUR', 'GIDA', 'MARKET', 'BAKKAL', 'MANAV'],
    ['EKMEK', 'SÜT', 'SÜTT', 'YOĞURT', 'YOGURT', 'MEYVE', 'SEBZE', 'ET', 'TAVUK', 'GOFRET', 'ÇİKOLATA',
     'CIKOLATA', 'YAĞ', 'UN ', 'ŞEKER', 'KREMA', 'MANGO', 'ARMUT', 'MUZ', 'DOMATES', 'BİBER', 'BIBER',
     'HELVA', 'SU ', 'MANTARI', 'TAHINI', 'CEVİZ', 'CEVIZ', 'GIDA', 'İÇECEK', 'ICECEK'],
  ],
  [
    'Yangın Tüpü Parça & Malzeme',
    ['YANGIN', 'SÖNDÜRME', 'SONDURME'],
    ['YANGIN TÜPÜ', 'YANGIN TUPU', 'GÖVDE', 'GOVDE', 'VANA', 'HORTUM', 'MANOMETRE', 'BOYASIZ', 'TÜPÜ', 'TUPU'],
  ],
  [
    'Gaz & Dolum Malzemesi',
    ['GAZ', 'DEMİR ÇELİK', 'DEMIR CELIK', 'SEMİHLER', 'SEMIHLER'],
    ['AZOT', 'KARBONDİOKSİT', 'KARBONDIOKSIT', 'ARGON', 'CO2', 'DOLUM', 'GAZI', ' GAZ'],
  ],
  [
    'Hammadde & Sanayi Malzemesi',
    ['METAL', 'SAC', 'DEMİR', 'DEMIR', 'ÇELİK', 'CELIK', 'PLASTİK', 'PLASTIK', 'AMBALAJ', 'KİMYA', 'KIMYA'],
    ['SAC', 'BORU', 'PROFİL', 'PROFIL', 'METAL', 'PLASTİK', 'PLASTIK'],
  ],
]

// ── Yardımcı fonksiyonlar ────────────────────────────────────────

function normalize(s: unknown): string {
  return String(s ?? '').toLowerCase().trim()
}

export function parseAmount(s: unknown): number | null {
  if (s == null) return null
  let str = String(s).trim()
  str = str.replace(/[TRYtry₺\s]/g, '')
  str = str.replace(/%/g, '')
  str = str.replace(/[^\d.,]/g, '')
  if (!str) return null

  const dotPos   = str.lastIndexOf('.')
  const commaPos = str.lastIndexOf(',')

  if (dotPos !== -1 && commaPos !== -1) {
    if (dotPos > commaPos) {
      str = str.replace(/,/g, '')
    } else {
      str = str.replace(/\./g, '').replace(',', '.')
    }
  } else if (commaPos !== -1) {
    str = str.replace(',', '.')
  }

  const val = parseFloat(str)
  return isNaN(val) ? null : Math.round(val * 100) / 100
}

export function parseDate(s: unknown): string | null {
  if (!s) return null
  let str = String(s).trim().replace(/­/g, '-').replace(/\xad/g, '-')
  const m = str.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/)
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  return null
}

function findField(text: string, ...patterns: string[]): string | null {
  for (const pat of patterns) {
    const m = text.match(new RegExp(pat, 'iu'))
    if (m && m[1]) {
      return m[1].trim().replace(/­/g, '-').replace(/\xad/g, '-')
    }
  }
  return null
}

function isSiraNo(val: unknown): boolean {
  return /^\d{1,4}$/.test(String(val ?? '').trim())
}

function isOzetSatir(cells: unknown[]): boolean {
  const text = cells.map(c => normalize(c)).filter(Boolean).join(' ')
  return OZET_SATIRLAR.some(kw => text.includes(kw))
}

function isSaticiStopLine(line: string): boolean {
  const low = normalize(line)
  if (SATICI_STOP_PREFIXES.some(kw => low.startsWith(kw))) return true
  if (/^\d/.test(line)) return true
  if (/\b\d{5}\b/.test(line)) return true
  return false
}

// ── Müşteri adresini SAYIN bloğundan çıkar ───────────────────────

function extractMusteriAdres(text: string): [string | null, string | null] {
  const m = text.match(/(?:SAYIN|ALICI)[:\s]*/i)
  if (!m || m.index == null) return [null, null]

  const after = text.slice(m.index + m[0].length)
  const lines = after.split('\n').map(l => l.trim()).filter(Boolean)

  let musteriAdi: string | null = null
  const adresLines: string[] = []

  for (const line of lines) {
    const low = normalize(line)
    const shouldStop = ADRES_STOP.some(kw => low.startsWith(kw) || low.includes(kw + ':'))
    if (shouldStop) break

    if (musteriAdi === null) {
      musteriAdi = line
    } else {
      adresLines.push(line)
    }
    if (/\d{5}/.test(line) || line.includes('/')) break
  }

  return [musteriAdi, adresLines.join(' ').trim() || null]
}

// ── Satıcı bilgisi çıkar (gelen mod) ────────────────────────────

function extractSataciBilgi(text: string): [string | null, string | null] {
  let saticiVkn: string | null = null

  const vknMatches = [...text.matchAll(/VKN\s*[:\s]+(\d{10})/gi)]
  if (vknMatches.length > 0) saticiVkn = vknMatches[0][1]

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const nameParts: string[] = []

  for (const line of lines.slice(0, 25)) {
    if (isSaticiStopLine(line)) break
    if (line.length >= 4 && /[A-ZÇĞİÖŞÜa-zçğışöşü]/.test(line)) {
      nameParts.push(line)
      if (nameParts.length >= 2) break
    }
  }

  const saticiAdi = nameParts.length > 0 ? nameParts.join(' ') : null
  return [saticiAdi, saticiVkn]
}

// ── Bakiye notu ───────────────────────────────────────────────────

function parseBakiyeNotu(text: string): string | null {
  const m = text.match(/Bakiye(?:niz)?\s*[:\s]+([\d.,]+)\s*TRL?\s*(Alacak|Bor[cç]|ALACAK|BORÇ)?/i)
  if (m) {
    const tip = (m[2] || '').trim()
    return `Bakiye: ${m[1]} TRL ${tip}`.trim()
  }
  return null
}

// ── Gider kategorisi ─────────────────────────────────────────────

function detectGiderKategorisi(saticiAdi: string | null, kalemler: KalemItem[]): string {
  const s = (saticiAdi || '').toUpperCase()
  const allDesc = kalemler.map(k => k.urun_adi || '').join(' ').toUpperCase()

  for (const [kategori, saticiKws, urunKws] of GIDER_KATEGORILERI) {
    if (saticiKws.some(kw => s.includes(kw))) return kategori
    if (urunKws.length > 0 && urunKws.some(kw => allDesc.includes(kw))) return kategori
  }
  return 'Genel Gider'
}

// ── Kalem tipleri ─────────────────────────────────────────────────

export interface KalemItem {
  urun_adi: string
  miktar: number
  birim: string
  birim_fiyat: number
  iskonto_orani: number
  iskonto_tutari: number
  kdv_orani: number
  kdv_tutari: number
  satir_toplam: number
}

// ── Hidropres metin bazlı kalem çıkarma ─────────────────────────

function extractItemsHidropres(text: string): KalemItem[] {
  const items: KalemItem[] = []
  const pattern = /^(\d{1,3})\s+(.+?)\s+(\d+[,.]?\d*)\s+(Adet|adet|KG|kg|Lt|lt|Mt|mt|Ton|ton|Kutu|kutu|Paket|paket)\s+([\d.,]+)\s*TL/gim

  for (const m of text.matchAll(pattern)) {
    const desc = m[2].trim()
    if (desc.length < 2 || isOzetSatir([desc])) continue

    const qty  = parseAmount(m[3]) ?? 1.0
    const unit = m[4].trim()
    const up   = parseAmount(m[5]) ?? 0.0

    const kdvM = m[0].match(/%\s*([\d.,]+)/)
    let kr = kdvM ? (parseAmount(kdvM[1]) ?? 20.0) : 20.0
    if (kr > 100) kr = 20.0

    const net = qty * up
    const ka  = Math.round(net * kr / 100 * 100) / 100
    const lt  = Math.round((net + ka) * 100) / 100

    items.push({
      urun_adi: desc, miktar: qty, birim: unit,
      birim_fiyat: Math.round(up * 100) / 100,
      iskonto_orani: 0, iskonto_tutari: 0,
      kdv_orani: kr, kdv_tutari: ka, satir_toplam: lt,
    })
  }
  return items
}

// ── Semihler tek satır parse ─────────────────────────────────────

function extractItemsSemihler(text: string): KalemItem[] {
  const items: KalemItem[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const headM = trimmed.match(/^(\d{1,3})\s+/)
    if (!headM) continue

    let rest = trimmed.slice(headM[0].length)
    rest = rest.replace(/^[A-Z]{1,5}\d{3,}\s+/, '')

    const birimM = rest.match(/([\d.,]+)\s+(Adet|adet|KG|kg|Lt|lt|Mt|mt|Ton|ton|Kutu|kutu|Paket|paket)\s+/i)
    if (!birimM) continue

    const desc = rest.slice(0, birimM.index!).trim()
    if (desc.length < 2 || isOzetSatir([desc])) continue

    const qty  = parseAmount(birimM[1]) ?? 1.0
    const unit = birimM[2].trim()

    const afterUnit = rest.slice(birimM.index! + birimM[0].length)
    const upM = afterUnit.match(/([\d.,]+)\s*TL/i)
    const up  = upM ? (parseAmount(upM[1]) ?? 0.0) : 0.0

    const kdvM = trimmed.match(/%\s*([\d.,]+)/)
    let kr = kdvM ? (parseAmount(kdvM[1]) ?? 20.0) : 20.0
    if (kr > 100) kr = 20.0

    const net = qty * up
    const ka  = Math.round(net * kr / 100 * 100) / 100

    items.push({
      urun_adi: desc, miktar: qty, birim: unit,
      birim_fiyat: Math.round(up * 100) / 100,
      iskonto_orani: 0, iskonto_tutari: 0,
      kdv_orani: kr, kdv_tutari: ka,
      satir_toplam: Math.round((net + ka) * 100) / 100,
    })
  }
  return items
}

// ── Genel metin bazlı kalem çıkarma (fallback) ──────────────────

function extractItemsFromText(text: string): KalemItem[] {
  const hidropres = extractItemsHidropres(text)
  if (hidropres.length > 0) return hidropres

  const semihler = extractItemsSemihler(text)
  if (semihler.length > 0) return semihler

  const items: KalemItem[] = []
  const pattern = /^\s*(\d{1,3})\s+(.+?)\s{2,}([\d.,]+)\s+(adet|kg|lt|mt|m2|m3|ton|kutu|paket|hizmet|saat|gün)\s+([\d.,]+)/gim

  for (const m of text.matchAll(pattern)) {
    const desc = m[2].trim()
    if (desc.length < 2 || isOzetSatir([desc])) continue

    const qty  = parseAmount(m[3]) ?? 1.0
    const unit = m[4].trim()
    const up   = parseAmount(m[5]) ?? 0.0
    const net  = qty * up
    const ka   = Math.round(net * 0.20 * 100) / 100

    items.push({
      urun_adi: desc, miktar: qty, birim: unit,
      birim_fiyat: Math.round(up * 100) / 100,
      iskonto_orani: 0, iskonto_tutari: 0,
      kdv_orani: 20, kdv_tutari: ka,
      satir_toplam: Math.round((net + ka) * 100) / 100,
    })
  }
  return items
}

// ── Migros toplam tutarı metinden çek ────────────────────────────

function extractMigrosTotal(text: string): number | null {
  const faturaM = text.match(/FATURA\s*TOPLAM[AI]\s*[:\s]+([\d.,]+)/i)
  if (faturaM) return parseAmount(faturaM[1])
  const araM = text.match(/ARA\s*TOPLAM\s*[:\s]+([\d.,]+)/i)
  if (araM) return parseAmount(araM[1])
  return null
}

// ── Parse sonuç tipleri ──────────────────────────────────────────

export interface ParseResult {
  filename: string
  fatura_no: string | null
  fatura_tarihi: string | null
  vade_tarihi: string | null
  senaryo: string | null
  musteri_adi: string | null
  musteri_vkn: string | null
  musteri_adresi: string | null
  kdv_matrahi: number | null
  kdv_tutari: number | null
  odenecek_tutar: number | null
  kalemler: KalemItem[]
  banka_bilgileri: { iban: string; banka_adi: string | null }[]
  hata: string | null
  // gelen mod ek alanları
  satici_adi?: string | null
  satici_vkn?: string | null
  gider_kategorisi?: string
  bakiye_notu?: string | null
}

// ── Ana parse fonksiyonu ─────────────────────────────────────────

export async function parsePdfBuffer(
  buffer: Buffer,
  filename: string,
  mode: 'satis' | 'gelen' = 'satis'
): Promise<ParseResult> {
  const isGelen = mode === 'gelen'
  const result: ParseResult = {
    filename,
    fatura_no: null,
    fatura_tarihi: null,
    vade_tarihi: null,
    senaryo: null,
    musteri_adi: null,
    musteri_vkn: null,
    musteri_adresi: null,
    kdv_matrahi: null,
    kdv_tutari: null,
    odenecek_tutar: null,
    kalemler: [],
    banka_bilgileri: [],
    hata: null,
  }

  if (isGelen) {
    result.satici_adi = null
    result.satici_vkn = null
    result.gider_kategorisi = 'Genel Gider'
    result.bakiye_notu = null
  }

  try {
    let text = await extractTextFromPdf(buffer)
    text = text.replace(/­/g, '-').replace(/\xad/g, '-')

    // ── Fatura No ────────────────────────────────────────────────
    result.fatura_no = findField(
      text,
      'Fatura\\s+No[:\\s]+([A-Z0-9\\-]+)',
      'FATURA\\s+NO[:\\s]+([A-Z0-9\\-]+)',
      'No\\s*:\\s*([A-Z]{2,}[\\-]\\d+[\\-]\\d+)',
    )

    // ── Tarihler ─────────────────────────────────────────────────
    result.fatura_tarihi = parseDate(findField(
      text,
      'Fatura\\s+Tarihi[:\\s]+([\\d.\\-/]+)',
      'FATURA\\s+TARİHİ[:\\s]+([\\d.\\-/]+)',
      'Düzenleme\\s+Tarihi[:\\s]+([\\d.\\-/]+)',
    ))
    result.vade_tarihi = parseDate(findField(
      text,
      'Son\\s+[ÖO]deme\\s+Tarihi[:\\s]+([\\d.\\-/]+)',
      'Vade\\s+Tarihi[:\\s]+([\\d.\\-/]+)',
      'VADESİ[:\\s]+([\\d.\\-/]+)',
    ))

    // ── Senaryo ──────────────────────────────────────────────────
    if (/TEMELFATURA/i.test(text)) result.senaryo = 'TEMELFATURA'
    else if (/T[İI]CAR[İI]FATURA/i.test(text)) result.senaryo = 'TICARIFATURA'

    // ── Müşteri / Satıcı bilgisi ──────────────────────────────────
    if (isGelen) {
      const [saticiAdi, saticiVkn] = extractSataciBilgi(text)
      result.satici_adi = saticiAdi
      result.satici_vkn = saticiVkn
      const [musteriAdi, musteriAdresi] = extractMusteriAdres(text)
      result.musteri_adi    = musteriAdi
      result.musteri_adresi = musteriAdresi
    } else {
      const [musteriAdi, musteriAdresi] = extractMusteriAdres(text)
      result.musteri_adi    = musteriAdi
      result.musteri_adresi = musteriAdresi

      const vkns = [...text.matchAll(/VKN\s*[:\s]+(\d{10})/gi)].map(m => m[1])
      if (vkns.length >= 2) result.musteri_vkn = vkns[1]
      else if (vkns.length === 1) result.musteri_vkn = vkns[0]

      if (!result.musteri_vkn) {
        const tckns = [...text.matchAll(/(?:T\.?C\.?\s*(?:Kimlik\s*No)?|TCKN)\s*[:\s]+(\d{11})/gi)].map(m => m[1])
        const tckns2 = tckns.length > 0 ? tckns : [...text.matchAll(/\b(\d{11})\b/g)].map(m => m[1])
        if (tckns2.length > 0) result.musteri_vkn = tckns2[tckns2.length - 1]
      }
    }

    // ── Finansal tutarlar ─────────────────────────────────────────
    result.kdv_matrahi = parseAmount(findField(
      text,
      'KDV\\s+Matrah[ıi][:\\s]+([\\d.,]+)',
      'Vergi\\s+Matrah[ıi][:\\s]+([\\d.,]+)',
      'Matrah[:\\s]+([\\d.,]+)',
    ))
    result.kdv_tutari = parseAmount(findField(
      text,
      'Hesaplanan\\s+KDV[:\\s]+([\\d.,]+)',
      'KDV\\s+Tutar[ıi][:\\s]+([\\d.,]+)',
      'Toplam\\s+KDV[:\\s]+([\\d.,]+)',
    ))
    result.odenecek_tutar = parseAmount(findField(
      text,
      '[ÖO]denecek\\s+Tutar[:\\s]+([\\d.,]+)',
      'Vergiler\\s+Dahil\\s+Toplam[:\\s]+([\\d.,]+)',
      'Genel\\s+Toplam[:\\s]+([\\d.,]+)',
      'GENEL\\s+TOPLAM[:\\s]+([\\d.,]+)',
    ))
    if (result.odenecek_tutar === null) {
      result.odenecek_tutar = extractMigrosTotal(text)
    }

    // ── Kalemler ─────────────────────────────────────────────────
    result.kalemler = extractItemsFromText(text)

    // ── IBAN ─────────────────────────────────────────────────────
    const ibans = [...new Set(
      [...text.matchAll(/TR\s*\d{2}\s*(?:\d{4}\s*){5}\d{2}/g)]
        .map(m => m[0].replace(/\s/g, ''))
    )]
    const bankaAdlari = [...text.matchAll(
      /((?:Ziraat|İş\s*Bankası|Garanti|Akbank|Yapı\s*Kredi|Halkbank|Vakıfbank|Denizbank|QNB|ING|TEB|Şekerbank|HSBC|Odeabank|Fibabanka|Albaraka|Kuveyt\s*Türk|Türkiye\s*Finans)[^\n]*)/gi
    )].map(m => m[1])

    result.banka_bilgileri = ibans.map((iban, i) => ({
      iban,
      banka_adi: bankaAdlari[i] ?? null,
    }))

    // ── Gelen fatura ek alanları ──────────────────────────────────
    if (isGelen) {
      result.gider_kategorisi = detectGiderKategorisi(result.satici_adi ?? null, result.kalemler)
      result.bakiye_notu = parseBakiyeNotu(text)
    }
  } catch (err: unknown) {
    result.hata = err instanceof Error ? err.message : String(err)
  }

  return result
}
