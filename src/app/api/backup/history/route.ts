import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'
import { BACKUP_STORAGE_BUCKET } from '@/lib/backup/config'

export const runtime = 'nodejs'

type BackupJobRow = {
  storage_path: string | null
  storage_bucket: string | null
  kullanici_profiller?: { ad_soyad: string | null } | null
}

export async function GET() {
  try {
    await requireBackupUser()
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('backup_jobs')
      .select('*, kullanici_profiller(ad_soyad)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = await Promise.all((data ?? []).map(async (row: BackupJobRow) => {
      let download_url: string | null = null
      if (row.storage_path) {
        const { data: signed } = await supabase.storage
          .from(row.storage_bucket ?? BACKUP_STORAGE_BUCKET)
          .createSignedUrl(row.storage_path, 60 * 60)
        download_url = signed?.signedUrl ?? null
      }

      return {
        ...row,
        user_name: row.kullanici_profiller?.ad_soyad ?? null,
        download_url,
      }
    }))

    return NextResponse.json({ rows })
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Gecmis okunamadi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
