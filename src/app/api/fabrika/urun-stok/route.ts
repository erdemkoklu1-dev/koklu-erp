import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('urun_stok')
    .select('*, urunler(id, ad, kategori, kdv_haric_fiyat)')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { urun_id, miktar, hareket_tipi, referans_no, aciklama } = body

  if (!urun_id || miktar === undefined) {
    return NextResponse.json({ error: 'urun_id ve miktar zorunludur.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Get current stock
  const { data: current } = await supabase
    .from('urun_stok')
    .select('stok_adedi')
    .eq('urun_id', urun_id)
    .single()

  const currentQty = Number(current?.stok_adedi ?? 0)
  const delta = hareket_tipi === 'giris' ? Number(miktar) : -Number(miktar)
  const yeniStok = Math.max(0, currentQty + delta)

  // Upsert urun_stok
  const { error: upsertErr } = await supabase
    .from('urun_stok')
    .upsert({ urun_id, stok_adedi: yeniStok, updated_at: new Date().toISOString() }, { onConflict: 'urun_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Log to depo_hareketleri
  await supabase.from('depo_hareketleri').insert({
    hareket_tipi: hareket_tipi ?? 'giris',
    kaynak: 'urun',
    kaynak_id: urun_id,
    miktar: Number(miktar),
    tarih: new Date().toISOString().split('T')[0],
    referans_no: referans_no || null,
    aciklama: aciklama || null,
  })

  return NextResponse.json({ success: true, yeniStok })
}
