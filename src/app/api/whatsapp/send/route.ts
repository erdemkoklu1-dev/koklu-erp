import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const GATEWAY = process.env.WHATSAPP_GATEWAY_URL ?? 'http://localhost:3001'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { to, message, musteri_id, cihaz_id } = body

  if (!to || !message) {
    return NextResponse.json({ error: '"to" ve "message" zorunludur.' }, { status: 400 })
  }

  let durum: 'gonderildi' | 'hata' = 'gonderildi'
  let hataMesaji: string | null = null

  try {
    const res = await fetch(`${GATEWAY}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      durum = 'hata'
      hataMesaji = err.error ?? 'Gateway hatası'
    }
  } catch (err: any) {
    durum = 'hata'
    hataMesaji = 'Gateway\'e ulaşılamadı: ' + (err?.message ?? 'Bağlantı hatası')
  }

  if (musteri_id) {
    const supabase = createServiceClient()
    await supabase.from('hatirlatma_kayitlari').insert({
      musteri_id,
      cihaz_id: cihaz_id ?? null,
      kanal: 'whatsapp',
      alici_telefon: to,
      mesaj_icerigi: message,
      durum,
      hata_mesaji: hataMesaji,
    })
  }

  if (durum === 'hata') {
    return NextResponse.json({ error: hataMesaji }, { status: 503 })
  }

  return NextResponse.json({ success: true })
}
