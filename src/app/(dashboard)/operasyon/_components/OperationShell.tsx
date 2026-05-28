import Link from 'next/link'
import OperationPrintButton from './OperationPrintButton'

type TabKey = 'ozet' | 'teslimatlar' | 'talepler' | 'is-planlari'

const tabs: { key: TabKey; label: string; href: string }[] = [
  { key: 'ozet', label: 'Operasyon Özeti', href: '/operasyon' },
  { key: 'teslimatlar', label: 'Teslimatlar', href: '/operasyon/teslimatlar' },
  { key: 'talepler', label: 'Talepler', href: '/operasyon/talepler' },
  { key: 'is-planlari', label: 'İş Planları', href: '/operasyon/is-planlari' },
]

type Props = {
  active: TabKey
  title?: string
  children: React.ReactNode
}

export default function OperationShell({ active, title, children }: Props) {
  const printTitle = title ?? tabs.find(tab => tab.key === active)?.label ?? 'Operasyon'

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-900">
      <div className="print-header hidden">
        KÖKLÜ ERP - {printTitle} - Yazdırma Tarihi: {new Date().toLocaleDateString('tr-TR')}
      </div>

      <div className="no-print border-b bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Operasyon</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Teslimat, talep ve iş planı süreçlerini tek merkezden yönetin.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/teslimatlar/yeni" className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                Yeni Teslimat
              </Link>
              <Link href="/operasyon/talepler/yeni" className="rounded-md border border-[#C8102E] px-3 py-2 text-sm font-medium text-[#C8102E] hover:bg-red-50">
                Yeni Talep
              </Link>
              <Link href="/operasyon/is-planlari/yeni" className="rounded-md bg-[#C8102E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#a00d25]">
                Yeni İş Planı
              </Link>
              <OperationPrintButton />
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto border-b dark:border-gray-700">
            {tabs.map(tab => {
              const isActive = tab.key === active
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-[#C8102E] text-[#C8102E]'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="print-title mb-4 hidden print:block">
        <h1 className="text-lg font-bold">{printTitle}</h1>
        <p className="text-xs text-gray-600">KÖKLÜ ERP operasyon çıktısı</p>
      </div>

      {children}
    </div>
  )
}
