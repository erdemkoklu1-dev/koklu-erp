import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('urunler')
    .select('id, ad, kategori, kdv_haric_fiyat, birim')
    .eq('aktif', true)
    .order('kategori')
    .order('ad')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
