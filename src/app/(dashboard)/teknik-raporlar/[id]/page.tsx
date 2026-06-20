import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTR, personName } from '@/lib/technical-reports/report-utils'
import { REPORT_TYPE_LABELS, type TechnicalReportRow } from '@/lib/technical-reports/types'
import TechnicalReportPrintView from '../_components/TechnicalReportPrintView'
import TechnicalReportActions from '../_components/TechnicalReportActions'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export default async function TechnicalReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  const [{ data }, { data: customers }, { data: subeler }] = await Promise.all([
    applyTenantScope(supabase
      .from('teknik_raporlar')
      .select('*, customers(full_name, address), subeler(ad), personeller(ad, soyad)')
      .eq('id', id), tenantAccess)
      .maybeSingle(),
    applyTenantScope(supabase.from('customers').select('id, full_name').order('full_name'), tenantAccess),
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
  ])
  if (!data) notFound()
  const report = data as TechnicalReportRow

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-700 print:bg-white print:p-0">
      <div className="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/teknik-raporlar" className="mb-2 inline-block text-sm font-medium text-gray-600 hover:text-[#C8102E] dark:text-gray-300">← Raporlara Dön</Link>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{report.baslik}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{report.rapor_no} · {REPORT_TYPE_LABELS[report.rapor_turu]}</p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Link href={`/teknik-raporlar/${report.id}/duzenle`} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600">Düzenle</Link>
            <Link href={`/teknik-raporlar/${report.id}/yazdir`} className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white">Yazdır</Link>
            <TechnicalReportActions
              report={report}
              customers={(customers ?? []).map(customer => ({ id: customer.id, label: customer.full_name ?? '-' }))}
              subeler={(subeler ?? []).map(sube => ({ id: sube.id, label: sube.ad ?? '-' }))}
            />
          </div>
        </div>
      </div>
      <section className="no-print mb-5 grid grid-cols-2 gap-3 rounded-lg border bg-white p-4 text-sm md:grid-cols-4 dark:border-gray-700 dark:bg-gray-800">
        <Info label="Rapor No" value={report.rapor_no} />
        <Info label="Müşteri" value={report.customer_name_snapshot} />
        <Info label="Şube" value={report.subeler?.ad} />
        <Info label="Lokasyon" value={report.lokasyon} />
        <Info label="Rapor Tarihi" value={formatDateTR(report.rapor_tarihi)} />
        <Info label="Hazırlayan" value={personName(report.personeller)} />
        <Info label="Durum" value={report.durum} />
        <Info label="Standart Profili" value={report.standart_profili} />
      </section>
      <TechnicalReportPrintView report={report} />
    </div>
  )
}

function Info({ label, value }: { label: string; value: any }) {
  return <div><div className="text-xs text-gray-500">{label}</div><div className="font-medium text-gray-900 dark:text-gray-100">{value || '-'}</div></div>
}
