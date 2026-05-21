export type SupplierMatchMethod = 'tax' | 'normalized_name' | 'similar_name' | 'none'

export type SupplierMatchInput = {
  id?: string | null
  name?: string | null
  taxNo?: string | number | null
}

export type SupplierMatchResult<T> = {
  supplier?: T
  method: SupplierMatchMethod
  score: number
  normalizedName: string
  taxNo: string
}

export function normalizeSupplierTaxNo(value: string | number | null | undefined): string {
  const raw = String(value ?? '')
  const matches = raw.match(/\d{10,11}/g)
  return matches?.[0] ?? raw.replace(/\D/g, '')
}

export function normalizeSupplierName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(a\s*s|anonim\s+sirketi|ltd\s+sti|limited\s+sirketi|limited|ltd|sti|sirketi)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const cur = Array.from({ length: b.length + 1 }, () => 0)

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }

  return prev[b.length]
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if ((a.length >= 8 || b.length >= 8) && (a.includes(b) || b.includes(a))) return 0.93

  const distanceScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length)
  const aTokens = new Set(a.split(' ').filter(Boolean))
  const bTokens = new Set(b.split(' ').filter(Boolean))
  const common = [...aTokens].filter(t => bTokens.has(t)).length
  const tokenScore = common / Math.max(aTokens.size, bTokens.size, 1)

  return Math.max(distanceScore, tokenScore)
}

export function matchExistingSupplier<T extends SupplierMatchInput>(
  suppliers: T[],
  input: SupplierMatchInput,
): SupplierMatchResult<T> {
  const taxNo = normalizeSupplierTaxNo(input.taxNo)
  const normalizedName = normalizeSupplierName(input.name)

  if (taxNo.length >= 10) {
    const supplier = suppliers.find(s => normalizeSupplierTaxNo(s.taxNo) === taxNo)
    if (supplier) return { supplier, method: 'tax', score: 1, normalizedName, taxNo }
  }

  if (normalizedName) {
    const supplier = suppliers.find(s => normalizeSupplierName(s.name) === normalizedName)
    if (supplier) return { supplier, method: 'normalized_name', score: 1, normalizedName, taxNo }

    let best: { supplier: T; score: number } | null = null
    for (const supplier of suppliers) {
      const score = similarity(normalizedName, normalizeSupplierName(supplier.name))
      if (!best || score > best.score) best = { supplier, score }
    }
    if (best && best.score >= 0.86) {
      return { supplier: best.supplier, method: 'similar_name', score: best.score, normalizedName, taxNo }
    }
  }

  return { method: 'none', score: 0, normalizedName, taxNo }
}
