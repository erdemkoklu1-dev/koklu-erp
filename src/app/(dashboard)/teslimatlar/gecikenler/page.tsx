import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { daysSince, gecikmeDurumu } from '@/lib/teslimatlar'
import { formatTRDate } from '@/lib/finance/formatters'

export default async function GecikenlerPage() {
  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - 10 * 86400000).toISOString()
  const [{ data: geri }, { data: emanet }] = await Promise.all([
    supabase.from('geri_teslim_takipleri').select('*, teslimatlar(id, teslimat_no), customers(full_name), urunler(ad)').in('durum', ['bekliyor', 'kismi_teslim']).lt('created_at', cutoff),
    supabase.from('emanet_takipleri').select('*, teslimatlar(id, teslimat_no), customers(full_name), urunler(ad)').in('durum', ['acik', 'kismi_kapandi']).lt('created_at', cutoff),
  ])
  const rows = [
    ...(geri ?? []).map(r => ({ ...r, tip: 'Geri teslim' })),
    ...(emanet ?? []).map(r => ({ ...r, tip: 'Emanet' })),
  ]

  return (
    <div className="space-y-5 p-6">
      <h1 className="text-xl font-bold">Gecikenler</h1>
      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700"><tr><th className="px-4 py-3 text-left">Tip</th><th className="px-4 py-3 text-left">Teslimat</th><th className="px-4 py-3 text-left">Müşteri</th><th className="px-4 py-3 text-left">Ürün</th><th className="px-4 py-3 text-left">Hedef</th><th className="px-4 py-3 text-right">Gün</th><th className="px-4 py-3 text-left">Seviye</th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {rows.map(row => <tr key={`${row.tip}-${row.id}`}><td className="px-4 py-3">{row.tip}</td><td className="px-4 py-3"><Link href={`/teslimatlar/${(row.teslimatlar as any)?.id}`} className="text-[#C8102E]">{(row.teslimatlar as any)?.teslimat_no}</Link></td><td className="px-4 py-3">{(row.customers as any)?.full_name}</td><td className="px-4 py-3">{(row.urunler as any)?.ad ?? '-'}</td><td className="px-4 py-3">{formatTRDate(row.hedef_tarih)}</td><td className="px-4 py-3 text-right">{daysSince(row.created_at)}</td><td className="px-4 py-3">{gecikmeDurumu(row.created_at)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
