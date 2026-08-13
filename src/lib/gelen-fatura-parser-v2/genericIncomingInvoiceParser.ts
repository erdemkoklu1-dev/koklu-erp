import { findIncomingDateByLabels } from './dateParser'
import { parseIncomingMoney } from './moneyParser'
import { classifyIncomingParseQuality, mapIncomingQualityToLegacy } from './parserQuality'
import { normalizeIncomingProductDescription } from './productNormalization'
import { classifyIncomingSupplier, hasIncomingTemplateLineHeader, isOwnCompanySupplierName, type IncomingSupplierTemplate } from './supplierClassifier'

export interface IncomingLineInput {
  urun_adi: string
  parse_warnings?: string[]
}

export interface IncomingHeaderResult {
  supplierName: string | null
  taxNumber: string | null
  invoiceNo: string | null
  invoiceDate: string | null
  dueDate: string | null
  subtotal: number | null
  vatTotal: number | null
  payableTotal: number | null
  template: IncomingSupplierTemplate
}

export interface IncomingParserV2Result {
  header: IncomingHeaderResult
  quality: 'clean' | 'manual_review' | 'critical_error'
  legacyQuality: 'temiz_parse' | 'manuel_kontrol_gerekli' | 'parse_hatasi'
  warnings: string[]
  supplierSignals: string[]
  templateLineHeaderDetected: boolean
}

function findField(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function cleanInvoiceNo(value: string | null): string | null {
  if (!value) return null
  const cleaned = value.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const standard = cleaned.match(/^([A-Z0-9]{3}\d{13})/) ?? cleaned.match(/^([A-Z]{2,4}\d{13})/)
  return standard ? standard[1] : cleaned || null
}

function findTaxNumber(text: string): string | null {
  const labelled = [...text.matchAll(/(?:VKN|TCKN|Vergi\s+No|Vergi\s+Numarası|Vergi\s+Numarasi)\s*[:\s]+(\d{10,11})/giu)]
    .map(m => m[1])
    .filter(v => v !== '5830028164')
  if (labelled.length > 0) return labelled[0]

  const free = [...text.matchAll(/\b(\d{10,11})\b/g)]
    .map(m => m[1])
    .filter(v => v !== '5830028164')
  return free[0] ?? null
}

export function parseIncomingInvoiceV2(text: string, lines: IncomingLineInput[]): IncomingParserV2Result {
  const supplier = classifyIncomingSupplier(text)
  const supplierNameCandidate = findField(text, [
    /(?:Satıcı|Satici|SatÄ±cÄ±|Tedarikçi|Tedarikci|TedarikÃ§i|Ticari\s+Unvan|Ünvan|Ãœnvan|Unvan)\s*[:\s]+([^\n]+)/iu,
  ]) ?? supplier.supplierName
  const ownCompanySupplierRejected = isOwnCompanySupplierName(supplierNameCandidate)
  const supplierName = ownCompanySupplierRejected ? null : supplierNameCandidate

  const taxNumber = findTaxNumber(text)

  const invoiceNo = cleanInvoiceNo(findField(text, [
    /Fatura\s+(?:No|Numarası|Numarasi|NumarasÄ±)\s*[:\s]+([A-Z0-9\s\-_—–-]+)/iu,
    /FATURA\s+(?:NO|NUMARASI)\s*[:\s]+([A-Z0-9\s\-_—–-]+)/iu,
    /Fatura\s+(?:No|NumarasÄ±)\s*[:\s]+([A-Z0-9\s\-_â€”â€“-]+)/iu,
  ]))

  const invoiceDate = findIncomingDateByLabels(text, [
    /Fatura\s+Tarihi\s*[:\s]/iu,
    /FATURA\s+TAR[İI]H[İI]\s*[:\s]/iu,
    /FATURA\s+TARÄ°HÄ°\s*[:\s]/iu,
    /D[üu]zenleme\s+Tarihi\s*[:\s]/iu,
    /D[Ã¼u]zenleme\s+Tarihi\s*[:\s]/iu,
  ])
  const dueDate = findIncomingDateByLabels(text, [
    /Son\s+[ÖOÃ–]deme\s+Tarihi\s*[:\s]/iu,
    /Vade\s+Tarihi\s*[:\s]/iu,
  ])

  const subtotal = parseIncomingMoney(findField(text, [
    /Mal\s+Hizmet\s+Toplam[ıiÄ±]?\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
    /Ara\s+Toplam\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
  ]))
  const vatTotal = parseIncomingMoney(findField(text, [
    /Hesaplanan\s+KDV\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
    /Toplam\s+KDV\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
  ]))
  const payableTotal = parseIncomingMoney(findField(text, [
    /(?:^|\n)\s*TOPLAM\s+TUTAR\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺)?/iu,
    /[ÖOÃ–]denecek\s+Tutar[ıiÄ±]?\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
    /Vergiler\s+Dahil\s+Toplam(?:\s+Tutar[ıiÄ±]?)?\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
    /Genel\s+Toplam(?:\s+Tutar[ıiÄ±]?)?\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
    /FATURA\s+TOPLAM[AI]\s*[:\s]+([\d.,\s]+)\s*(?:TL|TRY|TRL|₺|â‚º)?/iu,
  ]))

  const lineWarnings = lines.flatMap(line => {
    const normalized = normalizeIncomingProductDescription(line.urun_adi)
    return [...(line.parse_warnings ?? []), ...normalized.warnings]
  })
  const templateLineHeaderDetected = hasIncomingTemplateLineHeader(text, supplier.template)

  const quality = classifyIncomingParseQuality({
    supplierName,
    taxNumber,
    invoiceNo,
    invoiceDate,
    payableTotal,
    lineCount: lines.length,
    lineWarnings,
    templateLineHeaderDetected,
  })

  return {
    header: {
      supplierName,
      taxNumber,
      invoiceNo,
      invoiceDate,
      dueDate,
      subtotal,
      vatTotal,
      payableTotal,
      template: supplier.template,
    },
    quality: quality.quality,
    legacyQuality: mapIncomingQualityToLegacy(quality.quality),
    warnings: quality.warnings,
    supplierSignals: ownCompanySupplierRejected ? [...supplier.signals, 'own_company_supplier_candidate_rejected'] : supplier.signals,
    templateLineHeaderDetected,
  }
}
