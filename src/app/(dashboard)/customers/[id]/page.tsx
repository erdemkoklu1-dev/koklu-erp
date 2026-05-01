import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import DeleteCustomerButton from './DeleteCustomerButton'
import HatirlatmaSection from './HatirlatmaSection'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers').select('*').eq('id', id).single()
  if (!customer) notFound()

  const { data: devices } = await supabase
    .from('devices')
    .select('*, device_types(name)')
    .eq('customer_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const { data: onKayitlar } = await supabase
    .from('on_kayitlar')
    .select('id, kayit_tarihi, aciklama, miktar, birim, toplam_tutar, durum, invoice_id, invoices(invoice_number)')
    .eq('customer_id', id)
    .order('kayit_tarihi', { ascending: false })
    .limit(20)

  const bekleyenTutar = (onKayitlar ?? [])
    .filter(k => k.durum === 'beklemede')
    .reduce((s, k) => s + (k.toplam_tutar ?? 0), 0)

  function statusColor(expiry: string | null) {
    if (!expiry) return 'gray'
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000)
    if (days < 0) return 'red'
    if (days < 90) return 'orange'
    return 'green'
  }

  function statusLabel(expiry: string | null) {
    if (!expiry) return '-'
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000)
    if (days < 0) return '⚠️ Süresi Dolmuş'
    if (days < 90) return `⚡ ${days} gün kaldı`
    return `✅ ${days} gün`
  }

  const colorMap: Record<string, string> = {
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600',
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      {/* Üst bar */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/customers" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 text-sm">← Müşteriler</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{customer.full_name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/customers/${id}/edit`}
            className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            Düzenle
          </Link>
          <DeleteCustomerButton customerId={id} customerName={customer.full_name} />
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${customer.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {customer.is_active ? 'Aktif' : 'Pasif'}
          </span>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Bilgi kartı */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">Genel Bilgiler</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Müşteri Türü</div>
              <div className="text-sm font-medium">{customer.type === 'company' ? 'Firma' : 'Bireysel'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Vergi / TC No</div>
              <div className="text-sm font-medium">{customer.tax_number ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Yetkili</div>
              <div className="text-sm font-medium">{customer.authorized_person ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Yetkili Telefonu</div>
              <div className="text-sm font-medium">{customer.authorized_phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Telefon</div>
              <div className="text-sm font-medium">{customer.phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">E-posta</div>
              <div className="text-sm font-medium">{customer.email ?? '-'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Adres</div>
              <div className="text-sm font-medium">{customer.address ?? '-'}</div>
            </div>
          </div>
        </div>

        {/* İstatistik kartları */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{devices?.reduce((s, d) => s + (d.quantity ?? 1), 0) ?? 0}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">🧯 Toplam Cihaz</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {devices?.filter(d => d.expiry_date && Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) < 0).length ?? 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">⚠️ SKT Dolmuş</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">
              {devices?.filter(d => {
                const days = d.expiry_date ? Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) : 999
                return days >= 0 && days < 90
              }).length ?? 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">⚡ 90 Gün İçinde</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {devices?.filter(d => d.expiry_date && Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) >= 90).length ?? 0}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">✅ Geçerli</div>
          </div>
        </div>

        {/* Cihazlar tablosu */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between bg-gray-50 dark:bg-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cihazlar ({devices?.length ?? 0})</h2>
            <Link href={`/devices/new?customer_id=${id}`}
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#a50d26] transition-colors">
              + Cihaz Ekle
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Ürün Adı</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Adet</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Marka</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Dolum</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">1.Kontrol</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">2.Kontrol</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">3.Kontrol</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">SKT</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Durum</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Konum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devices && devices.length > 0 ? devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {device.custom_device_name ?? device.device_types?.name ?? '-'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{device.quantity ?? 1}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{device.brand ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(device.last_fill_date)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(device.control1_date)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(device.control2_date)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(device.control3_date)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(device.expiry_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${colorMap[statusColor(device.expiry_date)]}`}>
                        {statusLabel(device.expiry_date)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">{device.location_detail ?? '-'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                      Henüz cihaz eklenmemiş.{' '}
                      <Link href={`/devices/new?customer_id=${id}`} className="text-[#C8102E] hover:underline">Cihaz ekle →</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hatırlatmalar */}
        <HatirlatmaSection
          customerId={id}
          customerName={customer.full_name}
          phone={customer.phone ?? null}
          email={customer.email ?? null}
        />

        {/* Son servisler */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Son Servisler</h2>
            <Link
              href={`/service-forms/new?customer_id=${id}&customer_name=${encodeURIComponent(customer.full_name)}`}
              className="border border-[#C8102E] text-[#C8102E] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors">
              + Servis Formu
            </Link>
          </div>
          <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
            Bu müşteriye ait servis kaydı bulunmuyor.
          </div>
        </div>

        {/* Ön Kayıtlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ön Kayıtlar</h2>
              {bekleyenTutar > 0 && (
                <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {formatCurrency(bekleyenTutar)} bekliyor
                </span>
              )}
            </div>
            <Link href={`/cari-hesap/on-kayitlar/yeni?customer_id=${id}`}
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#a50d26] transition-colors">
              + Ön Kayıt Ekle
            </Link>
          </div>

          {(onKayitlar ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
              Bu müşteriye ait ön kayıt bulunmuyor.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Tarih</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Miktar</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Tutar</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Durum</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Fatura</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(onKayitlar ?? []).map(k => {
                    const invoice = k.invoices as any
                    return (
                      <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatTRDate(k.kayit_tarihi)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">{k.aciklama}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 text-right">{k.miktar} {k.birim}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                          {formatCurrency(k.toplam_tutar)}
                        </td>
                        <td className="px-4 py-2.5">
                          {k.durum === 'beklemede' ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-50 text-orange-700 border-orange-200">
                              Faturalanmadı
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200">
                              Faturalandı
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          {invoice ? (
                            <Link href={`/cari-hesap/faturalar/${k.invoice_id}`}
                              className="text-[#C8102E] hover:underline text-xs font-medium">
                              {invoice.invoice_number}
                            </Link>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(onKayitlar ?? []).length > 0 && (
            <div className="px-4 py-3 border-t bg-gray-50 dark:bg-gray-700 text-right">
              <Link href={`/cari-hesap/on-kayitlar?customer_id=${id}&durum=tumu`}
                className="text-xs text-[#C8102E] hover:underline font-medium">
                Tümünü gör →
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}