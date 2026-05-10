import { createServiceClient } from '@/lib/supabase/service'

export type JsonRow = Record<string, unknown>

export type HatirlatmaTableSummary = {
  inserted: number
  skipped: number
  merged: number
  relation_risks: number
  errors: string[]
}

export type HatirlatmalarRestoreSummary = {
  hatirlatma_kayitlari: HatirlatmaTableSummary
  hatirlatma_susturmalar: HatirlatmaTableSummary
}

type PlanAction = 'insert' | 'merge' | 'skip' | 'risk' | 'error'

type PlannedRow = {
  action: PlanAction
  row: JsonRow
  reason?: string
}

type RelationContext = {
  customerIdMap?: Map<string, string>
  availableCustomerIds?: Set<string>
  availableDeviceIds?: Set<string>
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

function stringValue(row: JsonRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function stringSet(values: unknown[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

async function existingIds(table: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const supabase = createServiceClient()
  const result = new Set<string>()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const { data, error } = await supabase.from(table).select('id').in('id', batch)
    if (error) throw error
    for (const row of data ?? []) result.add(row.id as string)
  }

  return result
}

function reminderCustomerId(row: JsonRow) {
  return stringValue(row, ['musteri_id', 'customer_id'])
}

function reminderDeviceId(row: JsonRow) {
  return stringValue(row, ['cihaz_id', 'device_id'])
}

function mapReminderRelations(row: JsonRow, customerIdMap: Map<string, string> | undefined) {
  const sourceCustomerId = reminderCustomerId(row)
  const sourceDeviceId = reminderDeviceId(row)
  const mappedCustomerId = customerIdMap?.get(sourceCustomerId) ?? sourceCustomerId
  const mapped: JsonRow = { ...row }

  if (sourceCustomerId && mappedCustomerId !== sourceCustomerId) {
    if ('musteri_id' in mapped) mapped.musteri_id = mappedCustomerId
    if ('customer_id' in mapped) mapped.customer_id = mappedCustomerId
  }
  if (sourceDeviceId && 'device_id' in mapped && !('cihaz_id' in mapped)) {
    mapped.device_id = sourceDeviceId
  }

  return { mapped, sourceCustomerId, mappedCustomerId, sourceDeviceId }
}

function reminderDate(row: JsonRow) {
  return stringValue(row, [
    'planli_gonderim_zamani',
    'planned_at',
    'gonderim_zamani',
    'sent_at',
    'created_at',
  ])
}

function reminderMessageType(row: JsonRow) {
  return stringValue(row, ['message_type', 'mesaj_tipi', 'kural_id', 'durum'])
}

function reminderNaturalKey(row: JsonRow) {
  const customerId = reminderCustomerId(row)
  const deviceId = reminderDeviceId(row)
  const date = reminderDate(row)
  const channel = stringValue(row, ['kanal', 'channel']).toLocaleLowerCase('tr-TR')
  const messageType = reminderMessageType(row).toLocaleLowerCase('tr-TR')

  if (!customerId || !date || !channel) return ''
  return [customerId, deviceId, date, channel, messageType].join('::')
}

function suppressionNaturalKey(row: JsonRow) {
  const customerId = reminderCustomerId(row)
  const deviceId = reminderDeviceId(row)
  const type = stringValue(row, ['tip', 'type', 'susturma_tipi', 'kanal', 'channel']).toLocaleLowerCase('tr-TR')
  const startsAt = stringValue(row, ['baslangic', 'starts_at', 'start_at'])
  const endsAt = stringValue(row, ['bitis', 'ends_at', 'end_at'])

  if (!customerId) return ''
  return [customerId, deviceId, type, startsAt, endsAt].join('::')
}

async function existingReminderKeys(table: 'hatirlatma_kayitlari' | 'hatirlatma_susturmalar', rows: JsonRow[]) {
  const supabase = createServiceClient()
  const customerIds = stringSet(rows.map(reminderCustomerId))
  const keys = new Set<string>()

  for (let i = 0; i < customerIds.length; i += 50) {
    const batch = customerIds.slice(i, i + 50)
    const { data, error } = await supabase.from(table).select('*').in('musteri_id', batch)
    if (error) throw error
    for (const row of data ?? []) {
      const key = table === 'hatirlatma_kayitlari'
        ? reminderNaturalKey(row as JsonRow)
        : suppressionNaturalKey(row as JsonRow)
      if (key) keys.add(key)
    }
  }

  return keys
}

async function planReminderRows(table: 'hatirlatma_kayitlari' | 'hatirlatma_susturmalar', rows: JsonRow[], context: RelationContext) {
  const clean = cleanRows(rows)
  const mappedRows = clean.map(row => mapReminderRelations(row, context.customerIdMap).mapped)
  const ids = stringSet(clean.map(row => row.id))
  const existingIdSet = await existingIds(table, ids)
  const existingKeySet = await existingReminderKeys(table, mappedRows)
  const targetCustomerIds = stringSet(clean.map(row => {
    const customerId = reminderCustomerId(row)
    return context.customerIdMap?.get(customerId) ?? customerId
  }))
  const targetDeviceIds = stringSet(clean.map(reminderDeviceId))
  const existingCustomerIds = await existingIds('customers', targetCustomerIds)
  const existingDeviceIds = await existingIds('devices', targetDeviceIds)
  const seenIds = new Set<string>()
  const seenKeys = new Set<string>()
  const planned: PlannedRow[] = []

  for (const row of clean) {
    const id = stringValue(row, ['id'])
    const { mapped, mappedCustomerId, sourceDeviceId } = mapReminderRelations(row, context.customerIdMap)
    const naturalKey = table === 'hatirlatma_kayitlari'
      ? reminderNaturalKey(mapped)
      : suppressionNaturalKey(mapped)

    if (mappedCustomerId && !existingCustomerIds.has(mappedCustomerId) && !context.availableCustomerIds?.has(mappedCustomerId)) {
      planned.push({ action: 'risk', row: mapped, reason: `${id || table}: musteri iliskisi bulunamadi` })
      continue
    }
    if (sourceDeviceId && !existingDeviceIds.has(sourceDeviceId) && !context.availableDeviceIds?.has(sourceDeviceId)) {
      planned.push({ action: 'risk', row: mapped, reason: `${id || table}: cihaz iliskisi bulunamadi` })
      continue
    }
    if (id && seenIds.has(id)) {
      planned.push({ action: 'skip', row: mapped, reason: `${id}: dosya icinde duplicate id` })
      continue
    }
    if (naturalKey && seenKeys.has(naturalKey)) {
      planned.push({ action: 'skip', row: mapped, reason: `${id || table}: dosya icinde duplicate anlam anahtari` })
      continue
    }
    if (id && existingIdSet.has(id)) {
      planned.push({ action: 'merge', row: mapped, reason: `${id}: mevcut id ile eslesti` })
      seenIds.add(id)
      if (naturalKey) seenKeys.add(naturalKey)
      continue
    }
    if (naturalKey && existingKeySet.has(naturalKey)) {
      planned.push({ action: 'merge', row: mapped, reason: `${id || table}: mevcut anlam anahtari ile eslesti` })
      if (id) seenIds.add(id)
      seenKeys.add(naturalKey)
      continue
    }

    planned.push({ action: 'insert', row: mapped })
    if (id) seenIds.add(id)
    if (naturalKey) seenKeys.add(naturalKey)
  }

  return planned
}

function applyPlanToSummary(plan: PlannedRow[], summary: HatirlatmaTableSummary) {
  for (const item of plan) {
    if (item.action === 'insert') summary.inserted += 1
    if (item.action === 'merge') summary.merged += 1
    if (item.action === 'skip') summary.skipped += 1
    if (item.action === 'risk') {
      summary.relation_risks += 1
      summary.skipped += 1
    }
    if (item.action === 'error' && item.reason) summary.errors.push(item.reason)
  }
}

export function createHatirlatmaSummary(): HatirlatmalarRestoreSummary {
  return {
    hatirlatma_kayitlari: { inserted: 0, skipped: 0, merged: 0, relation_risks: 0, errors: [] },
    hatirlatma_susturmalar: { inserted: 0, skipped: 0, merged: 0, relation_risks: 0, errors: [] },
  }
}

export async function collectAvailableDeviceIds(rows: JsonRow[] | null, customerIdMap: Map<string, string>, availableCustomerIds = new Set<string>()) {
  if (!rows) return new Set<string>()
  const clean = cleanRows(rows)
  const targetCustomerIds = stringSet(clean.map(row => {
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : ''
    return customerIdMap.get(customerId) ?? customerId
  }))
  const existingCustomerIds = await existingIds('customers', targetCustomerIds)
  const available = new Set<string>()

  for (const row of clean) {
    const id = typeof row.id === 'string' ? row.id : ''
    const customerId = typeof row.customer_id === 'string' ? row.customer_id : ''
    const mappedCustomerId = customerIdMap.get(customerId) ?? customerId
    if (id && mappedCustomerId && (existingCustomerIds.has(mappedCustomerId) || availableCustomerIds.has(mappedCustomerId))) available.add(id)
  }

  return available
}

export async function analyzeHatirlatmalar(
  kayitlari: JsonRow[] | null,
  susturmalar: JsonRow[] | null,
  context: RelationContext = {},
) {
  const summary = createHatirlatmaSummary()

  if (kayitlari) {
    const plan = await planReminderRows('hatirlatma_kayitlari', kayitlari, context)
    applyPlanToSummary(plan, summary.hatirlatma_kayitlari)
  }
  if (susturmalar) {
    const plan = await planReminderRows('hatirlatma_susturmalar', susturmalar, context)
    applyPlanToSummary(plan, summary.hatirlatma_susturmalar)
  }

  return summary
}

async function insertPlannedRows(table: 'hatirlatma_kayitlari' | 'hatirlatma_susturmalar', plan: PlannedRow[], summary: HatirlatmaTableSummary) {
  const supabase = createServiceClient()
  applyPlanToSummary(plan.filter(item => item.action !== 'insert'), summary)

  const toInsert = plan.filter(item => item.action === 'insert').map(item => item.row)
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      summary.errors.push(`${table}: ${error.message}`)
    } else {
      summary.inserted += batch.length
    }
  }
}

export async function restoreHatirlatmalar(
  kayitlari: JsonRow[] | null,
  susturmalar: JsonRow[] | null,
  context: RelationContext = {},
) {
  const summary = createHatirlatmaSummary()

  if (kayitlari) {
    const plan = await planReminderRows('hatirlatma_kayitlari', kayitlari, context)
    await insertPlannedRows('hatirlatma_kayitlari', plan, summary.hatirlatma_kayitlari)
  }
  if (susturmalar) {
    const plan = await planReminderRows('hatirlatma_susturmalar', susturmalar, context)
    await insertPlannedRows('hatirlatma_susturmalar', plan, summary.hatirlatma_susturmalar)
  }

  return summary
}
