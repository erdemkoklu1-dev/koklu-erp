import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildBackupZip } from '@/lib/backup/exporter'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.BACKUP_CRON_SECRET
  if (!secret || req.headers.get('x-backup-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const supabase = createServiceClient()
  const { data: settings, error: settingsError } = await supabase
    .from('backup_settings')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle()

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 })
  if (!settings?.enabled) return NextResponse.json({ skipped: true, reason: 'automatic backup disabled' })

  const today = new Date().getDay()
  if (today !== settings.weekday) return NextResponse.json({ skipped: true, reason: 'not scheduled day' })

  const result = await buildBackupZip({
    type: 'automatic',
    saveToStorage: settings.storage_enabled !== false,
    createdBy: {
      id: 'system',
      email: 'system',
      name: 'Automatic Backup',
      role: 'system',
    },
  })

  await supabase.from('backup_jobs').insert({
    id: result.backupId,
    created_by: null,
    backup_type: 'automatic',
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

  return NextResponse.json({
    success: true,
    backup_id: result.backupId,
    storage_saved: Boolean(result.storagePath),
    warnings: result.errors,
  })
}
