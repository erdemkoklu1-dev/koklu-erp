import { createClient } from '@/lib/supabase/server'
import { ventilationDefaultSettings } from '@/lib/technical-reports/ventilation-test-calculator'
import { defaultHydraulicSettings } from '@/lib/technical-reports/water-hydraulic-calculator'
import { waterSystemDefaultSettingRows } from '@/lib/technical-reports/water-system-calculator'
import TechnicalReportTabs from '../_components/TechnicalReportTabs'
import TechnicalSettingsTable from './TechnicalSettingsTable'

export default async function TechnicalSettingsPage() {
  const supabase = await createClient()
  const defaults = [
    ...waterSystemDefaultSettingRows.map(([ayar_adi, ayar_degeri, birim, aciklama]) => ({
    ayar_grubu: 'yangin_sulu_sistem',
    ayar_adi,
    ayar_degeri,
    birim,
    aciklama,
    aktif: true,
    })),
    ...defaultHydraulicSettings.map(setting => ({
      ayar_grubu: setting.group,
      ayar_adi: setting.key,
      ayar_degeri: setting.value,
      birim: setting.unit,
      aciklama: setting.description,
      aktif: true,
    })),
    ...ventilationDefaultSettings.map(([ayar_adi, ayar_degeri, birim, aciklama]) => ({
      ayar_grubu: 'havalandirma_test',
      ayar_adi,
      ayar_degeri,
      birim,
      aciklama,
      aktif: true,
    })),
  ]
  const { error: upsertError } = await supabase
    .from('teknik_hesap_ayarlari')
    .upsert(defaults, { onConflict: 'ayar_grubu,ayar_adi', ignoreDuplicates: true })

  if (upsertError) console.error('[teknik-ayarlar] default water settings upsert failed', upsertError)

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
        <TechnicalSettingsTable settings={(settings ?? []) as any} />
      </main>
    </div>
  )
}
