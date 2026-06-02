import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../_components/OperationShell'
import OperationFilters from '../_components/OperationFilters'
import { formatTRDate } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'

type SearchParams = Promise<{ durum?: string; geciken?: string; bugun?: string; q?: string; sube?: string; baslangic?: string; bitis?: string }>

const DURUMLAR = ['Taslak', 'Aktif', 'Beklemede', 'Tamamlandı', 'İptal', 'Bekliyor']

function daysLeft(value: string | null) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / 86400000)
}

function branchName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value
  return (row as { ad?: string } | null)?.ad ?? '-'
}

function withSube(href: string, subeId?: string | null) {
  if (!subeId) return href
  return `${href}${href.includes('?') ? '&' : '?'}sube=${encodeURIComponent(subeId)}`
}

export default async function IsPlanlariPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const lockedSubeId = getLockedBranchId(access)
  const effectiveSube = lockedSubeId ?? params.sube
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('is_planlari')
    .select('id, plan_no, baslik, customer_name_snapshot, plan_turu, durum, baslangic_tarihi, bitis_tarihi, tekrar_tipi, sonraki_is_tarihi, toplam_is_sayisi, tamamlanan_is_sayisi, iptal_is_sayisi, subeler(ad)')
    .order('created_at', { ascending: false })
    .limit(200)

  query = applyBranchScope(query, access, effectiveSube)
  if (params.q) query = query.or(`baslik.ilike.%${params.q}%,plan_no.ilike.%${params.q}%,customer_name_snapshot.ilike.%${params.q}%`)
  if (params.durum && params.durum !== 'Bekliyor') query = query.eq('durum', params.durum)
  if (params.baslangic) query = query.gte('baslangic_tarihi', params.baslangic)
  if (params.bitis) query = query.lte('baslangic_tarihi', params.bitis)

  const scopedCount = <T,>(baseQuery: T) => applyBranchScope(baseQuery, access, effectiveSube) as T

  const [
    { data: plans },
    { data: subeler },
    { count: bugun },
    { count: bekleyen },
    { count: tamamlanan },
    { count: geciken },
  ] = await Promise.all([
    query,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    scopedCount(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('planlanan_tarih', today)),
    scopedCount(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('durum', 'Bekliyor')),
    scopedCount(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('durum', 'Tamamlandı')),
    scopedCount(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).lt('planlanan_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')),
  ])

  let rows = plans ?? []
  if (params.bugun === '1') rows = rows.filter(row => row.sonraki_is_tarihi === today)
  if (params.durum === 'Bekliyor') rows = rows.filter(row => Math.max((row.toplam_is_sayisi || 0) - (row.tamamlanan_is_sayisi || 0) - (row.iptal_is_sayisi || 0), 0) > 0)
  if (params.geciken === '1') rows = rows.filter(row => row.sonraki_is_tarihi && row.sonraki_is_tarihi < today && !['Tamamlandı', 'İptal'].includes(row.durum))

  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const cards = [
    ['Bugünkü işler', bugun ?? 0, withSube('/operasyon/is-planlari?bugun=1', effectiveSube)],
    ['Bekleyen işler', bekleyen ?? 0, withSube('/operasyon/is-planlari?durum=Bekliyor', effectiveSube)],
    ['Tamamlanan işler', tamamlanan ?? 0, withSube('/operasyon/is-planlari?durum=Tamamlandı', effectiveSube)],
    ['Geciken işler', geciken ?? 0, withSube('/operasyon/is-planlari?geciken=1', effectiveSube)],
  ] as const

  return (
    <OperationShell active="is-planlari" title="İş Planları">
      <div className="space-y-5 p-6 print:p-0">
        <div className="no-print grid gap-3 md:grid-cols-4">
          {cards.map(([label, value, href]) => (
            <Link key={label} href={href} className="rounded-lg border bg-white p-4 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            </Link>
          ))}
        </div>

        <OperationFilters
          action="/operasyon/is-planlari"
          subeler={visibleSubeler}
          values={{ ...params, sube: effectiveSube }}
          durumlar={DURUMLAR}
          searchPlaceholder="Plan adı veya müşteri ara"
          lockedSubeId={lockedSubeId}
        />

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 print:block">
          {rows.map(plan => {
            const total = plan.toplam_is_sayisi || 0
            const done = plan.tamamlanan_is_sayisi || 0
            const canceled = plan.iptal_is_sayisi || 0
            const pending = Math.max(total - done - canceled, 0)
            const progress = total > 0 ? Math.round((done / total) * 100) : 0
            const remaining = daysLeft(plan.sonraki_is_tarihi)

            return (
              <article key={plan.id} className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 print:mb-3 print:break-inside-avoid">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-[#C8102E]">{plan.plan_no}</div>
                    <h2 className="mt-1 font-semibold text-gray-900 dark:text-gray-100">{plan.baslik}</h2>
                    <p className="text-sm text-gray-500">{plan.customer_name_snapshot ?? 'Genel operasyon'}</p>
                    <p className="text-xs font-medium text-gray-500">Şube: {branchName(plan.subeler)}</p>
                  </div>
                  <span className="rounded-full border bg-gray-50 px-2 py-0.5 text-xs text-gray-700">{plan.durum}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Tarih:</span> {formatTRDate(plan.baslangic_tarihi)} - {formatTRDate(plan.bitis_tarihi)}</div>
                  <div><span className="text-gray-500">Tekrar:</span> {plan.tekrar_tipi}</div>
                  <div><span className="text-gray-500">Bekleyen:</span> {pending}</div>
                  <div><span className="text-gray-500">Tamamlanan:</span> {done}</div>
                  <div><span className="text-gray-500">İptal:</span> {canceled}</div>
                  <div><span className="text-gray-500">Sonraki:</span> {formatTRDate(plan.sonraki_is_tarihi)}</div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-gray-500"><span>İlerleme</span><span>{progress}%</span></div>
                  <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-[#C8102E]" style={{ width: `${progress}%` }} /></div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className={`text-xs ${remaining !== null && remaining < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {remaining === null ? 'Sonraki iş yok' : remaining < 0 ? `${Math.abs(remaining)} gün gecikti` : `${remaining} gün kaldı`}
                  </span>
                  <Link href={`/operasyon/is-planlari/${plan.id}`} className="no-print rounded-md border border-[#C8102E] px-3 py-1.5 text-sm font-medium text-[#C8102E] hover:bg-red-50">Detay</Link>
                </div>
              </article>
            )
          })}
          {rows.length === 0 && (
            <div className="rounded-lg border bg-white p-10 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800 lg:col-span-2 xl:col-span-3">
              İş planı bulunamadı. <Link href="/operasyon/is-planlari/yeni" className="text-[#C8102E] hover:underline">Yeni iş planı oluştur</Link>
            </div>
          )}
        </div>
      </div>
    </OperationShell>
  )
}
