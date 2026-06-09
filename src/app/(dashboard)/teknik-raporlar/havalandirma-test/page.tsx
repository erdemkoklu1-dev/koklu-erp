import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TechnicalReportForm from '../_components/TechnicalReportForm'
import TechnicalReportTabs from '../_components/TechnicalReportTabs'

export default async function HavalandirmaTestPage() {
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
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Havalandırma Test Raporu</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Giriş/çıkış beş nokta hız ölçümü, kesit alanı, debi ve kayıp oranı hesabı.</p>
      </div>
      <TechnicalReportTabs active="/teknik-raporlar/havalandirma-test" />
      <main className="p-6">
        <TechnicalReportForm initialType="havalandirma_test_raporu" customers={customers ?? []} subeler={subeler ?? []} personeller={personeller ?? []} settings={settings ?? []} />
      </main>
    </div>
  )
}
