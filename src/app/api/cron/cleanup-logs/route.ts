import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'

export const runtime = 'nodejs'

async function runCleanup() {
  const supabase = createServiceClient()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 15)

  const { data, error } = await supabase
    .from('giris_kayitlari')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    deleted: data?.length ?? 0,
    cutoff_date: cutoff.toISOString(),
  })
}

// Vercel Cron: GET /api/cron/cleanup-logs  (Authorization: Bearer CRON_SECRET)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }
  return runCleanup()
}

// Admin UI: POST /api/cron/cleanup-logs  (user session, Admin/Yönetici rol gerekli)
export async function POST() {
  try {
    await requireBackupUser()
    return runCleanup()
  } catch (error) {
    if (error instanceof Response) return error
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }
}
