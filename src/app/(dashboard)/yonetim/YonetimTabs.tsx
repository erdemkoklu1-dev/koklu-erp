'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/yonetim/kullanicilar', label: '👥 Kullanıcılar' },
  { href: '/yonetim/roller',       label: '🔑 Roller & İzinler' },
  { href: '/yonetim/kayitlar',     label: '📋 Giriş/Çıkış Kayıtları' },
  { href: '/yonetim/sistem',       label: '📊 Sistem Durumu' },
]

export default function YonetimTabs() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1">
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
