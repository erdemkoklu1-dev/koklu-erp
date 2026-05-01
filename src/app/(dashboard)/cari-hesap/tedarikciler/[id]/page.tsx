import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'
import TedarikciModal from '../TedarikciModal'

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
  let manuelData: any = null

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
    manuelData = data
    supplierName = data.firma_adi
  } else {
    supplierName = decodeURIComponent(id)
  }

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, notes')
    .eq('invoice_type', 'alis')
    .eq('supplier_name', supplierName)
    .neq('status', 'iptal')
    .order('invoice_date', { ascending: false })

  const rows = invoices ?? []
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

      {/* Fatura Listesi */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fatura Listesi</h3>
          <Link href="/cari-hesap/faturalar/new"
            className="text-xs text-[#C8102E] hover:underline font-medium">
            + Alış Faturası
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Bu tedarikçiye ait fatura bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura No</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura Tarihi</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Vade Tarihi</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tutar</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Ödenen</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Kalan</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Durum</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(inv => {
                  const kalan = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                  const isOverdue = !!(inv.due_date && inv.due_date < today && kalan > 0)
                  const isToday   = inv.due_date === today && kalan > 0
                  const daysLeft  = inv.due_date && inv.due_date > today
                    ? Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000)
                    : null

                  const rowBg = isOverdue ? 'bg-red-50/60' : isToday ? 'bg-orange-50/60' : ''
                  const statusCfg = INVOICE_STATUS_CONFIG[inv.status as keyof typeof INVOICE_STATUS_CONFIG]

                  return (
                    <tr key={inv.id} className={`${rowBg} hover:bg-gray-50 transition-colors`}>
                      <td className="px-4 py-2.5">
                        <Link href={`/cari-hesap/faturalar/${inv.id}`}
                          className="font-mono text-xs text-[#C8102E] hover:underline font-medium">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">{formatTRDate(inv.invoice_date)}</td>
                      <td className="px-4 py-2.5">
                        {inv.due_date ? (
                          <div className="flex items-center gap-1">
                            <span className={isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-orange-600 font-medium' : 'text-gray-600 dark:text-gray-300'}>
                              {formatTRDate(inv.due_date)}
                            </span>
                            {daysLeft !== null && daysLeft <= 7 && kalan > 0 && (
                              <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.5 rounded-full">
                                {daysLeft}g
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200">{formatCurrency(inv.total_amount)}</td>
                      <td className="px-4 py-2.5 text-right text-green-700">
                        {(inv.paid_amount ?? 0) > 0 ? formatCurrency(inv.paid_amount) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${kalan > 0 ? (isOverdue ? 'text-red-600' : 'text-orange-600') : 'text-gray-400 dark:text-gray-500'}`}>
                        {kalan > 0 ? formatCurrency(kalan) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {statusCfg && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {kalan > 0 && (
                          <Link href={`/cari-hesap/faturalar/${inv.id}/odeme-ekle`}
                            className="text-xs text-green-600 hover:underline font-medium">
                            Öde →
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
                    {toplamKalan > 0 ? formatCurrency(toplamKalan) : '—'}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
