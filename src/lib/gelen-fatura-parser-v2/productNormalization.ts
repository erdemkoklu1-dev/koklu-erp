import {
  hasNumberlessWeightPrefix,
  normalizeProductCapacity,
  stripLeadingRowNumber,
} from '../invoice-parse/product-capacity'

export interface NormalizedIncomingProduct {
  raw_description: string
  normalized_description: string
  warnings: string[]
}

const HEADER_LEAK_PATTERNS = [
  /Fatura\s+(?:Tipi|No|Tarihi)/iu,
  /D[üu]zenleme\s+Tarihi/iu,
  /Son\s+[ÖO]deme\s+Tarihi/iu,
  /Vergi\s+Dairesi/iu,
  /ETTN/iu,
  /Gönderim\s+Şekli|Gonderim\s+Sekli/iu,
  /Adres\s*:/iu,
  /\bVKN\b|\bTCKN\b/iu,
  /Mal\s+Hizmet|Birim\s+Fiyat/iu,
]

const NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/\bDed[öo]kt[öo]r(ü)?\b/giu, 'Dedektör$1'],
  [/\bAlrm\b/giu, 'Alarm'],
  [/\bSren\b/giu, 'Siren'],
  [/\bBtn\b/giu, 'Buton'],
  [/\bSondurme\b/giu, 'Söndürme'],
  [/\bCihazi\b/giu, 'Cihazı'],
  [/\bYangin\b/giu, 'Yangın'],
  [/\bK\.?K\.?T\.?\b/giu, 'KKT'],
  [/\bC0?O?2\b(?![\w])/gu, 'CO2'],
]

export function normalizeIncomingProductDescription(description: unknown): NormalizedIncomingProduct {
  const raw = String(description ?? '').replace(/\s+/g, ' ').trim()
  const warnings: string[] = []

  let normalized = stripLeadingRowNumber(raw)
    .replace(/\s+\d{1,4}\s+(?=Söndürme|Sondurme|Cihazı|Cihazi|Dolum|Dolumu)/giu, ' ')
    .trim()

  for (const pattern of HEADER_LEAK_PATTERNS) {
    if (pattern.test(normalized)) warnings.push('header_leak')
    normalized = normalized.replace(pattern, ' ').replace(/\s+/g, ' ').trim()
  }

  for (const [pattern, replacement] of NORMALIZATION_RULES) {
    normalized = normalized.replace(pattern, replacement)
  }

  normalized = normalized
    .replace(/\b(\d+)\s*Kg\s+KKT\s+Yangın\s+Söndürme\s+Cihazı\s+Dolum(?:u)?\b/iu, '$1 Kg KKT Yangın Söndürme Cihazı Dolumu')
    .replace(/\b(\d+)\s*Kg\s+Köpüklü\s+Yangın\s+Söndürme\s+Cihazı\s+Dolum(?:u)?\b/iu, '$1 Kg Köpüklü Yangın Söndürme Cihazı Dolumu')
    .replace(/\s+/g, ' ')
    .trim()

  normalized = normalizeProductCapacity(normalized)

  if (!normalized || normalized.length < 2) warnings.push('empty_description')
  if (/^\d+\s+/.test(normalized)) warnings.push('line_number_leak')
  if (hasNumberlessWeightPrefix(normalized)) warnings.push('missing_weight_capacity')

  return {
    raw_description: raw,
    normalized_description: normalized || raw,
    warnings: [...new Set(warnings)],
  }
}
