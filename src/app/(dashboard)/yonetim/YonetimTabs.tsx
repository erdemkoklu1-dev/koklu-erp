'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/yonetim/kullanicilar', label: 'Kullanicilar', adminOnly: true },
  { href: '/yonetim/roller', label: 'Roller & Izinler', adminOnly: true },
  { href: '/yonetim/kayitlar', label: 'Giris/Cikis Kayitlari', adminOnly: true },
  { href: '/yonetim/sistem', label: 'Sistem Durumu', adminOnly: true },
  { href: '/yonetim/yedekleme', label: 'Yedekleme', adminOnly: false },
]

export default function YonetimTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto">
      {TABS.filter(tab => isAdmin || !tab.adminOnly).map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href}
            className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-[#C8102E] text-[#C8102E]'
                : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 hover:border-gray-300'
            }`}>
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
