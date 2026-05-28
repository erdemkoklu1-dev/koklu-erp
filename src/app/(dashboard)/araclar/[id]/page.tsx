import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency } from '@/lib/finance/formatters'
import CommissionsTable from './CommissionsTable'
import BrokerActions from './BrokerActions'
import CariHareketlerTable, { type CariHareketRow } from './CariHareketlerTable'

function isOpenReceivable(row: CariHareketRow) {
  return row.islem_yonu === 'alacak' && !['Ödendi', 'İptal', 'Mahsup Edildi'].includes(row.durum)
}

export default async function AraciDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: broker }, { data: commissions }, { data: cariHareketler }, { data: subeler }] = await Promise.all([
    supabase.from('brokers').select('*').eq('id', id).single(),
    supabase
      .from('invoice_brokers')
      .select(`
        id, invoice_id, commission_rate, commission_amount, is_paid, paid_date, notes,
        invoices(invoice_number, invoice_date, total_amount, customers(full_name))
      `)
      .eq('broker_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('araci_cari_hareketleri')
      .select('*, subeler(ad)')
      .eq('araci_id', id)
      .order('hareket_tarihi', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('subeler')
      .select('id, ad')
      .eq('aktif', true)
      .order('ad'),
  ])

  if (!broker) notFound()

  const rows = commissions ?? []
  const totalCommission = rows.reduce((s, r) => s + (r.commission_amount ?? 0), 0)
  const paidCommission = rows.filter(r => r.is_paid).reduce((s, r) => s + (r.commission_amount ?? 0), 0)
  const pendingCommission = totalCommission - paidCommission
  const totalJobs = rows.length

  const cariRows = (cariHareketler ?? []) as CariHareketRow[]
  const activeCariRows = cariRows.filter(row => row.durum !== 'İptal')
  const totalAlacak = activeCariRows
    .filter(row => row.islem_yonu === 'alacak')
    .reduce((sum, row) => sum + Number(row.tutar ?? 0), 0)
  const totalBorc = activeCariRows
    .filter(row => row.islem_yonu === 'borc')
    .reduce((sum, row) => sum + Number(row.tutar ?? 0), 0)
  const netBakiye = totalAlacak - totalBorc
  const today = new Date().toISOString().slice(0, 10)
  const gecikenTutar = activeCariRows
    .filter(row => isOpenReceivable(row) && row.vade_tarihi && row.vade_tarihi < today)
    .reduce((sum, row) => sum + Number(row.tutar ?? 0), 0)
  const bekleyenOdeme = activeCariRows
    .filter(isOpenReceivable)
    .reduce((sum, row) => sum + Number(row.tutar ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/araclar" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 text-sm">← Aracılar</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{broker.full_name}</h1>
        </div>
        <BrokerActions brokerId={id} />
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-5">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">Aracı Bilgileri</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Ad Soyad</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{broker.full_name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Firma</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{broker.company_name ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Telefon</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{broker.phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">E-posta</div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{broker.email ?? '-'}</div>
            </div>
            {broker.notes && (
              <div className="col-span-2 sm:col-span-4">
                <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Notlar</div>
                <div className="text-sm text-gray-600 dark:text-gray-300">{broker.notes}</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalJobs}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Toplam İş</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-blue-700">{formatCurrency(totalAlacak)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Toplam Alacak</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-green-600">{formatCurrency(totalBorc)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Toplam Borç / Ödeme</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className={`text-xl font-bold ${netBakiye === 0 ? 'text-green-600' : netBakiye > 0 ? 'text-orange-600' : 'text-red-600'}`}>
              {formatCurrency(netBakiye)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Net Bakiye</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className={`text-xl font-bold ${gecikenTutar > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(gecikenTutar)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vadesi Gelen</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-xl font-bold text-orange-500">{formatCurrency(bekleyenOdeme)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Bekleyen Ödeme</div>
          </div>
        </div>

        <CariHareketlerTable
          brokerId={id}
          initialRows={cariRows}
          subeler={(subeler ?? []) as { id: string; ad: string }[]}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(totalCommission)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Fatura Komisyonu</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-green-600">{formatCurrency(paidCommission)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ödenen Komisyon</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-lg font-bold text-orange-500">{formatCurrency(pendingCommission)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Bekleyen Komisyon</div>
          </div>
        </div>

        <CommissionsTable
          brokerId={id}
          initialRows={rows as any}
          totalJobs={totalJobs}
        />
      </div>
    </div>
  )
}
