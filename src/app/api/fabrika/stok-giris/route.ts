import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { hammadde_id, miktar, tarih, referans_no, aciklama } = body

  if (!hammadde_id || !miktar) {
    return NextResponse.json({ error: 'hammadde_id ve miktar zorunludur.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch current stock
  const { data: hammadde, error: fetchErr } = await supabase
    .from('hammaddeler')
    .select('mevcut_stok')
    .eq('id', hammadde_id)
    .single()

  if (fetchErr || !hammadde) {
    return NextResponse.json({ error: 'Hammadde bulunamadı.' }, { status: 404 })
  }

  const yeniStok = Number(hammadde.mevcut_stok) + Number(miktar)

  // Update stock
  const { error: updateErr } = await supabase
    .from('hammaddeler')
    .update({ mevcut_stok: yeniStok })
    .eq('id', hammadde_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Log to depo_hareketleri
  const { error: logErr } = await supabase.from('depo_hareketleri').insert({
    hareket_tipi: 'giris',
    kaynak: 'hammadde',
    kaynak_id: hammadde_id,
    miktar: Number(miktar),
    tarih: tarih ?? new Date().toISOString().split('T')[0],
    referans_no: referans_no || null,
    aciklama: aciklama || null,
  })

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  return NextResponse.json({ success: true, yeniStok })
}
