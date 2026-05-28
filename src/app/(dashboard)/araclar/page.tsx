import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'

type CariRow = {
  araci_id: string
  hareket_tarihi: string
  vade_tarihi: string | null
  islem_yonu: 'alacak' | 'borc'
  tutar: number
  durum: string
}

type BrokerStats = {
  totalAlacak: number
  totalBorc: number
  netBakiye: number
  geciken: number
  sonIslem: string | null
  jobCount: number
}

function emptyStats(): BrokerStats {
  return { totalAlacak: 0, totalBorc: 0, netBakiye: 0, geciken: 0, sonIslem: null, jobCount: 0 }
}

export default async function AraclarPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; bakiye?: string; sube?: string }>
}) {
  const params = await searchParams
  const supabase = createServiceClient()

  const [{ data: brokers }, { data: subeler }] = await Promise.all([
    supabase
      .from('brokers')
      .select('*')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('subeler')
      .select('id, ad')
      .eq('aktif', true)
      .order('ad'),
  ])

  const brokerIds = (brokers ?? []).map(b => b.id)
  const [{ data: movements }, { data: commissions }] = brokerIds.length > 0
    ? await Promise.all([
        supabase
          .from('araci_cari_hareketleri')
          .select('araci_id, hareket_tarihi, vade_tarihi, islem_yonu, tutar, durum, sube_id')
          .in('araci_id', brokerIds),
        supabase
          .from('invoice_brokers')
          .select('broker_id, id')
          .in('broker_id', brokerIds),
      ])
    : [{ data: [] }, { data: [] }]

  const today = new Date().toISOString().slice(0, 10)
  const statsMap = new Map<string, BrokerStats>()
  for (const id of brokerIds) statsMap.set(id, emptyStats())

  for (const c of commissions ?? []) {
    const stats = statsMap.get(c.broker_id) ?? emptyStats()
    stats.jobCount += 1
    statsMap.set(c.broker_id, stats)
  }

  for (const movement of (movements ?? []) as (CariRow & { sube_id?: string | null })[]) {
    if (movement.durum === 'İptal') continue
    if (params?.sube && movement.sube_id !== params.sube) continue
    const stats = statsMap.get(movement.araci_id) ?? emptyStats()
    const amount = Number(movement.tutar ?? 0)
    if (movement.islem_yonu === 'alacak') stats.totalAlacak += amount
    if (movement.islem_yonu === 'borc') stats.totalBorc += amount
    if (
      movement.islem_yonu === 'alacak' &&
      movement.vade_tarihi &&
      movement.vade_tarihi < today &&
      !['Ödendi', 'Mahsup Edildi'].includes(movement.durum)
    ) {
      stats.geciken += amount
    }
    if (!stats.sonIslem || movement.hareket_tarihi > stats.sonIslem) stats.sonIslem = movement.hareket_tarihi
    stats.netBakiye = stats.totalAlacak - stats.totalBorc
    statsMap.set(movement.araci_id, stats)
  }

  const q = (params?.q ?? '').trim().toLocaleLowerCase('tr-TR')
  const filteredBrokers = (brokers ?? []).filter(broker => {
    const stats = statsMap.get(broker.id) ?? emptyStats()
    const matchesText = !q ||
      String(broker.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
      String(broker.company_name ?? '').toLocaleLowerCase('tr-TR').includes(q)
    const matchesBalance =
      !params?.bakiye ||
      params.bakiye === 'tum' ||
      (params.bakiye === 'alacakli' && stats.netBakiye > 0) ||
      (params.bakiye === 'borclu' && stats.netBakiye < 0) ||
      (params.bakiye === 'geciken' && stats.geciken > 0) ||
      (params.bakiye === 'sifir' && stats.netBakiye === 0)
    return matchesText && matchesBalance
  })

  const totals = Array.from(statsMap.values()).reduce((acc, stats) => ({
    totalAlacak: acc.totalAlacak + stats.totalAlacak,
    totalBorc: acc.totalBorc + stats.totalBorc,
    netBakiye: acc.netBakiye + stats.netBakiye,
    geciken: acc.geciken + stats.geciken,
  }), { totalAlacak: 0, totalBorc: 0, netBakiye: 0, geciken: 0 })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Aracılar</h1>
        </div>
        <Link href="/araclar/new"
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
          + Yeni Aracı
        </Link>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{brokers?.length ?? 0}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Toplam Aracı</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-xl font-bold text-blue-700">{formatCurrency(totals.totalAlacak)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Toplam Aracı Alacağı</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-xl font-bold text-green-600">{formatCurrency(totals.totalBorc)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ödenen Toplam</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-xl font-bold text-orange-600">{formatCurrency(totals.netBakiye)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Bekleyen Toplam</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className={`text-xl font-bold ${totals.geciken > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totals.geciken)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Geciken Toplam</div>
          </div>
        </div>

        <form className="bg-white dark:bg-gray-800 border rounded-lg p-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            name="q"
            defaultValue={params?.q ?? ''}
            placeholder="Aracı adı veya firma ara"
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <select name="bakiye" defaultValue={params?.bakiye ?? 'tum'} className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
            <option value="tum">Tüm bakiyeler</option>
            <option value="alacakli">Alacağı olanlar</option>
            <option value="borclu">Borcu olanlar</option>
            <option value="geciken">Vadesi geçenler</option>
            <option value="sifir">Bakiyesi sıfır</option>
          </select>
          <select name="sube" defaultValue={params?.sube ?? ''} className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
            <option value="">Tüm şubeler</option>
            {(subeler ?? []).map(sube => <option key={sube.id} value={sube.id}>{sube.ad}</option>)}
          </select>
          <button className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            Filtrele
          </button>
        </form>

        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          {filteredBrokers.length === 0 ? (
            <div className="px-4 py-16 text-center text-gray-400 dark:text-gray-500 text-sm">
              Aracı kaydı bulunamadı.{' '}
              <Link href="/araclar/new" className="text-[#C8102E] hover:underline">Aracı ekle →</Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Aracı</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Telefon</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Toplam İş</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Toplam Alacak</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ödenen</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Net Bakiye</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Geciken</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Son İşlem Tarihi</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredBrokers.map(broker => {
                    const stats = statsMap.get(broker.id) ?? emptyStats()
                    return (
                      <tr key={broker.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{broker.full_name}</div>
                          {broker.company_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{broker.company_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{broker.phone ?? '-'}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300 font-medium">{stats.jobCount}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(stats.totalAlacak)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">{formatCurrency(stats.totalBorc)}</td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${stats.netBakiye > 0 ? 'text-orange-600' : stats.netBakiye < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(stats.netBakiye)}
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${stats.geciken > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                          {stats.geciken > 0 ? formatCurrency(stats.geciken) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{stats.sonIslem ? formatTRDate(stats.sonIslem) : '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${broker.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                            {broker.is_active ? 'Aktif' : 'Pasif'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/araclar/${broker.id}`}
                            className="text-xs text-[#C8102E] hover:underline">
                            Detay →
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
    </div>
  )
}
