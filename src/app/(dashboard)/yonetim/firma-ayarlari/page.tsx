import { requireAdminPageAccess } from '@/lib/backup/authorization'
import { getCompanyStampSettings } from '@/lib/company-stamp'
import CompanyStampSettingsClient from './CompanyStampSettingsClient'

export default async function FirmaAyarlariPage() {
  await requireAdminPageAccess()
  const stampSettings = await getCompanyStampSettings()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Firma Ayarları</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Firma çıktılarında kullanılacak genel görsel ve onay ayarlarını yönetin.
        </p>
      </div>
      <CompanyStampSettingsClient settings={stampSettings} />
    </div>
  )
}
