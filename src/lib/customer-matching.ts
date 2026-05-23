export type CustomerMatchCandidate = {
  id: string
  full_name: string | null
  tax_number?: string | null
  tc_kimlik?: string | null
  address?: string | null
}

export type CustomerMatchDecision =
  | {
      status: 'matched'
      customer: CustomerMatchCandidate
      candidates: CustomerMatchCandidate[]
      message: string
    }
  | {
      status: 'suspicious'
      candidates: CustomerMatchCandidate[]
      suggestedCustomer?: CustomerMatchCandidate
      message: string
    }
  | {
      status: 'new'
      candidates: CustomerMatchCandidate[]
      message: string
    }

const COMPANY_WORDS = [
  'anonim', 'as', 'a s', 'limited', 'ltd', 'sti', 'sirketi', 'sanayi', 'san',
  'ticaret', 'tic', 'pazarlama', 'paz', 'ithalat', 'ihracat', 'insaat', 'ins',
  've', 'co', 'corp',
]

export function normalizeCustomerTaxNo(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function normalizeCustomerName(value: string | null | undefined): string {
  let normalized = (value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  for (const word of COMPANY_WORDS) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ')
  }

  return normalized.replace(/\s+/g, ' ').trim()
}

function normalizeAddress(value: string | null | undefined): string {
  return normalizeCustomerName(value)
    .replace(/\b(mahallesi|mahalle|mah|caddesi|cadde|cad|sokak|sok|no|kat|daire)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(value: string): Set<string> {
  return new Set(value.split(' ').filter(token => token.length > 1))
}

function tokenSimilarity(a: string, b: string): number {
  const aTokens = tokenSet(a)
  const bTokens = tokenSet(b)
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let intersection = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1
  }
  return intersection / Math.max(aTokens.size, bTokens.size)
}

export function customerNamesStronglySimilar(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeCustomerName(a)
  const nb = normalizeCustomerName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 12 && nb.length >= 12 && (na.includes(nb) || nb.includes(na))) return true
  return tokenSimilarity(na, nb) >= 0.78
}

function addressesCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddress(a)
  const nb = normalizeAddress(b)
  if (!na || !nb) return true
  if (na === nb) return true
  if (na.length >= 12 && nb.length >= 12 && (na.includes(nb) || nb.includes(na))) return true
  return tokenSimilarity(na, nb) >= 0.72
}

function sameTax(customer: CustomerMatchCandidate, taxNo: string): boolean {
  if (!taxNo || taxNo.length < 10) return false
  return normalizeCustomerTaxNo(customer.tax_number) === taxNo ||
    normalizeCustomerTaxNo(customer.tc_kimlik) === taxNo
}

function findNameMatch(customers: CustomerMatchCandidate[], name: string): CustomerMatchCandidate | undefined {
  return customers.find(customer => customerNamesStronglySimilar(customer.full_name, name))
}

export function matchCustomerForImport(
  customers: CustomerMatchCandidate[],
  input: { name: string | null | undefined; taxNo?: string | null; address?: string | null }
): CustomerMatchDecision {
  const taxNo = normalizeCustomerTaxNo(input.taxNo)
  const name = input.name ?? ''
  const sameTaxCandidates = taxNo.length >= 10
    ? customers.filter(customer => sameTax(customer, taxNo))
    : []

  if (sameTaxCandidates.length > 0) {
    const strong = sameTaxCandidates.find(customer =>
      customerNamesStronglySimilar(customer.full_name, name) &&
      addressesCompatible(customer.address, input.address)
    )

    if (strong) {
      return {
        status: 'matched',
        customer: strong,
        candidates: sameTaxCandidates,
        message: 'Müşteri VKN/TCKN, ünvan ve adres ile eşleşti',
      }
    }

    return {
      status: 'suspicious',
      candidates: sameTaxCandidates,
      suggestedCustomer: sameTaxCandidates[0],
      message: 'Aynı VKN/TCKN ile kayıt bulundu, ancak ünvan veya adres farklı',
    }
  }

  const nameMatch = findNameMatch(customers, name)
  if (nameMatch) {
    return {
      status: 'matched',
      customer: nameMatch,
      candidates: [nameMatch],
      message: 'Müşteri ünvan ile eşleşti',
    }
  }

  return {
    status: 'new',
    candidates: [],
    message: 'Yeni müşteri oluşturulacak',
  }
}
