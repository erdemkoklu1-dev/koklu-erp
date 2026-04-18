import { createServiceClient } from '@/lib/supabase/service'
import KayitlarClient from './KayitlarClient'

export default async function KayitlarPage({
  searchParams,
}: {
  searchParams: Promise<{ kullanici?: string; from?: string; to?: string; tip?: string }>
}) {
  const { kullanici, from, to, tip } = await searchParams
  const supabase = createServiceClient()

  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let q = supabase
    .from('giris_kayitlari')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (kullanici) q = q.eq('kullanici_id', kullanici)
  if (from)      q = q.gte('created_at', from)
  if (to)        q = q.lte('created_at', to + 'T23:59:59')
  if (tip)       q = q.eq('islem_tipi', tip)

  const [{ data: kayitlar }, { data: profiller }] = await Promise.all([
    q,
    supabase.from('kullanici_profiller').select('id, ad_soyad'),
  ])

  // Özet istatistikler
  const { data: bugunAktif } = await supabase
    .from('giris_kayitlari')
    .select('kullanici_id')
    .eq('islem_tipi', 'giris')
    .gte('created_at', today)

  const { data: haftaBasarisiz } = await supabase
    .from('giris_kayitlari')
    .select('id')
    .eq('islem_tipi', 'basarisiz_giris')
    .gte('created_at', weekAgo)

  const bugunAktifSayisi = new Set(bugunAktif?.map(k => k.kullanici_id)).size
  const haftaBasarisizSayisi = haftaBasarisiz?.length ?? 0

  return (
    <KayitlarClient
      kayitlar={kayitlar ?? []}
      profiller={profiller ?? []}
      bugunAktif={bugunAktifSayisi}
      haftaBasarisiz={haftaBasarisizSayisi}
    />
  )
}
