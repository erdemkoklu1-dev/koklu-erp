import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'

export default async function MusteriEkstrePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: customer },
    { data: account },
    { data: invoices },
    { data: documents },
  ] = await Promise.all([
    supabase.from('customers').select('id, full_name, phone, address, tax_number, email, company_name').eq('id', id).single(),
    supabase.from('customer_accounts').select('*').eq('customer_id', id).maybeSingle(),
    supabase.from('invoices')
      .select('id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, description')
      .eq('customer_id', id)
      .eq('invoice_type', 'satis')
      .neq('status', 'iptal')
      .order('invoice_date', { ascending: true }),
    supabase.from('documents')
      .select('id, document_type, file_name, amount, notes, processed, uploaded_at, invoice_id')
      .eq('customer_id', id)
      .order('uploaded_at', { ascending: false })
      .limit(20),
  ])

  if (!customer) notFound()

  const today = new Date().toISOString().split('T')[0]
  const openingBalance = account?.opening_balance ?? 0

  // Ekstre hareketleri: önce devir, sonra faturalar ve ödemeler karışık (tarihe göre)
  type Entry = {
    id: string
    date: string
    description: string
    borc: number      // bize borçlandı (fatura)
    alacak: number    // ödedi / alacak
    type: 'opening' | 'invoice' | 'payment'
    invoiceId?: string
    status?: string
  }

  const entries: Entry[] = []

  // Devir bakiyesi
  if (openingBalance !== 0) {
    entries.push({
      id: 'opening',
      date: invoices?.[0]?.invoice_date ?? today,
      description: 'Devir Bakiyesi',
      borc: openingBalance > 0 ? openingBalance : 0,
      alacak: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      type: 'opening',
    })
  }

  // Faturalar ve ödemeler
  for (const inv of invoices ?? []) {
    entries.push({
      id: inv.id,
      date: inv.invoice_date,
      description: `Fatura: ${inv.invoice_number}${inv.description ? ` — ${inv.description}` : ''}`,
      borc: inv.total_amount ?? 0,
      alacak: 0,
      type: 'invoice',
      invoiceId: inv.id,
      status: inv.status,
    })
    if ((inv.paid_amount ?? 0) > 0) {
      entries.push({
        id: `pay-${inv.id}`,
        date: inv.invoice_date, // gerçek ödeme tarihi payments tablosundan alınabilir
        description: `Tahsilat: ${inv.invoice_number}`,
        borc: 0,
        alacak: inv.paid_amount ?? 0,
        type: 'payment',
        invoiceId: inv.id,
      })
    }
  }

  // Tarihe göre sırala
  entries.sort((a, b) => a.date.localeCompare(b.date))

  // Kümülatif bakiye
  let runningBalance = 0
  const entriesWithBalance = entries.map(e => {
    runningBalance += e.borc - e.alacak
    return { ...e, balance: runningBalance }
  })

  const toplamFatura = (invoices ?? []).reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const toplamOdendi = (invoices ?? []).reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const sonBakiye = openingBalance + toplamFatura - toplamOdendi
  const overdueInvoices = (invoices ?? []).filter(
    inv => inv.due_date && inv.due_date < today && !['odendi', 'iptal'].includes(inv.status)
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/musteri-cari" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Müşteri Cari</Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{customer.full_name}</h2>
        </div>
        <div className="flex gap-2">
          <Link href={`/customers/${id}`}
            className="border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
            Müşteri Detay
          </Link>
          <Link href={`/cari-hesap/faturalar/new?customer_id=${id}`}
            className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            + Fatura Kes
          </Link>
        </div>
      </div>

      {/* Müşteri bilgi + bakiye */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">Müşteri Bilgileri</h3>
          <div className="space-y-1.5 text-sm">
            {customer.company_name && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Firma</span>
                <span className="text-gray-800 dark:text-gray-200 font-medium">{customer.company_name}</span>
              </div>
            )}
            {customer.tax_number && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Vergi / TC</span>
                <span className="text-gray-700 dark:text-gray-300">{customer.tax_number}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Telefon</span>
                <span className="text-gray-700 dark:text-gray-300">{customer.phone}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">E-posta</span>
                <span className="text-gray-700 dark:text-gray-300">{customer.email}</span>
              </div>
            )}
            {customer.address && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Adres</span>
                <span className="text-gray-700 dark:text-gray-300 text-right">{customer.address}</span>
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-xl p-5 border ${sonBakiye > 0 ? 'bg-orange-50 border-orange-200' : sonBakiye < 0 ? 'bg-green-50 border-green-200' : 'bg-white dark:bg-gray-800'}`}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">Bakiye Özeti</h3>
          <div className="space-y-2 text-sm">
            {openingBalance !== 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Devir Bakiyesi</span>
                <span className={`font-medium ${openingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {openingBalance > 0 ? `+${formatCurrency(openingBalance)}` : `-${formatCurrency(Math.abs(openingBalance))}`}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Toplam Fatura</span>
              <span className="text-gray-800 dark:text-gray-200 font-medium">{formatCurrency(toplamFatura)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Tahsilat</span>
              <span className="text-green-700 font-medium">{formatCurrency(toplamOdendi)}</span>
            </div>
            {overdueInvoices.length > 0 && (
              <div className="flex justify-between">
                <span className="text-red-600">Gecikmiş</span>
                <span className="text-red-600 font-medium">{overdueInvoices.length} fatura</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 mt-1">
              <span className={`font-semibold ${sonBakiye > 0 ? 'text-orange-700' : sonBakiye < 0 ? 'text-green-700' : 'text-gray-600 dark:text-gray-300'}`}>
                {sonBakiye > 0 ? 'Borç (Bize Olan)' : sonBakiye < 0 ? 'Alacak (Müşterinin)' : 'Sıfır'}
              </span>
              <span className={`text-xl font-bold ${sonBakiye > 0 ? 'text-orange-700' : sonBakiye < 0 ? 'text-green-700' : 'text-gray-400 dark:text-gray-500'}`}>
                {sonBakiye === 0 ? '—' : formatCurrency(Math.abs(sonBakiye))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ekstre tablosu */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Hesap Ekstresi</h3>
          <Link href={`/cari-hesap/belgeler/new?customer_id=${id}`}
            className="text-sm text-[#C8102E] font-medium hover:underline">
            + Dekont Yükle
          </Link>
        </div>
        {entriesWithBalance.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Henüz hareket yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Tarih</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Borç</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Alacak</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entriesWithBalance.map(e => (
                  <tr key={e.id} className={`${e.type === 'payment' ? 'bg-green-50/40' : ''} hover:bg-gray-50`}>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {formatTRDate(e.date)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200">
                      {e.invoiceId ? (
                        <Link href={`/cari-hesap/faturalar/${e.invoiceId}`}
                          className="hover:text-[#C8102E] hover:underline">
                          {e.description}
                        </Link>
                      ) : e.description}
                      {e.status && e.type === 'invoice' && (() => {
                        const conf = INVOICE_STATUS_CONFIG[e.status]
                        return conf ? (
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full border ${conf.className}`}>
                            {conf.label}
                          </span>
                        ) : null
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-orange-700 font-medium text-right">
                      {e.borc > 0 ? formatCurrency(e.borc) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-green-700 font-medium text-right">
                      {e.alacak > 0 ? formatCurrency(e.alacak) : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-sm font-bold text-right ${
                      e.balance > 0 ? 'text-orange-600' : e.balance < 0 ? 'text-green-600' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {e.balance === 0 ? '0,00 ₺' : formatCurrency(Math.abs(e.balance))}
                      {e.balance < 0 && <span className="text-xs font-normal ml-1">A</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Genel Toplam</td>
                  <td className="px-4 py-3 text-sm font-bold text-orange-700 text-right">
                    {formatCurrency(openingBalance > 0 ? openingBalance + toplamFatura : toplamFatura)}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-green-700 text-right">
                    {formatCurrency(openingBalance < 0 ? Math.abs(openingBalance) + toplamOdendi : toplamOdendi)}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold text-right ${sonBakiye > 0 ? 'text-orange-700' : sonBakiye < 0 ? 'text-green-700' : 'text-gray-400 dark:text-gray-500'}`}>
                    {sonBakiye === 0 ? '—' : formatCurrency(Math.abs(sonBakiye))}
                    {sonBakiye < 0 && <span className="text-xs font-normal ml-1">(Alacak)</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Yüklenen Belgeler */}
      {(documents ?? []).length > 0 && (
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Yüklenen Belgeler</h3>
            <Link href={`/cari-hesap/belgeler?customer_id=${id}`}
              className="text-xs text-[#C8102E] hover:underline">
              Tümünü gör →
            </Link>
          </div>
          <div className="divide-y">
            {(documents ?? []).map(doc => (
              <div key={doc.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    doc.document_type === 'dekont' ? 'bg-blue-100 text-blue-700' :
                    doc.document_type === 'fatura_pdf' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {doc.document_type === 'dekont' ? 'DK' : doc.document_type === 'fatura_pdf' ? 'FT' : 'BL'}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{doc.file_name}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {formatTRDate(doc.uploaded_at)}
                      {doc.amount && ` · ${formatCurrency(doc.amount)}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doc.processed ? (
                    <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">İşlendi</span>
                  ) : (
                    <Link href={`/cari-hesap/belgeler/${doc.id}`}
                      className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full hover:bg-orange-200">
                      İşlem Bekliyor
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
