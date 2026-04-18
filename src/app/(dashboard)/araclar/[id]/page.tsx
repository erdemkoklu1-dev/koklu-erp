import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency } from '@/lib/finance/formatters'
import CommissionsTable from './CommissionsTable'
import BrokerActions from './BrokerActions'

export default async function AraciDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: broker }, { data: commissions }] = await Promise.all([
    supabase.from('brokers').select('*').eq('id', id).single(),
    supabase
      .from('invoice_brokers')
      .select(`
        id, invoice_id, commission_rate, commission_amount, is_paid, paid_date, notes,
        invoices(invoice_number, invoice_date, total_amount, customers(full_name))
      `)
      .eq('broker_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (!broker) notFound()

  const rows = commissions ?? []
  const totalCommission   = rows.reduce((s, r) => s + (r.commission_amount ?? 0), 0)
  const paidCommission    = rows.filter(r => r.is_paid).reduce((s, r) => s + (r.commission_amount ?? 0), 0)
  const pendingCommission = totalCommission - paidCommission
  const totalJobs         = rows.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Üst bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/araclar" className="text-gray-500 hover:text-gray-700 text-sm">← Aracılar</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900">{broker.full_name}</h1>
        </div>
        <BrokerActions brokerId={id} />
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Bilgi kartı */}
        <div className="bg-white border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b">Aracı Bilgileri</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Ad Soyad</div>
              <div className="text-sm font-medium text-gray-900">{broker.full_name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Firma</div>
              <div className="text-sm font-medium text-gray-900">{broker.company_name ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Telefon</div>
              <div className="text-sm font-medium text-gray-900">{broker.phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">E-posta</div>
              <div className="text-sm font-medium text-gray-900">{broker.email ?? '-'}</div>
            </div>
            {broker.notes && (
              <div className="col-span-2 sm:col-span-4">
                <div className="text-xs text-gray-400 mb-1">Notlar</div>
                <div className="text-sm text-gray-600">{broker.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Özet kartlar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalJobs}</div>
            <div className="text-xs text-gray-500 mt-1">Toplam İş</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalCommission)}</div>
            <div className="text-xs text-gray-500 mt-1">Toplam Komisyon</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-green-600">{formatCurrency(paidCommission)}</div>
            <div className="text-xs text-gray-500 mt-1">Ödenen Komisyon</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-orange-500">{formatCurrency(pendingCommission)}</div>
            <div className="text-xs text-gray-500 mt-1">Bekleyen Komisyon</div>
          </div>
        </div>

        {/* Faturalar tablosu */}
        <CommissionsTable
          brokerId={id}
          initialRows={rows as any}
          totalJobs={totalJobs}
        />

      </div>
    </div>
  )
}
