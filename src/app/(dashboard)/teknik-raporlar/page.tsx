import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PrintButton from '@/components/PrintButton'
import { formatDateTR, personName } from '@/lib/technical-reports/report-utils'
import { REPORT_TYPE_LABELS, type TechnicalReportRow, type TechnicalReportType } from '@/lib/technical-reports/types'
import TechnicalReportTabs from './_components/TechnicalReportTabs'

type SearchParams = Promise<{ q?: string; tur?: TechnicalReportType; sube?: string; durum?: string; from?: string; to?: string }>

export default async function TechnicalReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createClient()
  let query = supabase
    .from('teknik_raporlar')
    .select('*, customers(full_name), subeler(ad), personeller(ad, soyad)')
    .order('created_at', { ascending: false })

  if (params.tur) query = query.eq('rapor_turu', params.tur)
  if (params.sube) query = query.eq('sube_id', params.sube)
  if (params.durum) query = query.eq('durum', params.durum)
  if (params.from) query = query.gte('rapor_tarihi', params.from)
  if (params.to) query = query.lte('rapor_tarihi', params.to)
  if (params.q) query = query.or(`rapor_no.ilike.%${params.q}%,baslik.ilike.%${params.q}%,customer_name_snapshot.ilike.%${params.q}%`)

  const [{ data: rows }, { data: subeler }] = await Promise.all([
    query,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
  ])
  const reports = (rows ?? []) as TechnicalReportRow[]
  const now = new Date()
  const thisMonth = reports.filter(r => new Date(r.created_at).getMonth() === now.getMonth() && new Date(r.created_at).getFullYear() === now.getFullYear()).length
  const countBy = (fn: (row: TechnicalReportRow) => boolean) => reports.filter(fn).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div>Teknik Hesap & Raporlar · {new Date().toLocaleString('tr-TR')}</div>
      </div>
      <div className="no-print border-b bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Teknik Hesap & Raporlar</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Yangın sistemleri için teknik hesap, keşif, ihtiyaç listesi ve rapor çıktıları.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/teknik-raporlar/yeni" className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a50d26]">Yeni Teknik Rapor</Link>
            <PrintButton />
            <Link href="/teknik-raporlar" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600">PDF Arşivi / Raporlar</Link>
          </div>
        </div>
      </div>
      <TechnicalReportTabs active="/teknik-raporlar" />

      <main className="p-6 space-y-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat title="Toplam Rapor" value={reports.length} />
          <Stat title="Bu Ay Oluşturulan" value={thisMonth} />
          <Stat title="Taslak Raporlar" value={countBy(r => r.durum === 'Taslak')} />
          <Stat title="Teklife Aktarılanlar" value={countBy(r => r.durum === 'Teklife Aktarıldı')} />
          <Stat title="Oda Sızdırmazlık Testleri" value={countBy(r => r.rapor_turu === 'oda_sizdirmazlik_testi')} />
          <Stat title="Alarm Hesapları" value={countBy(r => r.rapor_turu === 'yangin_alarm_ihtiyac')} />
        </section>

        <form className="no-print grid grid-cols-1 gap-3 rounded-lg border bg-white p-4 md:grid-cols-6 dark:border-gray-700 dark:bg-gray-800">
          <input name="q" defaultValue={params.q ?? ''} placeholder="Müşteri, rapor no veya başlık ara" className="rounded-md border px-3 py-2 text-sm md:col-span-2 dark:border-gray-600" />
          <select name="tur" defaultValue={params.tur ?? ''} className="rounded-md border px-3 py-2 text-sm dark:border-gray-600">
            <option value="">Tüm Rapor Türleri</option>
            {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select name="sube" defaultValue={params.sube ?? ''} className="rounded-md border px-3 py-2 text-sm dark:border-gray-600">
            <option value="">Tüm Şubeler</option>
            {(subeler ?? []).map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
          <select name="durum" defaultValue={params.durum ?? ''} className="rounded-md border px-3 py-2 text-sm dark:border-gray-600">
            <option value="">Tüm Durumlar</option>
            {['Taslak','Hesaplandı','Onaylandı','Teklife Aktarıldı','İptal'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900">Filtrele</button>
        </form>

        <section className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left">Rapor No</th>
                  <th className="px-4 py-3 text-left">Rapor Türü</th>
                  <th className="px-4 py-3 text-left">Müşteri</th>
                  <th className="px-4 py-3 text-left">Şube</th>
                  <th className="px-4 py-3 text-left">Başlık</th>
                  <th className="px-4 py-3 text-left">Rapor Tarihi</th>
                  <th className="px-4 py-3 text-left">Hazırlayan</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                  <th className="px-4 py-3 text-right">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {reports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 font-medium">{report.rapor_no}</td>
                    <td className="px-4 py-3">{REPORT_TYPE_LABELS[report.rapor_turu]}</td>
                    <td className="px-4 py-3">{report.customer_name_snapshot}</td>
                    <td className="px-4 py-3">{report.subeler?.ad ?? '-'}</td>
                    <td className="px-4 py-3">{report.baslik}</td>
                    <td className="px-4 py-3">{formatDateTR(report.rapor_tarihi)}</td>
                    <td className="px-4 py-3">{personName(report.personeller)}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{report.durum}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/teknik-raporlar/${report.id}`} className="text-[#C8102E] hover:underline">Detay</Link>
                        <Link href={`/teknik-raporlar/${report.id}/duzenle`} className="text-gray-600 hover:underline">Düzenle</Link>
                        <Link href={`/teknik-raporlar/${report.id}/yazdir`} className="text-gray-600 hover:underline">Yazdır</Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">Teknik rapor bulunamadı.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{title}</div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}
