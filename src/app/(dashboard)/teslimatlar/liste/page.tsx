import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { formatTRDate } from '@/lib/finance/formatters'
import { TeslimatSilButton } from '../TeslimatSilButton'

export default async function TeslimatListePage({ searchParams }: { searchParams: Promise<{ sube?: string; durum?: string }> }) {
  const { sube, durum } = await searchParams
  const supabase = createServiceClient()
  let query = supabase
    .from('teslimatlar')
    .select('id, teslimat_no, teslimat_tarihi, hedef_tarih, durum, on_kayit_olusturuldu, customers(id, full_name), subeler(id, ad), personeller(id, ad, soyad)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (sube) query = query.eq('sube_id', sube)
  if (durum) query = query.eq('durum', durum)

  const [{ data: rows }, { data: subeler }] = await Promise.all([
    query,
    supabase.from('subeler').select('id, ad').order('ad'),
  ])

  function url(next: { sube?: string | null; durum?: string | null }) {
    const params = new URLSearchParams()
    const nextSube = next.sube === null ? undefined : (next.sube ?? sube)
    const nextDurum = next.durum === null ? undefined : (next.durum ?? durum)
    if (nextSube) params.set('sube', nextSube)
    if (nextDurum) params.set('durum', nextDurum)
    return `/teslimatlar/liste${params.toString() ? `?${params}` : ''}`
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Teslimat listesi</h1>
        <Link href="/teslimatlar/yeni" className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white">Yeni teslimat</Link>
      </div>
      <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-800">
        <Link href={url({ sube: null })} className="rounded-md border px-3 py-2">Tüm şubeler</Link>
        {(subeler ?? []).map(s => <Link key={s.id} href={url({ sube: s.id })} className="rounded-md border px-3 py-2">{s.ad}</Link>)}
        {['taslak', 'sevkte', 'tamamlandi', 'iptal'].map(d => <Link key={d} href={url({ durum: d })} className="rounded-md border px-3 py-2">{d}</Link>)}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">No</th>
              <th className="px-4 py-3 text-left">Müşteri</th>
              <th className="px-4 py-3 text-left">Şube</th>
              <th className="px-4 py-3 text-left">Personel</th>
              <th className="px-4 py-3 text-left">Tarih</th>
              <th className="px-4 py-3 text-left">Hedef</th>
              <th className="px-4 py-3 text-left">Durum</th>
              <th className="px-4 py-3 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {(rows ?? []).map(row => {
              const customer = row.customers as any
              const rowSube = row.subeler as any
              const personel = row.personeller as any
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-mono font-semibold text-[#C8102E]">{row.teslimat_no}</td>
                  <td className="px-4 py-3">{customer?.full_name ?? '-'}</td>
                  <td className="px-4 py-3">{rowSube?.ad ?? 'Genel'}</td>
                  <td className="px-4 py-3">{personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}` : '-'}</td>
                  <td className="px-4 py-3">{formatTRDate(row.teslimat_tarihi)}</td>
                  <td className="px-4 py-3">{formatTRDate(row.hedef_tarih)}</td>
                  <td className="px-4 py-3">{row.durum}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/teslimatlar/${row.id}`} className="text-[#C8102E]">Aç</Link>
                      <Link href={`/teslimatlar/${row.id}/duzenle`} className="text-[#C8102E]">Düzenle</Link>
                      <TeslimatSilButton id={row.id} teslimatNo={row.teslimat_no} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
