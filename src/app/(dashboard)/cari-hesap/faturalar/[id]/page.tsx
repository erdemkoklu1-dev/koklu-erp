import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG, PAYMENT_METHOD_LABELS } from '@/lib/finance/formatters'
import InvoiceActions from './_components/InvoiceActions'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export default async function FaturaDetayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kaynak?: string }>
}) {
  const { id } = await params
  const { kaynak } = await searchParams
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  const [{ data: invoice }, { data: items }, { data: payments }, { data: invoiceBrokers }] = await Promise.all([
    applyTenantScope(supabase.from('invoices')
      .select('*, customers(full_name, phone, address, tax_number, email), subeler(ad)')
      .eq('id', id), tenantAccess).maybeSingle(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('line_order'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('payment_date', { ascending: false }),
    supabase.from('invoice_brokers')
      .select('*, brokers(full_name, company_name)')
      .eq('invoice_id', id),
  ])

  if (!invoice) notFound()

  const customer = invoice.customers as any
  const sube = invoice.subeler as any
  const isMahsup = (invoice as any).mahsup_durumu === 'vergi_mahsup'
  const statusConf = isMahsup
    ? INVOICE_STATUS_CONFIG['vergi_mahsup']
    : (INVOICE_STATUS_CONFIG[invoice.status] ?? INVOICE_STATUS_CONFIG['taslak'])
  const kalan = (invoice.total_amount ?? 0) - (invoice.paid_amount ?? 0)
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = invoice.due_date && invoice.due_date < today && !['odendi', 'iptal', 'taslak'].includes(invoice.status)

  // HATA 4: Ara toplam ve KDV, DB'de 0 ise kalemlerden hesapla
  const araToplam = (() => {
    if ((invoice.subtotal ?? 0) > 0) return invoice.subtotal as number
    return (items ?? []).reduce((s, item) => {
      const disc = (item as any).discount_amount ?? 0
      return s + Math.round((item.quantity * item.unit_price - disc) * 100) / 100
    }, 0)
  })()
  const kdvToplam = (() => {
    if ((invoice.kdv_amount ?? 0) > 0) return invoice.kdv_amount as number
    return (items ?? []).reduce((s, item) => {
      const disc = (item as any).discount_amount ?? 0
      const net  = item.quantity * item.unit_price - disc
      return s + Math.round(net * item.kdv_rate / 100 * 100) / 100
    }, 0)
  })()

  // HATA 3: Tedarikçi adı ve adres ayırma
  // Adres belirteci içeren satırları firma adından ayır
  const ADDRESS_MARKERS = ['İOSB', 'ORGANİZE', 'SANAYİ BÖLGESİ', 'MAH.', 'MH.', 'SK.', 'SOK.', 'CAD.', 'BULVAR', 'NO:', 'KAT:', 'DAIRE', 'ESENLER', 'BAĞCILAR', 'KÜÇÜKÇEKMECE', 'ESENYURT', 'ARNAVUTKÖY']
  function parseSupplierName(raw: string | null): { name: string; adres: string | null } {
    if (!raw) return { name: '-', adres: null }
    const parts = raw.split(/\s{2,}|\n/)
    const nameParts: string[] = []
    const adresParts: string[] = []
    let inAdres = false
    for (const part of parts) {
      const up = part.toUpperCase()
      if (!inAdres && ADDRESS_MARKERS.some(m => up.includes(m))) {
        inAdres = true
      }
      if (inAdres) adresParts.push(part.trim())
      else nameParts.push(part.trim())
    }
    const name = nameParts.join(' ').trim() || raw
    const adres = adresParts.length > 0 ? adresParts.join(', ') : null
    return { name, adres }
  }
  const supplierParsed = parseSupplierName(invoice.supplier_name)

  const TYPE_LABELS: Record<string, string> = {
    satis: 'Satış Faturası', alis: 'Alış Faturası',
    iade_satis: 'İade (Satış)', iade_alis: 'İade (Alış)',
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={
              kaynak === 'giden' ? '/cari-hesap/giden-faturalar'
              : kaynak === 'gelen' ? '/cari-hesap/gelen-faturalar'
              : '/cari-hesap/faturalar'
            }
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700"
          >
            ←{' '}
            {kaynak === 'giden' ? 'Giden Faturalar'
              : kaynak === 'gelen' ? 'Gelen Faturalar'
              : 'Faturalar'}
          </Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{invoice.invoice_number}</h2>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
            {statusConf.label}
          </span>
        </div>
        <InvoiceActions invoiceId={id} status={invoice.status} kalan={kalan} kaynak={kaynak} />
      </div>

      {/* Mahsup bilgi kartı */}
      {isMahsup && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm flex-shrink-0">M</div>
          <div>
            <div className="text-sm font-semibold text-violet-800">Bu fatura vergi borcuna mahsup edilmiştir</div>
            <div className="text-xs text-violet-600 mt-0.5">
              {(invoice as any).mahsup_tarihi && <>Mahsup Tarihi: {formatTRDate((invoice as any).mahsup_tarihi)} · </>}
              {(invoice as any).mahsup_aciklama && <>{(invoice as any).mahsup_aciklama}</>}
            </div>
          </div>
        </div>
      )}

      {/* Gecikme uyarısı */}
      {isOverdue && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm flex-shrink-0">!</div>
          <div>
            <div className="text-sm font-semibold text-red-800">Bu faturanın vadesi geçmiş</div>
            <div className="text-xs text-red-600">
              Vade tarihi: {formatTRDate(invoice.due_date)} · Kalan: {formatCurrency(kalan)}
            </div>
          </div>
        </div>
      )}

      {/* İki kolon: Fatura Bilgisi + Müşteri */}
      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">Fatura Bilgileri</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Fatura No</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Tip</span>
              <span className="text-gray-700 dark:text-gray-300">{TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Tarih</span>
              <span className="text-gray-700 dark:text-gray-300">{formatTRDate(invoice.invoice_date)}</span>
            </div>
            {invoice.due_date && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Vade</span>
                <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
                  {formatTRDate(invoice.due_date)}
                </span>
              </div>
            )}
            {invoice.description && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Açıklama</span>
                <span className="text-gray-700 dark:text-gray-300 text-right max-w-48">{invoice.description}</span>
              </div>
            )}
            {sube?.ad && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Şube</span>
                <span className="text-gray-700 dark:text-gray-300">{sube.ad}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">
            {customer ? 'Müşteri Bilgileri' : 'Tedarikçi Bilgileri'}
          </h3>
          {customer ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Müşteri</span>
                <Link href={`/customers/${invoice.customer_id}`} className="font-semibold text-[#C8102E] hover:underline">
                  {customer.full_name}
                </Link>
              </div>
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
              {((invoice as any).musteri_adres || customer.address) && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Adres</span>
                  <span className="text-gray-700 dark:text-gray-300 text-right">{(invoice as any).musteri_adres || customer.address}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Firma Adı</span>
                <Link
                  href={`/cari-hesap/tedarikciler/${encodeURIComponent(invoice.supplier_name ?? '')}`}
                  className="font-semibold text-[#C8102E] hover:underline text-right"
                >
                  {supplierParsed.name}
                </Link>
              </div>
              {invoice.supplier_tax_no && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Vergi No</span>
                  <span className="text-gray-700 dark:text-gray-300">{invoice.supplier_tax_no}</span>
                </div>
              )}
              {((invoice as any).tedarikci_adres || supplierParsed.adres) && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Adres</span>
                  <span className="text-gray-700 dark:text-gray-300 text-right text-xs leading-relaxed">{(invoice as any).tedarikci_adres || supplierParsed.adres}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Kalemler */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fatura Kalemleri</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 w-8">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Miktar</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Birim</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Birim Fiyat</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">İskonto</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">KDV %</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">KDV Tutarı</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Satır Toplam</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(items ?? []).map((item, idx) => {
                const discountAmt  = (item as any).discount_amount ?? 0
                const discountRate = (item as any).discount_rate   ?? 0
                const netLine      = item.quantity * item.unit_price - discountAmt
                const kdvTutari    = Math.round(netLine * item.kdv_rate / 100 * 100) / 100
                const satirToplam  = Math.round((netLine + kdvTutari) * 100) / 100
                return (
                  <tr key={item.id}>
                    <td className="px-3 py-2.5 text-xs text-gray-400 dark:text-gray-500 text-center">{idx + 1}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">{item.description}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 text-right">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">{item.unit}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 text-right">{formatCurrency(item.unit_price)}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {discountAmt > 0
                        ? <span className="text-orange-600">{discountRate > 0 ? `%${discountRate} ` : ''}{formatCurrency(discountAmt)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 text-right">%{item.kdv_rate}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 text-right">{formatCurrency(kdvTutari)}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">
                      {formatCurrency(satirToplam)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Toplam */}
        <div className="border-t bg-gray-50 dark:bg-gray-700 px-5 py-4 flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Ara Toplam</span>
              <span className="font-medium">{formatCurrency(araToplam)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">KDV</span>
              <span className="font-medium">{formatCurrency(kdvToplam)}</span>
            </div>
            {invoice.stopaj_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Stopaj (%{invoice.stopaj_rate})</span>
                <span className="font-medium text-red-600">-{formatCurrency(invoice.stopaj_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t pt-1.5">
              <span>Genel Toplam</span>
              <span className="text-[#C8102E]">{formatCurrency(invoice.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-1.5">
              <span className="text-green-600">Ödenen</span>
              <span className="font-semibold text-green-700">{formatCurrency(invoice.paid_amount)}</span>
            </div>
            {kalan > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-orange-600 font-medium">Kalan</span>
                <span className="font-bold text-orange-700">{formatCurrency(kalan)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ödeme Geçmişi */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ödeme Geçmişi</h3>
        </div>
        {(payments ?? []).length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Henüz ödeme kaydı yok.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Tarih</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Yöntem</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Referans</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Tutar</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Not</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(payments ?? []).map(p => {
                const pIsMahsup = p.method === 'vergi_mahsup'
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${pIsMahsup ? 'bg-violet-50/40' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatTRDate(p.payment_date)}</td>
                    <td className="px-4 py-3 text-sm">
                      {pIsMahsup ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                          Vergi Borcuna Mahsup
                        </span>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-300">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{p.reference_no ?? '-'}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${pIsMahsup ? 'text-violet-700' : 'text-green-700'}`}>
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{p.notes ?? '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Aracılar */}
      {(invoiceBrokers ?? []).length > 0 && (
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aracılar</h3>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Aracı</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Komisyon Oranı</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Komisyon Tutarı</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Ödeme Durumu</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Ödeme Tarihi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(invoiceBrokers ?? []).map((b: any) => {
                const broker = b.brokers as any
                const brokerName = broker?.company_name
                  ? `${broker.full_name} (${broker.company_name})`
                  : (broker?.full_name ?? '-')
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <Link href={`/araclar/${b.broker_id}`} className="hover:text-[#C8102E] hover:underline">
                        {brokerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right">%{b.commission_rate}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                      {formatCurrency(b.commission_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        b.is_paid
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-orange-50 text-orange-700 border-orange-200'
                      }`}>
                        {b.is_paid ? 'Ödendi' : 'Bekliyor'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {b.paid_date ? formatTRDate(b.paid_date) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {invoice.notes && (
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Notlar</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">{invoice.notes}</p>
        </div>
      )}
    </div>
  )
}
