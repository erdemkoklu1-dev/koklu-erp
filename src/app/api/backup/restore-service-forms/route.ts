import AdmZip from 'adm-zip'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'
import { collectAvailableDeviceIds, restoreHatirlatmalar } from '@/lib/backup/hatirlatmalar-restore'

export const runtime = 'nodejs'

type JsonRow = Record<string, unknown>

type RestoreSummary = {
  service_forms: { inserted: number; skipped: number; errors: string[] }
  service_form_items: { inserted: number; skipped: number; errors: string[] }
  urunler: { inserted: number; skipped: number; errors: string[] }
  customers: { inserted: number; skipped: number; merged: number; relation_risks: number; errors: string[] }
  devices: { inserted: number; skipped: number; remapped: number; relation_risks: number; errors: string[] }
  teklifler: { inserted: number; skipped: number; merged: number; errors: string[] }
  teklif_kalemleri: { inserted: number; skipped: number; relation_risks: number; errors: string[] }
  hatirlatma_kayitlari: { inserted: number; skipped: number; merged: number; relation_risks: number; errors: string[] }
  hatirlatma_susturmalar: { inserted: number; skipped: number; merged: number; relation_risks: number; errors: string[] }
}

const URUN_KATEGORILERI = new Set(['cihaz', 'dolum', 'yedek_parca'])

function readJsonEntry(zip: AdmZip, entryName: string): JsonRow[] {
  const entry = zip.getEntry(entryName)
  if (!entry) throw new Error(`${entryName} bulunamadi.`)

  const parsed = JSON.parse(entry.getData().toString('utf8'))
  if (!Array.isArray(parsed)) throw new Error(`${entryName} dizi formatinda degil.`)
  return parsed.filter((row): row is JsonRow => row && typeof row === 'object' && !Array.isArray(row))
}

function readOptionalJsonEntry(zip: AdmZip, entryName: string): JsonRow[] | null {
  const entry = zip.getEntry(entryName)
  if (!entry) return null

  const parsed = JSON.parse(entry.getData().toString('utf8'))
  if (!Array.isArray(parsed)) throw new Error(`${entryName} dizi formatinda degil.`)
  return parsed.filter((row): row is JsonRow => row && typeof row === 'object' && !Array.isArray(row))
}

function stringSet(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

function cleanRows(rows: JsonRow[]) {
  return rows.map(row => {
    const clean: JsonRow = {}
    for (const [key, value] of Object.entries(row)) {
      if (key.includes('.')) continue
      clean[key] = value
    }
    return clean
  })
}

function normalizeUrunKey(kategori: unknown, ad: unknown) {
  if (typeof kategori !== 'string' || typeof ad !== 'string') return null
  const cleanKategori = kategori.trim()
  const cleanAd = ad.trim().toLocaleLowerCase('tr-TR')
  if (!cleanKategori || !cleanAd) return null
  return `${cleanKategori}::${cleanAd}`
}

function validateUrun(row: JsonRow) {
  const errors: string[] = []
  if (typeof row.kategori !== 'string' || !URUN_KATEGORILERI.has(row.kategori)) errors.push('kategori gecersiz')
  if (typeof row.ad !== 'string' || row.ad.trim().length === 0) errors.push('ad zorunlu')
  return errors
}

function normalizeCustomerName(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
  return normalized.length > 0 ? normalized : null
}

function normalizeTaxNumber(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).replace(/\D/g, '')
  return normalized.length > 0 ? normalized : null
}

function validateCustomer(row: JsonRow) {
  const errors: string[] = []
  if (typeof row.full_name !== 'string' || row.full_name.trim().length === 0) errors.push('full_name zorunlu')
  return errors
}

type ExistingCustomer = {
  id: string
  tax_number: string | null
  full_name: string | null
}

function customerMergePayload(row: JsonRow) {
  const payload: JsonRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'created_at') continue
    if (value === null || value === undefined || value === '') continue
    payload[key] = value
  }
  payload.updated_at = new Date().toISOString()
  return payload
}

async function existingIds(table: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from(table).select('id').in('id', ids)
  if (error) throw error
  return new Set((data ?? []).map(row => row.id as string))
}

async function restoreCustomers(rows: JsonRow[], summary: RestoreSummary['customers']) {
  const supabase = createServiceClient()
  const idMap = new Map<string, string>()
  const cleanCustomers = cleanRows(rows)
  const validRows: JsonRow[] = []

  for (const row of cleanCustomers) {
    const errors = validateCustomer(row)
    if (errors.length > 0) {
      summary.errors.push(`${typeof row.full_name === 'string' ? row.full_name : 'isimsiz musteri'}: ${errors.join(', ')}`)
    } else {
      validRows.push(row)
    }
  }

  const ids = stringSet(validRows.map(row => row.id))
  const wantedTaxNumbers = new Set(validRows.map(row => normalizeTaxNumber(row.tax_number)).filter((key): key is string => Boolean(key)))
  const wantedNames = new Set(validRows.map(row => normalizeCustomerName(row.full_name)).filter((key): key is string => Boolean(key)))
  const existingById = new Map<string, ExistingCustomer>()
  const existingByTaxNumber = new Map<string, ExistingCustomer>()
  const existingByName = new Map<string, ExistingCustomer>()

  if (ids.length > 0) {
    const { data, error } = await supabase.from('customers').select('id, tax_number, full_name').in('id', ids)
    if (error) throw error
    for (const row of data ?? []) {
      existingById.set(row.id as string, row as ExistingCustomer)
    }
  }

  if (wantedTaxNumbers.size > 0 || wantedNames.size > 0) {
    const { data, error } = await supabase.from('customers').select('id, tax_number, full_name')
    if (error) throw error
    for (const row of data ?? []) {
      const customer = row as ExistingCustomer
      const taxNumber = normalizeTaxNumber(customer.tax_number)
      const name = normalizeCustomerName(customer.full_name)
      if (taxNumber && wantedTaxNumbers.has(taxNumber) && !existingByTaxNumber.has(taxNumber)) existingByTaxNumber.set(taxNumber, customer)
      if (name && wantedNames.has(name) && !existingByName.has(name)) existingByName.set(name, customer)
    }
  }

  const seenIds = new Set<string>()
  const seenTaxNumbers = new Set<string>()
  const seenNames = new Set<string>()
  const toInsert: JsonRow[] = []
  const toMerge: Array<{ existing: ExistingCustomer; row: JsonRow }> = []

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const taxNumber = normalizeTaxNumber(row.tax_number)
    const name = normalizeCustomerName(row.full_name)
    const existing = (id ? existingById.get(id) : undefined) ??
      (taxNumber ? existingByTaxNumber.get(taxNumber) : undefined) ??
      (name ? existingByName.get(name) : undefined)
    const duplicateInFile = (id && seenIds.has(id)) ||
      (taxNumber && seenTaxNumbers.has(taxNumber)) ||
      (name && seenNames.has(name))

    if (existing) {
      toMerge.push({ existing, row })
      if (id) seenIds.add(id)
      if (taxNumber) seenTaxNumbers.add(taxNumber)
      if (name) seenNames.add(name)
      continue
    }
    if (duplicateInFile) {
      summary.skipped += 1
      continue
    }

    toInsert.push(row)
    if (id) seenIds.add(id)
    if (taxNumber) seenTaxNumbers.add(taxNumber)
    if (name) seenNames.add(name)
  }

  for (const { existing, row } of toMerge) {
    const payload = customerMergePayload(row)
    const { error } = await supabase.from('customers').update(payload).eq('id', existing.id)
    if (error) {
      summary.errors.push(`${typeof row.full_name === 'string' ? row.full_name : existing.id}: ${error.message}`)
    } else {
      summary.merged += 1
      if (typeof row.id === 'string' && row.id.length > 0) idMap.set(row.id, existing.id)
    }
  }

  for (const row of toInsert) {
    const { error } = await supabase.from('customers').insert(row)
    if (error) {
      summary.errors.push(`${typeof row.full_name === 'string' ? row.full_name : row.id ?? 'musteri'}: ${error.message}`)
    } else {
      summary.inserted += 1
      if (typeof row.id === 'string' && row.id.length > 0) idMap.set(row.id, row.id)
    }
  }

  return idMap
}

async function restoreUrunler(rows: JsonRow[], summary: RestoreSummary['urunler']) {
  const supabase = createServiceClient()
  const cleanUrunler = cleanRows(rows)
  const validRows: JsonRow[] = []

  for (const row of cleanUrunler) {
    const errors = validateUrun(row)
    if (errors.length > 0) {
      summary.errors.push(`${typeof row.ad === 'string' ? row.ad : 'isimsiz urun'}: ${errors.join(', ')}`)
    } else {
      validRows.push(row)
    }
  }

  const ids = stringSet(validRows.map(row => row.id))
  const existingIdSet = await existingIds('urunler', ids)
  const categories = stringSet(validRows.map(row => row.kategori))
  const wantedNaturalKeys = new Set(validRows.map(row => normalizeUrunKey(row.kategori, row.ad)).filter((key): key is string => Boolean(key)))
  const existingNaturalKeys = new Set<string>()

  if (categories.length > 0) {
    const { data, error } = await supabase.from('urunler').select('kategori, ad').in('kategori', categories)
    if (error) throw error
    for (const row of data ?? []) {
      const key = normalizeUrunKey(row.kategori, row.ad)
      if (key && wantedNaturalKeys.has(key)) existingNaturalKeys.add(key)
    }
  }

  const seenIds = new Set<string>()
  const seenNaturalKeys = new Set<string>()
  const toInsert: JsonRow[] = []

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const naturalKey = normalizeUrunKey(row.kategori, row.ad)
    const duplicate = (id && (existingIdSet.has(id) || seenIds.has(id))) || (naturalKey && (existingNaturalKeys.has(naturalKey) || seenNaturalKeys.has(naturalKey)))
    if (duplicate) {
      summary.skipped += 1
      continue
    }

    toInsert.push(row)
    if (id) seenIds.add(id)
    if (naturalKey) seenNaturalKeys.add(naturalKey)
  }

  for (const row of toInsert) {
    const { error } = await supabase.from('urunler').insert(row)
    if (error) {
      summary.errors.push(`${typeof row.ad === 'string' ? row.ad : row.id ?? 'urun'}: ${error.message}`)
    } else {
      summary.inserted += 1
    }
  }
}

function deviceMergePayload(row: JsonRow) {
  const payload: JsonRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id' || key === 'created_at') continue
    if (value === undefined) continue
    payload[key] = value
  }
  return payload
}

async function restoreDevices(rows: JsonRow[], customerIdMap: Map<string, string>, summary: RestoreSummary['devices']) {
  const supabase = createServiceClient()
  const cleanDevices = cleanRows(rows)
  const ids = stringSet(cleanDevices.map(row => row.id))
  const existingDeviceIds = await existingIds('devices', ids)
  const targetCustomerIds = stringSet(cleanDevices.map(row => {
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : ''
    return customerIdMap.get(customerId) ?? customerId
  }))
  const existingCustomerIds = await existingIds('customers', targetCustomerIds)
  const seenIds = new Set<string>()
  const toInsert: JsonRow[] = []

  for (const row of cleanDevices) {
    const id = typeof row.id === 'string' ? row.id : ''
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : ''
    const mappedCustomerId = customerIdMap.get(customerId) ?? customerId

    if (!customerId) {
      summary.errors.push(`${id || 'cihaz'}: customer_id zorunlu`)
      continue
    }
    if (!existingCustomerIds.has(mappedCustomerId)) {
      summary.relation_risks += 1
      summary.skipped += 1
      continue
    }

    const device = { ...row, customer_id: mappedCustomerId }
    if (id && seenIds.has(id)) {
      summary.skipped += 1
      continue
    }

    if (mappedCustomerId !== customerId) summary.remapped += 1
    if (id && existingDeviceIds.has(id)) {
      const { error } = await supabase.from('devices').update(deviceMergePayload(device)).eq('id', id)
      if (error) {
        summary.errors.push(`${id}: ${error.message}`)
      }
      seenIds.add(id)
      continue
    }

    toInsert.push(device)
    if (id) seenIds.add(id)
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('devices').insert(toInsert)
    if (error) {
      summary.errors.push(error.message)
    } else {
      summary.inserted = toInsert.length
    }
  }
}

async function existingFormNumbers(formNumbers: string[]) {
  if (formNumbers.length === 0) return new Set<string>()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('service_forms')
    .select('form_number')
    .in('form_number', formNumbers)
  if (error) throw error
  return new Set((data ?? []).map(row => row.form_number as string))
}

function normalizeTeklifNo(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim().toLocaleLowerCase('tr-TR')
  return normalized.length > 0 ? normalized : null
}

function teklifItemKey(row: JsonRow, teklifId: string) {
  const siraNo = typeof row.sira_no === 'number' || typeof row.sira_no === 'string' ? String(row.sira_no) : ''
  const aciklama = typeof row.aciklama === 'string' ? row.aciklama.trim().toLocaleLowerCase('tr-TR') : ''
  return `${teklifId}::${siraNo}::${aciklama}`
}

type TeklifRestoreMap = {
  idMap: Map<string, string>
  availableIds: Set<string>
}

async function restoreTeklifler(rows: JsonRow[], summary: RestoreSummary['teklifler']): Promise<TeklifRestoreMap> {
  const supabase = createServiceClient()
  const cleanTeklifler = cleanRows(rows)
  const validRows: JsonRow[] = []

  for (const row of cleanTeklifler) {
    if (typeof row.teklif_no !== 'string' || row.teklif_no.trim().length === 0) {
      summary.errors.push(`${typeof row.id === 'string' ? row.id : 'teklif'}: teklif_no zorunlu`)
    } else {
      validRows.push(row)
    }
  }

  const ids = stringSet(validRows.map(row => row.id))
  const teklifNoValues = stringSet(validRows.map(row => row.teklif_no))
  const existingById = new Map<string, string>()
  const existingByTeklifNo = new Map<string, string>()

  if (ids.length > 0) {
    const { data, error } = await supabase.from('teklifler').select('id, teklif_no').in('id', ids)
    if (error) throw error
    for (const row of data ?? []) {
      existingById.set(row.id as string, row.id as string)
      const teklifNo = normalizeTeklifNo(row.teklif_no)
      if (teklifNo && !existingByTeklifNo.has(teklifNo)) existingByTeklifNo.set(teklifNo, row.id as string)
    }
  }

  for (let i = 0; i < teklifNoValues.length; i += 50) {
    const batch = teklifNoValues.slice(i, i + 50)
    const { data, error } = await supabase.from('teklifler').select('id, teklif_no').in('teklif_no', batch)
    if (error) throw error
    for (const row of data ?? []) {
      const teklifNo = normalizeTeklifNo(row.teklif_no)
      if (teklifNo && !existingByTeklifNo.has(teklifNo)) existingByTeklifNo.set(teklifNo, row.id as string)
    }
  }

  const seenIds = new Set<string>()
  const seenTeklifNos = new Set<string>()
  const idMap = new Map<string, string>()
  const availableIds = new Set<string>()

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const teklifNo = normalizeTeklifNo(row.teklif_no)
    const existingId = (id ? existingById.get(id) : undefined) ?? (teklifNo ? existingByTeklifNo.get(teklifNo) : undefined)
    const duplicateInFile = (id && seenIds.has(id)) || (teklifNo && seenTeklifNos.has(teklifNo))

    if (existingId) {
      summary.merged += 1
      if (id) idMap.set(id, existingId)
      availableIds.add(existingId)
      if (id) seenIds.add(id)
      if (teklifNo) seenTeklifNos.add(teklifNo)
      continue
    }
    if (duplicateInFile) {
      summary.skipped += 1
      continue
    }

    const { data, error } = await supabase.from('teklifler').insert(row).select('id').single()
    if (error) {
      summary.errors.push(`${typeof row.teklif_no === 'string' ? row.teklif_no : id || 'teklif'}: ${error.message}`)
    } else {
      summary.inserted += 1
      const insertedId = data?.id as string | undefined
      if (id && insertedId) idMap.set(id, insertedId)
      if (insertedId) availableIds.add(insertedId)
    }

    if (id) seenIds.add(id)
    if (teklifNo) seenTeklifNos.add(teklifNo)
  }

  return { idMap, availableIds }
}

async function restoreTeklifKalemleri(rows: JsonRow[], teklifMap: TeklifRestoreMap, summary: RestoreSummary['teklif_kalemleri']) {
  const supabase = createServiceClient()
  const cleanKalemler = cleanRows(rows)
  const ids = stringSet(cleanKalemler.map(row => row.id))
  const targetTeklifIds = stringSet(cleanKalemler.map(row => {
    const teklifId = typeof row.teklif_id === 'string' ? row.teklif_id : ''
    return teklifMap.idMap.get(teklifId) ?? teklifId
  }))
  const existingItemIds = await existingIds('teklif_kalemleri', ids)
  const existingTeklifIds = new Set(teklifMap.availableIds)
  const existingItemKeys = new Set<string>()

  if (targetTeklifIds.length > 0) {
    const idsInDb = await existingIds('teklifler', targetTeklifIds)
    idsInDb.forEach(id => existingTeklifIds.add(id))

    for (let i = 0; i < targetTeklifIds.length; i += 50) {
      const batch = targetTeklifIds.slice(i, i + 50)
      const { data, error } = await supabase.from('teklif_kalemleri').select('teklif_id, sira_no, aciklama').in('teklif_id', batch)
      if (error) throw error
      for (const row of data ?? []) {
        existingItemKeys.add(teklifItemKey(row as JsonRow, row.teklif_id as string))
      }
    }
  }

  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()

  for (const row of cleanKalemler) {
    const id = typeof row.id === 'string' ? row.id : ''
    const sourceTeklifId = typeof row.teklif_id === 'string' ? row.teklif_id : ''
    const targetTeklifId = teklifMap.idMap.get(sourceTeklifId) ?? sourceTeklifId

    if (!sourceTeklifId) {
      summary.errors.push(`${id || 'teklif_kalemi'}: teklif_id zorunlu`)
      continue
    }
    if (!existingTeklifIds.has(targetTeklifId)) {
      summary.relation_risks += 1
      summary.skipped += 1
      continue
    }

    const key = teklifItemKey(row, targetTeklifId)
    if ((id && (existingItemIds.has(id) || seenIds.has(id))) || existingItemKeys.has(key) || seenKeys.has(key)) {
      summary.skipped += 1
      continue
    }

    const item = { ...row, teklif_id: targetTeklifId }
    const { error } = await supabase.from('teklif_kalemleri').insert(item)
    if (error) {
      summary.errors.push(`${id || targetTeklifId}: ${error.message}`)
    } else {
      summary.inserted += 1
      if (id) seenIds.add(id)
      seenKeys.add(key)
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireBackupUser()
    const form = await req.formData()
    const file = form.get('file')
    const confirmed = form.get('confirm') === 'true'

    if (!confirmed) {
      return NextResponse.json({ error: 'Import icin kullanici onayi gerekli.' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'ZIP dosyasi secilmeli.' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'Import sadece ZIP yedegi ile calisir.' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const zip = new AdmZip(bytes)
    const manifestEntry = zip.getEntry('manifest.json')
    const manifest = manifestEntry ? JSON.parse(manifestEntry.getData().toString('utf8')) : null
    const serviceFormsEntry = zip.getEntry('service_forms.json')
    const serviceFormItemsEntry = zip.getEntry('service_form_items.json')
    const teklifler = readOptionalJsonEntry(zip, 'teklifler.json')
    const teklifKalemleri = readOptionalJsonEntry(zip, 'teklif_kalemleri.json')
    const urunler = readOptionalJsonEntry(zip, 'urunler.json')
    const customers = readOptionalJsonEntry(zip, 'customers.json')
    const devices = readOptionalJsonEntry(zip, 'devices.json')
    const hatirlatmaKayitlari = readOptionalJsonEntry(zip, 'hatirlatma_kayitlari.json')
    const hatirlatmaSusturmalar = readOptionalJsonEntry(zip, 'hatirlatma_susturmalar.json')

    if (!customers && !devices && !urunler && !teklifler && !teklifKalemleri && !hatirlatmaKayitlari && !hatirlatmaSusturmalar && !serviceFormsEntry && !serviceFormItemsEntry) {
      return NextResponse.json({ error: 'Geri yuklenebilir tablo bulunamadi.' }, { status: 400 })
    }

    const summary: RestoreSummary = {
      service_forms: { inserted: 0, skipped: 0, errors: [] },
      service_form_items: { inserted: 0, skipped: 0, errors: [] },
      urunler: { inserted: 0, skipped: 0, errors: [] },
      customers: { inserted: 0, skipped: 0, merged: 0, relation_risks: 0, errors: [] },
      devices: { inserted: 0, skipped: 0, remapped: 0, relation_risks: 0, errors: [] },
      teklifler: { inserted: 0, skipped: 0, merged: 0, errors: [] },
      teklif_kalemleri: { inserted: 0, skipped: 0, relation_risks: 0, errors: [] },
      hatirlatma_kayitlari: { inserted: 0, skipped: 0, merged: 0, relation_risks: 0, errors: [] },
      hatirlatma_susturmalar: { inserted: 0, skipped: 0, merged: 0, relation_risks: 0, errors: [] },
    }

    const supabase = createServiceClient()
    let serviceForms: JsonRow[] = []
    let serviceFormItems: JsonRow[] = []
    let customerIdMap = new Map<string, string>()

    if (customers) {
      customerIdMap = await restoreCustomers(customers, summary.customers)
    }

    if (devices) {
      await restoreDevices(devices, customerIdMap, summary.devices)
    }

    if (hatirlatmaKayitlari || hatirlatmaSusturmalar) {
      const availableCustomerIds = new Set(customerIdMap.values())
      const availableDeviceIds = await collectAvailableDeviceIds(devices, customerIdMap, availableCustomerIds)
      const hatirlatmaSummary = await restoreHatirlatmalar(hatirlatmaKayitlari, hatirlatmaSusturmalar, { customerIdMap, availableCustomerIds, availableDeviceIds })
      summary.hatirlatma_kayitlari = hatirlatmaSummary.hatirlatma_kayitlari
      summary.hatirlatma_susturmalar = hatirlatmaSummary.hatirlatma_susturmalar
    }

    if (serviceFormsEntry || serviceFormItemsEntry) {
      serviceForms = cleanRows(readJsonEntry(zip, 'service_forms.json'))
      serviceFormItems = cleanRows(readJsonEntry(zip, 'service_form_items.json'))
      serviceForms = serviceForms.map(row => {
        const customerId = typeof row.customer_id === 'string' ? row.customer_id : ''
        const mappedCustomerId = customerIdMap.get(customerId)
        return mappedCustomerId ? { ...row, customer_id: mappedCustomerId } : row
      })

      const formIds = stringSet(serviceForms.map(row => row.id))
      const formNumbers = stringSet(serviceForms.map(row => row.form_number))
      const existingFormIdSet = await existingIds('service_forms', formIds)
      const existingFormNumberSet = await existingFormNumbers(formNumbers)

      const formsToInsert = serviceForms.filter(row => {
        const id = typeof row.id === 'string' ? row.id : ''
        const formNumber = typeof row.form_number === 'string' ? row.form_number : ''
        const duplicate = existingFormIdSet.has(id) || existingFormNumberSet.has(formNumber)
        if (duplicate) summary.service_forms.skipped += 1
        return !duplicate
      })

      let insertedFormIds: string[] = []
      if (formsToInsert.length > 0) {
        const { error } = await supabase.from('service_forms').insert(formsToInsert)
        if (error) {
          summary.service_forms.errors.push(error.message)
        } else {
          summary.service_forms.inserted = formsToInsert.length
          insertedFormIds = formsToInsert.map(row => row.id).filter((id): id is string => typeof id === 'string')
        }
      }

      const availableFormIds = new Set([
        ...formIds.filter(id => existingFormIdSet.has(id)),
        ...insertedFormIds,
      ])

      const itemIds = stringSet(serviceFormItems.map(row => row.id))
      const existingItemIdSet = await existingIds('service_form_items', itemIds)
      const itemsToInsert = serviceFormItems.filter(row => {
        const id = typeof row.id === 'string' ? row.id : ''
        const serviceFormId = typeof row.service_form_id === 'string' ? row.service_form_id : ''
        const duplicate = existingItemIdSet.has(id)
        const parentMissing = !availableFormIds.has(serviceFormId)
        if (duplicate || parentMissing) summary.service_form_items.skipped += 1
        return !duplicate && !parentMissing
      })

      if (itemsToInsert.length > 0) {
        const { error } = await supabase.from('service_form_items').insert(itemsToInsert)
        if (error) {
          summary.service_form_items.errors.push(error.message)
        } else {
          summary.service_form_items.inserted = itemsToInsert.length
        }
      }
    }

    if (urunler) {
      await restoreUrunler(urunler, summary.urunler)
    }

    let teklifMap: TeklifRestoreMap = { idMap: new Map<string, string>(), availableIds: new Set<string>() }
    if (teklifler) {
      teklifMap = await restoreTeklifler(teklifler, summary.teklifler)
    }

    if (teklifKalemleri) {
      await restoreTeklifKalemleri(teklifKalemleri, teklifMap, summary.teklif_kalemleri)
    }

    const hasErrors = summary.service_forms.errors.length > 0 ||
      summary.service_form_items.errors.length > 0 ||
      summary.urunler.errors.length > 0 ||
      summary.customers.errors.length > 0 ||
      summary.devices.errors.length > 0 ||
      summary.teklifler.errors.length > 0 ||
      summary.teklif_kalemleri.errors.length > 0 ||
      summary.hatirlatma_kayitlari.errors.length > 0 ||
      summary.hatirlatma_susturmalar.errors.length > 0
    const totalRows = serviceForms.length + serviceFormItems.length + (urunler?.length ?? 0) + (customers?.length ?? 0) + (devices?.length ?? 0) + (teklifler?.length ?? 0) + (teklifKalemleri?.length ?? 0) + (hatirlatmaKayitlari?.length ?? 0) + (hatirlatmaSusturmalar?.length ?? 0)
    const result = {
      restored: !hasErrors,
      dry_run: false,
      file_name: file.name,
      manifest,
      summary,
      message: hasErrors ? 'Import hata ile tamamlandi.' : 'Import tamamlandi.',
    }

    await supabase.from('backup_restores').insert({
      requested_by: user.id,
      file_name: file.name,
      file_size: bytes.length,
      table_count: [serviceForms.length, serviceFormItems.length, urunler?.length ?? 0, customers?.length ?? 0, devices?.length ?? 0, teklifler?.length ?? 0, teklifKalemleri?.length ?? 0, hatirlatmaKayitlari?.length ?? 0, hatirlatmaSusturmalar?.length ?? 0].filter(count => count > 0).length,
      total_rows: totalRows,
      dry_run_result: result,
      status: hasErrors ? 'restore_failed' : (hatirlatmaKayitlari || hatirlatmaSusturmalar) ? 'restored_hatirlatmalar' : (teklifler || teklifKalemleri) ? 'restored_teklifler' : (customers || devices) ? 'restored_customers' : urunler ? 'restored_urunler' : 'restored_service_forms',
    })

    if (urunler) {
      await supabase.from('backup_logs').insert({
        level: hasErrors ? 'warning' : 'info',
        message: 'urunler restore calisti',
        details: {
          requested_by: user.id,
          table: 'urunler',
          total_rows: urunler.length,
          inserted: summary.urunler.inserted,
          skipped: summary.urunler.skipped,
          errors: summary.urunler.errors.length,
        },
      })
    }

    if (customers) {
      await supabase.from('backup_logs').insert({
        level: hasErrors ? 'warning' : 'info',
        message: 'customers restore calisti',
        details: {
          requested_by: user.id,
          table: 'customers',
          total_rows: customers.length,
          inserted: summary.customers.inserted,
          skipped: summary.customers.skipped,
          merged: summary.customers.merged,
          relation_risks: summary.customers.relation_risks,
          errors: summary.customers.errors.length,
        },
      })
    }

    if (devices) {
      await supabase.from('backup_logs').insert({
        level: hasErrors ? 'warning' : 'info',
        message: 'devices restore calisti',
        details: {
          requested_by: user.id,
          table: 'devices',
          total_rows: devices.length,
          inserted: summary.devices.inserted,
          skipped: summary.devices.skipped,
          remapped: summary.devices.remapped,
          relation_risks: summary.devices.relation_risks,
          errors: summary.devices.errors.length,
        },
      })
    }

    if (teklifler || teklifKalemleri) {
      await supabase.from('backup_logs').insert({
        level: hasErrors ? 'warning' : 'info',
        message: 'teklifler restore calisti',
        details: {
          requested_by: user.id,
          tables: ['teklifler', 'teklif_kalemleri'],
          total_teklifler: teklifler?.length ?? 0,
          total_kalemler: teklifKalemleri?.length ?? 0,
          inserted_teklifler: summary.teklifler.inserted,
          matched_teklifler: summary.teklifler.merged,
          skipped_teklifler: summary.teklifler.skipped,
          inserted_kalemler: summary.teklif_kalemleri.inserted,
          skipped_kalemler: summary.teklif_kalemleri.skipped,
          relation_risks: summary.teklif_kalemleri.relation_risks,
          errors: summary.teklifler.errors.length + summary.teklif_kalemleri.errors.length,
        },
      })
    }

    if (hatirlatmaKayitlari || hatirlatmaSusturmalar) {
      await supabase.from('backup_logs').insert({
        level: hasErrors ? 'warning' : 'info',
        message: 'hatirlatmalar restore calisti',
        details: {
          requested_by: user.id,
          tables: ['hatirlatma_kayitlari', 'hatirlatma_susturmalar'],
          total_kayitlar: hatirlatmaKayitlari?.length ?? 0,
          total_susturmalar: hatirlatmaSusturmalar?.length ?? 0,
          inserted_kayitlar: summary.hatirlatma_kayitlari.inserted,
          matched_kayitlar: summary.hatirlatma_kayitlari.merged,
          skipped_kayitlar: summary.hatirlatma_kayitlari.skipped,
          riskli_kayitlar: summary.hatirlatma_kayitlari.relation_risks,
          inserted_susturmalar: summary.hatirlatma_susturmalar.inserted,
          matched_susturmalar: summary.hatirlatma_susturmalar.merged,
          skipped_susturmalar: summary.hatirlatma_susturmalar.skipped,
          riskli_susturmalar: summary.hatirlatma_susturmalar.relation_risks,
          errors: summary.hatirlatma_kayitlari.errors.length + summary.hatirlatma_susturmalar.errors.length,
        },
      })
    }

    return NextResponse.json(result, { status: hasErrors ? 207 : 200 })
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Servis formu importu tamamlanamadi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
