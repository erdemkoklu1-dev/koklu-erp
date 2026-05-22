import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import PrintButton from '@/components/PrintButton'

const DURUM_CONFIG: Record<string, { label: string; className: string }> = {
  beklemede:      { label: 'Faturalanmadı', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  faturalanmadi:  { label: 'Faturalandı',   className: 'bg-green-50 text-green-700 border-green-200'   },
}

const BIRIM_LABELS: Record<string, string> = {
  adet: 'adet', kg: 'kg', metre: 'm', saat: 'saat', is: 'iş',
}

export default async function OnKayitlarPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; customer_id?: string; from?: string; to?: string }>
}) {
  const { durum, customer_id, from, to } = await searchParams
  const supabase = createServiceClient()

  // Varsayılan filtre: sadece beklemedekiler
  const durumFilter = durum ?? 'beklemede'

  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')

  let query = supabase
    .from('on_kayitlar')
    .select(`
      id, kayit_tarihi, aciklama, miktar, birim, birim_fiyat, toplam_tutar, notlar, durum, invoice_id, kalemler,
      customers(id, full_name),
      invoices(invoice_number)
    `)
    .order('kayit_tarihi', { ascending: false })
    .order('created_at', { ascending: false })

  if (durumFilter !== 'tumu') query = query.eq('durum', durumFilter)
  if (customer_id) query = query.eq('customer_id', customer_id)
  if (from) query = query.gte('kayit_tarihi', from)
  if (to) query = query.lte('kayit_tarihi', to)

  const { data: kayitlar } = await query

  const toplamTutar = (kayitlar ?? []).reduce((s, k) => s + (k.toplam_tutar ?? 0), 0)
  const bekleyenTutar = (kayitlar ?? []).filter(k => k.durum === 'beklemede').reduce((s, k) => s + (k.toplam_tutar ?? 0), 0)

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams()
    const base = { durum: durumFilter, customer_id, from, to, ...overrides }
    for (const [k, v] of Object.entries(base)) {
      if (v) params.set(k, v)
    }
    return `/cari-hesap/on-kayitlar?${params.toString()}`
  }

  return (
    <div className="p-6 space-y-4">

      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Ön Kayıtlar Listesi · {new Date().toLocaleString('tr-TR')}</div>
      </div>

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ön Kayıtlar</h2>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link href="/cari-hesap/on-kayitlar/yeni"
            className="no-print bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            + Yeni Ön Kayıt
          </Link>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Listelenen Toplam</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(toplamTutar)}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="text-xs text-orange-600">Faturalanmamış</div>
          <div className="text-xl font-bold text-orange-700 mt-0.5">{formatCurrency(bekleyenTutar)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Kayıt Sayısı</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{kayitlar?.length ?? 0}</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl p-4 space-y-3">
        {/* Durum filtreleri */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'beklemede', label: 'Faturalanmadı' },
            { key: 'faturalanmadi', label: 'Faturalandı' },
            { key: 'tumu', label: 'Tümü' },
          ].map(f => (
            <Link key={f.key} href={buildUrl({ durum: f.key })}
              className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                durumFilter === f.key
                  ? 'bg-[#C8102E] text-white border-[#C8102E]'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#C8102E] hover:text-[#C8102E]'
              }`}>
              {f.label}
            </Link>
          ))}
        </div>

        {/* Müşteri + tarih filtresi */}
        <form method="GET" action="/cari-hesap/on-kayitlar" className="flex flex-wrap gap-3">
          <input type="hidden" name="durum" value={durumFilter} />
          <select name="customer_id" defaultValue={customer_id ?? ''}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
            <option value="">Tüm Müşteriler</option>
            {(customers ?? []).map(c => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={from ?? ''}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          <input type="date" name="to" defaultValue={to ?? ''}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          <button type="submit"
            className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 hover:bg-gray-50">
            Filtrele
          </button>
          <Link href="/cari-hesap/on-kayitlar"
            className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 hover:bg-gray-50 text-gray-500 dark:text-gray-400">
            Temizle
          </Link>
        </form>
      </div>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        {(kayitlar ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            Kayıt bulunamadı.{' '}
            <Link href="/cari-hesap/on-kayitlar/yeni" className="text-[#C8102E] hover:underline">
              Yeni ön kayıt ekle →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Müşteri</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarih</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Açıklama</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Miktar</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(kayitlar ?? []).map(k => {
                  const customer = k.customers as any
                  const invoice = k.invoices as any
                  const durumConf = DURUM_CONFIG[k.durum] ?? DURUM_CONFIG['beklemede']
                  return (
                    <tr key={k.id} className={`hover:bg-gray-50 transition-colors ${k.durum === 'beklemede' ? '' : 'opacity-70'}`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        <Link href={`/customers/${customer?.id}`}
                          className="hover:text-[#C8102E] hover:underline">
                          {customer?.full_name ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatTRDate(k.kayit_tarihi)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs">
                        <div className="truncate">{k.aciklama}</div>
                        {k.notlar && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{k.notlar}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 text-right whitespace-nowrap">
                        {Array.isArray(k.kalemler) && k.kalemler.length > 1
                          ? `${k.kalemler.length} kalem`
                          : `${k.miktar} ${BIRIM_LABELS[k.birim] ?? k.birim}`}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right whitespace-nowrap">
                        {formatCurrency(k.toplam_tutar)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${durumConf.className}`}>
                          {durumConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {invoice ? (
                          <Link href={`/cari-hesap/faturalar/${k.invoice_id}`}
                            className="text-[#C8102E] hover:underline font-medium text-xs">
                            {invoice.invoice_number}
                          </Link>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/cari-hesap/on-kayitlar/${k.id}/edit`}
                          className="text-xs text-gray-400 dark:text-gray-500 hover:text-[#C8102E] font-medium">
                          Düzenle
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
