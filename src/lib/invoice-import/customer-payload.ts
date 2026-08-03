export interface CustomerImportSource {
  name: string
  taxNumber?: string | null
  address?: string | null
  city?: string | null
  district?: string | null
  branchId?: string | null
  firmaId: string
}

/**
 * Repo'da kanıtlanmış customers sözleşmesi.
 *
 * `customers.il` canonical migration ve mevcut müşteri formunda vardır.
 * `customers.ilce` ise migration/generated tip/form sözleşmesinde yoktur. İlçe bu
 * nedenle kaybedilmez; canonical tam adres alanında korunur.
 */
export interface CustomerImportInsert {
  full_name: string
  type: 'individual' | 'company'
  tax_number: string | null
  address: string | null
  il: string | null
  sube_id: string | null
  is_active: true
  firma_id: string
}

function clean(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized || null
}

export function preserveDistrictInAddress(address?: string | null, district?: string | null): string | null {
  const normalizedAddress = clean(address)
  const normalizedDistrict = clean(district)
  if (!normalizedDistrict) return normalizedAddress
  if (!normalizedAddress) return normalizedDistrict

  const addressFolded = normalizedAddress.toLocaleLowerCase('tr-TR')
  const districtFolded = normalizedDistrict.toLocaleLowerCase('tr-TR')
  return addressFolded.includes(districtFolded)
    ? normalizedAddress
    : `${normalizedAddress}, ${normalizedDistrict}`
}

export function buildCustomerImportInsert(source: CustomerImportSource): CustomerImportInsert {
  const taxNumber = clean(source.taxNumber)?.replace(/\D/g, '') || null
  return {
    full_name: source.name.trim(),
    type: taxNumber?.length === 11 ? 'individual' : 'company',
    tax_number: taxNumber,
    address: preserveDistrictInAddress(source.address, source.district),
    il: clean(source.city),
    sube_id: clean(source.branchId),
    is_active: true,
    firma_id: source.firmaId,
  }
}
