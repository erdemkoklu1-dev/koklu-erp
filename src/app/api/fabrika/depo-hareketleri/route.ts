import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const hareket_tipi = searchParams.get('hareket_tipi')
  const kaynak       = searchParams.get('kaynak')
  const baslangic    = searchParams.get('baslangic')
  const bitis        = searchParams.get('bitis')
  const limit        = Number(searchParams.get('limit') ?? 200)

  const supabase = createServiceClient()
  let query = supabase
    .from('depo_hareketleri')
    .select('*')
    .order('tarih', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (hareket_tipi) query = query.eq('hareket_tipi', hareket_tipi)
  if (kaynak)       query = query.eq('kaynak', kaynak)
  if (baslangic)    query = query.gte('tarih', baslangic)
  if (bitis)        query = query.lte('tarih', bitis)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolve names for kaynak_id
  if (!data || data.length === 0) return NextResponse.json([])

  const hammaddeIds = [...new Set(data.filter(d => d.kaynak === 'hammadde').map(d => d.kaynak_id as string))]
  const urunIds     = [...new Set(data.filter(d => d.kaynak === 'urun').map(d => d.kaynak_id as string))]

  const [{ data: hammaddeler }, { data: urunler }] = await Promise.all([
    hammaddeIds.length > 0
      ? supabase.from('hammaddeler').select('id, ad').in('id', hammaddeIds)
      : Promise.resolve({ data: [] }),
    urunIds.length > 0
      ? supabase.from('urunler').select('id, ad').in('id', urunIds)
      : Promise.resolve({ data: [] }),
  ])

  const hammaddeMap = new Map((hammaddeler ?? []).map(h => [h.id, h.ad]))
  const urunMap     = new Map((urunler ?? []).map(u => [u.id, u.ad]))

  const enriched = data.map(d => ({
    ...d,
    kaynak_adi: d.kaynak === 'hammadde'
      ? (hammaddeMap.get(d.kaynak_id) ?? d.kaynak_id)
      : (urunMap.get(d.kaynak_id) ?? d.kaynak_id),
  }))

  return NextResponse.json(enriched)
}
