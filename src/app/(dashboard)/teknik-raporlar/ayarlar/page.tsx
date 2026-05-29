import { createClient } from '@/lib/supabase/server'
import TechnicalReportTabs from '../_components/TechnicalReportTabs'

export default async function TechnicalSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase
    .from('teknik_hesap_ayarlari')
    .select('*')
    .order('ayar_grubu')
    .order('ayar_adi')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="no-print border-b bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Teknik Ayarlar</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Hesap parametreleri bu tabloda yönetilebilir veri olarak tutulur.</p>
      </div>
      <TechnicalReportTabs active="/teknik-raporlar/ayarlar" />
      <main className="p-6">
        <div className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              <tr><th className="px-4 py-3 text-left">Grup</th><th className="px-4 py-3 text-left">Ayar</th><th className="px-4 py-3 text-left">Değer</th><th className="px-4 py-3 text-left">Birim</th><th className="px-4 py-3 text-left">Açıklama</th></tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {(settings ?? []).map((s: any) => <tr key={s.id}><td className="px-4 py-3">{s.ayar_grubu}</td><td className="px-4 py-3">{s.ayar_adi}</td><td className="px-4 py-3">{s.ayar_degeri}</td><td className="px-4 py-3">{s.birim ?? '-'}</td><td className="px-4 py-3">{s.aciklama}</td></tr>)}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
