import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from './_components/OperationShell'
import OperationFilters from './_components/OperationFilters'
import { formatTRDate } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'
import { TESLIMAT_CANCELLED_STATUS_ALIASES, isCancelledTeslimatStatus, normalizeTeslimatStatus, quotedTeslimatStatuses } from '@/lib/teslimat-status'

type SearchParams = Promise<{ sube?: string; baslangic?: string; bitis?: string; q?: string }>

type SummaryCard = {
  title: string
  value: number
  href: string
  tone: string
}

type ActivityRow = {
  id: string
  teslimat_no?: string | null
  talep_no?: string | null
  plan_no?: string | null
  baslik?: string | null
  durum?: string | null
  teslimat_tarihi?: string | null
  talep_tarihi?: string | null
  sonraki_is_tarihi?: string | null
  customers?: { full_name: string | null } | { full_name: string | null }[] | null
  subeler?: { ad: string | null } | { ad: string | null }[] | null
}

function Card({ title, value, href, tone }: SummaryCard) {
  return (
    <Link href={href} className="rounded-lg border bg-white p-4 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{title}</div>
    </Link>
  )
}

function applyDate<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(query: T, column: string, baslangic?: string, bitis?: string) {
  if (baslangic) query = query.gte(column, baslangic)
  if (bitis) query = query.lte(column, bitis)
  return query
}

function withSube(href: string, subeId?: string | null) {
  if (!subeId) return href
  return `${href}${href.includes('?') ? '&' : '?'}sube=${encodeURIComponent(subeId)}`
}

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function OperasyonPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const lockedSubeId = getLockedBranchId(access)
  const effectiveSube = lockedSubeId ?? params.sube
  const today = new Date().toISOString().slice(0, 10)
  const tenDaysAgo = new Date()
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
  const tenDaysAgoStr = tenDaysAgo.toISOString().slice(0, 10)

  const scoped = <T,>(query: T) => applyBranchScope(query, access, effectiveSube) as T

  const [
    { data: subeler },
    { count: bugunTeslim },
    { count: sevkte },
    { count: emanet },
    { count: geriBekleyen },
    { count: gecikenGeri },
    { count: gecikenEmanet },
    { count: yeniTalep },
    { count: islemeAlinan },
    { count: acilTalep },
    { count: gecikenTalep },
    { count: bugunkuIs },
    { count: bekleyenIs },
    { count: tamamlananIs },
    { count: gecikenIs },
    { data: sonTeslimatlar },
    { data: sonTalepler },
    { data: sonIsPlanlari },
  ] = await Promise.all([
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    applyDate(scoped(supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('teslimat_tarihi', today).not('durum', 'in', quotedTeslimatStatuses(TESLIMAT_CANCELLED_STATUS_ALIASES))), 'teslimat_tarihi', params.baslangic, params.bitis),
    applyDate(scoped(supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('durum', 'sevkte')), 'teslimat_tarihi', params.baslangic, params.bitis),
    scoped(supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['acik', 'kismi_kapandi'])),
    scoped(supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'kismi_teslim'])),
    scoped(supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'kismi_teslim']).lt('created_at', tenDaysAgoStr)),
    scoped(supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['acik', 'kismi_kapandi']).lt('created_at', tenDaysAgoStr)),
    applyDate(scoped(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('durum', 'Yeni')), 'talep_tarihi', params.baslangic, params.bitis),
    applyDate(scoped(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('durum', 'İşleme Alındı')), 'talep_tarihi', params.baslangic, params.bitis),
    applyDate(scoped(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('oncelik', 'Acil').not('durum', 'in', '("Tamamlandı","İptal")')), 'talep_tarihi', params.baslangic, params.bitis),
    scoped(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).lt('hedef_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')),
    scoped(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('planlanan_tarih', today)),
    scoped(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('durum', 'Bekliyor')),
    scoped(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('durum', 'Tamamlandı')),
    scoped(supabase.from('planli_isler').select('*', { count: 'exact', head: true }).lt('planlanan_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')),
    scoped(supabase.from('teslimatlar').select('id, teslimat_no, teslimat_tarihi, durum, customers(full_name), subeler(ad)').not('durum', 'in', quotedTeslimatStatuses(TESLIMAT_CANCELLED_STATUS_ALIASES)).order('created_at', { ascending: false }).limit(5)),
    scoped(supabase.from('musteri_talepleri').select('id, talep_no, baslik, durum, talep_tarihi, subeler(ad)').order('created_at', { ascending: false }).limit(5)),
    scoped(supabase.from('is_planlari').select('id, plan_no, baslik, durum, sonraki_is_tarihi, subeler(ad)').order('created_at', { ascending: false }).limit(5)),
  ])

  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const branchRows = await Promise.all(visibleSubeler.map(async sube => {
    const [
      { count: acikSevk },
      { count: acikEmanet },
      { count: acikGeri },
      { count: acikTalep },
      { count: bekleyenPlanliIs },
      { count: gecikenPlanliIs },
    ] = await Promise.all([
      supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('sube_id', sube.id).eq('durum', 'sevkte'),
      supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).eq('sube_id', sube.id).in('durum', ['acik', 'kismi_kapandi']),
      supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).eq('sube_id', sube.id).in('durum', ['bekliyor', 'kismi_teslim']),
      supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('sube_id', sube.id).not('durum', 'in', '("Tamamlandı","İptal")'),
      supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('sube_id', sube.id).eq('durum', 'Bekliyor'),
      supabase.from('planli_isler').select('*', { count: 'exact', head: true }).eq('sube_id', sube.id).lt('planlanan_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")'),
    ])

    return {
      id: sube.id,
      ad: sube.ad,
      acikTeslimat: (acikSevk ?? 0) + (acikEmanet ?? 0) + (acikGeri ?? 0),
      acikTalep: acikTalep ?? 0,
      bekleyenIs: bekleyenPlanliIs ?? 0,
      gecikenIs: gecikenPlanliIs ?? 0,
    }
  }))

  const sections: { title: string; cards: SummaryCard[] }[] = [
    {
      title: 'Teslimat Özeti',
      cards: [
        { title: 'Bugün teslim edilecekler', value: bugunTeslim ?? 0, href: withSube('/operasyon/teslimatlar?durum=bugun', effectiveSube), tone: 'text-blue-600' },
        { title: 'Sevkte olanlar', value: sevkte ?? 0, href: withSube('/operasyon/teslimatlar?durum=sevkte', effectiveSube), tone: 'text-orange-600' },
        { title: 'Açık emanetler', value: emanet ?? 0, href: withSube('/teslimatlar/emanetler', effectiveSube), tone: 'text-yellow-700' },
        { title: 'Geri teslim bekleyenler', value: geriBekleyen ?? 0, href: withSube('/teslimatlar/geri-teslim', effectiveSube), tone: 'text-red-600' },
        { title: '10 günü geçen teslimatlar', value: (gecikenGeri ?? 0) + (gecikenEmanet ?? 0), href: withSube('/teslimatlar/gecikenler', effectiveSube), tone: 'text-red-700' },
      ],
    },
    {
      title: 'Talep Özeti',
      cards: [
        { title: 'Yeni talepler', value: yeniTalep ?? 0, href: withSube('/operasyon/talepler?durum=Yeni', effectiveSube), tone: 'text-blue-600' },
        { title: 'İşleme alınan talepler', value: islemeAlinan ?? 0, href: withSube('/operasyon/talepler?durum=İşleme Alındı', effectiveSube), tone: 'text-indigo-700' },
        { title: 'Acil talepler', value: acilTalep ?? 0, href: withSube('/operasyon/talepler?oncelik=Acil', effectiveSube), tone: 'text-red-600' },
        { title: 'Geciken talepler', value: gecikenTalep ?? 0, href: withSube('/operasyon/talepler?geciken=1', effectiveSube), tone: 'text-red-700' },
      ],
    },
    {
      title: 'İş Planı Özeti',
      cards: [
        { title: 'Bugünkü işler', value: bugunkuIs ?? 0, href: withSube('/operasyon/is-planlari?bugun=1', effectiveSube), tone: 'text-blue-600' },
        { title: 'Bekleyen işler', value: bekleyenIs ?? 0, href: withSube('/operasyon/is-planlari?durum=Bekliyor', effectiveSube), tone: 'text-yellow-700' },
        { title: 'Tamamlanan işler', value: tamamlananIs ?? 0, href: withSube('/operasyon/is-planlari?durum=Tamamlandı', effectiveSube), tone: 'text-green-700' },
        { title: 'Geciken işler', value: gecikenIs ?? 0, href: withSube('/operasyon/is-planlari?geciken=1', effectiveSube), tone: 'text-red-700' },
      ],
    },
  ]

  const teslimatRows = ((sonTeslimatlar ?? []) as ActivityRow[])
    .map(row => ({ ...row, durum: normalizeTeslimatStatus(row.durum) }))
    .filter(row => !isCancelledTeslimatStatus(row.durum))
  const talepRows = (sonTalepler ?? []) as ActivityRow[]
  const planRows = (sonIsPlanlari ?? []) as ActivityRow[]

  return (
    <OperationShell active="ozet" title="Operasyon Özeti">
      <div className="space-y-6 p-6 print:p-0">
        <OperationFilters
          action="/operasyon"
          subeler={visibleSubeler}
          values={{ ...params, sube: effectiveSube }}
          searchPlaceholder="Özet içinde ara"
          lockedSubeId={lockedSubeId}
        />

        <div className="print-only hidden text-xs text-gray-600">
          Filtre: {effectiveSube ? `Şube ${effectiveSube}` : 'Tüm şubeler'} {params.baslangic ? `, Başlangıç ${params.baslangic}` : ''} {params.bitis ? `, Bitiş ${params.bitis}` : ''}
        </div>

        {sections.map(section => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{section.title}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {section.cards.map(card => <Card key={card.title} {...card} />)}
            </div>
          </section>
        ))}

        <section className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Şube Bazlı Açık İşler</h2>
            <div className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
              <table className="min-w-full divide-y text-sm dark:divide-gray-700">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left">Şube</th>
                    <th className="px-4 py-3 text-right">Açık Teslimat</th>
                    <th className="px-4 py-3 text-right">Açık Talep</th>
                    <th className="px-4 py-3 text-right">Bekleyen İş Planı</th>
                    <th className="px-4 py-3 text-right">Geciken İş</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {branchRows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium">{row.ad}</td>
                      <td className="px-4 py-3 text-right">{row.acikTeslimat}</td>
                      <td className="px-4 py-3 text-right">{row.acikTalep}</td>
                      <td className="px-4 py-3 text-right">{row.bekleyenIs}</td>
                      <td className="px-4 py-3 text-right">{row.gecikenIs}</td>
                    </tr>
                  ))}
                  {branchRows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Şube bulunamadı.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Son Aktiviteler</h2>
            <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="space-y-4 text-sm">
                {teslimatRows.map(row => {
                  const customer = relationOne(row.customers)
                  const sube = relationOne(row.subeler)
                  return (
                    <Link key={`t-${row.id}`} href={`/teslimatlar/${row.id}`} className="block rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="font-medium">Teslimat: {row.teslimat_no}</div>
                      <div className="text-xs text-gray-500">{customer?.full_name ?? '-'} · {sube?.ad ?? '-'} · {formatTRDate(row.teslimat_tarihi)}</div>
                    </Link>
                  )
                })}
                {talepRows.map(row => {
                  const sube = relationOne(row.subeler)
                  return (
                    <Link key={`r-${row.id}`} href={`/operasyon/talepler/${row.id}`} className="block rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="font-medium">Talep: {row.baslik}</div>
                      <div className="text-xs text-gray-500">{row.talep_no} · {sube?.ad ?? '-'} · {formatTRDate(row.talep_tarihi)}</div>
                    </Link>
                  )
                })}
                {planRows.map(row => {
                  const sube = relationOne(row.subeler)
                  return (
                    <Link key={`p-${row.id}`} href={`/operasyon/is-planlari/${row.id}`} className="block rounded-md p-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="font-medium">İş Planı: {row.baslik}</div>
                      <div className="text-xs text-gray-500">{row.plan_no} · {sube?.ad ?? '-'} · {formatTRDate(row.sonraki_is_tarihi)}</div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </OperationShell>
  )
}
