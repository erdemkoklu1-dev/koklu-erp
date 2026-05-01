import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'
import GelenFaturaTable from './GelenFaturaTable'
import GelenFiltresi from './GelenFiltresi'
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

export default async function GelenFaturalarPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; tedarikci?: string; odeme_durumu?: string; vade_durumu?: string; kategori?: string
    period?: string; from?: string; to?: string; sort?: string; sehir?: string
  }>
}) {
  const params = await searchParams
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]
  const in7 = new Date(); in7.setDate(in7.getDate() + 7)
  const in7Str = in7.toISOString().split('T')[0]

  const { from: dateFrom, to: dateTo } = computeDateRange(params.period, params.from, params.to)

  const dbSortCol = params.sort === 'date_asc' ? 'invoice_date'
    : params.sort === 'amount_desc' || params.sort === 'amount_asc' ? 'total_amount'
    : 'invoice_date'
  const dbAsc = params.sort === 'date_asc' || params.sort === 'amount_asc'

  // İl filtresi: önce bu ildeki tedarikçilerin firma adlarını bul
  let supplierFilter: string[] | null = null
  if (params.sehir) {
    const { data: teds } = await supabase
      .from('tedarikciler')
      .select('firma_adi')
      .eq('sehir', params.sehir)
    supplierFilter = (teds ?? []).map((t: any) => t.firma_adi).filter(Boolean)
  }

  let invoices: any[] = []

  // Eğer il filtresi seçiliyse ama o ilde tedarikçi yoksa boş döndür
  const noSehirMatch = supplierFilter !== null && supplierFilter.length === 0
  if (!noSehirMatch) {
    let query = supabase
      .from('invoices')
      .select('id, invoice_number, supplier_name, invoice_date, due_date, total_amount, paid_amount, status, notes')
      .eq('invoice_type', 'alis')
      .neq('status', 'iptal')
      .order(dbSortCol, { ascending: dbAsc })

    // Unified search: fatura no + tedarikçi adı
    const aramaMetni = (params.q ?? params.tedarikci ?? '').trim()
    if (aramaMetni.length >= 2) {
      query = query.or(`invoice_number.ilike.%${aramaMetni}%,supplier_name.ilike.%${aramaMetni}%`)
    }

    if (dateFrom) query = query.gte('invoice_date', dateFrom)
    if (dateTo)   query = query.lte('invoice_date', dateTo)
    if (params.kategori === 'vergi') query = query.ilike('notes', '%Vergi Ödemesi%')

    if (params.odeme_durumu && params.odeme_durumu !== 'tumu') {
      if (params.odeme_durumu === 'odenmemis') {
        query = query.in('status', ['taslak', 'kesildi', 'gonderildi'])
      } else {
        query = query.eq('status', params.odeme_durumu)
      }
    }

    if (supplierFilter !== null && supplierFilter.length > 0) {
      query = query.in('supplier_name', supplierFilter)
    }

    const { data } = await query
    invoices = data ?? []
  }

  // Post-fetch: JS sort + vade filter
  if (params.sort === 'customer_asc') {
    invoices = [...invoices].sort((a, b) => (a.supplier_name ?? '').localeCompare(b.supplier_name ?? '', 'tr'))
  } else if (params.sort === 'customer_desc') {
    invoices = [...invoices].sort((a, b) => (b.supplier_name ?? '').localeCompare(a.supplier_name ?? '', 'tr'))
  } else if (params.sort === 'kalan_desc') {
    invoices = [...invoices].sort((a, b) =>
      ((b.total_amount ?? 0) - (b.paid_amount ?? 0)) - ((a.total_amount ?? 0) - (a.paid_amount ?? 0))
    )
  }

  if (params.vade_durumu === 'gecikmiş') {
    invoices = invoices.filter(i => i.due_date && i.due_date < today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0)
  } else if (params.vade_durumu === 'bugun') {
    invoices = invoices.filter(i => i.due_date === today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0)
  } else if (params.vade_durumu === 'yaklasan') {
    invoices = invoices.filter(i =>
      i.due_date && i.due_date > today && i.due_date <= in7Str && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0
    )
  }

  const toplamTutar  = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const toplamKalan  = invoices.reduce((s, i) => s + Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0)
  const gecikmisSayi = invoices.filter(i => i.due_date && i.due_date < today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0).length

  const printDate = new Date().toLocaleString('tr-TR')

  return (
    <div className="p-6 space-y-5">

      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Gelen Faturalar Listesi · {printDate}</div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Gelen Faturalar</h2>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link href="/cari-hesap/fatura-import?tab=gelen-pdf"
            className="no-print bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            + İçe Aktar
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Toplam Fatura Tutarı</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamTutar)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{invoices.length} fatura</div>
        </div>
        <div className={`rounded-xl p-4 border ${toplamKalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${toplamKalan > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Kalan Borç</div>
          <div className={`text-xl font-bold ${toplamKalan > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(toplamKalan)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">ödenmemiş toplam</div>
        </div>
        <div className={`rounded-xl p-4 border ${gecikmisSayi > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${gecikmisSayi > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş</div>
          <div className={`text-xl font-bold ${gecikmisSayi > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{gecikmisSayi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            <Link href="/cari-hesap/gecikis" className="hover:underline">Detay →</Link>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <GelenFiltresi />

      {/* Sonuç sayısı */}
      <div className="text-sm text-gray-500 dark:text-gray-400 px-1">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{invoices.length}</span> sonuç bulundu
      </div>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tedarikçi</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura Tarihi</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vade Tarihi</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kalan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              <GelenFaturaTable invoices={invoices} today={today} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
