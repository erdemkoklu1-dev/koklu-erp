import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintButton from '@/components/PrintButton'
import type { TechnicalReportRow } from '@/lib/technical-reports/types'
import TechnicalReportPrintView from '../../_components/TechnicalReportPrintView'

export default async function PrintTechnicalReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('teknik_raporlar')
    .select('*, customers(full_name, address), subeler(ad), personeller(ad, soyad)')
    .eq('id', id)
    .single()
  if (!data) notFound()
  const report = data as TechnicalReportRow
  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Link href={`/teknik-raporlar/${report.id}`} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">← Rapora Dön</Link>
          <Link href="/teknik-raporlar" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">← Listeye Dön</Link>
        </div>
        <PrintButton />
      </div>
      <div className="no-print mx-auto mb-4 max-w-5xl rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-800">
        PDF çıktısında tarayıcı üstbilgi/altbilgi görünürse yazdırma ayarlarından “Üstbilgi ve altbilgi” seçeneğini kapatın.
      </div>
      <TechnicalReportPrintView report={report} />
    </div>
  )
}
