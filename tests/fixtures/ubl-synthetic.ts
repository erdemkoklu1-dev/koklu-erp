/**
 * **SENTETİK** UBL-TR fixture üreteci.
 *
 * Bu dosyada gerçek müşteri, gerçek tedarikçi veya gerçek fatura verisi YOKTUR
 * ve olmayacaktır (GOREV.md §12, §17). Bütün unvanlar uydurma, bütün VKN/TCKN
 * değerleri kontrol hanesi doğru olacak şekilde **üretilmiş** test değerleridir.
 *
 * Fixture sınıfı: **synthetic**. Bu fixture'larla geçen testler "X tedarikçi
 * formatı doğrulandı" anlamına GELMEZ; yalnızca altyapının doğru çalıştığını
 * kanıtlar.
 */

/** Kontrol hanesi geçerli, uydurma VKN'ler (gerçek bir mükellefe ait değildir). */
export const SYNTHETIC_VKN = {
  supplier: '1000000411',
  customer: '1000002877',
} as const

export interface SyntheticLine {
  id: string
  name: string
  quantity: string
  unitCode: string
  unitPrice: string
  lineTotal: string
  kdvRate: string
  kdvAmount: string
  discount?: string
}

export interface SyntheticInvoiceOptions {
  invoiceNumber?: string
  uuid?: string
  issueDate?: string
  issueTime?: string
  typeCode?: string
  profileId?: string
  currency?: string
  supplierName?: string
  customerName?: string
  lines?: SyntheticLine[]
  subtotal?: string
  taxTotal?: string
  taxInclusive?: string
  payable?: string
  /** `cbc` yerine farklı prefix kullan — namespace dayanıklılığı testi. */
  prefix?: string
  despatchId?: string
  orderId?: string
}

const DEFAULT_LINES: SyntheticLine[] = [
  {
    id: '1',
    // Türkçe karakterler bilinçli: bozulmadıkları doğrulanır.
    name: 'Yangın Söndürme Tüpü 6 kg — dolum ücreti',
    quantity: '2',
    unitCode: 'C62',
    unitPrice: '600.00',
    lineTotal: '1200.00',
    kdvRate: '20',
    kdvAmount: '240.00',
  },
]

/**
 * Geçerli bir UBL-TR `Invoice` belgesi üretir.
 *
 * Varsayılan senaryo bilinçli olarak "1200 TL" içerir: geçmişteki
 * `1200 → 1,20` parse hatasının regresyon testidir.
 */
export function syntheticUblInvoice(options: SyntheticInvoiceOptions = {}): string {
  const p = options.prefix ?? 'cbc'
  const lines = options.lines ?? DEFAULT_LINES
  const t = (tag: string, value: string, attrs = '') =>
    `<${p}:${tag}${attrs ? ' ' + attrs : ''}>${value}</${p}:${tag}>`

  const lineXml = lines
    .map(
      line => `
    <cac:InvoiceLine>
      ${t('ID', line.id)}
      ${t('InvoicedQuantity', line.quantity, `unitCode="${line.unitCode}"`)}
      ${t('LineExtensionAmount', line.lineTotal, 'currencyID="TRY"')}
      ${
        line.discount
          ? `<cac:AllowanceCharge>
        ${t('ChargeIndicator', 'false')}
        ${t('Amount', line.discount, 'currencyID="TRY"')}
      </cac:AllowanceCharge>`
          : ''
      }
      <cac:TaxTotal>
        ${t('TaxAmount', line.kdvAmount, 'currencyID="TRY"')}
        <cac:TaxSubtotal>
          ${t('Percent', line.kdvRate)}
          ${t('TaxAmount', line.kdvAmount, 'currencyID="TRY"')}
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        ${t('Name', line.name)}
      </cac:Item>
      <cac:Price>
        ${t('PriceAmount', line.unitPrice, 'currencyID="TRY"')}
      </cac:Price>
    </cac:InvoiceLine>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:${p}="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  ${t('UBLVersionID', '2.1')}
  ${t('ProfileID', options.profileId ?? 'TICARIFATURA')}
  ${t('ID', options.invoiceNumber ?? 'KKL2026000000123')}
  ${t('UUID', options.uuid ?? '11111111-2222-3333-4444-555555555555')}
  ${t('IssueDate', options.issueDate ?? '2026-03-14')}
  ${t('IssueTime', options.issueTime ?? '10:45:00')}
  ${t('InvoiceTypeCode', options.typeCode ?? 'SATIS')}
  ${t('DocumentCurrencyCode', options.currency ?? 'TRY')}
  ${
    options.orderId
      ? `<cac:OrderReference>${t('ID', options.orderId)}</cac:OrderReference>`
      : ''
  }
  ${
    options.despatchId
      ? `<cac:DespatchDocumentReference>${t('ID', options.despatchId)}</cac:DespatchDocumentReference>`
      : ''
  }
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        ${t('ID', SYNTHETIC_VKN.supplier, 'schemeID="VKN"')}
      </cac:PartyIdentification>
      <cac:PartyName>
        ${t('Name', options.supplierName ?? 'Örnek Güvenlik Ekipmanları Ltd. Şti.')}
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          ${t('Name', 'Çankaya')}
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        ${t('ID', SYNTHETIC_VKN.customer, 'schemeID="VKN"')}
      </cac:PartyIdentification>
      <cac:PartyName>
        ${t('Name', options.customerName ?? 'Deneme Alıcı Anonim Şirketi')}
      </cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    ${t('TaxAmount', options.taxTotal ?? '240.00', 'currencyID="TRY"')}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    ${t('LineExtensionAmount', options.subtotal ?? '1200.00', 'currencyID="TRY"')}
    ${t('TaxInclusiveAmount', options.taxInclusive ?? '1440.00', 'currencyID="TRY"')}
    ${t('PayableAmount', options.payable ?? '1440.00', 'currencyID="TRY"')}
  </cac:LegalMonetaryTotal>
${lineXml}
</Invoice>`
}

/** XXE saldırı vektörü — parser bunu ÇÖZMEMELİ, reddetmeli. */
export const XXE_ATTACK_XML = `<?xml version="1.0"?>
<!DOCTYPE Invoice [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<Invoice>
  <ID>&xxe;</ID>
</Invoice>`

/** Billion-laughs benzeri entity bombası — reddedilmeli. */
export const ENTITY_BOMB_XML = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
]>
<Invoice><ID>&lol2;</ID></Invoice>`

/** Fatura olmayan geçerli XML — kontrollü hata beklenir. */
export const NON_INVOICE_XML = `<?xml version="1.0"?><Katalog><Urun>Tüp</Urun></Katalog>`

/** Sentetik, geçerli görünümlü minimal PDF (metin katmanı yok sayılır). */
export function syntheticPdfBytes(body = 'sentetik'): Uint8Array {
  const text = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${body}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`
  return new TextEncoder().encode(text)
}

/** Şifreli PDF benzetimi: trailer içinde `/Encrypt`. */
export function encryptedPdfBytes(): Uint8Array {
  const text = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF\n`
  return new TextEncoder().encode(text)
}

/** `%%EOF` içermeyen bozuk PDF. */
export function corruptPdfBytes(): Uint8Array {
  return new TextEncoder().encode('%PDF-1.4\nbozuk içerik, sonlandırıcı yok\n')
}
