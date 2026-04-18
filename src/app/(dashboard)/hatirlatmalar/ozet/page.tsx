import { createServiceClient } from '@/lib/supabase/service'
import { getSetting } from '@/lib/settings'
import OzetClient, { type CustomerGroup, type DeviceItem } from './OzetClient'

export default async function HatirlatmalarOzetPage() {
  const supabase = createServiceClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const past30Days    = new Date(today); past30Days.setDate(today.getDate() - 30)
  const past30DaysStr = past30Days.toISOString().split('T')[0]
  const in30Days      = new Date(today); in30Days.setDate(today.getDate() + 30)
  const in30DaysStr   = in30Days.toISOString().split('T')[0]
  const in7Days       = new Date(today); in7Days.setDate(today.getDate() + 7)
  const firstOfMonth  = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

  const [
    { count: buAyGonderilen },
    { data: devices },
    { data: sablonlar },
    { data: recentSends },
    { data: susturmalar },
    { count: buHaftaPlanlanan },
  ] = await Promise.all([
    // Bu ay gönderilen (gönderildi)
    supabase
      .from('hatirlatma_kayitlari')
      .select('*', { count: 'exact', head: true })
      .eq('durum', 'gonderildi')
      .gte('created_at', firstOfMonth),

    // Yaklaşan / gecikmiş cihazlar (son 30 gün ile önümüzdeki 30 gün)
    supabase
      .from('devices')
      .select(`
        id, custom_device_name, brand, capacity,
        control1_date, control2_date, control3_date, expiry_date,
        customers!inner(id, full_name, email, phone)
      `)
      .eq('is_active', true)
      .or([
        `and(expiry_date.gte.${past30DaysStr},expiry_date.lte.${in30DaysStr})`,
        `and(control1_date.gte.${past30DaysStr},control1_date.lte.${in30DaysStr})`,
        `and(control2_date.gte.${past30DaysStr},control2_date.lte.${in30DaysStr})`,
        `and(control3_date.gte.${past30DaysStr},control3_date.lte.${in30DaysStr})`,
      ].join(',')),

    // Aktif mesaj şablonları
    supabase
      .from('hatirlatma_sablonlari')
      .select('id, ad, kanal, konu, mesaj_sablonu')
      .eq('aktif', true)
      .order('kanal'),

    // Son 30 günde gönderilen hatırlatmalar (durum sütununu kontrol et)
    supabase
      .from('hatirlatma_kayitlari')
      .select('cihaz_id, musteri_id, kanal, created_at')
      .eq('durum', 'gonderildi')
      .gte('created_at', past30Days.toISOString()),

    // Susturulan müşteriler
    supabase
      .from('hatirlatma_susturmalar')
      .select('musteri_id'),

    // Bu hafta planlanan gönderimler
    supabase
      .from('hatirlatma_kayitlari')
      .select('*', { count: 'exact', head: true })
      .eq('durum', 'planlandı')
      .gte('planli_gonderim_zamani', today.toISOString())
      .lte('planli_gonderim_zamani', in7Days.toISOString()),
  ])

  // Susturulan müşteri ID seti
  const susturulmusSet = new Set((susturmalar ?? []).map(s => s.musteri_id as string))

  // Müşteri bazında son gönderim bilgisi
  type SentInfo = { email: boolean; sms: boolean }
  const musteriSentMap = new Map<string, SentInfo>()
  for (const s of recentSends ?? []) {
    if (!s.musteri_id) continue
    const existing = musteriSentMap.get(s.musteri_id) ?? { email: false, sms: false }
    if (s.kanal === 'email') existing.email = true
    if (s.kanal === 'sms')   existing.sms   = true
    musteriSentMap.set(s.musteri_id, existing)
  }

  // ── Müşteri bazında gruplama ──────────────────────────────
  const customerMap = new Map<string, CustomerGroup>()

  for (const d of devices ?? []) {
    const c = d.customers as unknown as {
      id: string; full_name: string; email: string | null; phone: string | null
    }
    const deviceName = d.custom_device_name
      ?? ([d.brand, d.capacity].filter(Boolean).join(' ') || 'Cihaz')

    const sent = musteriSentMap.get(c.id) ?? { email: false, sms: false }

    const datePairs: [string | null, 'kontrol' | 'skt'][] = [
      [d.control1_date, 'kontrol'],
      [d.control2_date, 'kontrol'],
      [d.control3_date, 'kontrol'],
      [d.expiry_date,   'skt'],
    ]

    for (const [dateStr, tip] of datePairs) {
      if (!dateStr) continue
      const gunKaldi = Math.floor(
        (new Date(dateStr).getTime() - today.getTime()) / 86400000
      )
      if (gunKaldi < -30 || gunKaldi > 30) continue

      // Müşteri grubunu al veya oluştur
      if (!customerMap.has(c.id)) {
        customerMap.set(c.id, {
          customerId:    c.id,
          customerName:  c.full_name,
          customerEmail: c.email ?? null,
          customerPhone: c.phone ?? null,
          devices:       [],
          enYakinGunKaldi: gunKaldi,
          sentEmail:  sent.email,
          sentSms:    sent.sms,
          susturuldu: susturulmusSet.has(c.id),
        })
      }

      const group = customerMap.get(c.id)!

      // En yakın günü güncelle
      if (gunKaldi < group.enYakinGunKaldi) group.enYakinGunKaldi = gunKaldi
      if (sent.email) group.sentEmail = true
      if (sent.sms)   group.sentSms   = true

      // Bu device+tip kombinasyonu zaten var mı?
      const idx = group.devices.findIndex(dv => dv.deviceId === d.id && dv.tarihTipi === tip)
      const newItem: DeviceItem = { deviceId: d.id, deviceName, tarih: dateStr, tarihTipi: tip, gunKaldi }

      if (idx === -1) {
        group.devices.push(newItem)
      } else {
        // Daha acil olanı (daha küçük gunKaldi) koy; gelecek tarihi geçmişe tercih et
        const ex = group.devices[idx]
        const replace =
          (ex.gunKaldi < 0 && gunKaldi >= 0) ||
          (ex.gunKaldi >= 0 && gunKaldi >= 0 && gunKaldi < ex.gunKaldi) ||
          (ex.gunKaldi < 0 && gunKaldi < 0  && gunKaldi > ex.gunKaldi)
        if (replace) group.devices[idx] = newItem
      }
    }
  }

  // Her grubun cihazlarını aciliyete göre sırala
  for (const g of customerMap.values()) {
    g.devices.sort((a, b) => a.gunKaldi - b.gunKaldi)
  }

  // Aktif (susturulmamış) ve susturulmuş ayrı listeler
  const customerGroups: CustomerGroup[] = Array.from(customerMap.values())
    .sort((a, b) => a.enYakinGunKaldi - b.enYakinGunKaldi)

  const aktifGruplar      = customerGroups.filter(g => !g.susturuldu)
  const susturulmusGruplar = customerGroups.filter(g =>  g.susturuldu)

  // KPI
  const kontrolYaklasan = aktifGruplar.filter(g => g.devices.some(d => d.tarihTipi === 'kontrol' && d.gunKaldi >= 0 && d.gunKaldi <= 30)).length
  const sktYaklasan     = aktifGruplar.filter(g => g.devices.some(d => d.tarihTipi === 'skt'     && d.gunKaldi >= 0 && d.gunKaldi <= 30)).length

  const [hasResend, hasNetgsm] = await Promise.all([
    getSetting('resend_api_key',  'RESEND_API_KEY').then(v => !!v),
    getSetting('netgsm_usercode', 'NETGSM_USERCODE').then(v => !!v),
  ])

  return (
    <OzetClient
      aktifGruplar={aktifGruplar}
      susturulmusGruplar={susturulmusGruplar}
      buAyGonderilen={buAyGonderilen ?? 0}
      buHaftaGonderilecek={(buHaftaPlanlanan ?? 0) + aktifGruplar.filter(g => g.enYakinGunKaldi >= 0 && g.enYakinGunKaldi <= 7).length}
      kontrolYaklasan={kontrolYaklasan}
      sktYaklasan={sktYaklasan}
      sablonlar={(sablonlar ?? []) as any}
      hasResend={hasResend}
      hasNetgsm={hasNetgsm}
    />
  )
}
