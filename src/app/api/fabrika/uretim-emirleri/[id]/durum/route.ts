import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { durum } = await req.json()

  if (!['planlandı', 'üretimde', 'tamamlandı', 'iptal'].includes(durum)) {
    return NextResponse.json({ error: 'Geçersiz durum.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch the order
  const { data: emir, error: emirErr } = await supabase
    .from('uretim_emirleri')
    .select('*')
    .eq('id', id)
    .single()

  if (emirErr || !emir) return NextResponse.json({ error: 'Emir bulunamadı.' }, { status: 404 })

  const update: Record<string, unknown> = { durum }

  if (durum === 'üretimde' && !emir.gercek_baslangic) {
    update.gercek_baslangic = new Date().toISOString()
  }

  if (durum === 'tamamlandı') {
    update.gercek_bitis = new Date().toISOString()
    if (!emir.gercek_baslangic) update.gercek_baslangic = new Date().toISOString()

    // Fetch BOM
    const { data: recete } = await supabase
      .from('urun_receteler')
      .select('hammadde_id, miktar')
      .eq('urun_id', emir.urun_id)

    if (recete && recete.length > 0) {
      const today = new Date().toISOString().split('T')[0]

      for (const item of recete) {
        const kullanilanMiktar = Number(item.miktar) * Number(emir.miktar)

        // Deduct hammadde stock
        const { data: hammadde } = await supabase
          .from('hammaddeler')
          .select('mevcut_stok')
          .eq('id', item.hammadde_id)
          .single()

        if (hammadde) {
          await supabase
            .from('hammaddeler')
            .update({ mevcut_stok: Math.max(0, Number(hammadde.mevcut_stok) - kullanilanMiktar) })
            .eq('id', item.hammadde_id)
        }

        // Log to uretim_hareketleri
        await supabase.from('uretim_hareketleri').insert({
          uretim_emri_id: id,
          hammadde_id: item.hammadde_id,
          kullanilan_miktar: kullanilanMiktar,
          tarih: today,
        })

        // Log to depo_hareketleri
        await supabase.from('depo_hareketleri').insert({
          hareket_tipi: 'cikis',
          kaynak: 'hammadde',
          kaynak_id: item.hammadde_id,
          miktar: kullanilanMiktar,
          tarih: today,
          referans_no: emir.emir_no,
          aciklama: `Üretim emri: ${emir.emir_no}`,
        })
      }
    }

    // Add to urun_stok
    await supabase
      .from('urun_stok')
      .upsert(
        { urun_id: emir.urun_id, stok_adedi: Number(emir.miktar), updated_at: new Date().toISOString() },
        { onConflict: 'urun_id' }
      )

    // Also log finished goods to depo_hareketleri
    await supabase.from('depo_hareketleri').insert({
      hareket_tipi: 'giris',
      kaynak: 'urun',
      kaynak_id: emir.urun_id,
      miktar: Number(emir.miktar),
      tarih: new Date().toISOString().split('T')[0],
      referans_no: emir.emir_no,
      aciklama: `Üretim tamamlandı: ${emir.emir_no}`,
    })
  }

  const { data, error } = await supabase
    .from('uretim_emirleri')
    .update(update)
    .eq('id', id)
    .select('*, urunler(id, ad)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
