import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { formatTRDate } from '@/lib/finance/formatters'
import TabletModeButton from './TabletModeButton'
import { getCurrentAccess } from '@/lib/auth/authorization'

type TeslimatKalemRow = {
  id: string
  aciklama: string | null
  toplam_tutar: number | null
  teslimatlar?: { teslimat_no?: string | null; durum?: string | null } | null
}

type SubeJoin = { ad?: string | null }
type CustomerJoin = { id?: string | null; full_name?: string | null }
type SubeRow = { sube_id: string | null; subeler: unknown; durum: string | null }
type SonTeslimatRow = {
  id: string
  teslimat_no: string | null
  teslimat_tarihi: string | null
  durum: string
  customers: unknown
  subeler: unknown
}

function kalemMarker(notlar: string | null | undefined) {
  return String(notlar ?? '').match(/Teslimat kalemi: ([0-9a-f-]+)/i)?.[1] ?? null
}

const DURUM_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  taslak:     { label: 'Taslak',     icon: '',   cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  sevkte:     { label: 'Sevkte',     icon: '🚚', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  tamamlandi: { label: 'Tamamlandı', icon: '✅', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  iptal:      { label: 'İptal',      icon: '❌', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
}

function DurumBadge({ durum }: { durum: string }) {
  const b = DURUM_BADGE[durum] ?? { label: durum, icon: '', cls: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>
      {b.icon && <span>{b.icon}</span>}
      {b.label}
    </span>
  )
}

type CardProps = {
  label: string
  value: number
  icon: string
  valueCls: string
  isUrgent?: boolean
  href: string
}

function DashboardCard({ label, value, icon, valueCls, isUrgent, href }: CardProps) {
  const urgentStyle = isUrgent && value > 0
    ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-900/10 animate-pulse'
    : 'bg-white dark:bg-gray-800'
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 hover:shadow-md transition-shadow dark:border-gray-700 ${urgentStyle}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-2xl font-bold ${valueCls}`}>{value}</div>
          <div className="mt-1 text-xs leading-tight text-gray-500 dark:text-gray-400">{label}</div>
        </div>
        <span className="text-xl">{icon}</span>
      </div>
    </Link>
  )
}

export default async function TeslimatlarPage() {
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const today = new Date().toISOString().slice(0, 10)
  const tenDaysAgoDate = new Date()
  tenDaysAgoDate.setDate(tenDaysAgoDate.getDate() - 10)
  const tenDaysAgo = tenDaysAgoDate.toISOString().slice(0, 10)
  function scope(query: any) {
    if (!access || access.isAdmin) return query
    if (access.branchIds.length === 0) return query.in('sube_id', ['00000000-0000-0000-0000-000000000000'])
    return query.in('sube_id', access.branchIds)
  }

  const [
    { count: todayCount },
    { count: sevkteCount },
    { count: emanetCount },
    { count: bekleyenCount },
    { count: gecikenGeriCount },
    { count: gecikenEmanetCount },
    { data: onKayitKalemler },
    { data: onKayitlar },
    { data: sonTeslimatlar },
    { data: subeRows },
  ] = await Promise.all([
    scope(supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('teslimat_tarihi', today)),
    scope(supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('durum', 'sevkte')),
    scope(supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['acik', 'kismi_kapandi'])),
    scope(supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'kismi_teslim'])),
    scope(supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'kismi_teslim']).lt('created_at', tenDaysAgo)),
    scope(supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['acik', 'kismi_kapandi']).lt('created_at', tenDaysAgo)),
    supabase
      .from('teslimat_kalemleri')
      .select('id, aciklama, toplam_tutar, teslimatlar(teslimat_no, durum)')
      .eq('faturalanir_mi', true)
      .gt('toplam_tutar', 0)
      .limit(300),
    supabase
      .from('on_kayitlar')
      .select('id, aciklama, notlar')
      .ilike('notlar', '%Teslimat kalemi:%')
      .limit(1000),
    scope(supabase
      .from('teslimatlar')
      .select('id, teslimat_no, teslimat_tarihi, durum, customers(id, full_name), subeler(ad)')
      .order('created_at', { ascending: false })
      .limit(8)),
    scope(supabase
      .from('teslimatlar')
      .select('sube_id, subeler(ad), durum')
      .neq('durum', 'tamamlandi')
      .neq('durum', 'iptal')),
  ])

  const aktarilanKalemler = new Set((onKayitlar ?? []).map(k => kalemMarker(k.notlar)).filter(Boolean))
  const aktarilanAciklamalar = new Set((onKayitlar ?? []).map(k => k.aciklama).filter(Boolean))
  const onKayitCount = ((onKayitKalemler ?? []) as TeslimatKalemRow[]).filter(row => {
    const t = row.teslimatlar
    const aciklama = `${t?.teslimat_no} - ${row.aciklama}`
    return t?.durum === 'tamamlandi' && !aktarilanKalemler.has(row.id) && !aktarilanAciklamalar.has(aciklama)
  }).length

  const gecikenCount = (gecikenGeriCount ?? 0) + (gecikenEmanetCount ?? 0)
  const typedSubeRows = (subeRows ?? []) as SubeRow[]
  const typedSonTeslimatlar = (sonTeslimatlar ?? []) as SonTeslimatRow[]

  // Şube bazlı açık iş
  const subeMap = new Map<string, { ad: string; subeId: string; count: number }>()
  for (const row of typedSubeRows) {
    const sube = row.subeler as SubeJoin | null
    const key = (row.sube_id as string | null) ?? 'genel'
    const cur = subeMap.get(key) ?? { ad: sube?.ad ?? 'Genel', subeId: key, count: 0 }
    cur.count += 1
    subeMap.set(key, cur)
  }

  const cards: CardProps[] = [
    { label: 'Bugün teslim', value: todayCount ?? 0, icon: '📦', valueCls: 'text-blue-600 dark:text-blue-400', href: '/teslimatlar/liste?durum=bugun' },
    { label: 'Sevkte', value: sevkteCount ?? 0, icon: '🚚', valueCls: 'text-yellow-600 dark:text-yellow-400', href: '/teslimatlar/liste?durum=sevkte' },
    { label: 'Açık emanetler', value: emanetCount ?? 0, icon: '🔄', valueCls: 'text-orange-600 dark:text-orange-400', href: '/teslimatlar/emanetler', isUrgent: (emanetCount ?? 0) > 0 },
    { label: 'Geri teslim bekleyenler', value: bekleyenCount ?? 0, icon: '⏳', valueCls: 'text-red-600 dark:text-red-400', href: '/teslimatlar/geri-teslim' },
    { label: '10 günü geçenler', value: gecikenCount, icon: '⚠️', valueCls: 'text-red-600 dark:text-red-400', href: '/teslimatlar/gecikenler', isUrgent: true },
    { label: 'Ön kayda aktarılacak', value: onKayitCount, icon: '📋', valueCls: 'text-green-600 dark:text-green-400', href: '/teslimatlar/on-kayda-aktar' },
  ]

  return (
    <div className="space-y-5 p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Teslimatlar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Teslim, alım, emanet ve geri teslim takipleri.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <TabletModeButton />
          <Link href="/teslimatlar/yeni" className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25] transition-colors">
            + Yeni teslimat
          </Link>
        </div>
      </div>

      {/* KPI Kartları */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(card => <DashboardCard key={card.label} {...card} />)}
      </div>

      {/* Alt Bölüm */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Son hareketler */}
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Son hareketler</h2>
            <Link href="/teslimatlar/liste" className="text-sm text-[#C8102E] hover:underline">Tümünü gör →</Link>
          </div>
          <div className="divide-y dark:divide-gray-700">
            {typedSonTeslimatlar.map(row => {
              const customer = row.customers as CustomerJoin | null
              const sube = row.subeler as SubeJoin | null
              const durumIcon = row.durum === 'tamamlandi' ? '✅' : row.durum === 'sevkte' ? '🚚' : row.durum === 'iptal' ? '❌' : '📦'
              return (
                <div key={row.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{durumIcon}</span>
                    <div>
                      <Link href={`/teslimatlar/${row.id}`} className="font-mono text-sm font-semibold text-[#C8102E] hover:underline">
                        {row.teslimat_no}
                      </Link>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {customer?.id ? (
                          <Link href={`/customers/${customer.id}`} className="hover:underline">
                            {customer.full_name ?? '-'}
                          </Link>
                        ) : (customer?.full_name ?? '-')}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <DurumBadge durum={row.durum} />
                    <div className="text-xs text-gray-400">
                      {formatTRDate(row.teslimat_tarihi)} · {sube?.ad ?? 'Genel'}
                    </div>
                  </div>
                </div>
              )
            })}
            {typedSonTeslimatlar.length === 0 && (
              <div className="py-10 text-center">
                <div className="mb-2 text-3xl">📦</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Henüz teslimat kaydı yok.</div>
                <Link href="/teslimatlar/yeni" className="mt-2 inline-block text-sm text-[#C8102E] hover:underline">
                  İlk teslimatı oluştur →
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Şube bazlı açık iş */}
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Şube bazlı açık iş</h2>
          <div className="space-y-2">
            {Array.from(subeMap.values()).map(row => (
              <Link
                key={row.subeId}
                href={row.subeId !== 'genel' ? `/teslimatlar/liste?sube=${row.subeId}` : '/teslimatlar/liste'}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="text-gray-700 dark:text-gray-200">{row.ad}</span>
                <span className="rounded-full bg-[#C8102E] px-2 py-0.5 text-xs font-semibold text-white">{row.count}</span>
              </Link>
            ))}
            {subeMap.size === 0 && (
              <div className="py-6 text-center">
                <div className="mb-1 text-2xl">✅</div>
                <div className="text-sm text-gray-400">Tüm şubelerde açık iş yok.</div>
              </div>
            )}
          </div>
          {subeMap.size > 0 && (
            <div className="mt-4 border-t pt-3 dark:border-gray-700">
              <Link href="/teslimatlar/liste" className="text-xs text-[#C8102E] hover:underline">
                Tüm teslimatları gör →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
