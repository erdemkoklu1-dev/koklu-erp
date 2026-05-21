import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import { normalizeSupplierName, normalizeSupplierTaxNo } from '@/lib/gelen-fatura-supplier-matching'
import TedarikciModal from './TedarikciModal'
import TopluOdemeModal from './TopluOdemeModal'

type SearchParams = {
  q?: string
  durum?: string
  sube_id?: string
  from?: string
  to?: string
}

type InvoiceRow = {
  id: string
  invoice_number: string
  supplier_name: string | null
  supplier_tax_no: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  paid_amount: number | null
  status: string | null
  sube_id: string | null
  subeler: { ad: string } | { ad: string }[] | null
}

type ManualSupplier = {
  id: string
  firma_adi: string
  vergi_no: string | null
  telefon?: string | null
  email?: string | null
  sehir?: string | null
  urunler_hizmetler?: string | null
  odeme_vadesi?: number | null
}

type SupplierRow = {
  name: string
  taxNo: string | null
  totalInvoice: number
  totalPaid: number
  invoiceCount: number
  overdueCount: number
  overdueAmount: number
  lastActivity: string | null
  invoices: InvoiceRow[]
  manuelId: string | null
  manuelData: ManualSupplier | null
}

function inDateRange(value: string | null, from?: string, to?: string) {
  if (!value) return !from && !to
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

function supplierKey(name: string | null | undefined, taxNo: string | null | undefined) {
  const normalizedTax = normalizeSupplierTaxNo(taxNo)
  if (normalizedTax) return `tax:${normalizedTax}`
  return `name:${normalizeSupplierName(name)}`
}

function branchName(subeler: InvoiceRow['subeler']) {
  if (Array.isArray(subeler)) return subeler[0]?.ad ?? null
  return subeler?.ad ?? null
}

function buildUrl(params: SearchParams, overrides: SearchParams) {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) next.set(key, value)
  }
  const qs = next.toString()
  return qs ? `/cari-hesap/tedarikciler?${qs}` : '/cari-hesap/tedarikciler'
}

export default async function TedarikcilerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const durum = params.durum || 'acik'
  const q = (params.q ?? '').trim()
  const qNorm = normalizeSupplierName(q)
  const qTax = normalizeSupplierTaxNo(q)

  const [{ data: invoices }, { data: manuelTedarikciler }, { data: subeler }, { data: payments }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, supplier_name, supplier_tax_no, invoice_date, due_date, total_amount, paid_amount, status, sube_id, subeler(ad)')
      .eq('invoice_type', 'alis')
      .neq('status', 'iptal')
      .order('invoice_date', { ascending: false }),
    supabase
      .from('tedarikciler')
      .select('id, firma_adi, vergi_no, telefon, email, sehir, urunler_hizmetler, odeme_vadesi')
      .eq('aktif', true)
      .order('firma_adi'),
    supabase.from('subeler').select('id, ad').order('ad'),
    supabase.from('payments').select('invoice_id, payment_date').order('payment_date', { ascending: false }),
  ])

  const paymentByInvoice = new Map<string, string>()
  for (const payment of payments ?? []) {
    if (payment.invoice_id && payment.payment_date && !paymentByInvoice.has(payment.invoice_id)) {
      paymentByInvoice.set(payment.invoice_id, payment.payment_date)
    }
  }

  const supplierMap = new Map<string, SupplierRow>()

  for (const inv of (invoices ?? []) as unknown as InvoiceRow[]) {
    const lastActivity = paymentByInvoice.get(inv.id) ?? inv.invoice_date
    if (params.sube_id && inv.sube_id !== params.sube_id) continue
    if (!inDateRange(inv.invoice_date, params.from, params.to)) continue

    const name = inv.supplier_name ?? 'Bilinmeyen Tedarikçi'
    const key = supplierKey(name, inv.supplier_tax_no)
    const cur = supplierMap.get(key) ?? {
      name,
      taxNo: inv.supplier_tax_no ?? null,
      totalInvoice: 0,
      totalPaid: 0,
      invoiceCount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      lastActivity: null,
      invoices: [],
      manuelId: null,
      manuelData: null,
    }
    cur.totalInvoice += inv.total_amount ?? 0
    cur.totalPaid += inv.paid_amount ?? 0
    cur.invoiceCount++
    cur.lastActivity = !cur.lastActivity || (lastActivity && lastActivity > cur.lastActivity) ? lastActivity ?? cur.lastActivity : cur.lastActivity
    const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
    if (inv.due_date && inv.due_date < today && kalan > 0) {
      cur.overdueCount++
      cur.overdueAmount += kalan
    }
    cur.invoices.push(inv)
    supplierMap.set(key, cur)
  }

  for (const mt of (manuelTedarikciler ?? []) as ManualSupplier[]) {
    if (params.sube_id || params.from || params.to) continue
    const key = supplierKey(mt.firma_adi, mt.vergi_no)
    const existing = supplierMap.get(key)
    if (existing) {
      existing.name = mt.firma_adi
      existing.taxNo = mt.vergi_no ?? existing.taxNo
      existing.manuelId = mt.id
      existing.manuelData = mt
    } else {
      supplierMap.set(key, {
        name: mt.firma_adi,
        taxNo: mt.vergi_no ?? null,
        totalInvoice: 0,
        totalPaid: 0,
        invoiceCount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        lastActivity: null,
        invoices: [],
        manuelId: mt.id,
        manuelData: mt,
      })
    }
  }

  let suppliers = Array.from(supplierMap.values())

  if (q) {
    suppliers = suppliers.filter(s => {
      const nameMatch = normalizeSupplierName(s.name).includes(qNorm)
      const taxMatch = qTax && normalizeSupplierTaxNo(s.taxNo).includes(qTax)
      const invoiceMatch = s.invoices.some(inv => (inv.invoice_number ?? '').toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')))
      return nameMatch || taxMatch || invoiceMatch
    })
  }

  suppliers = suppliers.filter(s => {
    const kalan = Math.max(0, s.totalInvoice - s.totalPaid)
    if (durum === 'tum') return true
    if (durum === 'kapanan' || durum === 'odenen') return s.invoiceCount > 0 && kalan === 0
    if (durum === 'borclu') return kalan > 0
    if (durum === 'geciken') return s.overdueCount > 0
    return kalan > 0 || s.invoiceCount === 0
  })

  suppliers.sort((a, b) => {
    const ka = a.totalInvoice - a.totalPaid
    const kb = b.totalInvoice - b.totalPaid
    if (ka === 0 && kb === 0) return a.name.localeCompare(b.name, 'tr')
    return kb - ka
  })

  const toplamBorc = suppliers.reduce((s, r) => s + Math.max(0, r.totalInvoice - r.totalPaid), 0)
  const gecikmisToplam = suppliers.reduce((s, r) => s + r.overdueAmount, 0)
  const kapananSayi = Array.from(supplierMap.values()).filter(s => s.invoiceCount > 0 && Math.max(0, s.totalInvoice - s.totalPaid) === 0).length

  const statusTabs = [
    { value: 'acik', label: 'Açık Hesaplar' },
    { value: 'borclu', label: 'Borcu Olanlar' },
    { value: 'geciken', label: 'Gecikenler' },
    { value: 'kapanan', label: 'Kapanan Hesaplar' },
    { value: 'odenen', label: 'Tamamen Ödenenler' },
    { value: 'tum', label: 'Tümü' },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tedarikçiler</h2>
        <div className="flex gap-2">
          <Link href="/cari-hesap/faturalar/new"
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            + Alış Faturası
          </Link>
          <TedarikciModal />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Filtrelenmiş Borç</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamBorc)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{suppliers.filter(s => s.totalInvoice > s.totalPaid).length} tedarikçiye borç</div>
        </div>
        <div className={`rounded-xl p-4 border ${gecikmisToplam > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${gecikmisToplam > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş Borç</div>
          <div className={`text-xl font-bold ${gecikmisToplam > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(gecikmisToplam)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">vadesi geçmiş ödemeler</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Kapanan Hesap</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{kapananSayi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">varsayılan listeden ayrıldı</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border rounded-xl p-4 space-y-3 sticky top-0 z-10">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map(opt => (
            <Link key={opt.value} href={buildUrl(params, { durum: opt.value })}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${durum === opt.value ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {opt.label}
            </Link>
          ))}
        </div>

        <form method="GET" action="/cari-hesap/tedarikciler" className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <input type="hidden" name="durum" value={durum} />
          <input name="q" defaultValue={q} placeholder="Tedarikçi, VKN veya fatura no"
            className="lg:col-span-2 border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
          <select name="sube_id" defaultValue={params.sube_id ?? ''}
            className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900">
            <option value="">Tüm şubeler</option>
            {(subeler ?? []).map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
          <input type="date" name="from" defaultValue={params.from ?? ''} title="İşlem/Fatura başlangıç tarihi"
            className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
          <input type="date" name="to" defaultValue={params.to ?? ''} title="İşlem/Fatura bitiş tarihi"
            className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900" />
          <div className="flex gap-2">
            <button className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium">Filtrele</button>
            <Link href="/cari-hesap/tedarikciler" className="border px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300">Temizle</Link>
          </div>
        </form>
        <div className="text-xs text-gray-400 dark:text-gray-500">Tarih aralığı işlem/fatura tarihine göre uygulanır.</div>
      </div>

      <div className="space-y-4">
        {suppliers.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border rounded-xl px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            Filtreye uygun tedarikçi bulunamadı.
          </div>
        ) : suppliers.map(sup => {
          const kalan = Math.max(0, sup.totalInvoice - sup.totalPaid)
          const isClosed = sup.invoiceCount > 0 && kalan === 0
          const detailHref = sup.manuelId
            ? `/cari-hesap/tedarikciler/${sup.manuelId}`
            : `/cari-hesap/tedarikciler/${encodeURIComponent(sup.name)}`

          return (
            <div key={`${sup.taxNo ?? ''}-${sup.name}`} className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
              <div className={`px-5 py-3 border-b flex items-center justify-between ${sup.overdueCount > 0 ? 'bg-red-50' : isClosed ? 'bg-green-50' : 'bg-gray-50 dark:bg-gray-700'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={detailHref}
                    className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline">
                    {sup.name}
                  </Link>
                  <Link href={detailHref} className="text-xs text-[#C8102E] hover:underline">
                    Cari
                  </Link>
                  {sup.taxNo && <span className="text-xs text-gray-400 dark:text-gray-500">{sup.taxNo}</span>}
                  {sup.manuelData && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border px-2 py-0.5 rounded-full">Kayıtlı</span>}
                  {isClosed && <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Kapandı</span>}
                </div>
                <div className="flex items-center gap-3">
                  {sup.overdueCount > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                      {sup.overdueCount} gecikmiş - {formatCurrency(sup.overdueAmount)}
                    </span>
                  )}
                  <TopluOdemeModal supplierName={sup.name} invoices={sup.invoices ?? []} />
                  <div className="text-right">
                    {sup.invoiceCount > 0 ? (
                      <>
                        <div className={`text-sm font-bold ${kalan > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {kalan > 0 ? `Borç: ${formatCurrency(kalan)}` : 'Kapandı'}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{sup.invoiceCount} fatura</div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-400 dark:text-gray-500">Fatura yok</div>
                    )}
                  </div>
                </div>
              </div>

              {sup.invoiceCount > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura No</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Tarih</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Vade</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Şube</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Tutar</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Ödenen</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Kalan</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sup.invoices.slice(0, 8).map(inv => {
                        const invKalan = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                        const isOverdue = inv.due_date && inv.due_date < today && invKalan > 0
                        return (
                          <tr key={inv.id} className={`${isOverdue ? 'bg-red-50/50' : ''} hover:bg-gray-50`}>
                            <td className="px-4 py-2.5">
                              <Link href={`/cari-hesap/faturalar/${inv.id}`}
                                className="text-sm font-medium text-[#C8102E] hover:underline">
                                {inv.invoice_number}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(inv.invoice_date)}</td>
                            <td className={`px-4 py-2.5 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
                              {inv.due_date ? formatTRDate(inv.due_date) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{branchName(inv.subeler) ?? '-'}</td>
                            <td className="px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 font-medium text-right">{formatCurrency(inv.total_amount)}</td>
                            <td className="px-4 py-2.5 text-sm text-green-700 text-right">{(inv.paid_amount ?? 0) > 0 ? formatCurrency(inv.paid_amount) : '-'}</td>
                            <td className={`px-4 py-2.5 text-sm font-semibold text-right ${invKalan > 0 ? 'text-orange-600' : 'text-gray-400 dark:text-gray-500'}`}>
                              {invKalan > 0 ? formatCurrency(invKalan) : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {invKalan > 0 && (
                                <Link href={`/cari-hesap/faturalar/${inv.id}/odeme-ekle`} className="text-xs text-green-600 font-medium hover:underline">
                                  Öde
                                </Link>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500 space-y-1">
                  {sup.manuelData?.urunler_hizmetler && (
                    <div><span className="text-gray-500 dark:text-gray-400 font-medium">Ürünler:</span> {sup.manuelData.urunler_hizmetler}</div>
                  )}
                  <div className="flex gap-4 flex-wrap text-xs">
                    {sup.manuelData?.telefon && <span>Tel: {sup.manuelData.telefon}</span>}
                    {sup.manuelData?.email && <span>E-posta: {sup.manuelData.email}</span>}
                    {sup.manuelData?.sehir && <span>Şehir: {sup.manuelData.sehir}</span>}
                    {sup.manuelData?.odeme_vadesi && <span>Vade: {sup.manuelData.odeme_vadesi} gün</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
