import { requireBackupPageAccess } from '@/lib/backup/authorization'
import YonetimTabs from './YonetimTabs'

export default async function YonetimLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireBackupPageAccess()
  const isAdmin = user.role === 'Admin'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Yönetim Paneli</h1>
      </div>

      <div className="bg-white dark:bg-gray-800 border-b px-6">
        <YonetimTabs isAdmin={isAdmin} />
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  )
}
