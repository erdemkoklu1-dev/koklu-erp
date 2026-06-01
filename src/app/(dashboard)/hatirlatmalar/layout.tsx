import HatirlatmaTabs from './HatirlatmaTabs'
import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function HatirlatmalarLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('reminders')
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700 flex flex-col">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4">
        <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">Hatırlatmalar</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Müşterilere bakım ve SKT hatırlatması gönderin</p>
      </div>
      <HatirlatmaTabs />
      <div className="flex-1">{children}</div>
    </div>
  )
}
