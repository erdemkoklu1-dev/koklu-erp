import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../_components/OperationShell'
import OperationFilters from '../_components/OperationFilters'
import { formatTRDate } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'
import { completeTalepAction, softDeleteTalepAction } from './actions'
import { TALEP_STATUS_OPTIONS, normalizeTalepStatus, talepStatusAliases, talepStatusLabel } from './status'

type SearchParams = Promise<{ durum?: string; oncelik?: string; geciken?: string; hedef?: string; q?: string; sube?: string; baslangic?: string; bitis?: string }>

type TalepRow = {
  id: string
  talep_no: string | null
  customer_name_snapshot: string | null
  cihaz_name_snapshot: string | null
  baslik: string | null
  aciklama: string | null
  kategori: string | null
  oncelik: string | null
  durum: string | null
  talep_tarihi: string | null
  hedef_tarih: string | null
  sube_id: string | null
  sorumlu_personel_id: string | null
}

type SubeRow = { id: string; ad: string | null }
type PersonelRow = { id: string; ad: string | null; soyad: string | null }

const DURUM_BADGE: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  planned: 'bg-purple-50 text-purple-700 border-purple-200',
  field: 'bg-orange-50 text-orange-700 border-orange-200',
  waiting: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
}

function withSube(href: string, subeId?: string | null) {
  if (!subeId) return href
  return `${href}${href.includes('?') ? '&' : '?'}sube=${encodeURIComponent(subeId)}`
}

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function quotedIn(values: string[]) {
  return `(${values.map(value => `"${value.replaceAll('"', '\\"')}"`).join(',')})`
}

function applyStatusFilter<T extends { in: (column: string, values: string[]) => T }>(query: T, durum?: string) {
  if (!durum) return query
  const normalized = normalizeTalepStatus(durum)
  if (normalized === 'unknown') return query
  return query.in('durum', talepStatusAliases(normalized))
}

function applyDefaultVisibility<T extends { not: (column: string, operator: string, value: string) => T }>(query: T, durum?: string) {
  if (durum) return query
  return query.not('durum', 'in', quotedIn(talepStatusAliases('cancelled')))
}

function applyOpenStatusFilter<T extends { not: (column: string, operator: string, value: string) => T }>(query: T) {
  return query.not('durum', 'in', quotedIn([...talepStatusAliases('completed'), ...talepStatusAliases('cancelled')]))
}

function applyDateFilters<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  baslangic?: string,
  bitis?: string,
) {
  const start = validDate(baslangic)
  const end = validDate(bitis)
  if (start) query = query.gte('talep_tarihi', start)
  if (end) query = query.lte('talep_tarihi', end)
  return query
}

export default async function TaleplerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const lockedSubeId = getLockedBranchId(access)
  const effectiveSube = lockedSubeId ?? params.sube
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('musteri_talepleri')
    .select('id, talep_no, customer_name_snapshot, cihaz_name_snapshot, baslik, aciklama, kategori, oncelik, durum, talep_tarihi, hedef_tarih, sube_id, sorumlu_personel_id')
    .order('created_at', { ascending: false })
    .limit(200)

  query = applyBranchScope(query, access, effectiveSube)
  query = applyDefaultVisibility(query, params.durum)
  query = applyStatusFilter(query, params.durum)
  query = applyDateFilters(query, params.baslangic, params.bitis)
  if (params.oncelik) query = query.eq('oncelik', params.oncelik)
  if (params.hedef === 'bugun') query = applyOpenStatusFilter(query.eq('hedef_tarih', today))
  if (params.geciken === '1') query = applyOpenStatusFilter(query.lt('hedef_tarih', today))
  if (params.q?.trim()) {
    const q = params.q.trim().replaceAll('%', '\\%').replaceAll(',', ' ')
    query = query.or(`baslik.ilike.%${q}%,talep_no.ilike.%${q}%,customer_name_snapshot.ilike.%${q}%`)
  }

  const scoped = <T,>(baseQuery: T) => applyBranchScope(baseQuery, access, effectiveSube) as T
  const baseCount = () => scoped(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }))
  const statusCount = (status: 'new' | 'in_progress' | 'waiting' | 'completed') => applyDateFilters(
    baseCount().in('durum', talepStatusAliases(status)),
    params.baslangic,
    params.bitis,
  )

  const [
    { data: rows },
    { data: subeler },
    { count: yeni },
    { count: islemeAlinan },
    { count: acil },
    { count: bekleyen },
    { count: bugun },
    { count: geciken },
    { count: tamamlanan },
  ] = await Promise.all([
    query,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    statusCount('new'),
    statusCount('in_progress'),
    applyDateFilters(applyOpenStatusFilter(baseCount().eq('oncelik', 'Acil')), params.baslangic, params.bitis),
    statusCount('waiting'),
    applyOpenStatusFilter(baseCount().eq('hedef_tarih', today)),
    applyOpenStatusFilter(baseCount().lt('hedef_tarih', today)),
    statusCount('completed'),
  ])

  const talepRows = (rows ?? []) as TalepRow[]
  const subeIds = Array.from(new Set(talepRows.map(row => row.sube_id).filter(Boolean) as string[]))
  const personelIds = Array.from(new Set(talepRows.map(row => row.sorumlu_personel_id).filter(Boolean) as string[]))

  const [{ data: rowSubeler }, { data: personeller }] = await Promise.all([
    subeIds.length > 0 ? supabase.from('subeler').select('id, ad').in('id', subeIds) : Promise.resolve({ data: [] }),
    personelIds.length > 0 ? supabase.from('personeller').select('id, ad, soyad').in('id', personelIds) : Promise.resolve({ data: [] }),
  ])

  const subeMap = new Map(((rowSubeler ?? []) as SubeRow[]).map(sube => [sube.id, sube.ad ?? '-']))
  const personelMap = new Map(((personeller ?? []) as PersonelRow[]).map(personel => [personel.id, `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() || '-']))
  const visibleSubeler = filterVisibleBranches((subeler ?? []) as SubeRow[], access)

  const cards = [
    ['Yeni Talepler', yeni ?? 0, withSube('/operasyon/talepler?durum=new', effectiveSube)],
    ['İşleme Alınanlar', islemeAlinan ?? 0, withSube('/operasyon/talepler?durum=in_progress', effectiveSube)],
    ['Acil Talepler', acil ?? 0, withSube('/operasyon/talepler?oncelik=Acil', effectiveSube)],
    ['Bekleyenler', bekleyen ?? 0, withSube('/operasyon/talepler?durum=waiting', effectiveSube)],
    ['Bugün Çözülecekler', bugun ?? 0, withSube('/operasyon/talepler?hedef=bugun', effectiveSube)],
    ['Gecikenler', geciken ?? 0, withSube('/operasyon/talepler?geciken=1', effectiveSube)],
    ['Tamamlananlar', tamamlanan ?? 0, withSube('/operasyon/talepler?durum=completed', effectiveSube)],
  ] as const

  return (
    <OperationShell active="talepler" title="Müşteri Talepleri">
      <div className="space-y-5 p-6 print:p-0">
        <div className="no-print grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {cards.map(([label, value, href]) => (
            <Link key={label} href={href} className="rounded-lg border bg-white p-3 hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
            </Link>
          ))}
        </div>

        <OperationFilters
          action="/operasyon/talepler"
          subeler={visibleSubeler}
          values={{ ...params, sube: effectiveSube }}
          durumlar={TALEP_STATUS_OPTIONS}
          searchPlaceholder="Müşteri, talep no veya başlık ara"
          lockedSubeId={lockedSubeId}
        />

        <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-[1320px] divide-y text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Talep No</th>
                <th className="px-4 py-3 text-left">Müşteri</th>
                <th className="px-4 py-3 text-left">Şube</th>
                <th className="px-4 py-3 text-left">Başlık</th>
                <th className="px-4 py-3 text-left">Kategori</th>
                <th className="px-4 py-3 text-left">Öncelik</th>
                <th className="px-4 py-3 text-left">Tarih</th>
                <th className="px-4 py-3 text-left">Hedef</th>
                <th className="px-4 py-3 text-left">Durum</th>
                <th className="px-4 py-3 text-left">Sorumlu</th>
                <th className="no-print px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {talepRows.map(row => {
                const status = normalizeTalepStatus(row.durum)
                return (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-[#C8102E]">{row.talep_no}</td>
                    <td className="px-4 py-3">{row.customer_name_snapshot ?? '-'}</td>
                    <td className="px-4 py-3">{row.sube_id ? subeMap.get(row.sube_id) ?? '-' : '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.baslik}</div>
                      <div className="max-w-xs truncate text-xs text-gray-500">{row.aciklama}</div>
                    </td>
                    <td className="px-4 py-3">{row.kategori}</td>
                    <td className="px-4 py-3">{row.oncelik}</td>
                    <td className="px-4 py-3">{formatTRDate(row.talep_tarihi)}</td>
                    <td className="px-4 py-3">{formatTRDate(row.hedef_tarih)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${DURUM_BADGE[status] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                        {talepStatusLabel(row.durum)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.sorumlu_personel_id ? personelMap.get(row.sorumlu_personel_id) ?? '-' : '-'}</td>
                    <td className="no-print px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link href={`/operasyon/talepler/${row.id}`} className="text-[#C8102E] hover:underline">Detay</Link>
                        <Link href={`/operasyon/talepler/${row.id}/duzenle`} className="text-gray-600 hover:underline dark:text-gray-300">Düzenle</Link>
                        <Link href={`/operasyon/talepler/${row.id}/yazdir`} className="text-gray-600 hover:underline dark:text-gray-300">Yazdır</Link>
                        <Link href={`/operasyon/is-planlari/yeni?requestId=${row.id}`} className="text-gray-600 hover:underline dark:text-gray-300">İş Planına Aktar</Link>
                        <Link href={`/teslimatlar/yeni?requestId=${row.id}`} className="text-gray-600 hover:underline dark:text-gray-300">Teslimata Aktar</Link>
                        {status !== 'completed' && (
                          <form action={completeTalepAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button className="text-green-700 hover:underline">Tamamlandı Yap</button>
                          </form>
                        )}
                        <form action={softDeleteTalepAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <button className="text-red-700 hover:underline">Sil</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {talepRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-500">
                    Talep bulunamadı. <Link href="/operasyon/talepler/yeni" className="text-[#C8102E] hover:underline">Yeni talep oluştur</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OperationShell>
  )
}
