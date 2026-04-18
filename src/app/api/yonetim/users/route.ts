import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

// GET: tüm kullanıcıları listele (admin only - service client)
export async function GET() {
  const supabase = createServiceClient()

  const { data: profiller, error } = await supabase
    .from('kullanici_profiller')
    .select('*, roller(id, ad, renk)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auth kullanıcıları ile birleştir (email, last_sign_in_at)
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const authMap = new Map(authUsers.map(u => [u.id, u]))

  const result = (profiller ?? []).map(p => {
    const auth = authMap.get(p.id)
    return {
      ...p,
      email: auth?.email ?? '',
      son_giris: auth?.last_sign_in_at ?? null,
      email_confirmed: auth?.email_confirmed_at != null,
    }
  })

  return NextResponse.json(result)
}

// POST: yeni kullanıcı oluştur
export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { ad_soyad, email, password, rol_id, departman, telefon, aktif } = body

  if (!email || !password || !ad_soyad) {
    return NextResponse.json({ error: 'Ad soyad, email ve şifre zorunlu' }, { status: 400 })
  }

  // 1. Auth kullanıcısı oluştur
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Kullanıcı oluşturulamadı' }, { status: 500 })
  }

  // 2. Profil ekle
  const { error: profilErr } = await supabase.from('kullanici_profiller').insert({
    id: authData.user.id,
    ad_soyad,
    telefon: telefon || null,
    departman: departman || null,
    rol_id: rol_id || null,
    aktif: aktif ?? true,
  })

  if (profilErr) {
    // Auth kullanıcısını geri sil
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profilErr.message }, { status: 500 })
  }

  return NextResponse.json({ id: authData.user.id })
}
