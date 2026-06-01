import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { TeslimatListeClient, type TeslimatRow } from './TeslimatListeClient'
import { getCurrentAccess } from '@/lib/auth/authorization'

type RawTeslimat = {
  id: string
  teslimat_no: string | null
  teslimat_tarihi: string | null
  hedef_tarih: string | null
  durum: string | null
  customers: unknown
  subeler: unknown
  personeller: unknown
}

export default async function TeslimatListePage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  const params = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  function scope(query: any) {
    if (!access || access.isAdmin) return query
    if (access.branchIds.length === 0) return query.in('sube_id', ['00000000-0000-0000-0000-000000000000'])
    return query.in('sube_id', access.branchIds)
  }

  const [{ data: rows }, { data: subeler }] = await Promise.all([
    scope(supabase
      .from('teslimatlar')
      .select('id, teslimat_no, teslimat_tarihi, hedef_tarih, durum, customers(id, full_name), subeler(id, ad), personeller(id, ad, soyad)')
      .order('created_at', { ascending: false })
      .limit(300)),
    supabase.from('subeler').select('id, ad').order('ad'),
  ])

  // Kalem sayısını ayrı sorguda çek
  const rawRows = (rows ?? []) as RawTeslimat[]
  const ids = rawRows.map(r => r.id)
  const { data: kalemRows } = ids.length > 0
    ? await supabase.from('teslimat_kalemleri').select('teslimat_id').in('teslimat_id', ids)
    : { data: [] }

  const kalemCountMap = new Map<string, number>()
  for (const kr of kalemRows ?? []) {
    kalemCountMap.set(kr.teslimat_id, (kalemCountMap.get(kr.teslimat_id) ?? 0) + 1)
  }

  const typedRows: TeslimatRow[] = rawRows.map(r => {
    const c = r.customers as unknown as { id: string; full_name: string } | null
    const s = r.subeler as unknown as { id: string; ad: string } | null
    const p = r.personeller as unknown as { id: string; ad: string; soyad: string } | null
    return {
      id: r.id,
      teslimat_no: r.teslimat_no ?? '',
      teslimat_tarihi: r.teslimat_tarihi ?? null,
      hedef_tarih: r.hedef_tarih ?? null,
      durum: r.durum ?? 'taslak',
      customers: c,
      subeler: s,
      personeller: p,
      kalem_count: kalemCountMap.get(r.id) ?? 0,
    }
  })

  const visibleSubeler = access?.isAdmin ? (subeler ?? []) : (subeler ?? []).filter(s => access?.branchIds.includes(s.id))
  const typedSubeler = visibleSubeler.map(s => ({ id: s.id, ad: s.ad ?? '' }))

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Link href="/teslimatlar" className="flex items-center gap-1 text-[#C8102E] hover:underline">
              ← Teslimatlar
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600 dark:text-gray-400">Teslimat Listesi</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Teslimat listesi</h1>
        </div>
        <Link href="/teslimatlar/yeni" className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25] transition-colors">
          + Yeni teslimat
        </Link>
      </div>
      <TeslimatListeClient rows={typedRows} subeler={typedSubeler} initialDurum={params.durum ?? ''} />
    </div>
  )
}
