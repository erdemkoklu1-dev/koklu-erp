import AdmZip from 'adm-zip'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'
import { analyzeHatirlatmalar, collectAvailableDeviceIds } from '@/lib/backup/hatirlatmalar-restore'

export const runtime = 'nodejs'

type DryRunManifest = Record<string, unknown> | null
type TableSummary = {
  file: string
  rows: number
  table?: string
  inserted?: number
  skipped?: number
  merged?: number
  remapped?: number
  relation_risks?: number
  errors?: number
}

const RESTORABLE_TABLES = ['service_forms', 'service_form_items', 'urunler', 'customers', 'devices', 'teklifler', 'teklif_kalemleri', 'hatirlatma_kayitlari', 'hatirlatma_susturmalar']
const URUN_KATEGORILERI = new Set(['cihaz', 'dolum', 'yedek_parca'])

type JsonRow = Record<string, unknown>

function asRows(parsed: unknown): JsonRow[] {
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.filter((row): row is JsonRow => row !== null && typeof row === 'object' && !Array.isArray(row))
}

function normalizeNaturalKey(kategori: unknown, ad: unknown) {
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

async function analyzeCustomers(records: JsonRow[]): Promise<{ inserted: number; skipped: number; merged: number; relation_risks: number; errors: number; idMap: Map<string, string> }> {
  const validRows = records.filter(row => validateCustomer(row).length === 0)
  const invalidCount = records.length - validRows.length
  const ids = Array.from(new Set(validRows.map(row => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0)))
  const taxNumbers = Array.from(new Set(validRows.map(row => normalizeTaxNumber(row.tax_number)).filter((key): key is string => Boolean(key))))
  const names = Array.from(new Set(validRows.map(row => normalizeCustomerName(row.full_name)).filter((key): key is string => Boolean(key))))

  const supabase = createServiceClient()
  const existingIds = new Set<string>()
  const existingTaxNumbers = new Set<string>()
  const existingNames = new Set<string>()
  const existingById = new Map<string, ExistingCustomer>()
  const existingByTaxNumber = new Map<string, ExistingCustomer>()
  const existingByName = new Map<string, ExistingCustomer>()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data } = await supabase.from('customers').select('id, tax_number, full_name').in('id', batch)
    if (data) {
      data.forEach(row => {
        const customer = row as ExistingCustomer
        existingIds.add(customer.id)
        existingById.set(customer.id, customer)
      })
    }
  }

  if (taxNumbers.length > 0 || names.length > 0) {
    const { data } = await supabase.from('customers').select('id, tax_number, full_name')
    for (const row of data ?? []) {
      const customer = row as ExistingCustomer
      const taxNumber = normalizeTaxNumber(customer.tax_number)
      const name = normalizeCustomerName(customer.full_name)
      if (taxNumber && taxNumbers.includes(taxNumber)) {
        existingTaxNumbers.add(taxNumber)
        if (!existingByTaxNumber.has(taxNumber)) existingByTaxNumber.set(taxNumber, customer)
      }
      if (name && names.includes(name)) {
        existingNames.add(name)
        if (!existingByName.has(name)) existingByName.set(name, customer)
      }
    }
  }

  const seenIds = new Set<string>()
  const seenTaxNumbers = new Set<string>()
  const seenNames = new Set<string>()
  const idMap = new Map<string, string>()
  let inserted = 0
  let skipped = 0
  let merged = 0

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const taxNumber = normalizeTaxNumber(row.tax_number)
    const name = normalizeCustomerName(row.full_name)
    const existingMatch = (id && existingIds.has(id)) ||
      (taxNumber && existingTaxNumbers.has(taxNumber)) ||
      (name && existingNames.has(name))
    const existing = (id ? existingById.get(id) : undefined) ??
      (taxNumber ? existingByTaxNumber.get(taxNumber) : undefined) ??
      (name ? existingByName.get(name) : undefined)
    const duplicateInFile = (id && seenIds.has(id)) ||
      (taxNumber && seenTaxNumbers.has(taxNumber)) ||
      (name && seenNames.has(name))

    if (existingMatch) {
      merged += 1
      if (id && existing) idMap.set(id, existing.id)
      continue
    }
    if (duplicateInFile) {
      skipped += 1
      continue
    }

    inserted += 1
    if (id) idMap.set(id, id)
    if (id) seenIds.add(id)
    if (taxNumber) seenTaxNumbers.add(taxNumber)
    if (name) seenNames.add(name)
  }

  return { inserted, skipped, merged, relation_risks: 0, errors: invalidCount, idMap }
}

async function analyzeUrunler(records: JsonRow[]): Promise<{ inserted: number; skipped: number; errors: number }> {
  const validRows = records.filter(row => validateUrun(row).length === 0)
  const invalidCount = records.length - validRows.length
  const ids = Array.from(new Set(validRows.map(row => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0)))
  const naturalKeys = Array.from(new Set(validRows.map(row => normalizeNaturalKey(row.kategori, row.ad)).filter((key): key is string => Boolean(key))))

  const supabase = createServiceClient()
  const existingIds = new Set<string>()
  const existingNaturalKeys = new Set<string>()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data } = await supabase.from('urunler').select('id').in('id', batch)
    if (data) data.forEach(row => existingIds.add(row.id as string))
  }

  const categories = Array.from(new Set(validRows.map(row => row.kategori).filter((value): value is string => typeof value === 'string')))
  if (categories.length > 0) {
    const { data } = await supabase.from('urunler').select('kategori, ad').in('kategori', categories)
    for (const row of data ?? []) {
      const key = normalizeNaturalKey(row.kategori, row.ad)
      if (key && naturalKeys.includes(key)) existingNaturalKeys.add(key)
    }
  }

  const seenIds = new Set<string>()
  const seenNaturalKeys = new Set<string>()
  let inserted = 0
  let skipped = 0

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const naturalKey = normalizeNaturalKey(row.kategori, row.ad)
    const duplicate = (id && (existingIds.has(id) || seenIds.has(id))) || (naturalKey && (existingNaturalKeys.has(naturalKey) || seenNaturalKeys.has(naturalKey)))
    if (duplicate) {
      skipped += 1
      continue
    }
    inserted += 1
    if (id) seenIds.add(id)
    if (naturalKey) seenNaturalKeys.add(naturalKey)
  }

  return { inserted, skipped, errors: invalidCount }
}

async function analyzeDevices(records: JsonRow[], customerIdMap: Map<string, string>): Promise<{ inserted: number; skipped: number; remapped: number; relation_risks: number; errors: number }> {
  const validRows = records.filter(row => typeof row.customer_id === 'string' && row.customer_id.length > 0)
  const invalidCount = records.length - validRows.length
  const ids = Array.from(new Set(validRows.map(row => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0)))
  const targetCustomerIds = Array.from(new Set(validRows.map(row => {
    const customerId = row.customer_id as string
    return customerIdMap.get(customerId) ?? customerId
  })))

  const supabase = createServiceClient()
  const existingDeviceIds = new Set<string>()
  const existingCustomerIds = new Set<string>()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data } = await supabase.from('devices').select('id').in('id', batch)
    if (data) data.forEach(row => existingDeviceIds.add(row.id as string))
  }

  for (let i = 0; i < targetCustomerIds.length; i += 50) {
    const batch = targetCustomerIds.slice(i, i + 50)
    const { data } = await supabase.from('customers').select('id').in('id', batch)
    if (data) data.forEach(row => existingCustomerIds.add(row.id as string))
  }

  const seenDeviceIds = new Set<string>()
  let inserted = 0
  let skipped = 0
  let remapped = 0
  let relationRisks = 0

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const customerId = row.customer_id as string
    const mappedCustomerId = customerIdMap.get(customerId) ?? customerId
    const duplicateInFile = id && seenDeviceIds.has(id)

    if (!existingCustomerIds.has(mappedCustomerId)) {
      relationRisks += 1
      skipped += 1
      continue
    }
    if (duplicateInFile) {
      skipped += 1
      continue
    }
    if (id && existingDeviceIds.has(id)) {
      if (mappedCustomerId !== customerId) remapped += 1
      seenDeviceIds.add(id)
      continue
    }

    inserted += 1
    if (mappedCustomerId !== customerId) remapped += 1
    if (id) seenDeviceIds.add(id)
  }

  return { inserted, skipped, remapped, relation_risks: relationRisks, errors: invalidCount }
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

type TeklifAnalysis = {
  inserted: number
  skipped: number
  merged: number
  errors: number
  idMap: Map<string, string>
  availableIds: Set<string>
  insertedIds: Set<string>
}

async function analyzeTeklifler(records: JsonRow[]): Promise<TeklifAnalysis> {
  const validRows = records.filter(row => typeof row.teklif_no === 'string' && row.teklif_no.trim().length > 0)
  const invalidCount = records.length - validRows.length
  const ids = Array.from(new Set(validRows.map(row => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0)))
  const teklifNoValues = Array.from(new Set(validRows.map(row => row.teklif_no).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))

  const supabase = createServiceClient()
  const existingById = new Map<string, string>()
  const existingByTeklifNo = new Map<string, string>()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data } = await supabase.from('teklifler').select('id, teklif_no').in('id', batch)
    for (const row of data ?? []) {
      existingById.set(row.id as string, row.id as string)
      const teklifNo = normalizeTeklifNo(row.teklif_no)
      if (teklifNo && !existingByTeklifNo.has(teklifNo)) existingByTeklifNo.set(teklifNo, row.id as string)
    }
  }

  for (let i = 0; i < teklifNoValues.length; i += 50) {
    const batch = teklifNoValues.slice(i, i + 50)
    const { data } = await supabase.from('teklifler').select('id, teklif_no').in('teklif_no', batch)
    for (const row of data ?? []) {
      const teklifNo = normalizeTeklifNo(row.teklif_no)
      if (teklifNo && !existingByTeklifNo.has(teklifNo)) existingByTeklifNo.set(teklifNo, row.id as string)
    }
  }

  const seenIds = new Set<string>()
  const seenTeklifNos = new Set<string>()
  const idMap = new Map<string, string>()
  const availableIds = new Set<string>()
  const insertedIds = new Set<string>()
  let inserted = 0
  let skipped = 0
  let merged = 0

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const teklifNo = normalizeTeklifNo(row.teklif_no)
    const existingId = (id ? existingById.get(id) : undefined) ?? (teklifNo ? existingByTeklifNo.get(teklifNo) : undefined)
    const duplicateInFile = (id && seenIds.has(id)) || (teklifNo && seenTeklifNos.has(teklifNo))

    if (existingId) {
      merged += 1
      if (id) idMap.set(id, existingId)
      availableIds.add(existingId)
      if (id) seenIds.add(id)
      if (teklifNo) seenTeklifNos.add(teklifNo)
      continue
    }
    if (duplicateInFile) {
      skipped += 1
      continue
    }

    inserted += 1
    if (id) {
      idMap.set(id, id)
      availableIds.add(id)
      insertedIds.add(id)
      seenIds.add(id)
    }
    if (teklifNo) seenTeklifNos.add(teklifNo)
  }

  return { inserted, skipped, merged, errors: invalidCount, idMap, availableIds, insertedIds }
}

async function analyzeTeklifKalemleri(records: JsonRow[], teklifAnalysis: TeklifAnalysis): Promise<{ inserted: number; skipped: number; relation_risks: number; errors: number }> {
  const validRows = records.filter(row => typeof row.teklif_id === 'string' && row.teklif_id.length > 0)
  const invalidCount = records.length - validRows.length
  const ids = Array.from(new Set(validRows.map(row => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0)))
  const targetTeklifIds = Array.from(new Set(validRows.map(row => {
    const teklifId = row.teklif_id as string
    return teklifAnalysis.idMap.get(teklifId) ?? teklifId
  })))

  const supabase = createServiceClient()
  const existingItemIds = new Set<string>()
  const existingItemKeys = new Set<string>()
  const existingTeklifIds = new Set(teklifAnalysis.availableIds)

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data } = await supabase.from('teklif_kalemleri').select('id').in('id', batch)
    if (data) data.forEach(row => existingItemIds.add(row.id as string))
  }

  for (let i = 0; i < targetTeklifIds.length; i += 50) {
    const batch = targetTeklifIds.slice(i, i + 50)
    const { data } = await supabase.from('teklifler').select('id').in('id', batch)
    if (data) data.forEach(row => existingTeklifIds.add(row.id as string))
  }

  for (let i = 0; i < targetTeklifIds.length; i += 50) {
    const batch = targetTeklifIds.slice(i, i + 50)
    const { data } = await supabase.from('teklif_kalemleri').select('teklif_id, sira_no, aciklama').in('teklif_id', batch)
    for (const row of data ?? []) {
      existingItemKeys.add(teklifItemKey(row as JsonRow, row.teklif_id as string))
    }
  }

  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  let inserted = 0
  let skipped = 0
  let relationRisks = 0

  for (const row of validRows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const sourceTeklifId = row.teklif_id as string
    const targetTeklifId = teklifAnalysis.idMap.get(sourceTeklifId) ?? sourceTeklifId
    const key = teklifItemKey(row, targetTeklifId)

    if (!existingTeklifIds.has(targetTeklifId)) {
      relationRisks += 1
      skipped += 1
      continue
    }
    if ((id && (existingItemIds.has(id) || seenIds.has(id))) || existingItemKeys.has(key) || seenKeys.has(key)) {
      skipped += 1
      continue
    }

    inserted += 1
    if (id) seenIds.add(id)
    seenKeys.add(key)
  }

  return { inserted, skipped, relation_risks: relationRisks, errors: invalidCount }
}

async function checkDuplicateIds(
  tableName: string,
  records: unknown[],
): Promise<{ inserted: number; skipped: number }> {
  const ids = records
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r))
    .map(r => r.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  if (ids.length === 0) return { inserted: records.length, skipped: 0 }

  const supabase = createServiceClient()
  const existingSet = new Set<string>()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data } = await supabase.from(tableName).select('id').in('id', batch)
    if (data) data.forEach(r => existingSet.add(r.id as string))
  }

  const skipped = ids.filter(id => existingSet.has(id)).length
  return { inserted: records.length - skipped, skipped }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireBackupUser()
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Dosya secilmeli.' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const tables: TableSummary[] = []
    let manifest: DryRunManifest = null
    let customerIdMap = new Map<string, string>()
    let teklifAnalysis: TeklifAnalysis | null = null

    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(bytes)
      const customersEntry = zip.getEntry('customers.json')
      const devicesEntry = zip.getEntry('devices.json')
      const tekliflerEntry = zip.getEntry('teklifler.json')
      const hatirlatmaKayitlariEntry = zip.getEntry('hatirlatma_kayitlari.json')
      const hatirlatmaSusturmalarEntry = zip.getEntry('hatirlatma_susturmalar.json')
      let customerAnalysis: Awaited<ReturnType<typeof analyzeCustomers>> | null = null
      let hatirlatmaAnalysis: Awaited<ReturnType<typeof analyzeHatirlatmalar>> | null = null
      if (customersEntry) {
        customerAnalysis = await analyzeCustomers(asRows(JSON.parse(customersEntry.getData().toString('utf8'))))
        customerIdMap = customerAnalysis.idMap
      }
      if (tekliflerEntry) {
        teklifAnalysis = await analyzeTeklifler(asRows(JSON.parse(tekliflerEntry.getData().toString('utf8'))))
      }
      if (hatirlatmaKayitlariEntry || hatirlatmaSusturmalarEntry) {
        const devices = devicesEntry ? asRows(JSON.parse(devicesEntry.getData().toString('utf8'))) : null
        const availableCustomerIds = new Set(customerIdMap.values())
        const availableDeviceIds = await collectAvailableDeviceIds(devices, customerIdMap, availableCustomerIds)
        hatirlatmaAnalysis = await analyzeHatirlatmalar(
          hatirlatmaKayitlariEntry ? asRows(JSON.parse(hatirlatmaKayitlariEntry.getData().toString('utf8'))) : null,
          hatirlatmaSusturmalarEntry ? asRows(JSON.parse(hatirlatmaSusturmalarEntry.getData().toString('utf8'))) : null,
          { customerIdMap, availableCustomerIds, availableDeviceIds },
        )
      }

      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.endsWith('.json')) continue
        const raw = entry.getData().toString('utf8')
        if (entry.entryName === 'manifest.json') {
          manifest = JSON.parse(raw)
        } else {
          const parsed = JSON.parse(raw)
          const rows = Array.isArray(parsed) ? parsed.length : 1
          const tableName = entry.entryName.replace(/\.json$/, '')

          if (tableName === 'customers') {
            const { inserted, skipped, merged, relation_risks, errors, idMap } = customerAnalysis ?? await analyzeCustomers(asRows(parsed))
            customerIdMap = idMap
            tables.push({ file: entry.entryName, rows, table: tableName, inserted, skipped, merged, relation_risks, errors })
          } else if (tableName === 'devices') {
            const { inserted, skipped, remapped, relation_risks, errors } = await analyzeDevices(asRows(parsed), customerIdMap)
            tables.push({ file: entry.entryName, rows, table: tableName, inserted, skipped, remapped, relation_risks, errors })
          } else if (tableName === 'urunler') {
            const { inserted, skipped, errors } = await analyzeUrunler(asRows(parsed))
            tables.push({ file: entry.entryName, rows, table: tableName, inserted, skipped, errors })
          } else if (tableName === 'teklifler') {
            const analysis = teklifAnalysis ?? await analyzeTeklifler(asRows(parsed))
            teklifAnalysis = analysis
            tables.push({ file: entry.entryName, rows, table: tableName, inserted: analysis.inserted, skipped: analysis.skipped, merged: analysis.merged, errors: analysis.errors })
          } else if (tableName === 'teklif_kalemleri') {
            const analysis = teklifAnalysis ?? { inserted: 0, skipped: 0, merged: 0, errors: 0, idMap: new Map<string, string>(), availableIds: new Set<string>(), insertedIds: new Set<string>() }
            const { inserted, skipped, relation_risks, errors } = await analyzeTeklifKalemleri(asRows(parsed), analysis)
            tables.push({ file: entry.entryName, rows, table: tableName, inserted, skipped, relation_risks, errors })
          } else if (tableName === 'hatirlatma_kayitlari') {
            const availableCustomerIds = new Set(customerIdMap.values())
            const summary = (hatirlatmaAnalysis ?? await analyzeHatirlatmalar(asRows(parsed), null, { customerIdMap, availableCustomerIds })).hatirlatma_kayitlari
            tables.push({ file: entry.entryName, rows, table: tableName, inserted: summary.inserted, skipped: summary.skipped, merged: summary.merged, relation_risks: summary.relation_risks, errors: summary.errors.length })
          } else if (tableName === 'hatirlatma_susturmalar') {
            const availableCustomerIds = new Set(customerIdMap.values())
            const summary = (hatirlatmaAnalysis ?? await analyzeHatirlatmalar(null, asRows(parsed), { customerIdMap, availableCustomerIds })).hatirlatma_susturmalar
            tables.push({ file: entry.entryName, rows, table: tableName, inserted: summary.inserted, skipped: summary.skipped, merged: summary.merged, relation_risks: summary.relation_risks, errors: summary.errors.length })
          } else if (RESTORABLE_TABLES.includes(tableName)) {
            const records = Array.isArray(parsed) ? parsed : [parsed]
            const { inserted, skipped } = await checkDuplicateIds(tableName, records)
            tables.push({ file: entry.entryName, rows, table: tableName, inserted, skipped })
          } else {
            tables.push({ file: entry.entryName, rows })
          }
        }
      }
    } else if (file.name.toLowerCase().endsWith('.json')) {
      const raw = bytes.toString('utf8')
      const parsed = JSON.parse(raw)
      const rows = Array.isArray(parsed) ? parsed.length : 1
      tables.push({ file: file.name, rows })
    } else {
      return NextResponse.json({ error: 'Sadece JSON veya ZIP desteklenir.' }, { status: 400 })
    }

    const totalRows = tables.reduce((sum, t) => sum + t.rows, 0)
    const result = {
      file_name: file.name,
      table_count: tables.length,
      total_rows: totalRows,
      tables,
      manifest,
      dry_run: true,
      message: 'Onizleme tamamlandi.',
    }

    const supabase = createServiceClient()
    await supabase.from('backup_restores').insert({
      requested_by: user.id,
      file_name: file.name,
      file_size: bytes.length,
      table_count: tables.length,
      total_rows: totalRows,
      dry_run_result: result,
      status: 'previewed',
    })

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Dry-run tamamlanamadi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
