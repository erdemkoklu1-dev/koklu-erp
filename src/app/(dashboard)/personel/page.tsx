import { createServiceClient } from '@/lib/supabase/service'
import PersonelListeClient from './PersonelListeClient'

export const dynamic = 'force-dynamic'

export default async function PersonelPage() {
  const supabase = createServiceClient()

  const [
    { data: personeller },
    { data: subeler },
    { data: izinler },
    { data: maaslar },
  ] = await Promise.all([
    supabase
      .from('personeller')
      .select('id, sicil_no, ad, soyad, sube_id, pozisyon, departman, istihdam_tipi, ise_baslama_tarihi, durum, subeler(ad)')
      .order('ad'),
    supabase.from('subeler').select('id, ad').order('ad'),
    supabase
      .from('personel_izinler')
      .select('personel_id, durum, baslangic_tarihi, bitis_tarihi')
      .eq('durum', 'onaylandi'),
    supabase
      .from('maas_odemeleri')
      .select('personel_id, net_maas, odeme_donemi, odendi'),
  ])

  const today = new Date().toISOString().split('T')[0]
  const buAy = today.slice(0, 7)

  const bugunIzinliIds = new Set(
    (izinler ?? [])
      .filter(i => i.baslangic_tarihi <= today && i.bitis_tarihi >= today)
      .map(i => i.personel_id)
  )

  const buAyMaasTopla = (maaslar ?? [])
    .filter(m => m.odeme_donemi === buAy && !m.odendi)
    .reduce((s, m) => s + (m.net_maas ?? 0), 0)

  function normalizeRel(rows: any[] | null, key: string) {
    return (rows ?? []).map(r => ({
      ...r,
      [key]: Array.isArray(r[key]) ? (r[key][0] ?? null) : r[key],
    }))
  }

  const toplamPersonel = (personeller ?? []).length
  const aktifPersonel  = (personeller ?? []).filter(p => p.durum === 'aktif').length
  const bugunIzinli    = bugunIzinliIds.size

  return (
    <PersonelListeClient
      personeller={normalizeRel(personeller as any[], 'subeler')}
      subeler={subeler ?? []}
      ozet={{ toplamPersonel, aktifPersonel, bugunIzinli, buAyMaasTopla }}
    />
  )
}
