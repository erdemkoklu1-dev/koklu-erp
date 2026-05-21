export type IncomingParseQuality = 'clean' | 'manual_review' | 'critical_error'

export interface IncomingQualityInput {
  supplierName?: string | null
  taxNumber?: string | null
  invoiceNo?: string | null
  invoiceDate?: string | null
  payableTotal?: number | null
  lineCount: number
  lineWarnings?: string[]
  templateLineHeaderDetected?: boolean
}

export interface IncomingQualityResult {
  quality: IncomingParseQuality
  warnings: string[]
}

export function classifyIncomingParseQuality(input: IncomingQualityInput): IncomingQualityResult {
  const critical: string[] = []
  const warnings: string[] = []

  if (!input.supplierName || input.supplierName.trim().length < 3) critical.push('supplier_missing')
  if (!input.invoiceNo) critical.push('invoice_no_missing')
  if (!input.invoiceDate) critical.push('invoice_date_missing')
  if (input.payableTotal == null) {
    if (input.lineCount === 0) critical.push('payable_total_missing')
    else warnings.push('payable_total_missing')
  }
  else if (input.payableTotal <= 0) critical.push('payable_total_invalid')
  if (input.lineCount === 0) {
    warnings.push(input.templateLineHeaderDetected ? 'line_items_missing_template_header_found' : 'line_items_missing')
  }
  if (!input.taxNumber) warnings.push('tax_number_missing')

  for (const warning of input.lineWarnings ?? []) warnings.push(warning)

  if (critical.length > 0) {
    return { quality: 'critical_error', warnings: [...new Set([...critical, ...warnings])] }
  }
  if (warnings.length > 0) {
    return { quality: 'manual_review', warnings: [...new Set(warnings)] }
  }
  return { quality: 'clean', warnings: [] }
}

export function mapIncomingQualityToLegacy(quality: IncomingParseQuality): 'temiz_parse' | 'manuel_kontrol_gerekli' | 'parse_hatasi' {
  if (quality === 'clean') return 'temiz_parse'
  if (quality === 'manual_review') return 'manuel_kontrol_gerekli'
  return 'parse_hatasi'
}
