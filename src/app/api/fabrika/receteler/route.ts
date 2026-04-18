import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const urun_id = searchParams.get('urun_id')

  const supabase = createServiceClient()
  let query = supabase
    .from('urun_receteler')
    .select('*, hammaddeler(id, ad, birim, birim_maliyet, mevcut_stok)')
    .order('hammaddeler(ad)')

  if (urun_id) query = query.eq('urun_id', urun_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { urun_id, hammadde_id, miktar, birim, notlar } = body

  if (!urun_id || !hammadde_id || !miktar) {
    return NextResponse.json({ error: 'urun_id, hammadde_id ve miktar zorunludur.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('urun_receteler')
    .upsert({ urun_id, hammadde_id, miktar, birim, notlar: notlar || null }, { onConflict: 'urun_id,hammadde_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id zorunludur.' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('urun_receteler').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, miktar, notlar } = body
  if (!id) return NextResponse.json({ error: 'id zorunludur.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('urun_receteler')
    .update({ miktar, notlar })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
