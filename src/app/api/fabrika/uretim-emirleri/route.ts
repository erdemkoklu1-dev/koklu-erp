import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('uretim_emirleri')
    .select('*, urunler(id, ad, kategori)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { urun_id, miktar, planlanan_baslangic, planlanan_bitis, sorumlu, notlar } = body

  if (!urun_id || !miktar) {
    return NextResponse.json({ error: 'urun_id ve miktar zorunludur.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Generate emir_no
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('uretim_emirleri')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${year}-01-01`)
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const emir_no = `UE-${year}-${seq}`

  const { data, error } = await supabase
    .from('uretim_emirleri')
    .insert({
      emir_no,
      urun_id,
      miktar: Number(miktar),
      planlanan_baslangic: planlanan_baslangic || null,
      planlanan_bitis: planlanan_bitis || null,
      sorumlu: sorumlu || null,
      notlar: notlar || null,
    })
    .select('*, urunler(id, ad)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
