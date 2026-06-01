import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/authorization'

// PATCH: kullanıcı güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentAccess()
  if (!access?.isAdmin) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const body = await req.json()
  const { action } = body

  // Şifre sıfırlama
  if (action === 'reset_password') {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: body.email,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ link: data.properties?.action_link })
  }

  // Aktif/pasif
  if (action === 'toggle_ban') {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: body.aktif ? 'none' : '876000h',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('kullanici_profiller').update({ aktif: body.aktif }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // Profil güncelleme
  const { rol_id, departman, telefon, aktif, sube_ids } = body
  const { error } = await supabase.from('kullanici_profiller').update({
    rol_id: rol_id || null,
    departman: departman || null,
    telefon: telefon || null,
    aktif: aktif ?? true,
    sube_id: Array.isArray(sube_ids) && sube_ids.length === 1 ? sube_ids[0] : null,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('kullanici_rolleri').delete().eq('kullanici_id', id)
  if (rol_id) await supabase.from('kullanici_rolleri').insert({ kullanici_id: id, rol_id })

  if (Array.isArray(sube_ids)) {
    await supabase.from('kullanici_sube_yetkileri').delete().eq('kullanici_id', id)
    if (sube_ids.length > 0) {
      await supabase.from('kullanici_sube_yetkileri').insert(
        sube_ids.map((sube_id: string) => ({ kullanici_id: id, sube_id })),
      )
    }
  }

  return NextResponse.json({ ok: true })
}
