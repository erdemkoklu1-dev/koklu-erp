import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TechnicalReportForm from '../_components/TechnicalReportForm'
import TechnicalReportTabs from '../_components/TechnicalReportTabs'

export default async function OdaSizdirmazlikPage() {
  const supabase = await createClient()
  const [{ data: customers }, { data: subeler }, { data: personeller }, { data: settings }] = await Promise.all([
    supabase.from('customers').select('id, full_name, address, sube_id').eq('is_active', true).order('full_name'),
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    supabase.from('personeller').select('id, ad, soyad').eq('durum', 'aktif').order('ad'),
    supabase.from('teknik_hesap_ayarlari').select('ayar_grubu, ayar_adi, ayar_degeri, birim').eq('aktif', true),
  ])
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="no-print border-b bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <Link href="/teknik-raporlar" className="mb-2 inline-block text-sm font-medium text-gray-600 hover:text-[#C8102E] dark:text-gray-300">← Raporlara Dön</Link>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Oda Sızdırmazlık Testi</h1>
      </div>
      <TechnicalReportTabs active="/teknik-raporlar/oda-sizdirmazlik" />
      <main className="p-6"><TechnicalReportForm initialType="oda_sizdirmazlik_testi" customers={customers ?? []} subeler={subeler ?? []} personeller={personeller ?? []} settings={settings ?? []} /></main>
    </div>
  )
}
