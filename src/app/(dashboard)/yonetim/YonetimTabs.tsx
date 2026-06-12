'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { id: 'kullanicilar', href: '/yonetim/kullanicilar', label: 'Kullanıcılar', adminOnly: true },
  { id: 'roller', href: '/yonetim/roller', label: 'Roller', adminOnly: true },
  { id: 'rol-yetkileri', href: '/yonetim/roller', label: 'Rol Yetkileri', adminOnly: true },
  { id: 'sube-yetkileri', href: '/yonetim/kullanicilar', label: 'Şube Yetkileri', adminOnly: true },
  { id: 'modul-yetkileri', href: '/yonetim/roller', label: 'Modül Yetkileri', adminOnly: true },
  { id: 'firma-ayarlari', href: '/yonetim/firma-ayarlari', label: 'Firma Ayarları', adminOnly: true },
  { id: 'sistem-ayarlari', href: '/yonetim/sistem', label: 'Sistem Ayarları', adminOnly: true },
  { id: 'teknik-ayarlari', href: '/teknik-raporlar/ayarlar', label: 'Teknik Ayarlar', adminOnly: true },
  { id: 'loglar', href: '/yonetim/kayitlar', label: 'Loglar / İşlem Geçmişi', adminOnly: true },
  { id: 'yedekleme', href: '/yonetim/yedekleme', label: 'Yedekleme', adminOnly: false },
]

export default function YonetimTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 overflow-x-auto">
      {TABS.filter(tab => isAdmin || !tab.adminOnly).map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link key={tab.id} href={tab.href}
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
