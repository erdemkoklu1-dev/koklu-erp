'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/hatirlatmalar/ozet',     label: 'Özet / Dashboard'     },
  { href: '/hatirlatmalar/kurallar', label: 'Hatırlatma Kuralları' },
  { href: '/hatirlatmalar/sablonlar', label: 'Mesaj Şablonları'   },
  { href: '/hatirlatmalar/gecmis',   label: 'Gönderim Geçmişi'    },
  { href: '/hatirlatmalar/ayarlar',  label: 'Entegrasyon Ayarları' },
]

export default function HatirlatmaTabs() {
  const pathname = usePathname()
  return (
    <div className="bg-white border-b px-6">
      <nav className="flex gap-1 -mb-px overflow-x-auto">
        {TABS.map(t => {
          const active = pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? 'border-[#C8102E] text-[#C8102E]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
