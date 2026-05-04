import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireBackupUser } from '@/lib/backup/authorization'

export const runtime = 'nodejs'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'

export async function GET() {
  try {
    await requireBackupUser()
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('backup_settings')
      .select('*')
      .eq('id', SETTINGS_ID)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      settings: data ?? {
        enabled: false,
        weekday: 1,
        run_at: '03:00',
        storage_enabled: true,
      },
    })
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Ayarlar okunamadi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireBackupUser()
    const body = await req.json()
    const enabled = body.enabled === true
    const storageEnabled = body.storage_enabled !== false
    const weekday = Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6 ? body.weekday : 1
    const runAt = typeof body.run_at === 'string' && /^\d{2}:\d{2}$/.test(body.run_at) ? body.run_at : '03:00'

    const supabase = createServiceClient()
    const { error } = await supabase.from('backup_settings').upsert({
      id: SETTINGS_ID,
      enabled,
      weekday,
      run_at: runAt,
      storage_enabled: storageEnabled,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Response) return error
    const message = error instanceof Error ? error.message : 'Ayarlar kaydedilemedi'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
