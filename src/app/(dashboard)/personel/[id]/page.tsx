import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import PersonelDetayClient from './PersonelDetayClient'

export const dynamic = 'force-dynamic'

export default async function PersonelDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: personel } = await supabase
    .from('personeller')
    .select('*, subeler(ad), roller(ad)')
    .eq('id', id)
    .single()

  if (!personel) notFound()

  const [
    { data: izinler },
    { data: maaslar },
    { data: mesailer },
    { data: performanslar },
    { data: belgeler },
    { data: izinHakki },
    { data: subeler },
    { data: personelListesi },
  ] = await Promise.all([
    supabase.from('personel_izinler').select('*, onaylayan:onaylayan_id(ad, soyad)').eq('personel_id', id).order('baslangic_tarihi', { ascending: false }),
    supabase.from('maas_odemeleri').select('*').eq('personel_id', id).order('odeme_donemi', { ascending: false }),
    supabase.from('mesai_kayitlari').select('*').eq('personel_id', id).order('tarih', { ascending: false }),
    supabase.from('performans_degerlendirmeleri').select('*, degerlendiren:degerlendiren_id(ad, soyad)').eq('personel_id', id).order('created_at', { ascending: false }),
    supabase.from('personel_belgeler').select('*').eq('personel_id', id).order('created_at', { ascending: false }),
    supabase.from('yillik_izin_hakki').select('*').eq('personel_id', id).order('yil', { ascending: false }),
    supabase.from('subeler').select('id, ad').order('ad'),
    supabase.from('personeller').select('id, ad, soyad').order('ad'),
  ])

  function normalizeRel(rows: any[] | null, key: string) {
    return (rows ?? []).map(r => ({
      ...r,
      [key]: Array.isArray(r[key]) ? (r[key][0] ?? null) : r[key],
    }))
  }

  const p = {
    ...personel,
    subeler: Array.isArray(personel.subeler) ? (personel.subeler[0] ?? null) : personel.subeler,
    roller:  Array.isArray(personel.roller)  ? (personel.roller[0]  ?? null) : personel.roller,
  }

  return (
    <PersonelDetayClient
      personel={p as any}
      izinler={normalizeRel(izinler as any[], 'onaylayan')}
      maaslar={maaslar ?? []}
      mesailer={mesailer ?? []}
      performanslar={normalizeRel(performanslar as any[], 'degerlendiren')}
      belgeler={belgeler ?? []}
      izinHakki={izinHakki ?? []}
      subeler={subeler ?? []}
      personelListesi={personelListesi ?? []}
    />
  )
}
