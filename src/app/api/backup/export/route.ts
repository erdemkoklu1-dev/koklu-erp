import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'
import { buildBackupZip, parseSelectedTables } from '@/lib/backup/exporter'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireBackupUser()
    const body = await req.json()
    const type = body.type === 'full' ? 'full' : 'selected'
    const selectedTables = type === 'full' ? undefined : parseSelectedTables(body.tables)
    const saveToStorage = body.saveToStorage === true

    const result = await buildBackupZip({ type, selectedTables, saveToStorage, createdBy: user })
    const supabase = createServiceClient()

    await supabase.from('backup_jobs').insert({
      id: result.backupId,
      created_by: user.id,
      backup_type: type,
      included_tables: result.manifest.included_tables as string[],
      row_counts: result.rowCounts,
      total_rows: result.totalRows,
      file_size: result.buffer.length,
      storage_saved: Boolean(result.storagePath),
      storage_bucket: result.storagePath ? 'backups' : null,
      storage_path: result.storagePath,
      status: Object.keys(result.errors).length > 0 ? 'completed_with_warnings' : 'completed',
      error_message: Object.keys(result.errors).length > 0 ? JSON.stringify(result.errors) : null,
    })

    await supabase.from('backup_logs').insert({
      job_id: result.backupId,
      level: Object.keys(result.errors).length > 0 ? 'warning' : 'info',
      message: `${type} backup olusturuldu`,
      details: { errors: result.errors, storage_path: result.storagePath },
    })

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Backup-Id': result.backupId,
        'X-Storage-Saved': result.storagePath ? 'true' : 'false',
        'X-Backup-Warnings': encodeURIComponent(JSON.stringify(result.errors)),
      },
    })
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Yedek olusturulamadi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
