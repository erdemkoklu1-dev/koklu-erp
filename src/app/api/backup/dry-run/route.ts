import AdmZip from 'adm-zip'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'

export const runtime = 'nodejs'

type DryRunManifest = Record<string, unknown> | null
type TableSummary = {
  file: string
  rows: number
  table?: string
  inserted?: number
  skipped?: number
}

const RESTORABLE_TABLES = ['service_forms', 'service_form_items']

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

    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(bytes)
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory || !entry.entryName.endsWith('.json')) continue
        const raw = entry.getData().toString('utf8')
        if (entry.entryName === 'manifest.json') {
          manifest = JSON.parse(raw)
        } else {
          const parsed = JSON.parse(raw)
          const rows = Array.isArray(parsed) ? parsed.length : 1
          const tableName = entry.entryName.replace(/\.json$/, '')

          if (RESTORABLE_TABLES.includes(tableName)) {
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
