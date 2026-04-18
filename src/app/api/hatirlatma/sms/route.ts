import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getSetting } from '@/lib/settings'

function toTurkishNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 11) return '9' + digits
  if (digits.length === 10) return '90' + digits
  return digits
}

export async function POST(req: NextRequest) {
  const [usercode, password, msgheader] = await Promise.all([
    getSetting('netgsm_usercode', 'NETGSM_USERCODE'),
    getSetting('netgsm_password', 'NETGSM_PASSWORD'),
    getSetting('netgsm_msgheader', 'NETGSM_MSGHEADER'),
  ])

  if (!usercode || !password) {
    return NextResponse.json(
      { error: 'Netgsm bilgileri eksik. Entegrasyon Ayarları bölümünden ekleyin.' },
      { status: 500 }
    )
  }

  const body = await req.json()
  const { to, message, musteri_id, cihaz_id, kural_id } = body

  if (!to || !message) {
    return NextResponse.json({ error: 'to ve message zorunludur.' }, { status: 400 })
  }

  const phone = toTurkishNumber(to)

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
  <header>
    <usercode>${usercode}</usercode>
    <password>${password}</password>
    <msgheader>${msgheader ?? 'KOKLU'}</msgheader>
  </header>
  <body>
    <msg><![CDATA[${message}]]></msg>
    <no>${phone}</no>
  </body>
</mainbody>`

  const supabase = createServiceClient()

  let durum: 'gonderildi' | 'hata' = 'gonderildi'
  let hataMesaji: string | null = null

  try {
    const response = await fetch('https://api.netgsm.com.tr/sms/send/xml', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
      body: xmlBody,
    })

    const text = await response.text()
    if (!text.startsWith('00')) {
      durum = 'hata'
      hataMesaji = `Netgsm yanıtı: ${text}`
    }
  } catch (err: any) {
    durum = 'hata'
    hataMesaji = err?.message ?? 'Bağlantı hatası'
  }

  if (musteri_id) {
    await supabase.from('hatirlatma_kayitlari').insert({
      kural_id: kural_id ?? null,
      musteri_id,
      cihaz_id: cihaz_id ?? null,
      kanal: 'sms',
      alici_telefon: phone,
      mesaj_icerigi: message,
      durum,
      hata_mesaji: hataMesaji,
    })
  }

  if (durum === 'hata') {
    return NextResponse.json({ error: hataMesaji }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
