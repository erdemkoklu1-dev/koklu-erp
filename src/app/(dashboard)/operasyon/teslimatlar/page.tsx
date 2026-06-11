import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../_components/OperationShell'
import OperationFilters from '../_components/OperationFilters'
import { formatTRDate } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'
import { TESLIMAT_CANCELLED_STATUS_ALIASES, normalizeTeslimatStatus, quotedTeslimatStatuses } from '@/lib/teslimat-status'
import { TeslimatSilButton } from '../../teslimatlar/TeslimatSilButton'

type SearchParams = Promise<{ durum?: string; q?: string; sube?: string; baslangic?: string; bitis?: string }>

const DURUMLAR = [
  { value: 'taslak', label: 'Taslak' },
  { value: 'sevkte', label: 'Sevkte' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'iptal', label: 'İptaller' },
]
const DURUM_LABEL: Record<string, string> = {
  taslak: 'Taslak',
  sevkte: 'Sevkte',
  tamamlandi: 'Tamamlandı',
  cancelled: 'İptal',
}

function badgeClass(durum: string) {
  if (durum === 'tamamlandi') return 'bg-green-50 text-green-700 border-green-200'
  if (durum === 'sevkte') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (durum === 'cancelled') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-700 border-gray-200'
}

export default async function OperasyonTeslimatlarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const lockedSubeId = getLockedBranchId(access)
  const effectiveSube = lockedSubeId ?? params.sube
  const today = new Date().toISOString().slice(0, 10)

  let query = applyBranchScope(supabase
    .from('teslimatlar')
    .select('id, teslimat_no, teslimat_tarihi, hedef_tarih, durum, customers(id, full_name), subeler(id, ad), personeller(id, ad, soyad)')
    .order('created_at', { ascending: false })
    .limit(300), access, effectiveSube)

  if (params.durum === 'iptal') query = query.in('durum', [...TESLIMAT_CANCELLED_STATUS_ALIASES])
  else query = query.not('durum', 'in', quotedTeslimatStatuses(TESLIMAT_CANCELLED_STATUS_ALIASES))
  if (params.durum === 'bugun') query = query.eq('teslimat_tarihi', today)
  else if (params.durum && params.durum !== 'iptal') query = query.eq('durum', params.durum)
  if (params.baslangic) query = query.gte('teslimat_tarihi', params.baslangic)
  if (params.bitis) query = query.lte('teslimat_tarihi', params.bitis)
  if (params.q) query = query.or(`teslimat_no.ilike.%${params.q}%`)

  const [{ data: rows }, { data: subeler }] = await Promise.all([
    query,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
  ])
  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const displayRows: any[] = (rows ?? []).map((row: any) => ({ ...row, durum: normalizeTeslimatStatus(row.durum) }))

  const ids = (rows ?? []).map((row: any) => row.id)
  const { data: kalemRows } = ids.length > 0
    ? await supabase.from('teslimat_kalemleri').select('teslimat_id').in('teslimat_id', ids)
    : { data: [] }

  const kalemCountMap = new Map<string, number>()
  for (const kalem of kalemRows ?? []) {
    kalemCountMap.set(kalem.teslimat_id, (kalemCountMap.get(kalem.teslimat_id) ?? 0) + 1)
  }

  const summary = {
    toplam: displayRows.length,
    taslak: displayRows.filter(row => row.durum === 'taslak').length,
    sevkte: displayRows.filter(row => row.durum === 'sevkte').length,
    tamamlandi: displayRows.filter(row => row.durum === 'tamamlandi').length,
    bugun: displayRows.filter(row => row.teslimat_tarihi === today).length,
  }

  const quickFilters = [
    ['Tümü', '/operasyon/teslimatlar', summary.toplam],
    ['Bugün', '/operasyon/teslimatlar?durum=bugun', summary.bugun],
    ['Taslak', '/operasyon/teslimatlar?durum=taslak', summary.taslak],
    ['Sevkte', '/operasyon/teslimatlar?durum=sevkte', summary.sevkte],
    ['Tamamlandı', '/operasyon/teslimatlar?durum=tamamlandi', summary.tamamlandi],
  ] as const

  return (
    <OperationShell active="teslimatlar" title="Teslimat Listesi">
      <div className="space-y-5 p-6 print:p-0">
        <div className="no-print flex flex-wrap gap-2">
          {quickFilters.map(([label, href, count]) => (
            <Link key={label} href={href} className="rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-[#C8102E] hover:text-[#C8102E] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {label} <span className="ml-1 text-gray-400">{count}</span>
            </Link>
          ))}
        </div>

        <OperationFilters
          action="/operasyon/teslimatlar"
          subeler={visibleSubeler}
          values={{ ...params, sube: effectiveSube ?? undefined }}
          durumlar={DURUMLAR}
          searchPlaceholder="Teslim no ara"
          lockedSubeId={lockedSubeId}
        />

        <div className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Teslim No</th>
                <th className="px-4 py-3 text-left">Müşteri</th>
                <th className="px-4 py-3 text-left">Şube</th>
                <th className="px-4 py-3 text-left">Teslim Tarihi</th>
                <th className="px-4 py-3 text-left">Hedef Tarih</th>
                <th className="px-4 py-3 text-right">Kalem</th>
                <th className="px-4 py-3 text-left">Durum</th>
                <th className="no-print px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {displayRows.map((row: any) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono text-[#C8102E]">{row.teslimat_no}</td>
                  <td className="px-4 py-3">{row.customers?.full_name ?? '-'}</td>
                  <td className="px-4 py-3">{row.subeler?.ad ?? '-'}</td>
                  <td className="px-4 py-3">{formatTRDate(row.teslimat_tarihi)}</td>
                  <td className="px-4 py-3">{formatTRDate(row.hedef_tarih)}</td>
                  <td className="px-4 py-3 text-right">{kalemCountMap.get(row.id) ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClass(row.durum)}`}>
                      {DURUM_LABEL[row.durum] ?? row.durum}
                    </span>
                  </td>
                  <td className="no-print px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/teslimatlar/${row.id}`} className="text-[#C8102E] hover:underline">Detay</Link>
                      <TeslimatSilButton id={row.id} teslimatNo={row.teslimat_no ?? '-'} />
                    </div>
                  </td>
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    Teslimat kaydı bulunamadı. <Link href="/teslimatlar/yeni" className="text-[#C8102E] hover:underline">Yeni teslimat oluştur</Link>
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
