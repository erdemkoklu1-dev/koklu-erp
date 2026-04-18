import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

// PATCH: kullanıcı güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { rol_id, departman, telefon, aktif } = body
  const { error } = await supabase.from('kullanici_profiller').update({
    rol_id: rol_id || null,
    departman: departman || null,
    telefon: telefon || null,
    aktif: aktif ?? true,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
