import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'
import GidenFiltresi from './GidenFiltresi'
import PrintButton from '@/components/PrintButton'

function computeDateRange(period?: string, from?: string, to?: string) {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (period === 'bu_ay') return {
    from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`,
    to: today.toISOString().split('T')[0],
  }
  if (period === 'gecen_ay') {
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1)
    return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] }
  }
  if (period === 'son_3_ay') {
    const start = new Date(today); start.setMonth(today.getMonth() - 3)
    return { from: start.toISOString().split('T')[0], to: today.toISOString().split('T')[0] }
  }
  if (period === 'bu_yil') return {
    from: `${today.getFullYear()}-01-01`,
    to: today.toISOString().split('T')[0],
  }
  return { from: from ?? null, to: to ?? null }
}

export default async function GidenFaturalarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; period?: string; from?: string; to?: string; sort?: string; durum?: string; sehir?: string; sube?: string }>
}) {
  const { q, period, from: fromParam, to: toParam, sort, durum, sehir, sube } = await searchParams
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const { from: dateFrom, to: dateTo } = computeDateRange(period, fromParam, toParam)

  const dbSortCol = sort === 'date_asc' ? 'invoice_date'
    : sort === 'amount_desc' || sort === 'amount_asc' ? 'total_amount'
    : 'invoice_date'
  const dbAsc = sort === 'date_asc' || sort === 'amount_asc'

  let query = supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, mahsup_durumu, sube_id, customers(full_name, il), subeler(ad)')
    .eq('invoice_type', 'satis')
    .neq('status', 'iptal')
    .order(dbSortCol, { ascending: dbAsc })

  if (dateFrom) query = query.gte('invoice_date', dateFrom)
  if (dateTo)   query = query.lte('invoice_date', dateTo)

  // Fatura no DB-level search (min 2 chars)
  if (q && q.trim().length >= 2) {
    query = query.ilike('invoice_number', `%${q.trim()}%`)
  }

  if (sube) query = query.eq('sube_id', sube)

  if (durum && durum !== 'tumu' && durum !== 'gecikmiş') {
    if (durum === 'vergi_mahsup') {
      query = query.eq('mahsup_durumu', 'vergi_mahsup')
    } else {
      query = query.eq('status', durum)
    }
  }

  const { data: rawInvoices } = await query

  let invoices = rawInvoices ?? []

  if (sort === 'customer_asc') {
    invoices = [...invoices].sort((a, b) => {
      const na = (a.customers as any)?.full_name ?? ''
      const nb = (b.customers as any)?.full_name ?? ''
      return na.localeCompare(nb, 'tr')
    })
  } else if (sort === 'customer_desc') {
    invoices = [...invoices].sort((a, b) => {
      const na = (a.customers as any)?.full_name ?? ''
      const nb = (b.customers as any)?.full_name ?? ''
      return nb.localeCompare(na, 'tr')
    })
  } else if (sort === 'kalan_desc') {
    invoices = [...invoices].sort((a, b) =>
      ((b.total_amount ?? 0) - (b.paid_amount ?? 0)) - ((a.total_amount ?? 0) - (a.paid_amount ?? 0))
    )
  }

  if (durum === 'gecikmiş') {
    invoices = invoices.filter(i =>
      i.due_date && i.due_date < today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0
    )
  }

  // Müşteri adına göre search (JS-side, joined table)
  if (q && q.trim().length >= 2) {
    const s = q.trim().toLowerCase()
    invoices = invoices.filter(i => {
      const c = i.customers as any
      return (i.invoice_number ?? '').toLowerCase().includes(s) ||
        (c?.full_name ?? '').toLowerCase().includes(s)
    })
  }

  // İl filtresi: customers.il'e göre
  if (sehir) {
    invoices = invoices.filter(i => {
      const c = i.customers as any
      return (c?.il ?? '') === sehir
    })
  }

  // KPI
  const toplamTutar  = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const toplamOdenen = invoices.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const toplamKalan  = Math.max(0, toplamTutar - toplamOdenen)
  const gecikmisSayi = invoices.filter(i =>
    i.due_date && i.due_date < today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0
  ).length

  const in7Str = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] })()

  const printDate = new Date().toLocaleString('tr-TR')

  return (
    <div className="p-6 space-y-5">

      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Giden Faturalar Listesi · {printDate}</div>
        {(durum && durum !== 'tumu') && <div style={{ fontWeight: 'normal', fontSize: '11px', marginTop: '2px' }}>Filtreler: Durum: {durum}</div>}
      </div>

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Giden Faturalar</h2>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link href="/cari-hesap/faturalar/new"
            className="no-print bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            + Yeni Fatura
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Toplam Giden Fatura</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamTutar)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{invoices.length} fatura</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-600 mb-0.5">Tahsil Edilen</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(toplamOdenen)}</div>
        </div>
        <div className={`rounded-xl p-4 border ${toplamKalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${toplamKalan > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Kalan Alacak</div>
          <div className={`text-xl font-bold ${toplamKalan > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>
            {formatCurrency(toplamKalan)}
          </div>
        </div>
        <div className={`rounded-xl p-4 border ${gecikmisSayi > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${gecikmisSayi > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş</div>
          <div className={`text-xl font-bold ${gecikmisSayi > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{gecikmisSayi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">vadesi geçmiş</div>
        </div>
      </div>

      {/* Filtreler */}
      <GidenFiltresi />

      {/* Sonuç sayısı */}
      <div className="text-sm text-gray-500 dark:text-gray-400 px-1">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{invoices.length}</span> sonuç bulundu
      </div>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Müşteri</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Şube</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarih</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vade</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kalan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">Fatura bulunamadı</td>
                </tr>
              ) : invoices.map(inv => {
                const customer = inv.customers as any
                const invSube = inv.subeler as any
                const kalan = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                const isMahsup = (inv as any).mahsup_durumu === 'vergi_mahsup'
                const isOverdue = !!(inv.due_date && inv.due_date < today && kalan > 0)
                const isToday   = inv.due_date === today && kalan > 0
                const daysLeft  = inv.due_date && inv.due_date > today
                  ? Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000)
                  : null

                const statusConf = isMahsup
                  ? INVOICE_STATUS_CONFIG['vergi_mahsup']
                  : INVOICE_STATUS_CONFIG[inv.status as string] ?? INVOICE_STATUS_CONFIG['taslak']

                return (
                  <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${isOverdue ? 'bg-red-50/40' : isMahsup ? 'bg-violet-50/30' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/cari-hesap/faturalar/${inv.id}?kaynak=giden`}
                        className="text-[#C8102E] hover:underline font-semibold">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {customer?.full_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{invSube?.ad ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatTRDate(inv.invoice_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.due_date ? (
                        <div className="flex items-center gap-1.5">
                          <span className={isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-orange-600 font-medium' : 'text-gray-600 dark:text-gray-300'}>
                            {formatTRDate(inv.due_date)}
                          </span>
                          {isOverdue && (
                            <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">Gecikmiş</span>
                          )}
                          {isToday && (
                            <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium">Bugün</span>
                          )}
                          {daysLeft !== null && daysLeft <= 7 && kalan > 0 && !isToday && (
                            <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full">{daysLeft}g kaldı</span>
                          )}
                        </div>
                      ) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">{formatCurrency(inv.total_amount)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${kalan > 0 ? (isOverdue ? 'text-red-600' : 'text-orange-600') : 'text-gray-400 dark:text-gray-500'}`}>
                      {kalan > 0 ? formatCurrency(kalan) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {statusConf && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                          {statusConf.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-3 justify-end">
                        <Link href={`/cari-hesap/faturalar/${inv.id}?kaynak=giden`}
                          className="text-xs text-[#C8102E] hover:underline font-medium">
                          Detay →
                        </Link>
                        <Link href={`/cari-hesap/faturalar/${inv.id}/edit?kaynak=giden`}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:underline font-medium">
                          Düzenle
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
