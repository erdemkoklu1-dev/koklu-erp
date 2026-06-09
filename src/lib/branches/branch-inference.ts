export type BranchInferenceConfidence = 'high' | 'medium' | 'low' | 'none'

export type BranchCandidate = {
  id: string
  ad?: string | null
  name?: string | null
  sehir?: string | null
  city?: string | null
}

export interface BranchInferenceResult {
  city: string | null
  suggestedBranchId: string | null
  suggestedBranchName: string | null
  confidence: BranchInferenceConfidence
  reason: string
}

const CITY_ALIASES: Array<{ city: string; aliases: string[] }> = [
  { city: 'İstanbul', aliases: ['istanbul'] },
  { city: 'Erzincan', aliases: ['erzincan'] },
  { city: 'Ankara', aliases: ['ankara'] },
  { city: 'İzmir', aliases: ['izmir'] },
  { city: 'Elazığ', aliases: ['elazig', 'elazığ'] },
]

export function normalizeCityName(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function inferCityFromAddress(address?: string | null): string | null {
  const normalized = normalizeCityName(address)
  if (!normalized) return null

  for (const entry of CITY_ALIASES) {
    if (entry.aliases.some(alias => normalized.includes(normalizeCityName(alias)))) {
      return entry.city
    }
  }

  return null
}

export function suggestBranchByCity(
  city: string | null | undefined,
  branches: BranchCandidate[],
): BranchInferenceResult {
  const normalizedCity = normalizeCityName(city)

  if (!normalizedCity) {
    return {
      city: null,
      suggestedBranchId: null,
      suggestedBranchName: null,
      confidence: 'none',
      reason: 'Adres veya şehir bilgisi bulunamadı.',
    }
  }

  const directMatch = branches.find(branch => {
    const branchCity = normalizeCityName(branch.sehir ?? branch.city)
    const branchName = normalizeCityName(branch.ad ?? branch.name)
    return branchCity === normalizedCity || branchName.includes(normalizedCity)
  })

  if (directMatch) {
    return {
      city: city || null,
      suggestedBranchId: directMatch.id,
      suggestedBranchName: directMatch.ad ?? directMatch.name ?? null,
      confidence: 'high',
      reason: `${city} bilgisine göre şube önerildi.`,
    }
  }

  const citySpecificName = normalizedCity === 'istanbul'
    ? 'istanbul'
    : normalizedCity === 'erzincan'
      ? 'erzincan'
      : normalizedCity

  const nameMatch = branches.find(branch =>
    normalizeCityName(branch.ad ?? branch.name).includes(citySpecificName)
  )

  if (nameMatch) {
    return {
      city: city || null,
      suggestedBranchId: nameMatch.id,
      suggestedBranchName: nameMatch.ad ?? nameMatch.name ?? null,
      confidence: 'medium',
      reason: `${city} bilgisine göre şube adı eşleşti.`,
    }
  }

  return {
    city: city || null,
    suggestedBranchId: null,
    suggestedBranchName: null,
    confidence: 'low',
    reason: `${city} bulundu fakat eşleşen şube bulunamadı.`,
  }
}

export function inferBranchFromAddress(
  address: string | null | undefined,
  branches: BranchCandidate[],
): BranchInferenceResult {
  return suggestBranchByCity(inferCityFromAddress(address), branches)
}
