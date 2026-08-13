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
  /** VKN eşleşti ama isimler tamamen farklı — muhtemelen DB'de yanlış VKN kaydı */
  vknNameMismatch?: boolean
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    // Hukuki şirket tipleri
    .replace(/\b(a\s*s|anonim\s+sirketi|ltd\s+sti|limited\s+sirketi|limited|ltd|sti|sirketi)\b/g, ' ')
    // Genel sektör kelimeleri — her firmada geçer, eşleştirmeyi bozar
    .replace(/\b(san\s+ve\s+tic|san\s+tic|ve\s+tic|dis\s+tic|ic\s+ve\s+dis\s+tic)\b/g, ' ')
    .replace(/\b(ticaret|sanayi)\b/g, ' ')
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

  // İçerme kontrolü: kısa isim uzun ismin en az %60'ı olmalı
  const shorter = a.length <= b.length ? a : b
  const longer  = a.length <= b.length ? b : a
  if (shorter.length >= 5 && longer.includes(shorter) && shorter.length / longer.length >= 0.6) {
    return 0.93
  }

  const distanceScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length)

  // 2 karakterden kısa token'lar anlamsız — filtreleniyor
  const aTokens = new Set(a.split(' ').filter(t => t.length > 2))
  const bTokens = new Set(b.split(' ').filter(t => t.length > 2))

  let tokenScore = 0
  if (aTokens.size > 0 && bTokens.size > 0) {
    const common = [...aTokens].filter(t => bTokens.has(t)).length
    tokenScore = common / Math.max(aTokens.size, bTokens.size)
  }

  return Math.max(distanceScore, tokenScore)
}

/**
 * VKN eşleşmesinde isim tutarlılığını kontrol eder.
 * DB'deki isimle parse edilen isim arasında HİÇ ortak anlamlı kelime yoksa
 * büyük ihtimalle DB'de yanlış VKN kaydı vardır.
 */
function hasNameOverlap(dbName: string, parsedName: string): boolean {
  const dbNorm     = normalizeSupplierName(dbName)
  const parsedNorm = normalizeSupplierName(parsedName)

  // Normalize sonrası her ikisi de anlamlı uzunlukta olmalı
  if (dbNorm.length < 5 || parsedNorm.length < 5) return true

  const dbWords     = dbNorm.split(' ').filter(w => w.length > 3)
  const parsedWords = parsedNorm.split(' ').filter(w => w.length > 3)

  if (dbWords.length === 0 || parsedWords.length === 0) return true

  return dbWords.some(w => parsedWords.some(pw => pw.includes(w) || w.includes(pw)))
}

export function matchExistingSupplier<T extends SupplierMatchInput>(
  suppliers: T[],
  input: SupplierMatchInput,
): SupplierMatchResult<T> {
  const taxNo = normalizeSupplierTaxNo(input.taxNo)
  const normalizedName = normalizeSupplierName(input.name)

  // 1. VKN/TCKN — en güvenilir, her zaman önce
  if (taxNo.length >= 10) {
    const supplier = suppliers.find(s => normalizeSupplierTaxNo(s.taxNo) === taxNo)
    if (supplier) {
      // İsim tutarlılık kontrolü: VKN eşleşti ama isimler tamamen farklıysa
      // muhtemelen DB'de yanlış VKN kaydı var — eşleşmeyi reddet
      const parsedName = String(input.name ?? '')
      const dbName     = String(supplier.name ?? '')
      if (parsedName && dbName && !hasNameOverlap(dbName, parsedName)) {
        console.warn(
          `[supplier-match] VKN ${taxNo} eşleşti ama isimler uyumsuz: DB="${dbName}" vs Parse="${parsedName}" — eşleşme reddedildi`
        )
        return { method: 'none', score: 0, normalizedName, taxNo, vknNameMismatch: true }
      }
      return { supplier, method: 'tax', score: 1, normalizedName, taxNo }
    }
  }

  // 2. Unvan eşleştirmesi — normalize isim en az 5 karakter olmalı
  if (normalizedName.length >= 5) {
    // 2a. Tam normalize eşleşme
    const exact = suppliers.find(s => {
      const candidateTaxNo = normalizeSupplierTaxNo(s.taxNo)
      if (taxNo.length >= 10 && candidateTaxNo.length >= 10 && candidateTaxNo !== taxNo) return false
      const cn = normalizeSupplierName(s.name)
      return cn.length >= 5 && cn === normalizedName
    })
    if (exact) return { supplier: exact, method: 'normalized_name', score: 1, normalizedName, taxNo }

    // 2b. Benzer unvan — %86 ve üzeri güven skoru
    let best: { supplier: T; score: number } | null = null
    for (const candidate of suppliers) {
      const candidateTaxNo = normalizeSupplierTaxNo(candidate.taxNo)
      if (taxNo.length >= 10 && candidateTaxNo.length >= 10 && candidateTaxNo !== taxNo) continue
      const candidateNorm = normalizeSupplierName(candidate.name)
      if (candidateNorm.length < 5) continue
      const score = similarity(normalizedName, candidateNorm)
      if (!best || score > best.score) best = { supplier: candidate, score }
    }
    if (best && best.score >= 0.86) {
      return { supplier: best.supplier, method: 'similar_name', score: best.score, normalizedName, taxNo }
    }
  }

  return { method: 'none', score: 0, normalizedName, taxNo }
}
