import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import { getSetting } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const apiKey = await getSetting('resend_api_key', 'RESEND_API_KEY')
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Resend API Key tanımlanmamış. Entegrasyon Ayarları bölümünden ekleyin.' },
      { status: 500 }
    )
  }

  const body = await req.json()
  const { to, subject, html, text, musteri_id, cihaz_id, kural_id } = body

  if (!to || !subject || (!html && !text)) {
    return NextResponse.json({ error: 'to, subject ve html/text zorunludur.' }, { status: 400 })
  }

  const resend = new Resend(apiKey)

  const { data, error } = await resend.emails.send({
    from: 'Köklü Yangın Söndürme <bilgi@koklu.com.tr>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html: html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap">${text}</pre>`,
    text,
  })

  const supabase = createServiceClient()

  if (error) {
    if (musteri_id) {
      await supabase.from('hatirlatma_kayitlari').insert({
        kural_id: kural_id ?? null,
        musteri_id,
        cihaz_id: cihaz_id ?? null,
        kanal: 'email',
        alici_email: Array.isArray(to) ? to[0] : to,
        mesaj_icerigi: text ?? html,
        durum: 'hata',
        hata_mesaji: error.message,
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (musteri_id) {
    await supabase.from('hatirlatma_kayitlari').insert({
      kural_id: kural_id ?? null,
      musteri_id,
      cihaz_id: cihaz_id ?? null,
      kanal: 'email',
      alici_email: Array.isArray(to) ? to[0] : to,
      mesaj_icerigi: text ?? html,
      durum: 'gonderildi',
    })
  }

  return NextResponse.json({ success: true, id: data?.id })
}
