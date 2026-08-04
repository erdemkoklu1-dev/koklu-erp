const WEIGHT_TOKEN_SOURCE = String.raw`\d+(?:[.,]\d+)?\s*(?:k\s*\.?\s*g\s*\.?|kilogram(?:lar)?)`
const WEIGHT_TOKEN = new RegExp(String.raw`\b(${WEIGHT_TOKEN_SOURCE})(?=\s|$)`, 'giu')
const LEADING_WEIGHT = new RegExp(String.raw`^\s*${WEIGHT_TOKEN_SOURCE}(?=\s|$)`, 'iu')
const NUMBERLESS_WEIGHT_PREFIX = /^\s*(?:k\s*\.\s*g\s*\.?|kg\.?)\s+/iu

export function normalizeProductCapacity(description: unknown): string {
  return String(description ?? '')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*kilogram(?:lar)?\b\.?/giu, '$1 Kg')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*k\s*\.?\s*g\s*\.?(?=\s|$)/giu, '$1 Kg')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Yalnız gerçek tablo sıra numarasını temizler. `6 Kg ...` gibi ürün
 * kapasitesiyle başlayan açıklamalardaki sayı ürün adının parçasıdır.
 */
export function stripLeadingRowNumber(description: unknown): string {
  const normalized = normalizeProductCapacity(description)
  if (LEADING_WEIGHT.test(normalized)) return normalized
  return normalized.replace(/^\d{1,4}\s+/, '').trim()
}

export function productWeightCapacities(description: unknown): string[] {
  const normalized = normalizeProductCapacity(description)
  return [...normalized.matchAll(WEIGHT_TOKEN)].map(match => {
    const number = match[1].match(/\d+(?:[.,]\d+)?/)?.[0].replace(',', '.')
    return `${number}kg`
  })
}

export function hasNumberlessWeightPrefix(description: unknown): boolean {
  return NUMBERLESS_WEIGHT_PREFIX.test(String(description ?? ''))
}

export function sourceCapacityWasLost(source: unknown, output: unknown): boolean {
  const sourceWeights = productWeightCapacities(source)
  if (sourceWeights.length === 0) return false
  const outputWeights = new Set(productWeightCapacities(output))
  return sourceWeights.some(weight => !outputWeights.has(weight))
}
