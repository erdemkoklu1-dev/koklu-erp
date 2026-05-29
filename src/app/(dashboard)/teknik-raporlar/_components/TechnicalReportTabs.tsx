import Link from 'next/link'

const tabs = [
  ['/teknik-raporlar', 'Raporlar'],
  ['/teknik-raporlar/yeni', 'Yeni Teknik Rapor'],
  ['/teknik-raporlar/alarm-hesabi', 'Yangın Alarm Hesabı'],
  ['/teknik-raporlar/genel-ihtiyac', 'Genel İhtiyaç Raporu'],
  ['/teknik-raporlar/oda-sizdirmazlik', 'Oda Sızdırmazlık Testi'],
  ['/teknik-raporlar/ayarlar', 'Teknik Ayarlar'],
] as const

export default function TechnicalReportTabs({ active }: { active: string }) {
  return (
    <div className="no-print overflow-x-auto border-b bg-white dark:border-gray-700 dark:bg-gray-800">
      <nav className="flex min-w-max gap-1 px-6">
        {tabs.map(([href, label]) => {
          const selected = active === href
          return (
            <Link
              key={href}
              href={href}
              className={`border-b-2 px-3 py-3 text-sm font-medium ${
                selected
                  ? 'border-[#C8102E] text-[#C8102E]'
                  : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
