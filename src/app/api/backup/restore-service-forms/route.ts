import AdmZip from 'adm-zip'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'

export const runtime = 'nodejs'

type JsonRow = Record<string, unknown>

type RestoreSummary = {
  service_forms: { inserted: number; skipped: number; errors: string[] }
  service_form_items: { inserted: number; skipped: number; errors: string[] }
}

function readJsonEntry(zip: AdmZip, entryName: string): JsonRow[] {
  const entry = zip.getEntry(entryName)
  if (!entry) throw new Error(`${entryName} bulunamadi.`)

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

async function existingIds(table: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const supabase = createServiceClient()
  const { data, error } = await supabase.from(table).select('id').in('id', ids)
  if (error) throw error
  return new Set((data ?? []).map(row => row.id as string))
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
      return NextResponse.json({ error: 'Servis formu importu sadece ZIP yedegi ile calisir.' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const zip = new AdmZip(bytes)
    const serviceForms = cleanRows(readJsonEntry(zip, 'service_forms.json'))
    const serviceFormItems = cleanRows(readJsonEntry(zip, 'service_form_items.json'))

    const summary: RestoreSummary = {
      service_forms: { inserted: 0, skipped: 0, errors: [] },
      service_form_items: { inserted: 0, skipped: 0, errors: [] },
    }

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

    const supabase = createServiceClient()
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

    const hasErrors = summary.service_forms.errors.length > 0 || summary.service_form_items.errors.length > 0
    const result = {
      restored: !hasErrors,
      dry_run: false,
      file_name: file.name,
      summary,
      message: hasErrors ? 'Servis formu importu hata ile tamamlandi.' : 'Servis formu importu tamamlandi.',
    }

    await supabase.from('backup_restores').insert({
      requested_by: user.id,
      file_name: file.name,
      file_size: bytes.length,
      table_count: 2,
      total_rows: serviceForms.length + serviceFormItems.length,
      dry_run_result: result,
      status: hasErrors ? 'restore_failed' : 'restored_service_forms',
    })

    return NextResponse.json(result, { status: hasErrors ? 207 : 200 })
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Servis formu importu tamamlanamadi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
