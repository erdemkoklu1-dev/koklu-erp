/**
 * Fatura alan normalizasyonu (GOREV.md Faz C-7.3).
 *
 * Kural: normalizasyon **şüpheli değeri sessizce sıfıra çevirmez**. Parse edilemeyen
 * zorunlu alan `null` + açık uyarı döner; çağıran bunu validation hatasına çevirir.
 *
 * Bağımlılıksızdır; `node --test` altında doğrudan test edilir.
 */

export interface NormalizationIssue {
  field: string
  code: string
  message: string
}

export type Normalized<T> = { value: T | null; issue?: NormalizationIssue }

function issue(field: string, code: string, message: string): NormalizationIssue {
  return { field, code, message }
}

// ─── Para / sayı ───────────────────────────────────────────────────────────────

/**
 * `1.234,56` (TR), `1,234.56` (EN), `1234.56`, `1 234,56`, `%20`, `1.234,56 TL`
 * biçimlerini tek merkezde sayıya çevirir.
 *
 * Ayraç belirsizse (ör. `1,234`) karar kuralı:
 *  - son ayraçtan sonra tam 3 hane varsa ve başka ayraç yoksa ⇒ binlik ayracı
 *  - aksi halde ⇒ ondalık ayracı
 */
export function parseAmount(raw: unknown, field = 'amount'): Normalized<number> {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return { value: null, issue: issue(field, 'AMOUNT_NOT_FINITE', 'Sayısal değer geçersiz.') }
    }
    return { value: raw }
  }
  if (typeof raw !== 'string') {
    return { value: null, issue: issue(field, 'AMOUNT_MISSING', 'Tutar okunamadı.') }
  }

  let text = raw.trim()
  if (text === '') {
    return { value: null, issue: issue(field, 'AMOUNT_MISSING', 'Tutar boş.') }
  }

  // Para birimi sembolleri, yüzde işareti ve boşluk ayraçları temizlenir.
  text = text
    .replace(/[₺$€]/g, '')
    .replace(/\b(TRY|TL|USD|EUR|EURO)\b/gi, '')
    .replace(/%/g, '')
    .replace(/ /g, ' ')
    .trim()

  // Muhasebe negatifi: (1.234,56)
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1).trim()
  }
  if (text.startsWith('-')) {
    negative = true
    text = text.slice(1).trim()
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim()
  }

  // Binlik ayracı olarak kullanılan boşlukları kaldır
  text = text.replace(/\s/g, '')

  if (!/^[\d.,]+$/.test(text)) {
    return { value: null, issue: issue(field, 'AMOUNT_UNPARSEABLE', `Tutar biçimi tanınmadı.`) }
  }

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  let decimalSeparator: ',' | '.' | null = null

  if (lastComma !== -1 && lastDot !== -1) {
    // Her ikisi de varsa sonda olan ondalıktır.
    decimalSeparator = lastComma > lastDot ? ',' : '.'
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? ',' : '.'
    const index = lastComma !== -1 ? lastComma : lastDot
    const decimals = text.length - index - 1
    const occurrences = text.split(sep).length - 1
    // Tek ayraç + tam 3 hane ⇒ binlik (1.234 / 1,234). Aksi halde ondalık.
    decimalSeparator = occurrences === 1 && decimals === 3 ? null : sep
  }

  let normalized: string
  if (decimalSeparator === null) {
    normalized = text.replace(/[.,]/g, '')
  } else {
    const thousands = decimalSeparator === ',' ? '.' : ','
    normalized = text.split(thousands).join('').replace(decimalSeparator, '.')
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return { value: null, issue: issue(field, 'AMOUNT_UNPARSEABLE', 'Tutar biçimi tanınmadı.') }
  }

  return { value: negative ? -parsed : parsed }
}

/** KDV / iskonto / stopaj oranı. 0–100 aralığı dışındakiler reddedilir. */
export function parseRate(raw: unknown, field = 'rate'): Normalized<number> {
  const amount = parseAmount(raw, field)
  if (amount.value === null) return amount
  if (amount.value < 0 || amount.value > 100) {
    return { value: null, issue: issue(field, 'RATE_OUT_OF_RANGE', 'Oran %0–%100 aralığında olmalıdır.') }
  }
  return { value: amount.value }
}

// ─── Para birimi ───────────────────────────────────────────────────────────────

export type CurrencyCode = 'TRY' | 'USD' | 'EUR'

const CURRENCY_ALIASES: Record<string, CurrencyCode> = {
  TRY: 'TRY', TL: 'TRY', TRL: 'TRY', 'TÜRK LİRASI': 'TRY', 'TURK LIRASI': 'TRY', '₺': 'TRY',
  USD: 'USD', $: 'USD', DOLAR: 'USD', 'US DOLLAR': 'USD',
  EUR: 'EUR', '€': 'EUR', EURO: 'EUR', AVRO: 'EUR',
}

export function parseCurrency(raw: unknown, field = 'currency'): Normalized<CurrencyCode> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { value: null, issue: issue(field, 'CURRENCY_MISSING', 'Para birimi okunamadı.') }
  }
  const key = raw.trim().toLocaleUpperCase('tr-TR')
  const match = CURRENCY_ALIASES[key]
  if (!match) {
    return { value: null, issue: issue(field, 'CURRENCY_UNSUPPORTED', 'Desteklenmeyen para birimi.') }
  }
  return { value: match }
}

// ─── Tarih ─────────────────────────────────────────────────────────────────────

const TURKISH_MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * `dd.MM.yyyy`, `dd/MM/yyyy`, `dd-MM-yyyy`, ISO `yyyy-MM-dd`, `12 Mart 2026`
 * biçimlerini `YYYY-MM-DD`'ye çevirir. Ay/gün belirsizliğinde TR sırası (gün önce)
 * kullanılır; yalnızca >12 olan alan varsa kesinleştirilir.
 */
export function parseInvoiceDate(raw: unknown, field = 'date'): Normalized<string> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { value: null, issue: issue(field, 'DATE_MISSING', 'Tarih okunamadı.') }
  }
  const text = raw.trim()

  // ISO
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    if (!isRealDate(+y, +m, +d)) {
      return { value: null, issue: issue(field, 'DATE_INVALID', 'Tarih geçersiz.') }
    }
    return { value: iso(+y, +m, +d) }
  }

  // dd.MM.yyyy / dd/MM/yyyy / dd-MM-yyyy  (yıl 2 haneli de olabilir)
  const numeric = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[T\s].*)?$/)
  if (numeric) {
    const first = +numeric[1]
    const second = +numeric[2]
    let year = +numeric[3]
    if (numeric[3].length === 2) year += year >= 70 ? 1900 : 2000

    // TR varsayılanı gün.ay; ilk alan >12 ise zaten gün, ikinci alan >12 ise sıra terstir.
    let day = first
    let month = second
    if (second > 12 && first <= 12) {
      day = second
      month = first
    }
    if (!isRealDate(year, month, day)) {
      return { value: null, issue: issue(field, 'DATE_INVALID', 'Tarih geçersiz.') }
    }
    return { value: iso(year, month, day) }
  }

  // 12 Mart 2026 / 12 mart 2026
  const textual = text.match(/^(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})$/)
  if (textual) {
    const day = +textual[1]
    const month = TURKISH_MONTHS[textual[2].toLocaleLowerCase('tr-TR')]
    const year = +textual[3]
    if (!month || !isRealDate(year, month, day)) {
      return { value: null, issue: issue(field, 'DATE_INVALID', 'Tarih geçersiz.') }
    }
    return { value: iso(year, month, day) }
  }

  return { value: null, issue: issue(field, 'DATE_UNPARSEABLE', 'Tarih biçimi tanınmadı.') }
}

// ─── VKN / TCKN ────────────────────────────────────────────────────────────────

/** Türkiye VKN (10 hane) doğrulama algoritması. */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false
  const digits = value.split('').map(Number)
  const last = digits[9]
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const tmp = (digits[i] + (10 - i - 1)) % 10
    if (tmp === 0) {
      sum += 9
      continue
    }
    const powered = (tmp * Math.pow(2, 10 - i - 1)) % 9
    sum += powered === 0 ? 9 : powered
  }
  return (10 - (sum % 10)) % 10 === last
}

/** Türkiye TCKN (11 hane) doğrulama algoritması. */
export function isValidTckn(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false
  if (value[0] === '0') return false
  const d = value.split('').map(Number)
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8]
  const evenSum = d[1] + d[3] + d[5] + d[7]
  if ((oddSum * 7 - evenSum) % 10 !== d[9]) return false
  const total = d.slice(0, 10).reduce((s, n) => s + n, 0)
  return total % 10 === d[10]
}

export interface TaxId {
  value: string
  kind: 'vkn' | 'tckn'
}

/**
 * VKN/TCKN normalize eder. Rakam dışı karakterler atılır; uzunluk ve kontrol
 * hanesi doğrulanır. Geçersizse `null` + uyarı döner, uydurma değer üretilmez.
 */
export function parseTaxId(raw: unknown, field = 'taxId'): Normalized<TaxId> {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { value: null, issue: issue(field, 'TAXID_MISSING', 'VKN/TCKN okunamadı.') }
  }
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 0) {
    return { value: null, issue: issue(field, 'TAXID_MISSING', 'VKN/TCKN okunamadı.') }
  }
  if (digits.length === 10) {
    if (!isValidVkn(digits)) {
      return { value: null, issue: issue(field, 'TAXID_CHECKSUM', 'VKN kontrol hanesi doğrulanamadı.') }
    }
    return { value: { value: digits, kind: 'vkn' } }
  }
  if (digits.length === 11) {
    if (!isValidTckn(digits)) {
      return { value: null, issue: issue(field, 'TAXID_CHECKSUM', 'TCKN kontrol hanesi doğrulanamadı.') }
    }
    return { value: { value: digits, kind: 'tckn' } }
  }
  return { value: null, issue: issue(field, 'TAXID_LENGTH', 'VKN 10, TCKN 11 haneli olmalıdır.') }
}

// ─── Fatura numarası ───────────────────────────────────────────────────────────

/**
 * Fatura numarasını duplicate karşılaştırması için normalize eder:
 * büyük harf, boşluk/tire/nokta temizliği. Görüntülenen değer değişmez.
 */
export function normalizeInvoiceNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().toLocaleUpperCase('tr-TR').replace(/[\s\-_./\\]/g, '')
  return cleaned === '' ? null : cleaned
}

/**
 * Duplicate anahtarı: **yalnızca fatura numarasına güvenilmez.**
 * Düzenleyen VKN + normalize fatura numarası birleşimi kullanılır.
 */
export function buildDuplicateKey(issuerTaxId: string | null, invoiceNumber: string | null): string | null {
  const number = normalizeInvoiceNumber(invoiceNumber)
  if (!number) return null
  const issuer = (issuerTaxId ?? '').replace(/\D/g, '')
  if (!issuer) return null
  return `${issuer}:${number}`
}

// ─── Satır ve toplam tutarlılığı ───────────────────────────────────────────────

export interface LineAmounts {
  quantity: number
  unitPrice: number
  discountAmount?: number
  lineTotal?: number
  kdvRate?: number
}

export interface TotalsCheck {
  computedSubtotal: number
  computedKdv: number
  computedGrandTotal: number
  issues: NormalizationIssue[]
}

function cents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Kalemlerden ara toplam / KDV / genel toplam hesaplar ve satır bazında
 * `miktar × birim fiyat` ile beyan edilen satır toplamını karşılaştırır.
 * Hesap kuruş (integer) üzerinden yapılır; float drift birikmez.
 */
export function computeTotals(lines: LineAmounts[], toleranceCents = 2): TotalsCheck {
  const issues: NormalizationIssue[] = []
  let subtotalCents = 0
  let kdvCents = 0

  lines.forEach((line, index) => {
    const grossCents = Math.round(cents(line.quantity) * line.unitPrice) / 1
    const discountCents = cents(line.discountAmount ?? 0)
    const netCents = Math.round(grossCents - discountCents)

    if (line.lineTotal !== undefined) {
      const declaredCents = cents(line.lineTotal)
      if (Math.abs(declaredCents - netCents) > toleranceCents) {
        issues.push(
          issue(
            `lines[${index}].lineTotal`,
            'LINE_TOTAL_MISMATCH',
            `Kalem ${index + 1}: satır toplamı miktar × birim fiyat ile uyuşmuyor.`,
          ),
        )
      }
    }

    subtotalCents += netCents
    if (line.kdvRate !== undefined) {
      kdvCents += Math.round((netCents * line.kdvRate) / 100)
    }
  })

  return {
    computedSubtotal: subtotalCents / 100,
    computedKdv: kdvCents / 100,
    computedGrandTotal: (subtotalCents + kdvCents) / 100,
    issues,
  }
}
