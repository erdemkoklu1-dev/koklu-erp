/**
 * UBL-TR (e-Fatura / e-Arşiv) alan çıkarımı — **deterministik**, AI'sız.
 *
 * GOREV.md §12 parser öncelik sırasının 1. basamağıdır: XML varsa PDF/OCR/AI
 * hiç çalıştırılmaz. Aynı belgeden her zaman aynı sonuç çıkar.
 *
 * Namespace dayanıklılığı: bütün eşleme **yerel ad** üzerinden yapılır
 * (`cbc:ID`, `ns2:ID`, `ID` aynıdır). UBL-TR üreticileri prefix'leri farklı
 * seçer; prefix'e bağlanan parser sahada kırılır.
 *
 * Güvenlik: XML ayrıştırması `./xml.ts` üzerinden yapılır; DTD/external entity
 * **yapısal olarak** desteklenmez.
 *
 * Dürüstlük sınırı: bu modül alanları çıkarır ve tutarlılık kontrolü yapar;
 * **kayıt oluşturmaz**. Kaydetme kararı kullanıcı ön izlemesine bağlıdır.
 */

import {
  at,
  child,
  children,
  findAll,
  findFirst,
  parseXml,
  textAt,
  type XmlElement,
} from './xml.ts'
import {
  buildDuplicateKey,
  computeTotals,
  normalizeInvoiceNumber,
  parseAmount,
  parseCurrency,
  parseInvoiceDate,
  parseRate,
  parseTaxId,
  type LineAmounts,
  type NormalizationIssue,
} from './normalization.ts'

export const UBL_ERROR = {
  NOT_UBL: 'UBL_NOT_INVOICE_DOCUMENT',
  XML_INVALID: 'UBL_XML_INVALID',
  NO_INVOICE_NUMBER: 'UBL_NO_INVOICE_NUMBER',
} as const

export type UblErrorCode = (typeof UBL_ERROR)[keyof typeof UBL_ERROR]

export interface UblParty {
  /** Ticari unvan veya kişi adı */
  name: string | null
  taxId: string | null
  taxIdKind: 'vkn' | 'tckn' | null
  taxOffice: string | null
}

export interface UblLine {
  /** Belgedeki satır kimliği (sıra numarası olabilir) */
  id: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  /** İskonto pozitif, artırım negatif olarak normalize edilir. */
  discountAmount: number | null
  lineTotal: number | null
  kdvRate: number | null
  kdvAmount: number | null
}

export interface UblInvoice {
  invoiceNumber: string | null
  normalizedInvoiceNumber: string | null
  uuid: string | null
  issueDate: string | null
  issueTime: string | null
  /** `SATIS`, `IADE`, `TEVKIFAT` … */
  invoiceTypeCode: string | null
  /** `TICARIFATURA`, `TEMELFATURA`, `EARSIVFATURA` … */
  profileId: string | null
  currency: string | null
  exchangeRate: number | null
  supplier: UblParty
  customer: UblParty
  lines: UblLine[]
  subtotal: number | null
  taxTotal: number | null
  taxInclusiveTotal: number | null
  payableAmount: number | null
  /** İrsaliye referansları */
  despatchReferences: string[]
  /** Sipariş referansları */
  orderReferences: string[]
  /** Düzenleyen VKN + normalize fatura no; duplicate tespiti için. */
  duplicateKey: string | null
  issues: NormalizationIssue[]
}

export type UblResult =
  | { ok: true; value: UblInvoice }
  | { ok: false; error: { code: UblErrorCode; message: string } }

/** Bu belge bir UBL fatura mı? (kök element yerel adına bakılır) */
export const UBL_ROOTS = ['Invoice', 'CreditNote', 'DespatchAdvice'] as const

function collect(issues: NormalizationIssue[], issue?: NormalizationIssue) {
  if (issue) issues.push(issue)
}

/**
 * Taraf bilgisi. UBL-TR'de VKN/TCKN `PartyIdentification/ID` altında ve
 * `schemeID` özniteliğiyle ayrılır (`VKN` / `TCKN` / `MERSISNO` / `TICARETSICILNO`).
 * `schemeID` yoksa uzunluk + kontrol hanesi üzerinden karar verilir.
 */
function readParty(party: XmlElement | null, label: string, issues: NormalizationIssue[]): UblParty {
  if (!party) return { name: null, taxId: null, taxIdKind: null, taxOffice: null }

  const personName =
    [textAt(party, 'Person', 'FirstName'), textAt(party, 'Person', 'FamilyName')]
      .filter(Boolean)
      .join(' ')
      .trim()

  const name =
    textAt(party, 'PartyName', 'Name') ??
    textAt(party, 'PartyLegalEntity', 'RegistrationName') ??
    (personName.length > 0 ? personName : null)

  let rawTaxId: string | null = null
  for (const identification of children(party, 'PartyIdentification')) {
    const idNode = child(identification, 'ID')
    if (!idNode) continue
    const scheme = (idNode.attrs.schemeID ?? '').toUpperCase()
    const value = idNode.text.trim()
    if (!value) continue
    if (scheme === 'VKN' || scheme === 'TCKN') {
      rawTaxId = value
      break
    }
    // schemeID yoksa/başkaysa yalnızca aday olarak tutulur.
    if (!rawTaxId && /^\d{10,11}$/.test(value)) rawTaxId = value
  }

  const parsed = parseTaxId(rawTaxId, `${label}.taxId`)
  collect(issues, rawTaxId ? parsed.issue : undefined)

  return {
    name: name && name.trim().length > 0 ? name.trim() : null,
    taxId: parsed.value?.value ?? null,
    taxIdKind: parsed.value?.kind ?? null,
    taxOffice: textAt(party, 'PartyTaxScheme', 'TaxScheme', 'Name'),
  }
}

/**
 * `AllowanceCharge`: `ChargeIndicator=false` ⇒ iskonto, `true` ⇒ artırım.
 * İskonto pozitif, artırım negatif olarak tek işarete indirgenir; böylece
 * `net = brüt − discountAmount` her iki durumda da doğrudur.
 */
function readAllowanceCharge(node: XmlElement, label: string, issues: NormalizationIssue[]): number {
  let total = 0
  for (const ac of children(node, 'AllowanceCharge')) {
    const amount = parseAmount(textAt(ac, 'Amount'), `${label}.allowanceCharge`)
    collect(issues, amount.issue)
    if (amount.value === null) continue
    const isCharge = (textAt(ac, 'ChargeIndicator') ?? 'false').toLowerCase() === 'true'
    total += isCharge ? -amount.value : amount.value
  }
  return total
}

function readLine(node: XmlElement, index: number, issues: NormalizationIssue[]): UblLine {
  const label = `line[${index + 1}]`

  const quantityNode = child(node, 'InvoicedQuantity') ?? child(node, 'CreditedQuantity')
  const quantity = parseAmount(quantityNode?.text ?? null, `${label}.quantity`)
  collect(issues, quantity.issue)

  const unitPrice = parseAmount(textAt(node, 'Price', 'PriceAmount'), `${label}.unitPrice`)
  collect(issues, unitPrice.issue)

  const lineTotal = parseAmount(textAt(node, 'LineExtensionAmount'), `${label}.lineTotal`)
  collect(issues, lineTotal.issue)

  // KDV: satır altındaki TaxTotal/TaxSubtotal.
  const taxSubtotal = at(node, 'TaxTotal', 'TaxSubtotal')
  const kdvRate = parseRate(textAt(taxSubtotal, 'Percent'), `${label}.kdvRate`)
  collect(issues, kdvRate.issue)
  const kdvAmount = parseAmount(textAt(node, 'TaxTotal', 'TaxAmount'), `${label}.kdvAmount`)
  collect(issues, kdvAmount.issue)

  const discount = readAllowanceCharge(node, label, issues)

  return {
    id: textAt(node, 'ID'),
    description:
      textAt(node, 'Item', 'Name') ??
      textAt(node, 'Item', 'Description') ??
      null,
    quantity: quantity.value,
    unit: quantityNode?.attrs.unitCode ?? null,
    unitPrice: unitPrice.value,
    discountAmount: discount === 0 ? null : discount,
    lineTotal: lineTotal.value,
    kdvRate: kdvRate.value,
    kdvAmount: kdvAmount.value,
  }
}

/**
 * UBL-TR XML metnini yapılandırılmış faturaya çevirir.
 *
 * Toplam tutarlılığı `computeTotals` ile ayrıca doğrulanır; beyan edilen toplam
 * ile hesaplanan toplam uyuşmuyorsa **düzeltme yapılmaz**, uyarı üretilir.
 * Kararı kullanıcı ön izlemesi verir.
 */
export function parseUblInvoice(xmlText: string): UblResult {
  const parsed = parseXml(xmlText)
  if (!parsed.ok) {
    return { ok: false, error: { code: UBL_ERROR.XML_INVALID, message: parsed.error.message } }
  }

  const root = parsed.root
  if (!(UBL_ROOTS as readonly string[]).includes(root.name)) {
    return {
      ok: false,
      error: {
        code: UBL_ERROR.NOT_UBL,
        message: 'Yüklenen XML bir UBL-TR fatura belgesi değil.',
      },
    }
  }

  const issues: NormalizationIssue[] = []

  const invoiceNumber = textAt(root, 'ID')
  if (!invoiceNumber) {
    return {
      ok: false,
      error: { code: UBL_ERROR.NO_INVOICE_NUMBER, message: 'Fatura numarası okunamadı.' },
    }
  }

  const issueDate = parseInvoiceDate(textAt(root, 'IssueDate'), 'issueDate')
  collect(issues, issueDate.issue)

  const currencyRaw = textAt(root, 'DocumentCurrencyCode')
  const currency = parseCurrency(currencyRaw, 'currency')
  collect(issues, currencyRaw ? currency.issue : undefined)

  const rateNode = findFirst(root, 'PricingExchangeRate') ?? findFirst(root, 'TaxExchangeRate')
  const exchangeRate = parseAmount(textAt(rateNode, 'CalculationRate'), 'exchangeRate')

  const supplier = readParty(at(root, 'AccountingSupplierParty', 'Party'), 'supplier', issues)
  const customer = readParty(at(root, 'AccountingCustomerParty', 'Party'), 'customer', issues)

  const lineNodes = [...children(root, 'InvoiceLine'), ...children(root, 'CreditNoteLine')]
  const lines = lineNodes.map((node, index) => readLine(node, index, issues))

  const monetary = child(root, 'LegalMonetaryTotal')
  const subtotal = parseAmount(textAt(monetary, 'LineExtensionAmount'), 'subtotal')
  collect(issues, subtotal.issue)
  const taxInclusive = parseAmount(textAt(monetary, 'TaxInclusiveAmount'), 'taxInclusiveTotal')
  const payable = parseAmount(textAt(monetary, 'PayableAmount'), 'payableAmount')
  collect(issues, payable.issue)

  // Belge düzeyi vergi toplamı: satır altındaki TaxTotal'lar hariç tutulur.
  const documentTaxTotal = children(root, 'TaxTotal')
    .map(node => parseAmount(textAt(node, 'TaxAmount'), 'taxTotal').value)
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0)

  // ── Toplam tutarlılığı: düzeltme YOK, yalnızca uyarı ──
  const computableLines: LineAmounts[] = lines
    .filter(line => line.quantity !== null && line.unitPrice !== null)
    .map(line => ({
      quantity: line.quantity as number,
      unitPrice: line.unitPrice as number,
      discountAmount: line.discountAmount ?? undefined,
      lineTotal: line.lineTotal ?? undefined,
      kdvRate: line.kdvRate ?? undefined,
    }))

  if (computableLines.length > 0) {
    const totals = computeTotals(computableLines)
    issues.push(...totals.issues)

    if (payable.value !== null) {
      const diff = Math.abs(Math.round(totals.computedGrandTotal * 100) - Math.round(payable.value * 100))
      if (diff > 2) {
        issues.push({
          field: 'payableAmount',
          code: 'TOTAL_MISMATCH',
          message:
            'Kalemlerden hesaplanan genel toplam, belgede yazan ödenecek tutarla uyuşmuyor. Kaydetmeden önce kontrol edin.',
        })
      }
    }
  }

  const taxId = supplier.taxId
  return {
    ok: true,
    value: {
      invoiceNumber,
      normalizedInvoiceNumber: normalizeInvoiceNumber(invoiceNumber),
      uuid: textAt(root, 'UUID'),
      issueDate: issueDate.value,
      issueTime: textAt(root, 'IssueTime'),
      invoiceTypeCode: textAt(root, 'InvoiceTypeCode'),
      profileId: textAt(root, 'ProfileID'),
      currency: currency.value ?? (currencyRaw ? currencyRaw.toUpperCase() : null),
      exchangeRate: exchangeRate.value,
      supplier,
      customer,
      lines,
      subtotal: subtotal.value,
      taxTotal: documentTaxTotal > 0 ? documentTaxTotal : null,
      taxInclusiveTotal: taxInclusive.value,
      payableAmount: payable.value,
      despatchReferences: findAll(root, 'DespatchDocumentReference')
        .map(node => textAt(node, 'ID'))
        .filter((value): value is string => Boolean(value)),
      orderReferences: findAll(root, 'OrderReference')
        .map(node => textAt(node, 'ID'))
        .filter((value): value is string => Boolean(value)),
      duplicateKey: buildDuplicateKey(taxId, invoiceNumber),
      issues,
    },
  }
}

/**
 * Çıkarımın güven skoru (0–1).
 *
 * Düşük skor **otomatik kayıt engellidir** (GOREV.md §12: "Düşük güven skorunda
 * otomatik kayıt yapılmaz"). Skor uydurma bir ağırlıklandırma değil, zorunlu
 * alanların doluluğu ve tutarsızlık sayımıdır.
 */
export function scoreUblConfidence(invoice: UblInvoice): number {
  const required: Array<unknown> = [
    invoice.invoiceNumber,
    invoice.issueDate,
    invoice.supplier.taxId,
    invoice.supplier.name,
    invoice.payableAmount,
  ]
  const filled = required.filter(value => value !== null && value !== undefined && value !== '').length
  let score = filled / required.length

  if (invoice.lines.length === 0) score -= 0.2
  const blocking = invoice.issues.filter(i => i.code === 'TOTAL_MISMATCH' || i.code.startsWith('TAXID_'))
  score -= blocking.length * 0.15

  return Math.max(0, Math.min(1, Number(score.toFixed(3))))
}
