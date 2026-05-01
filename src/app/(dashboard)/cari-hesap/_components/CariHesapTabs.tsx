'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/cari-hesap/mali-durum',       label: 'Mali Durum'      },
  { href: '/cari-hesap/faturalar',        label: 'Faturalar'       },
  { href: '/cari-hesap/giden-faturalar',  label: 'Giden Faturalar' },
  { href: '/cari-hesap/gelen-faturalar',  label: 'Gelen Faturalar' },
  { href: '/cari-hesap/gecikis',          label: 'Gecikmiş'        },
  { href: '/cari-hesap/on-kayitlar',      label: 'Ön Kayıtlar'     },
  { href: '/cari-hesap/musteri-cari',     label: 'Müşteri Cari'    },
  { href: '/cari-hesap/tedarikciler',     label: 'Tedarikçiler'    },
  { href: '/cari-hesap/belgeler',         label: 'Belgeler'        },
  { href: '/cari-hesap/gelir-gider',      label: 'Gelir / Gider'   },
  { href: '/cari-hesap/sabit-giderler',   label: 'Sabit Giderler'  },
  { href: '/cari-hesap/maaslar',          label: 'Maaşlar'         },
  { href: '/cari-hesap/vergi',            label: 'Vergi Takvimi'   },
  { href: '/cari-hesap/fatura-import',    label: 'e-Fatura Import' },
]

export default function CariHesapTabs() {
  const pathname = usePathname()
  return (
    <div className="bg-white dark:bg-gray-800 border-b px-6">
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
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 hover:border-gray-300'
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
