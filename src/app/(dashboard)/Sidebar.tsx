'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  BarChart2,
  Bell,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ClipboardList,
  Factory,
  FileDown,
  FileInput,
  FileText,
  FileUp,
  Handshake,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
  UserSquare2,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { moduleKeysWithAliases } from '@/lib/auth/modules'

type NavItem = { href: string; label: string; icon: LucideIcon; modul?: string; adminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Anasayfa', icon: LayoutDashboard },
  { href: '/customers', label: 'Müşteriler', icon: Users, modul: 'customers' },
  { href: '/cihazlar', label: 'Cihazlar', icon: Shield, modul: 'devices' },
  { href: '/service-forms', label: 'Servis Formları', icon: ClipboardList, modul: 'service_forms' },
  { href: '/fabrika', label: 'Fabrika', icon: Factory, modul: 'factory' },
  { href: '/operasyon', label: 'Operasyon', icon: BriefcaseBusiness, modul: 'operations' },
  { href: '/teknik-raporlar', label: 'Teknik Hesap & Raporlar', icon: Calculator, modul: 'technical_reports' },
  { href: '/hatirlatmalar', label: 'Hatırlatmalar', icon: Bell, modul: 'reminders' },
  { href: '/fiyat-teklifleri', label: 'Fiyat Teklifleri', icon: FileText, modul: 'price_offers' },
  { href: '/fiyat-teklifleri/proforma', label: 'Proforma Fatura', icon: FileText, modul: 'proforma_invoices' },
  { href: '/cari-hesap', label: 'Cari Hesap', icon: Wallet, modul: 'current_account' },
  { href: '/araclar', label: 'Aracılar', icon: Handshake, modul: 'agents' },
  { href: '/subeler', label: 'Şubeler', icon: Building2, modul: 'branches' },
  { href: '/personel', label: 'Personel', icon: UserSquare2, modul: 'personnel' },
  { href: '/invoice-import', label: 'Müşteri İçe Aktar', icon: FileUp, modul: 'customer_import' },
  { href: '/cari-hesap/fatura-import', label: 'Fatura Yükle', icon: FileDown, modul: 'invoice_import' },
  { href: '/cari-hesap/giden-faturalar', label: 'Giden Faturalar', icon: FileUp, modul: 'outgoing_invoices' },
  { href: '/cari-hesap/gelen-faturalar', label: 'Gelen Faturalar', icon: FileInput, modul: 'incoming_invoices' },
  { href: '/cari-hesap/gecikis', label: 'Gecikmiş Borçlar', icon: AlertTriangle, modul: 'current_account' },
  { href: '/cari-hesap/gider-raporu', label: 'Gider Raporu', icon: BarChart2, modul: 'current_account' },
  { href: '/yonetim', label: 'Yönetim', icon: Settings, modul: 'management', adminOnly: true },
]

const CACHE_KEY = 'koklu_sidebar_perms_v2'
const CACHE_TTL = 5 * 60 * 1000

type PermsCache = {
  isAdmin: boolean
  isBackupManager?: boolean
  modulIzinleri: Record<string, boolean>
  ts: number
}

function readCache(): PermsCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed: PermsCache = JSON.parse(raw)
    if (Date.now() - parsed.ts > CACHE_TTL) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(data: Omit<PermsCache, 'ts'>) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }))
  } catch {}
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className={`flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium transition-colors ${active ? 'bg-[#C8102E] text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}`}>
      <item.icon size={20} className="flex-shrink-0" />
      <span className="sidebar-label">{item.label}</span>
    </Link>
  )
}

function NavSkeleton() {
  return (
    <div className="animate-pulse space-y-0.5 px-3 py-3">
      {[...Array(6)].map((_, i) => <div key={i} className="h-11 rounded-lg bg-gray-100 dark:bg-gray-700" />)}
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [isBackupManager, setIsBackupManager] = useState(false)
  const [modulIzinleri, setModulIzinleri] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setIsAdmin(cached.isAdmin)
      setIsBackupManager(cached.isBackupManager ?? false)
      setModulIzinleri(cached.modulIzinleri)
      setLoading(false)
      return
    }

    const supabase = createClient()
    let cancelled = false

    async function loadPermissions() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        const { data: profil } = await supabase.from('kullanici_profiller').select('rol_id, roller(ad)').eq('id', user.id).single()
        if (cancelled) return

        if (!profil) {
          setIsAdmin(true)
          setIsBackupManager(true)
          writeCache({ isAdmin: true, isBackupManager: true, modulIzinleri: {} })
          return
        }

        const rolAd = (profil.roller as { ad?: string } | null)?.ad
        if (rolAd === 'Admin' || rolAd === 'Super Admin' || rolAd === 'Genel Admin') {
          setIsAdmin(true)
          setIsBackupManager(true)
          writeCache({ isAdmin: true, isBackupManager: true, modulIzinleri: {} })
          return
        }

        setIsAdmin(false)
        const canBackup = rolAd === 'Yönetici' || rolAd === 'Yonetici'
        setIsBackupManager(canBackup)

        if (profil.rol_id) {
          const { data: izinler } = await supabase.from('modul_izinleri').select('modul_adi, okuma').eq('rol_id', profil.rol_id)
          if (!cancelled) {
            const map: Record<string, boolean> = {}
            for (const iz of izinler ?? []) map[iz.modul_adi] = iz.okuma
            setModulIzinleri(map)
            writeCache({ isAdmin: false, isBackupManager: canBackup, modulIzinleri: map })
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPermissions()
    return () => { cancelled = true }
  }, [])

  function canSee(item: NavItem): boolean {
    if (!item.modul) return true
    if (loading) return false
    if (isAdmin) return true
    if (item.href === '/yonetim' && isBackupManager) return true
    if (item.adminOnly) return false
    return moduleKeysWithAliases(item.modul).some(key => modulIzinleri[key] === true)
  }

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-3 border-b px-5 py-5 dark:border-gray-700">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#C8102E] text-base font-bold text-white shadow-sm">K</div>
        <div className="sidebar-logo-text">
          <p className="text-base font-bold leading-tight tracking-wide text-gray-900 dark:text-white">KÖKLÜ ERP</p>
          <p className="mt-0.5 text-xs leading-tight text-gray-400 dark:text-gray-500">Yangın Yönetim</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto">
        {loading ? <NavSkeleton /> : (
          <div className="space-y-0.5 px-3 py-3">
            {NAV_ITEMS.filter(canSee).map(item => {
              const active = item.href === '/dashboard' ? pathname === '/dashboard' : item.href === '/operasyon' ? pathname.startsWith('/operasyon') : pathname.startsWith(item.href)
              return <NavLink key={item.href} item={item} active={active} />
            })}
          </div>
        )}
      </nav>
    </aside>
  )
}
