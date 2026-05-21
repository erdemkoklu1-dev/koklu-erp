import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG, PAYMENT_METHOD_LABELS } from '@/lib/finance/formatters'
import { normalizeSupplierTaxNo } from '@/lib/gelen-fatura-supplier-matching'
import TedarikciModal from '../TedarikciModal'

type ManualSupplier = {
  id: string
  firma_adi: string
  vergi_no: string | null
  vergi_dairesi: string | null
  adres: string | null
  sehir: string | null
  telefon: string | null
  email: string | null
  web_sitesi: string | null
  yetkili_adi: string | null
  yetkili_telefon: string | null
  urunler_hizmetler: string | null
  odeme_vadesi: number | null
  notlar: string | null
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export default async function TedarikciDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // Determine if this is a UUID (manual supplier) or encoded name (invoice-based)
  let supplierName: string
  let manuelData: ManualSupplier | null = null

  if (isUuid(id)) {
    const { data } = await supabase.from('tedarikciler').select('*').eq('id', id).single()
    if (!data) {
      return (
        <div className="p-6 text-sm text-gray-400 dark:text-gray-500">
          Tedarikçi bulunamadı.{' '}
          <Link href="/cari-hesap/tedarikciler" className="text-[#C8102E] hover:underline">← Geri</Link>
        </div>
      )
    }
    manuelData = data as ManualSupplier
    supplierName = data.firma_adi
  } else {
    supplierName = decodeURIComponent(id)
  }

  const invoiceSelect = 'id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, notes, sube_id, subeler(ad)'
  const byNameReq = supabase
    .from('invoices')
    .select(invoiceSelect)
    .eq('invoice_type', 'alis')
    .eq('supplier_name', supplierName)
    .neq('status', 'iptal')
    .order('invoice_date', { ascending: false })
  const supplierTaxNo = normalizeSupplierTaxNo(manuelData?.vergi_no)
  const byTaxReq = supplierTaxNo
    ? supabase
      .from('invoices')
      .select(invoiceSelect)
      .eq('invoice_type', 'alis')
      .eq('supplier_tax_no', supplierTaxNo)
      .neq('status', 'iptal')
      .order('invoice_date', { ascending: false })
    : null

  const [{ data: invoicesByName }, taxRes] = await Promise.all([
    byNameReq,
    byTaxReq ?? Promise.resolve({ data: [] }),
  ])
  const invoiceMap = new Map((invoicesByName ?? []).map(inv => [inv.id, inv]))
  for (const inv of taxRes.data ?? []) invoiceMap.set(inv.id, inv)

  const rows = Array.from(invoiceMap.values()).sort((a, b) => (b.invoice_date ?? '').localeCompare(a.invoice_date ?? ''))
  const invoiceIds = rows.map(i => i.id)
  const { data: payments } = invoiceIds.length > 0
    ? await supabase
      .from('payments')
      .select('id, invoice_id, amount, payment_date, method, reference_no')
      .in('invoice_id', invoiceIds)
      .order('payment_date', { ascending: true })
    : { data: [] }

  const toplamTutar = rows.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const toplamOdenen = rows.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const toplamKalan = Math.max(0, toplamTutar - toplamOdenen)
  const gecikmisSayi = rows.filter(i =>
    i.due_date && i.due_date < today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0
  ).length

  const editInitial = manuelData ? {
    id: manuelData.id,
    firma_adi: manuelData.firma_adi ?? '',
    vergi_no: manuelData.vergi_no ?? '',
    vergi_dairesi: manuelData.vergi_dairesi ?? '',
    adres: manuelData.adres ?? '',
    sehir: manuelData.sehir ?? '',
    telefon: manuelData.telefon ?? '',
    email: manuelData.email ?? '',
    web_sitesi: manuelData.web_sitesi ?? '',
    yetkili_adi: manuelData.yetkili_adi ?? '',
    yetkili_telefon: manuelData.yetkili_telefon ?? '',
    urunler_hizmetler: manuelData.urunler_hizmetler ?? '',
    odeme_vadesi: manuelData.odeme_vadesi != null ? String(manuelData.odeme_vadesi) : '',
    notlar: manuelData.notlar ?? '',
  } : null

  const invoiceById = new Map(rows.map(inv => [inv.id, inv]))
  const movements = [
    ...rows.map(inv => ({
      id: `inv-${inv.id}`,
      date: inv.invoice_date,
      belgeTuru: 'Fatura',
      invoiceId: inv.id,
      invoiceNo: inv.invoice_number,
      borc: inv.total_amount ?? 0,
      odeme: 0,
      dueDate: inv.due_date,
      sube: (inv.subeler as { ad?: string } | null)?.ad ?? null,
      status: inv.status,
      method: null as string | null,
    })),
    ...((payments ?? []).map(p => {
      const inv = p.invoice_id ? invoiceById.get(p.invoice_id) : null
      return {
        id: `pay-${p.id}`,
        date: p.payment_date,
        belgeTuru: 'Ödeme',
        invoiceId: p.invoice_id,
        invoiceNo: inv?.invoice_number ?? '-',
        borc: 0,
        odeme: p.amount ?? 0,
        dueDate: inv?.due_date ?? null,
        sube: (inv?.subeler as { ad?: string } | null)?.ad ?? null,
        status: inv?.status ?? null,
        method: p.method ?? null,
      }
    })),
  ].sort((a, b) => {
    const dateCmp = (a.date ?? '').localeCompare(b.date ?? '')
    if (dateCmp !== 0) return dateCmp
    return a.belgeTuru.localeCompare(b.belgeTuru, 'tr')
  })
  const cariRows = movements.reduce<Array<(typeof movements)[number] & { bakiye: number }>>((acc, m) => {
    const previousBalance = acc[acc.length - 1]?.bakiye ?? 0
    acc.push({ ...m, bakiye: previousBalance + m.borc - m.odeme })
    return acc
  }, []).reverse()

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/tedarikciler" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
            ← Tedarikçiler
          </Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{supplierName}</h2>
        </div>
        {editInitial && (
          <TedarikciModal
            initial={editInitial}
            trigger={
              <button className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Düzenle
              </button>
            }
          />
        )}
      </div>

      {/* Manuel tedarikçi bilgileri */}
      {manuelData && (
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {manuelData.vergi_no && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Vergi No</span>{manuelData.vergi_no}</div>
          )}
          {manuelData.vergi_dairesi && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Vergi Dairesi</span>{manuelData.vergi_dairesi}</div>
          )}
          {manuelData.sehir && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Şehir</span>{manuelData.sehir}</div>
          )}
          {manuelData.telefon && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Telefon</span>{manuelData.telefon}</div>
          )}
          {manuelData.email && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">E-posta</span>{manuelData.email}</div>
          )}
          {manuelData.web_sitesi && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Web</span>{manuelData.web_sitesi}</div>
          )}
          {manuelData.yetkili_adi && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Yetkili</span>{manuelData.yetkili_adi}</div>
          )}
          {manuelData.yetkili_telefon && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Yetkili Tel.</span>{manuelData.yetkili_telefon}</div>
          )}
          {manuelData.odeme_vadesi != null && (
            <div><span className="text-xs text-gray-500 dark:text-gray-400 block">Ödeme Vadesi</span>{manuelData.odeme_vadesi} gün</div>
          )}
          {manuelData.adres && (
            <div className="col-span-2"><span className="text-xs text-gray-500 dark:text-gray-400 block">Adres</span>{manuelData.adres}</div>
          )}
          {manuelData.urunler_hizmetler && (
            <div className="col-span-2 md:col-span-3">
              <span className="text-xs text-gray-500 dark:text-gray-400 block">Sattığı Ürünler / Hizmetler</span>
              {manuelData.urunler_hizmetler}
            </div>
          )}
          {manuelData.notlar && (
            <div className="col-span-2 md:col-span-3">
              <span className="text-xs text-gray-500 dark:text-gray-400 block">Notlar</span>
              {manuelData.notlar}
            </div>
          )}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Toplam Fatura</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamTutar)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{rows.length} fatura</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-600 mb-0.5">Ödenen</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(toplamOdenen)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">toplam ödeme</div>
        </div>
        <div className={`rounded-xl p-4 border ${toplamKalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${toplamKalan > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Kalan Borç</div>
          <div className={`text-xl font-bold ${toplamKalan > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(toplamKalan)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">ödenmemiş</div>
        </div>
        <div className={`rounded-xl p-4 border ${gecikmisSayi > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${gecikmisSayi > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş</div>
          <div className={`text-xl font-bold ${gecikmisSayi > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{gecikmisSayi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">vadesi geçmiş fatura</div>
        </div>
      </div>

      {/* Tedarikçi Cari */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tedarikçi Cari</h3>
          <Link href="/cari-hesap/faturalar/new"
            className="text-xs text-[#C8102E] hover:underline font-medium">
            + Alış Faturası
          </Link>
        </div>
        {cariRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Bu tedarikçiye ait cari hareket bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tarih</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Belge Türü</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura No</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Borç</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Ödeme</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Bakiye</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Vade</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Şube</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Durum</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {cariRows.map(row => {
                  const isOverdue = !!(row.dueDate && row.dueDate < today && row.bakiye > 0)
                  const statusCfg = row.status ? INVOICE_STATUS_CONFIG[row.status as keyof typeof INVOICE_STATUS_CONFIG] : null

                  return (
                    <tr key={row.id} className={`${isOverdue ? 'bg-red-50/60' : ''} hover:bg-gray-50 transition-colors`}>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{formatTRDate(row.date)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${row.belgeTuru === 'Ödeme' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                          {row.belgeTuru}
                        </span>
                        {row.method && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/cari-hesap/faturalar/${row.invoiceId}`}
                          className="font-mono text-xs text-[#C8102E] hover:underline font-medium">
                          {row.invoiceNo}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200">
                        {row.borc > 0 ? formatCurrency(row.borc) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-700">
                        {row.odeme > 0 ? formatCurrency(row.odeme) : '-'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${row.bakiye > 0 ? (isOverdue ? 'text-red-600' : 'text-orange-600') : 'text-gray-400 dark:text-gray-500'}`}>
                        {row.bakiye > 0 ? formatCurrency(row.bakiye) : '-'}
                      </td>
                      <td className={`px-4 py-2.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
                        {row.dueDate ? formatTRDate(row.dueDate) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{row.sube ?? '-'}</td>
                      <td className="px-4 py-2.5">
                        {statusCfg && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.belgeTuru === 'Fatura' && row.bakiye > 0 && (
                          <Link href={`/cari-hesap/faturalar/${row.invoiceId}/odeme-ekle`}
                            className="text-xs text-green-600 hover:underline font-medium">
                            Öde
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-600 dark:text-gray-300">Toplam</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-800 dark:text-gray-200">{formatCurrency(toplamTutar)}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-green-700">{formatCurrency(toplamOdenen)}</td>
                  <td className={`px-4 py-2.5 text-right text-sm font-bold ${toplamKalan > 0 ? 'text-orange-600' : 'text-gray-400 dark:text-gray-500'}`}>
                    {toplamKalan > 0 ? formatCurrency(toplamKalan) : '-'}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
