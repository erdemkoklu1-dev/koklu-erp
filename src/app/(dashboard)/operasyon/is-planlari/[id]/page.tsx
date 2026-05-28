import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { updatePlanliIsDurumAction } from '../actions'
import OperationShell from '../../_components/OperationShell'
import { formatTRDate } from '@/lib/finance/formatters'

export default async function IsPlaniDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data: plan }, { data: isler }] = await Promise.all([
    supabase
      .from('is_planlari')
      .select('*, customers(id, full_name), subeler(ad), personeller(ad, soyad)')
      .eq('id', id)
      .single(),
    supabase
      .from('planli_isler')
      .select('*, customers(full_name), subeler(ad), personeller(ad, soyad)')
      .eq('is_plani_id', id)
      .order('sira_no'),
  ])

  if (!plan) notFound()

  const total = isler?.length ?? 0
  const bekleyen = (isler ?? []).filter(i => i.durum === 'Bekliyor').length
  const tamamlanan = (isler ?? []).filter(i => i.durum === 'Tamamlandı').length
  const iptal = (isler ?? []).filter(i => i.durum === 'İptal').length
  const today = new Date().toISOString().slice(0, 10)
  const geciken = (isler ?? []).filter(i => i.planlanan_tarih < today && !['Tamamlandı', 'İptal'].includes(i.durum)).length
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
            <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-300">Şube: {plan.subeler?.ad ?? '-'}</p>
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
            <div><span className="text-xs text-gray-500">Müşteri</span><div>{plan.customer_name_snapshot ?? plan.customers?.full_name ?? 'Genel operasyon'}</div></div>
            <div><span className="text-xs text-gray-500">Şube</span><div>{plan.subeler?.ad ?? '-'}</div></div>
            <div><span className="text-xs text-gray-500">Başlangıç</span><div>{formatTRDate(plan.baslangic_tarihi)}</div></div>
            <div><span className="text-xs text-gray-500">Bitiş</span><div>{formatTRDate(plan.bitis_tarihi)}</div></div>
            <div><span className="text-xs text-gray-500">Periyot</span><div>{plan.tekrar_tipi}</div></div>
            <div><span className="text-xs text-gray-500">Sonraki İş</span><div>{formatTRDate(plan.sonraki_is_tarihi)}</div></div>
            <div><span className="text-xs text-gray-500">Sorumlu</span><div>{plan.personeller ? `${plan.personeller.ad ?? ''} ${plan.personeller.soyad ?? ''}`.trim() : '-'}</div></div>
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
              {(isler ?? []).map((is: any) => (
                <tr key={is.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">{is.sira_no}</td>
                  <td className="px-4 py-3">{formatTRDate(is.planlanan_tarih)}</td>
                  <td className="px-4 py-3">{is.customers?.full_name ?? plan.customer_name_snapshot ?? '-'}</td>
                  <td className="px-4 py-3">{is.subeler?.ad ?? plan.subeler?.ad ?? '-'}</td>
                  <td className="px-4 py-3">{is.aciklama || is.baslik}</td>
                  <td className="px-4 py-3">{is.personeller ? `${is.personeller.ad ?? ''} ${is.personeller.soyad ?? ''}`.trim() : '-'}</td>
                  <td className="px-4 py-3">{is.durum}</td>
                  <td className="no-print px-4 py-3">
                    <form action={updatePlanliIsDurumAction} className="flex justify-end gap-2">
                      <input type="hidden" name="id" value={is.id} />
                      <input type="hidden" name="is_plani_id" value={plan.id} />
                      <select name="durum" defaultValue={is.durum} className="rounded-md border px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900">
                        {['Bekliyor', 'Sahada', 'Tamamlandı', 'Ertelendi', 'İptal', 'Gecikti'].map(v => <option key={v}>{v}</option>)}
                      </select>
                      <button className="rounded-md border border-[#C8102E] px-2 py-1 text-xs font-medium text-[#C8102E]">Kaydet</button>
                    </form>
                  </td>
                </tr>
              ))}
              {(isler ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Planlı iş bulunamadı.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </OperationShell>
  )
}
