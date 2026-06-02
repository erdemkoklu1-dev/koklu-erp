import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../_components/OperationShell'
import OperationFilters from '../_components/OperationFilters'
import { formatTRDate } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'

type SearchParams = Promise<{ durum?: string; oncelik?: string; geciken?: string; hedef?: string; q?: string; sube?: string; baslangic?: string; bitis?: string }>

const DURUMLAR = ['Yeni', 'İşleme Alındı', 'Planlandı', 'Sahada', 'Beklemede', 'Tamamlandı', 'İptal']

const DURUM_BADGE: Record<string, string> = {
  Yeni: 'bg-blue-50 text-blue-700 border-blue-200',
  'İşleme Alındı': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Planlandı: 'bg-purple-50 text-purple-700 border-purple-200',
  Sahada: 'bg-orange-50 text-orange-700 border-orange-200',
  Beklemede: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Tamamlandı: 'bg-green-50 text-green-700 border-green-200',
  İptal: 'bg-red-50 text-red-700 border-red-200',
}

type TalepRow = {
  id: string
  talep_no: string | null
  customer_name_snapshot: string | null
  cihaz_name_snapshot: string | null
  baslik: string | null
  aciklama: string | null
  kategori: string | null
  oncelik: string | null
  durum: string
  talep_tarihi: string | null
  hedef_tarih: string | null
  subeler: { ad: string | null } | { ad: string | null }[] | null
  personeller: { ad: string | null; soyad: string | null } | { ad: string | null; soyad: string | null }[] | null
}

function relationOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value
}

function withSube(href: string, subeId?: string | null) {
  if (!subeId) return href
  return `${href}${href.includes('?') ? '&' : '?'}sube=${encodeURIComponent(subeId)}`
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
    .select('id, talep_no, customer_name_snapshot, cihaz_name_snapshot, baslik, aciklama, kategori, oncelik, durum, talep_tarihi, hedef_tarih, subeler(ad), personeller(ad, soyad)')
    .order('created_at', { ascending: false })
    .limit(200)

  query = applyBranchScope(query, access, effectiveSube)
  if (params.durum) query = query.eq('durum', params.durum)
  if (params.oncelik) query = query.eq('oncelik', params.oncelik)
  if (params.baslangic) query = query.gte('talep_tarihi', params.baslangic)
  if (params.bitis) query = query.lte('talep_tarihi', params.bitis)
  if (params.hedef === 'bugun') query = query.eq('hedef_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')
  if (params.geciken === '1') query = query.lt('hedef_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')
  if (params.q) query = query.or(`baslik.ilike.%${params.q}%,talep_no.ilike.%${params.q}%,customer_name_snapshot.ilike.%${params.q}%`)

  const scopedCount = <T,>(baseQuery: T) => applyBranchScope(baseQuery, access, effectiveSube) as T

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
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('durum', 'Yeni')),
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('durum', 'İşleme Alındı')),
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('oncelik', 'Acil').not('durum', 'in', '("Tamamlandı","İptal")')),
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('durum', 'Beklemede')),
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('hedef_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')),
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).lt('hedef_tarih', today).not('durum', 'in', '("Tamamlandı","İptal")')),
    scopedCount(supabase.from('musteri_talepleri').select('*', { count: 'exact', head: true }).eq('durum', 'Tamamlandı')),
  ])

  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const talepRows = (rows ?? []) as TalepRow[]
  const cards = [
    ['Yeni Talepler', yeni ?? 0, withSube('/operasyon/talepler?durum=Yeni', effectiveSube)],
    ['İşleme Alınanlar', islemeAlinan ?? 0, withSube('/operasyon/talepler?durum=İşleme Alındı', effectiveSube)],
    ['Acil Talepler', acil ?? 0, withSube('/operasyon/talepler?oncelik=Acil', effectiveSube)],
    ['Bekleyenler', bekleyen ?? 0, withSube('/operasyon/talepler?durum=Beklemede', effectiveSube)],
    ['Bugün Çözülecekler', bugun ?? 0, withSube('/operasyon/talepler?hedef=bugun', effectiveSube)],
    ['Gecikenler', geciken ?? 0, withSube('/operasyon/talepler?geciken=1', effectiveSube)],
    ['Tamamlananlar', tamamlanan ?? 0, withSube('/operasyon/talepler?durum=Tamamlandı', effectiveSube)],
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
          durumlar={DURUMLAR}
          searchPlaceholder="Müşteri, talep no veya başlık ara"
          lockedSubeId={lockedSubeId}
        />

        <div className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="min-w-full divide-y text-sm dark:divide-gray-700">
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
                const sube = relationOne(row.subeler)
                const personel = relationOne(row.personeller)
                return (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono text-[#C8102E]">{row.talep_no}</td>
                  <td className="px-4 py-3">{row.customer_name_snapshot ?? '-'}</td>
                  <td className="px-4 py-3">{sube?.ad ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.baslik}</div>
                    <div className="max-w-xs truncate text-xs text-gray-500">{row.aciklama}</div>
                  </td>
                  <td className="px-4 py-3">{row.kategori}</td>
                  <td className="px-4 py-3">{row.oncelik}</td>
                  <td className="px-4 py-3">{formatTRDate(row.talep_tarihi)}</td>
                  <td className="px-4 py-3">{formatTRDate(row.hedef_tarih)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${DURUM_BADGE[row.durum] ?? 'bg-gray-50 text-gray-700 border-gray-200'}`}>{row.durum}</span></td>
                  <td className="px-4 py-3">{personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() : '-'}</td>
                  <td className="no-print px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/operasyon/talepler/${row.id}`} className="text-[#C8102E] hover:underline">Detay</Link>
                    </div>
                  </td>
                </tr>
                )
              })}
              {talepRows.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-500">Talep bulunamadı. <Link href="/operasyon/talepler/yeni" className="text-[#C8102E] hover:underline">Yeni talep oluştur</Link></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </OperationShell>
  )
}
