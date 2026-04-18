import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'

export default async function AraclarPage() {
  const supabase = createServiceClient()

  const { data: brokers } = await supabase
    .from('brokers')
    .select('*')
    .eq('is_active', true)
    .order('full_name')

  // Her aracı için komisyon istatistikleri
  const brokerIds = (brokers ?? []).map(b => b.id)
  const { data: commissions } = brokerIds.length > 0
    ? await supabase
        .from('invoice_brokers')
        .select('broker_id, commission_amount, is_paid')
        .in('broker_id', brokerIds)
    : { data: [] }

  type BrokerStats = { total: number; paid: number; pending: number; jobCount: number }
  const statsMap = new Map<string, BrokerStats>()
  for (const c of commissions ?? []) {
    const s = statsMap.get(c.broker_id) ?? { total: 0, paid: 0, pending: 0, jobCount: 0 }
    s.jobCount++
    s.total += c.commission_amount ?? 0
    if (c.is_paid) s.paid += c.commission_amount ?? 0
    else s.pending += c.commission_amount ?? 0
    statsMap.set(c.broker_id, s)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900">Aracılar</h1>
        </div>
        <Link href="/araclar/new"
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
          + Yeni Aracı
        </Link>
      </div>

      <div className="p-6">
        <div className="bg-white border rounded-lg overflow-hidden">
          {!brokers || brokers.length === 0 ? (
            <div className="px-4 py-16 text-center text-gray-400 text-sm">
              Henüz aracı eklenmemiş.{' '}
              <Link href="/araclar/new" className="text-[#C8102E] hover:underline">Aracı ekle →</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ad / Firma</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Telefon</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">E-posta</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Aktif İş</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Bekleyen Kom.</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Toplam Kom.</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {brokers.map(broker => {
                    const stats = statsMap.get(broker.id) ?? { jobCount: 0, pending: 0, total: 0, paid: 0 }
                    return (
                      <tr key={broker.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{broker.full_name}</div>
                          {broker.company_name && (
                            <div className="text-xs text-gray-500">{broker.company_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{broker.phone ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{broker.email ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 font-medium">{stats.jobCount}</td>
                        <td className="px-4 py-3 text-right">
                          {stats.pending > 0 ? (
                            <span className="text-sm font-semibold text-orange-700">{formatCurrency(stats.pending)}</span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(stats.total)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/araclar/${broker.id}`}
                            className="text-xs text-[#C8102E] hover:underline">
                            Detay →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
