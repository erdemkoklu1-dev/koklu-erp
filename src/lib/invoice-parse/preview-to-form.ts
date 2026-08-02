/**
 * Kanonik `InvoicePreview` → fatura formu alanları eşlemesi.
 *
 * ── NEDEN AYRI, SAF BİR MODÜL ───────────────────────────────────────────────
 * `/cari-hesap/faturalar/new` ekranı fatura okumak için AI vision'a bağlıydı ve
 * sağlayıcı modeli kaldırınca **bütün** fatura yükleme akışı düştü. Ekran artık
 * kanonik `/api/v1/invoices/parse` hattını kullanıyor; bu modül o hattın iki
 * çıktı şeklini (UBL-TR ve PDF metin katmanı) tek bir form doldurma şekline
 * indirger.
 *
 * Modül `next/*` veya DOM API'si import etmez; `node --test` altında doğrudan
 * çalıştırılır. Ekran kodunda eşleme mantığı BIRAKILMAZ ki regresyon testi
 * gerçek dönüşümü kapsasın.
 *
 * Bu modül veri **uydurmaz**: okunamayan alan `null` kalır, hiçbir tutar tahmin
 * edilmez. Kullanıcı ön izlemede her alanı düzenleyebilir.
 */

import type { InvoicePreview, ParseSource } from './pipeline.ts'
import type { UblInvoice } from './ubl-tr.ts'

/** Formdaki `Birim` seçeneğinin kabul ettiği değerler. */
export const FORM_UNITS = ['adet', 'saat', 'kg', 'm', 'set', 'paket'] as const
export type FormUnit = (typeof FORM_UNITS)[number]

/** Formdaki `KDV %` seçeneğinin kabul ettiği değerler. */
export const FORM_KDV_RATES = [0, 10, 20] as const

export interface FormParty {
  name: string | null
  taxNumber: string | null
  address: string | null
}

export interface FormLine {
  description: string
  quantity: number
  unit: FormUnit
  unitPrice: number
  kdvRate: number
}

export interface InvoiceFormFill {
  source: ParseSource
  /** Belge numarası — form bunu göstermek için kullanır, kayıt anahtarı değildir. */
  invoiceNumber: string | null
  /** `YYYY-MM-DD` — `<input type="date">` bunu doğrudan kabul eder. */
  invoiceDate: string | null
  dueDate: string | null
  supplier: FormParty
  customer: FormParty
  /** Baskın kalem KDV oranı; kalemler boşsa `null`. */
  kdvRate: number | null
  lines: FormLine[]
  /** Belgede yazan ödenecek tutar; kalemlerden yeniden hesaplanmaz. */
  payableAmount: number | null
  confidence: number
  autoSaveAllowed: boolean
  warnings: string[]
}

/**
 * UN/ECE Rec 20 birim kodları → formdaki Türkçe birim.
 * Listede olmayan kod `adet`e düşer (form yalnızca bu değerleri kabul eder).
 */
const UNIT_CODE_MAP: Record<string, FormUnit> = {
  C62: 'adet',
  NIU: 'adet',
  PCE: 'adet',
  EA: 'adet',
  ADET: 'adet',
  HUR: 'saat',
  SAAT: 'saat',
  KGM: 'kg',
  KG: 'kg',
  GRM: 'kg',
  MTR: 'm',
  M: 'm',
  SET: 'set',
  PA: 'paket',
  PK: 'paket',
  PAKET: 'paket',
}

export function normalizeUnit(raw: string | null | undefined): FormUnit {
  if (!raw) return 'adet'
  const key = raw.trim().toUpperCase()
  return UNIT_CODE_MAP[key] ?? 'adet'
}

/**
 * KDV oranını sayısal olarak normalize eder.
 *
 * Standart dışı oran (örn. %1, %8) **en yakın geçerli değere yuvarlanmaz**:
 * belgedeki değer korunur ve `previewToFormFill` bunun için ayrı bir uyarı
 * üretir. Sessizce %20'ye çekmek, tutarı bozan bir veri kaybı olurdu.
 */
export function normalizeKdvRate(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null
  return Math.round(raw * 100) / 100
}

/** Oran formdaki `KDV %` seçeneklerinden biri mi? */
export function isStandardKdvRate(rate: number): boolean {
  return (FORM_KDV_RATES as readonly number[]).includes(rate)
}

function nonEmpty(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Kalemlerdeki en sık KDV oranı; eşitlikte ilk görülen kazanır. */
function dominantKdvRate(lines: FormLine[]): number | null {
  if (lines.length === 0) return null
  const counts = new Map<number, number>()
  for (const line of lines) {
    counts.set(line.kdvRate, (counts.get(line.kdvRate) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [rate, count] of counts) {
    if (count > bestCount) {
      best = rate
      bestCount = count
    }
  }
  return best
}

function fromUbl(ubl: UblInvoice): Omit<InvoiceFormFill, 'source' | 'confidence' | 'autoSaveAllowed' | 'warnings'> {
  const lines: FormLine[] = ubl.lines.map(line => {
    const quantity = finiteOrNull(line.quantity) ?? 0
    // Birim fiyat yoksa satır toplamından türetilir; ikisi de yoksa 0 kalır ve
    // kullanıcı elle girer. Uydurma değer yazılmaz.
    const unitPrice =
      finiteOrNull(line.unitPrice) ??
      (quantity > 0 && finiteOrNull(line.lineTotal) !== null
        ? Math.round(((line.lineTotal as number) / quantity) * 10000) / 10000
        : 0)

    return {
      description: nonEmpty(line.description) ?? '',
      quantity,
      unit: normalizeUnit(line.unit),
      unitPrice,
      kdvRate: normalizeKdvRate(line.kdvRate) ?? 0,
    }
  })

  return {
    invoiceNumber: nonEmpty(ubl.invoiceNumber),
    invoiceDate: nonEmpty(ubl.issueDate),
    dueDate: null,
    supplier: {
      name: nonEmpty(ubl.supplier.name),
      taxNumber: nonEmpty(ubl.supplier.taxId),
      address: null,
    },
    customer: {
      name: nonEmpty(ubl.customer.name),
      taxNumber: nonEmpty(ubl.customer.taxId),
      address: null,
    },
    kdvRate: dominantKdvRate(lines),
    lines,
    payableAmount: finiteOrNull(ubl.payableAmount),
  }
}

/** `parsePdfBuffer` çıktısının bu eşlemede kullanılan alt kümesi. */
interface PdfShape {
  fatura_no?: unknown
  fatura_tarihi?: unknown
  vade_tarihi?: unknown
  musteri_adi?: unknown
  musteri_vkn?: unknown
  musteri_adresi?: unknown
  satici_adi?: unknown
  satici_vkn?: unknown
  tedarikci_adres?: unknown
  odenecek_tutar?: unknown
  kalemler?: unknown
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? nonEmpty(value) : null
}

function fromPdf(raw: unknown): Omit<InvoiceFormFill, 'source' | 'confidence' | 'autoSaveAllowed' | 'warnings'> {
  const pdf: PdfShape = raw !== null && typeof raw === 'object' ? (raw as PdfShape) : {}

  const rawLines = Array.isArray(pdf.kalemler) ? pdf.kalemler : []
  const lines: FormLine[] = rawLines.map(entry => {
    const item = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : {}
    return {
      description: asString(item.urun_adi) ?? '',
      quantity: finiteOrNull(item.miktar) ?? 0,
      unit: normalizeUnit(typeof item.birim === 'string' ? item.birim : null),
      unitPrice: finiteOrNull(item.birim_fiyat) ?? 0,
      kdvRate: normalizeKdvRate(finiteOrNull(item.kdv_orani)) ?? 0,
    }
  })

  return {
    invoiceNumber: asString(pdf.fatura_no),
    invoiceDate: asString(pdf.fatura_tarihi),
    dueDate: asString(pdf.vade_tarihi),
    supplier: {
      name: asString(pdf.satici_adi),
      taxNumber: asString(pdf.satici_vkn),
      address: asString(pdf.tedarikci_adres),
    },
    customer: {
      name: asString(pdf.musteri_adi),
      taxNumber: asString(pdf.musteri_vkn),
      address: asString(pdf.musteri_adresi),
    },
    kdvRate: dominantKdvRate(lines),
    lines,
    payableAmount: finiteOrNull(pdf.odenecek_tutar),
  }
}

/**
 * Kanonik ön izlemeyi forma yazılabilir hâle getirir.
 *
 * UBL yolu her zaman önceliklidir: `preview.ubl` doluysa PDF alanına hiç
 * bakılmaz (hat zaten XML'i PDF'ten önce işler).
 */
export function previewToFormFill(preview: InvoicePreview): InvoiceFormFill {
  const base = preview.ubl ? fromUbl(preview.ubl) : fromPdf(preview.pdf)

  const warnings = [...preview.warnings]

  // Formun sunmadığı bir KDV oranı geldiyse sessizce değiştirmek yerine uyar.
  const unsupported = [...new Set(base.lines.map(line => line.kdvRate))].filter(
    rate => !isStandardKdvRate(rate),
  )
  if (unsupported.length > 0) {
    warnings.push(
      `Belgede standart dışı KDV oranı var (%${unsupported.join(', %')}). Kalemleri kaydetmeden önce kontrol edin.`,
    )
  }

  return {
    source: preview.source,
    ...base,
    confidence: preview.confidence,
    autoSaveAllowed: preview.autoSaveAllowed,
    warnings,
  }
}
