import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatTRDate } from '@/lib/finance/formatters'

const DURUM_BADGE: Record<string, string> = {
  gonderildi: 'bg-green-50 text-green-700 border-green-200',
  hata:       'bg-red-50 text-red-700 border-red-200',
  bekliyor:   'bg-yellow-50 text-yellow-700 border-yellow-200',
}

const KANAL_BADGE: Record<string, string> = {
  email:    'bg-blue-50 text-blue-700 border-blue-200',
  sms:      'bg-green-50 text-green-700 border-green-200',
  whatsapp: 'bg-purple-50 text-purple-700 border-purple-200',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' '
    + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export default async function GecmisPage({
  searchParams,
}: {
  searchParams: Promise<{ kanal?: string; durum?: string; baslangic?: string; bitis?: string }>
}) {
  const { kanal, durum, baslangic, bitis } = await searchParams
  const supabase = createServiceClient()

  let query = supabase
    .from('hatirlatma_kayitlari')
    .select(`
      id, kanal, alici_email, alici_telefon, mesaj_icerigi,
      gonderim_zamani, durum, hata_mesaji, created_at,
      customers(id, full_name),
      devices(id, custom_device_name, brand, capacity)
    `)
    .order('created_at', { ascending: false })
    .limit(300)

  if (kanal) query = query.eq('kanal', kanal)
  if (durum) query = query.eq('durum', durum)
  if (baslangic) query = query.gte('created_at', baslangic + 'T00:00:00Z')
  if (bitis)     query = query.lte('created_at', bitis + 'T23:59:59Z')

  const { data: kayitlar } = await query

  const [{ count: toplamGonderilen }, { count: toplamHata }] = await Promise.all([
    supabase.from('hatirlatma_kayitlari').select('*', { count: 'exact', head: true }).eq('durum', 'gonderildi'),
    supabase.from('hatirlatma_kayitlari').select('*', { count: 'exact', head: true }).eq('durum', 'hata'),
  ])

  // URL builder yardımcı
  function buildUrl(overrides: Record<string, string | undefined>): string {
    const params: string[] = []
    const merged = { kanal, durum, baslangic, bitis, ...overrides }
    if (merged.kanal)     params.push(`kanal=${merged.kanal}`)
    if (merged.durum)     params.push(`durum=${merged.durum}`)
    if (merged.baslangic) params.push(`baslangic=${merged.baslangic}`)
    if (merged.bitis)     params.push(`bitis=${merged.bitis}`)
    return '/hatirlatmalar/gecmis' + (params.length ? '?' + params.join('&') : '')
  }

  return (
    <div className="p-6 space-y-5">

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Gönderim Geçmişi</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
            {toplamGonderilen ?? 0} başarılı
          </span>
          {(toplamHata ?? 0) > 0 && (
            <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
              {toplamHata} hatalı
            </span>
          )}
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-3 items-center">

        {/* Kanal filtresi */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 border rounded-lg p-1 text-xs">
          {[
            { label: 'Tüm Kanallar', value: undefined },
            { label: 'E-posta',      value: 'email'   },
            { label: 'SMS',          value: 'sms'     },
          ].map(f => (
            <Link
              key={f.value ?? 'all'}
              href={buildUrl({ kanal: f.value })}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                (kanal ?? '') === (f.value ?? '')
                  ? 'bg-[#C8102E] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Durum filtresi */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 border rounded-lg p-1 text-xs">
          {[
            { label: 'Tüm Durumlar', value: undefined     },
            { label: 'Gönderildi',   value: 'gonderildi'  },
            { label: 'Hata',         value: 'hata'        },
          ].map(f => (
            <Link
              key={f.value ?? 'all'}
              href={buildUrl({ durum: f.value })}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                (durum ?? '') === (f.value ?? '')
                  ? 'bg-[#C8102E] text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Tarih filtresi */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border rounded-lg px-3 py-1.5 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Tarih:</span>
          <form method="GET" action="/hatirlatmalar/gecmis" className="flex items-center gap-2">
            {kanal     && <input type="hidden" name="kanal"    value={kanal} />}
            {durum     && <input type="hidden" name="durum"    value={durum} />}
            <input
              type="date"
              name="baslangic"
              defaultValue={baslangic ?? ''}
              className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
            />
            <span className="text-gray-400 dark:text-gray-500">—</span>
            <input
              type="date"
              name="bitis"
              defaultValue={bitis ?? ''}
              className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
            />
            <button
              type="submit"
              className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded text-xs font-medium hover:bg-gray-200 transition-colors"
            >
              Uygula
            </button>
            {(baslangic || bitis) && (
              <Link
                href={buildUrl({ baslangic: undefined, bitis: undefined })}
                className="text-red-500 hover:text-red-700 text-xs"
              >
                ✕
              </Link>
            )}
          </form>
        </div>

      </div>

      {/* Sonuç tablosu */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        {(kayitlar ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            Gönderim kaydı bulunamadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tarih / Saat</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Müşteri</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Cihaz</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Kanal</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Alıcı</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(kayitlar ?? []).map(k => {
                  const musteri = k.customers as unknown as { id: string; full_name: string } | null
                  const cihaz = k.devices as unknown as {
                    id: string
                    custom_device_name: string | null
                    brand: string | null
                    capacity: string | null
                  } | null
                  const cihazAdi = cihaz?.custom_device_name
                    ?? ([cihaz?.brand, cihaz?.capacity].filter(Boolean).join(' ') || '—')
                  return (
                    <tr key={k.id} className={`hover:bg-gray-50 ${k.durum === 'hata' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatDateTime(k.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        {musteri ? (
                          <Link href={`/customers/${musteri.id}`}
                            className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline">
                            {musteri.full_name}
                          </Link>
                        ) : <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">{cihazAdi}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${KANAL_BADGE[k.kanal] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`}>
                          {k.kanal}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {k.alici_email ?? k.alici_telefon ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <div>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${DURUM_BADGE[k.durum] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`}>
                            {k.durum === 'gonderildi' ? 'Gönderildi' : k.durum === 'hata' ? 'Hata' : 'Bekliyor'}
                          </span>
                          {k.hata_mesaji && (
                            <div className="text-xs text-red-600 mt-0.5 max-w-xs truncate" title={k.hata_mesaji}>
                              {k.hata_mesaji}
                            </div>
                          )}
                        </div>
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
