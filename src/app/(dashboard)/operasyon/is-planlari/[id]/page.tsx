import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { updatePlanliIsDurumAction } from '../actions'
import OperationShell from '../../_components/OperationShell'
import { formatTRDate } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope } from '@/lib/auth/branch-scope'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

type Relation<T> = T | T[] | null

type PlanliIsRow = {
  id: string
  sira_no: number | null
  baslik: string | null
  aciklama: string | null
  planlanan_tarih: string | null
  durum: string
  customers: Relation<{ full_name?: string | null }>
  subeler: Relation<{ ad?: string | null }>
  personeller: Relation<{ ad?: string | null; soyad?: string | null }>
}

function relationOne<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] ?? null : value
}

export default async function IsPlaniDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  let planQuery = applyTenantScope(supabase
    .from('is_planlari')
    .select('*, customers(id, full_name), subeler(ad), personeller(ad, soyad)')
    .eq('id', id), tenantAccess)
  planQuery = applyBranchScope(planQuery, access)

  let islerQuery = applyTenantScope(supabase
    .from('planli_isler')
    .select('*, customers(full_name), subeler(ad), personeller(ad, soyad)')
    .eq('is_plani_id', id)
    .order('sira_no'), tenantAccess)
  islerQuery = applyBranchScope(islerQuery, access)

  const [{ data: plan }, { data: isler }] = await Promise.all([
    planQuery.single(),
    islerQuery,
  ])

  if (!plan) notFound()

  const planCustomer = relationOne(plan.customers as Relation<{ full_name?: string | null }>)
  const planSube = relationOne(plan.subeler as Relation<{ ad?: string | null }>)
  const planPersonel = relationOne(plan.personeller as Relation<{ ad?: string | null; soyad?: string | null }>)
  const isRows = (isler ?? []) as PlanliIsRow[]

  const total = isRows.length
  const bekleyen = isRows.filter(row => row.durum === 'Bekliyor').length
  const tamamlanan = isRows.filter(row => row.durum === 'Tamamlandı').length
  const iptal = isRows.filter(row => row.durum === 'İptal').length
  const today = new Date().toISOString().slice(0, 10)
  const geciken = isRows.filter(row => row.planlanan_tarih && row.planlanan_tarih < today && !['Tamamlandı', 'İptal'].includes(row.durum)).length
  const progress = total > 0 ? Math.round((tamamlanan / total) * 100) : 0

  const cards = [
    ['Toplam İş', total],
    ['Bekleyen', bekleyen],
    ['Tamamlanan', tamamlanan],
    ['İptal', iptal],
    ['Geciken', geciken],
  ] as const

  return (
    <OperationShell active="is-planlari" title={`İş Planı Detayı - ${plan.plan_no}`}>
      <div className="space-y-5 p-6 print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/operasyon/is-planlari" className="no-print text-sm text-gray-500 hover:text-gray-700">← İş Planları</Link>
            <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">{plan.baslik}</h1>
            <p className="font-mono text-sm text-[#C8102E]">{plan.plan_no}</p>
            <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">Şube: {planSube?.ad ?? '-'}</p>
          </div>
          <span className="rounded-full border bg-gray-50 px-3 py-1 text-sm text-gray-700">{plan.durum}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-xs text-gray-500">Müşteri</span><div>{plan.customer_name_snapshot ?? planCustomer?.full_name ?? 'Genel operasyon'}</div></div>
            <div><span className="text-xs text-gray-500">Şube</span><div>{planSube?.ad ?? '-'}</div></div>
            <div><span className="text-xs text-gray-500">Başlangıç</span><div>{formatTRDate(plan.baslangic_tarihi)}</div></div>
            <div><span className="text-xs text-gray-500">Bitiş</span><div>{formatTRDate(plan.bitis_tarihi)}</div></div>
            <div><span className="text-xs text-gray-500">Periyot</span><div>{plan.tekrar_tipi}</div></div>
            <div><span className="text-xs text-gray-500">Sonraki İş</span><div>{formatTRDate(plan.sonraki_is_tarihi)}</div></div>
            <div><span className="text-xs text-gray-500">Sorumlu</span><div>{planPersonel ? `${planPersonel.ad ?? ''} ${planPersonel.soyad ?? ''}`.trim() : '-'}</div></div>
            <div><span className="text-xs text-gray-500">Plan Türü</span><div>{plan.plan_turu}</div></div>
          </div>
          <div className="mt-5">
            <div className="mb-1 flex justify-between text-xs text-gray-500"><span>Genel ilerleme</span><span>{progress}%</span></div>
            <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-[#C8102E]" style={{ width: `${progress}%` }} /></div>
          </div>
          {plan.aciklama && <p className="mt-4 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">{plan.aciklama}</p>}
        </section>

        <section className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b p-4 dark:border-gray-700">
            <h2 className="font-semibold">Planlı İşler</h2>
          </div>
          <table className="min-w-full divide-y text-sm dark:divide-gray-700">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Sıra No</th>
                <th className="px-4 py-3 text-left">Planlanan Tarih</th>
                <th className="px-4 py-3 text-left">Müşteri</th>
                <th className="px-4 py-3 text-left">Şube</th>
                <th className="px-4 py-3 text-left">Görev Açıklaması</th>
                <th className="px-4 py-3 text-left">Atanan Personel</th>
                <th className="px-4 py-3 text-left">Durum</th>
                <th className="no-print px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {isRows.map(row => {
                const customer = relationOne(row.customers)
                const sube = relationOne(row.subeler)
                const personel = relationOne(row.personeller)
                return (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">{row.sira_no}</td>
                    <td className="px-4 py-3">{formatTRDate(row.planlanan_tarih)}</td>
                    <td className="px-4 py-3">{customer?.full_name ?? plan.customer_name_snapshot ?? '-'}</td>
                    <td className="px-4 py-3">{sube?.ad ?? planSube?.ad ?? '-'}</td>
                    <td className="px-4 py-3">{row.aciklama || row.baslik}</td>
                    <td className="px-4 py-3">{personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() : '-'}</td>
                    <td className="px-4 py-3">{row.durum}</td>
                    <td className="no-print px-4 py-3">
                      <form action={updatePlanliIsDurumAction} className="flex justify-end gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="is_plani_id" value={plan.id} />
                        <select name="durum" defaultValue={row.durum} className="rounded-md border px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900">
                          {['Bekliyor', 'Sahada', 'Tamamlandı', 'Ertelendi', 'İptal', 'Gecikti'].map(value => <option key={value}>{value}</option>)}
                        </select>
                        <button className="rounded-md border border-[#C8102E] px-2 py-1 text-xs font-medium text-[#C8102E]">Kaydet</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
              {isRows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Planlı iş bulunamadı.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </OperationShell>
  )
}
