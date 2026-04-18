import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const ALLOWED_KEYS = ['resend_api_key', 'netgsm_usercode', 'netgsm_password', 'netgsm_msgheader', 'whatsapp_phone']

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('app_settings').select('key, value')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mask sensitive keys — return only last 4 chars
  const masked: Record<string, string | null> = {}
  const hasFull: Record<string, boolean> = {}
  for (const row of data ?? []) {
    const v = row.value
    if (!v) {
      masked[row.key] = null
      hasFull[row.key] = false
    } else if (['resend_api_key', 'netgsm_password'].includes(row.key)) {
      masked[row.key] = '••••••••' + v.slice(-4)
      hasFull[row.key] = true
    } else {
      masked[row.key] = v
      hasFull[row.key] = true
    }
  }

  return NextResponse.json({ settings: masked, hasFull })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { key, value } = body

  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Geçersiz ayar anahtarı.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value: value || null, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
