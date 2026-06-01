import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { APP_MODULES } from '@/lib/auth/modules'

const MODULE_KEYS = new Set(APP_MODULES.map(module => module.key))

type PermissionBody = {
  rol_id?: string
  modul_adi?: string
  okuma?: boolean
  yazma?: boolean
  silme?: boolean
}

export async function PATCH(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access?.isAdmin) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = (await req.json()) as PermissionBody
  const { rol_id, modul_adi } = body

  if (!rol_id || !modul_adi) {
    return NextResponse.json({ error: 'Rol ve modül zorunlu' }, { status: 400 })
  }
  if (!MODULE_KEYS.has(modul_adi as any)) {
    return NextResponse.json({ error: 'Geçersiz modül' }, { status: 400 })
  }

  const okuma = body.okuma === true
  const yazma = okuma && body.yazma === true
  const silme = okuma && body.silme === true
  const payload = { rol_id, modul_adi, okuma, yazma, silme }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('modul_izinleri')
    .upsert(payload, { onConflict: 'rol_id,modul_adi' })
    .select('id, rol_id, modul_adi, okuma, yazma, silme')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase
    .from('rol_yetkileri')
    .upsert(payload, { onConflict: 'rol_id,modul_adi' })

  return NextResponse.json(data)
}
