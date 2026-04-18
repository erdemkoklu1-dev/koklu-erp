import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import TedarikciModal from './TedarikciModal'
import TopluOdemeModal from './TopluOdemeModal'

export default async function TedarikcilerPage() {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: invoices }, { data: manuelTedarikciler }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, supplier_name, supplier_tax_no, invoice_date, due_date, total_amount, paid_amount, status')
      .eq('invoice_type', 'alis')
      .neq('status', 'iptal')
      .order('invoice_date', { ascending: false }),
    supabase
      .from('tedarikciler')
      .select('*')
      .eq('aktif', true)
      .order('firma_adi'),
  ])

  // Invoice-derived suppliers
  type SupplierRow = {
    name: string
    taxNo: string | null
    totalInvoice: number
    totalPaid: number
    invoiceCount: number
    overdueCount: number
    overdueAmount: number
    invoices: typeof invoices
    manuelId: string | null
    manuelData: any | null
  }

  const supplierMap = new Map<string, SupplierRow>()

  for (const inv of invoices ?? []) {
    const key = inv.supplier_name ?? 'Bilinmeyen Tedarikçi'
    const cur = supplierMap.get(key) ?? {
      name: key,
      taxNo: inv.supplier_tax_no ?? null,
      totalInvoice: 0,
      totalPaid: 0,
      invoiceCount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      invoices: [],
      manuelId: null,
      manuelData: null,
    }
    cur.totalInvoice += inv.total_amount ?? 0
    cur.totalPaid += inv.paid_amount ?? 0
    cur.invoiceCount++
    const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
    if (inv.due_date && inv.due_date < today && kalan > 0) {
      cur.overdueCount++
      cur.overdueAmount += kalan
    }
    cur.invoices = [...(cur.invoices ?? []), inv]
    supplierMap.set(key, cur)
  }

  // Merge manuel tedarikciler — match by firma_adi if exists in invoice map
  for (const mt of manuelTedarikciler ?? []) {
    const existing = supplierMap.get(mt.firma_adi)
    if (existing) {
      existing.manuelId = mt.id
      existing.manuelData = mt
    } else {
      // No invoices — add as manual-only
      supplierMap.set(mt.firma_adi, {
        name: mt.firma_adi,
        taxNo: mt.vergi_no ?? null,
        totalInvoice: 0,
        totalPaid: 0,
        invoiceCount: 0,
        overdueCount: 0,
        overdueAmount: 0,
        invoices: [],
        manuelId: mt.id,
        manuelData: mt,
      })
    }
  }

  const suppliers = Array.from(supplierMap.values()).sort((a, b) => {
    // Invoice-based suppliers first (by kalan desc), then manuel-only
    const ka = a.totalInvoice - a.totalPaid
    const kb = b.totalInvoice - b.totalPaid
    if (ka === 0 && kb === 0) return a.name.localeCompare(b.name, 'tr')
    return kb - ka
  })

  const toplamBorc = suppliers.reduce((s, r) => s + Math.max(0, r.totalInvoice - r.totalPaid), 0)
  const gecikmisToplam = suppliers.reduce((s, r) => s + r.overdueAmount, 0)

  return (
    <div className="p-6 space-y-5">

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Tedarikçiler</h2>
        <div className="flex gap-2">
          <Link href="/cari-hesap/faturalar/new"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            + Alış Faturası
          </Link>
          <TedarikciModal />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-0.5">Toplam Tedarikçi Borcu</div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(toplamBorc)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{suppliers.filter(s => s.totalInvoice > s.totalPaid).length} tedarikçiye borç</div>
        </div>
        <div className={`rounded-xl p-4 border ${gecikmisToplam > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
          <div className={`text-xs mb-0.5 ${gecikmisToplam > 0 ? 'text-red-600' : 'text-gray-500'}`}>Gecikmiş Borç</div>
          <div className={`text-xl font-bold ${gecikmisToplam > 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(gecikmisToplam)}</div>
          <div className="text-xs text-gray-400 mt-0.5">vadesi geçmiş ödemeler</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-0.5">Toplam Tedarikçi</div>
          <div className="text-xl font-bold text-gray-900">{suppliers.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">{(manuelTedarikciler ?? []).length} manuel · {suppliers.filter(s => s.invoiceCount > 0).length} faturalı</div>
        </div>
      </div>

      {/* Tedarikçi listesi */}
      <div className="space-y-4">
        {suppliers.length === 0 ? (
          <div className="bg-white border rounded-xl px-4 py-12 text-center text-sm text-gray-400">
            Henüz tedarikçi yok.{' '}
            <span className="text-[#C8102E]">Alış faturası ekleyin veya tedarikçi oluşturun.</span>
          </div>
        ) : suppliers.map(sup => {
          const kalan = sup.totalInvoice - sup.totalPaid
          const detailHref = sup.manuelId
            ? `/cari-hesap/tedarikciler/${sup.manuelId}`
            : `/cari-hesap/tedarikciler/${encodeURIComponent(sup.name)}`

          return (
            <div key={sup.name} className="bg-white border rounded-xl overflow-hidden">
              <div className={`px-5 py-3 border-b flex items-center justify-between ${sup.overdueCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={detailHref}
                    className="text-sm font-semibold text-gray-900 hover:text-[#C8102E] hover:underline">
                    {sup.name}
                  </Link>
                  {sup.taxNo && <span className="text-xs text-gray-400">{sup.taxNo}</span>}
                  {sup.manuelData && sup.invoiceCount === 0 && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                      Manuel Eklendi
                    </span>
                  )}
                  {sup.manuelData && sup.invoiceCount > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-500 border px-2 py-0.5 rounded-full">
                      Kayıtlı
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {sup.overdueCount > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                      {sup.overdueCount} gecikmiş — {formatCurrency(sup.overdueAmount)}
                    </span>
                  )}
                  <TopluOdemeModal supplierName={sup.name} invoices={sup.invoices ?? []} />
                  <div className="text-right">
                    {sup.invoiceCount > 0 ? (
                      <>
                        <div className={`text-sm font-bold ${kalan > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {kalan > 0 ? `Borç: ${formatCurrency(kalan)}` : 'Kapandı'}
                        </div>
                        <div className="text-xs text-gray-400">{sup.invoiceCount} fatura</div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-400">Fatura yok</div>
                    )}
                  </div>
                </div>
              </div>

              {sup.invoiceCount > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Fatura No</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Tarih</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Vade</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Tutar</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Ödenen</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Kalan</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(sup.invoices ?? []).map(inv => {
                        const invKalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
                        const isOverdue = inv.due_date && inv.due_date < today && invKalan > 0
                        return (
                          <tr key={inv.id} className={`${isOverdue ? 'bg-red-50/50' : ''} hover:bg-gray-50`}>
                            <td className="px-4 py-2.5">
                              <Link href={`/cari-hesap/faturalar/${inv.id}`}
                                className="text-sm font-medium text-[#C8102E] hover:underline">
                                {inv.invoice_number}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-600">{formatTRDate(inv.invoice_date)}</td>
                            <td className={`px-4 py-2.5 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {inv.due_date ? formatTRDate(inv.due_date) : '—'}
                              {isOverdue && <span className="ml-1 text-xs">(Gecikmiş)</span>}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-800 font-medium text-right">
                              {formatCurrency(inv.total_amount)}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-green-700 text-right">
                              {(inv.paid_amount ?? 0) > 0 ? formatCurrency(inv.paid_amount) : '—'}
                            </td>
                            <td className={`px-4 py-2.5 text-sm font-semibold text-right ${invKalan > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                              {invKalan > 0 ? formatCurrency(invKalan) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {invKalan > 0 && (
                                <Link href={`/cari-hesap/faturalar/${inv.id}/odeme-ekle`}
                                  className="text-xs text-green-600 font-medium hover:underline">
                                  Öde →
                                </Link>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t bg-gray-50/50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-600">Toplam</td>
                        <td className="px-4 py-2 text-sm font-bold text-gray-800 text-right">{formatCurrency(sup.totalInvoice)}</td>
                        <td className="px-4 py-2 text-sm font-bold text-green-700 text-right">{formatCurrency(sup.totalPaid)}</td>
                        <td className={`px-4 py-2 text-sm font-bold text-right ${kalan > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                          {kalan > 0 ? formatCurrency(kalan) : '—'}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-4 text-sm text-gray-400 space-y-1">
                  {sup.manuelData?.urunler_hizmetler && (
                    <div><span className="text-gray-500 font-medium">Ürünler:</span> {sup.manuelData.urunler_hizmetler}</div>
                  )}
                  <div className="flex gap-4 flex-wrap text-xs">
                    {sup.manuelData?.telefon && <span>📞 {sup.manuelData.telefon}</span>}
                    {sup.manuelData?.email && <span>✉️ {sup.manuelData.email}</span>}
                    {sup.manuelData?.sehir && <span>📍 {sup.manuelData.sehir}</span>}
                    {sup.manuelData?.odeme_vadesi && <span>⏱ {sup.manuelData.odeme_vadesi} gün vade</span>}
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
