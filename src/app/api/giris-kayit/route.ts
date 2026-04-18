import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const body = await req.json()
  const { kullanici_id, email, ad_soyad, islem_tipi } = body

  const ip_adresi = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'bilinmiyor'
  const tarayici = req.headers.get('user-agent') ?? ''

  await supabase.from('giris_kayitlari').insert({
    kullanici_id,
    email,
    ad_soyad,
    islem_tipi,
    ip_adresi,
    tarayici,
  })

  return NextResponse.json({ ok: true })
}
