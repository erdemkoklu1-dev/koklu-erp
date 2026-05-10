import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { formatTRDate } from '@/lib/finance/formatters'

export default async function EmanetlerPage({ searchParams }: { searchParams: Promise<{ sube?: string }> }) {
  const { sube } = await searchParams
  const supabase = createServiceClient()
  let query = supabase
    .from('emanet_takipleri')
    .select('*, teslimatlar(id, teslimat_no), customers(id, full_name), subeler(id, ad), urunler(ad)')
    .in('durum', ['acik', 'kismi_kapandi'])
    .order('created_at', { ascending: false })
  if (sube) query = query.eq('sube_id', sube)
  const { data } = await query

  return (
    <div className="space-y-5 p-6">
      <h1 className="text-xl font-bold">Açık emanetler</h1>
      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700"><tr><th className="px-4 py-3 text-left">Teslimat</th><th className="px-4 py-3 text-left">Müşteri</th><th className="px-4 py-3 text-left">Ürün</th><th className="px-4 py-3 text-left">Şube</th><th className="px-4 py-3 text-right">Miktar</th><th className="px-4 py-3 text-left">Hedef</th><th className="px-4 py-3 text-left">Durum</th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {(data ?? []).map(row => <tr key={row.id}><td className="px-4 py-3"><Link className="text-[#C8102E]" href={`/teslimatlar/${(row.teslimatlar as any)?.id}`}>{(row.teslimatlar as any)?.teslimat_no}</Link></td><td className="px-4 py-3">{(row.customers as any)?.full_name}</td><td className="px-4 py-3">{(row.urunler as any)?.ad ?? '-'}</td><td className="px-4 py-3">{(row.subeler as any)?.ad ?? 'Genel'}</td><td className="px-4 py-3 text-right">{row.geri_alinan_miktar}/{row.miktar}</td><td className="px-4 py-3">{formatTRDate(row.hedef_tarih)}</td><td className="px-4 py-3">{row.durum}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
