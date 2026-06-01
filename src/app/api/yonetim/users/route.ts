import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/authorization'

// GET: tüm kullanıcıları listele (admin only - service client)
export async function GET() {
  const access = await getCurrentAccess()
  if (!access?.isAdmin) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: profiller, error } = await supabase
    .from('kullanici_profiller')
    .select('*, roller(id, ad, renk)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auth kullanıcıları ile birleştir (email, last_sign_in_at)
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const authMap = new Map(authUsers.map(u => [u.id, u]))
  const { data: subeYetkileri } = await supabase
    .from('kullanici_sube_yetkileri')
    .select('kullanici_id, sube_id, subeler(id, ad)')

  const subeMap = new Map<string, unknown[]>()
  for (const row of subeYetkileri ?? []) {
    const list = subeMap.get(row.kullanici_id) ?? []
    list.push(row.subeler)
    subeMap.set(row.kullanici_id, list)
  }

  const result = (profiller ?? []).map(p => {
    const auth = authMap.get(p.id)
    return {
      ...p,
      email: auth?.email ?? '',
      son_giris: auth?.last_sign_in_at ?? null,
      email_confirmed: auth?.email_confirmed_at != null,
      subeler: subeMap.get(p.id) ?? [],
    }
  })

  return NextResponse.json(result)
}

// POST: yeni kullanıcı oluştur
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access?.isAdmin) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const supabase = createServiceClient()
  const body = await req.json()
  const { ad_soyad, email, password, rol_id, departman, telefon, aktif, sube_ids } = body

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
    sube_id: Array.isArray(sube_ids) && sube_ids.length === 1 ? sube_ids[0] : null,
  })

  if (profilErr) {
    // Auth kullanıcısını geri sil
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profilErr.message }, { status: 500 })
  }

  if (rol_id) {
    await supabase.from('kullanici_rolleri').insert({ kullanici_id: authData.user.id, rol_id })
  }

  if (Array.isArray(sube_ids) && sube_ids.length > 0) {
    await supabase.from('kullanici_sube_yetkileri').insert(
      sube_ids.map((sube_id: string) => ({ kullanici_id: authData.user.id, sube_id })),
    )
  }

  return NextResponse.json({ id: authData.user.id })
}
