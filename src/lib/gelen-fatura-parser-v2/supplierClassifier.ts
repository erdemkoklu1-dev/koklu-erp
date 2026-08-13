export type IncomingSupplierTemplate = 'migros' | 'erkarpas' | 'hidropres' | 'semihler' | 'unknown'

export interface IncomingSupplierClassification {
  template: IncomingSupplierTemplate
  supplierName: string | null
  confidence: number
  signals: string[]
}

const KOKLU_VKN = '5830028164'

function fold(value: string): string {
  return value
    .toLocaleUpperCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/İ/g, 'I')
}

function isBadSupplierLine(line: string): boolean {
  const folded = fold(line)
  if (line.includes('@')) return true
  if (folded.includes(KOKLU_VKN)) return true
  if (isOwnCompanySupplierName(line)) return true
  if (/^(SAYIN|ALICI|ADRES|TEL|TELEFON|FAKS|FAX|E-POSTA|WEB|VERGI|VKN|TCKN|IBAN)\b/.test(folded)) return true
  if (/(FATURA NO|FATURA TARIHI|DUZENLEME|ETTN|SENARYO|OZELLESTIRME)/.test(folded)) return true
  if (/^\d/.test(line.trim())) return true
  return false
}

export function isOwnCompanySupplierName(value: string | null | undefined): boolean {
  const folded = fold(value ?? '')
  return folded.includes(KOKLU_VKN) || (folded.includes('KOKLU') && folded.includes('YANGIN'))
}

function inferSupplierName(text: string, template: IncomingSupplierTemplate): string | null {
  const knownNames: Record<IncomingSupplierTemplate, string | null> = {
    migros: 'Migros',
    erkarpas: 'Erkarpaş',
    hidropres: 'Hidropres',
    semihler: 'Semihler',
    unknown: null,
  }
  if (knownNames[template]) return knownNames[template]

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const candidates: string[] = []
  for (const [index, line] of lines.slice(0, 30).entries()) {
    const folded = fold(line)
    if (folded.startsWith('SAYIN') || folded.startsWith('ALICI')) break
    if (isBadSupplierLine(line)) continue
    if (/(LTD|LIMITED|ANONIM|A\.S\.|SIRKETI|ENSTITUSU|SANAYI|TICARET|MAGAZACILIK|ELEKTRIK|YANGIN|KALIBRASYON)/.test(folded)) {
      const previous = lines[index - 1]
      if (previous && !isBadSupplierLine(previous) && /[A-ZÇĞİÖŞÜ]{3}/u.test(previous) && !candidates.includes(previous)) {
        candidates.push(previous.replace(/\s+/g, ' ').trim())
      }
      candidates.push(line.replace(/\s+/g, ' ').trim())
      if (/(LTD|LIMITED|A\.S\.|SIRKETI|ENSTITUSU)/.test(folded)) break
    }
  }
  return candidates.length > 0 ? candidates.slice(0, 3).join(' ').split(/\s+\/\s+/)[0].trim() : null
}

export function classifyIncomingSupplier(text: string): IncomingSupplierClassification {
  const folded = fold(text)
  const signals: string[] = []
  let template: IncomingSupplierTemplate = 'unknown'

  if (/\bMIGROS\b/.test(folded)) {
    template = 'migros'
    signals.push('migros_keyword_or_table')
  } else if (/\bERKARPAS\b/.test(folded)) {
    template = 'erkarpas'
    signals.push('erkarpas_keyword_or_table')
  } else if (/\bHIDROPRES\b/.test(folded)) {
    template = 'hidropres'
    signals.push('hidropres_keyword_or_table')
  } else if (/\bSEMIHLER\b/.test(folded)) {
    template = 'semihler'
    signals.push('semihler_keyword_or_table')
  }

  return {
    template,
    supplierName: inferSupplierName(text, template),
    confidence: template === 'unknown' ? 35 : 80,
    signals,
  }
}

export function hasIncomingTemplateLineHeader(text: string, template: IncomingSupplierTemplate): boolean {
  const folded = fold(text)
  if (template === 'migros') return /URUN KODU/.test(folded) && /URUN ADI/.test(folded) && /BIRIM FIYAT/.test(folded)
  if (template === 'erkarpas') return /STOK KODU/.test(folded) && /MAL\s*\/\s*HIZMET/.test(folded)
  if (template === 'hidropres') return /HIZMET\s*\/\s*URUN ADI/.test(folded) && /BIRIM FIYAT/.test(folded)
  if (template === 'semihler') return /MALZEME\s*\/\s*HIZMET/.test(folded) && /KDV/.test(folded)
  return /(URUN ADI|MAL\s*\/\s*HIZMET|HIZMET\s*\/\s*URUN ADI|MALZEME\s*\/\s*HIZMET)/.test(folded)
}
