import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hammaddeler')
    .select('*, tedarikciler(id, firma_adi)')
    .eq('aktif', true)
    .order('ad')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { ad, birim, kategori, mevcut_stok, minimum_stok, birim_maliyet, tedarikci_id, notlar } = body

  if (!ad || !birim || !kategori) {
    return NextResponse.json({ error: 'ad, birim ve kategori zorunludur.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hammaddeler')
    .insert({
      ad, birim, kategori,
      mevcut_stok: mevcut_stok ?? 0,
      minimum_stok: minimum_stok ?? 0,
      birim_maliyet: birim_maliyet ?? 0,
      tedarikci_id: tedarikci_id || null,
      notlar: notlar || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
