'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Shield, ClipboardList, FileUp, Wallet,
  Handshake, FileDown, FileInput, AlertTriangle, BarChart2, FileText,
  Bell, Factory, Settings, Building2, UserSquare2, BriefcaseBusiness
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type NavItem = { href: string; label: string; icon: LucideIcon; modul?: string; adminOnly?: boolean }

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',                  label: 'Anasayfa',          icon: LayoutDashboard },
  { href: '/customers',                  label: 'Müşteriler',        icon: Users,         modul: 'musteriler' },
  { href: '/cihazlar',                   label: 'Cihazlar',          icon: Shield,        modul: 'cihazlar' },
  { href: '/service-forms',              label: 'Servis Formları',   icon: ClipboardList, modul: 'servis_formlari' },
  { href: '/fabrika',                    label: 'Fabrika',           icon: Factory,       modul: 'fabrika' },
  { href: '/operasyon',                  label: 'Operasyon',         icon: BriefcaseBusiness },
  { href: '/hatirlatmalar',              label: 'Hatırlatmalar',     icon: Bell,          modul: 'hatirlatmalar' },
  { href: '/fiyat-teklifleri',           label: 'Fiyat Teklifleri',  icon: FileText,      modul: 'fiyat_teklifleri' },
  { href: '/fiyat-teklifleri/proforma',  label: 'Proforma Fatura',   icon: FileText,      modul: 'fiyat_teklifleri' },
  { href: '/cari-hesap',                 label: 'Cari Hesap',        icon: Wallet,        modul: 'cari_hesap' },
  { href: '/araclar',                    label: 'Aracılar',          icon: Handshake,     modul: 'aracilar' },
  { href: '/subeler',                    label: 'Şubeler',           icon: Building2,     modul: 'subeler' },
  { href: '/personel',                   label: 'Personel',          icon: UserSquare2,   modul: 'personel' },
  { href: '/invoice-import',             label: 'Müşteri İçe Aktar', icon: FileUp,        modul: 'musteriler' },
  { href: '/cari-hesap/fatura-import',   label: 'Fatura Yükle',      icon: FileDown,      modul: 'faturalar' },
  { href: '/cari-hesap/giden-faturalar', label: 'Giden Faturalar',   icon: FileUp,        modul: 'faturalar' },
  { href: '/cari-hesap/gelen-faturalar', label: 'Gelen Faturalar',   icon: FileInput,     modul: 'faturalar' },
  { href: '/cari-hesap/gecikis',         label: 'Gecikmiş Borçlar',  icon: AlertTriangle, modul: 'cari_hesap' },
  { href: '/cari-hesap/gider-raporu',    label: 'Gider Raporu',      icon: BarChart2,     modul: 'cari_hesap' },
  { href: '/yonetim',                    label: 'Yönetim',           icon: Settings,      modul: 'yonetim', adminOnly: true },
]

const CACHE_KEY = 'koklu_sidebar_perms_v1'
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
  } catch { /* sessionStorage dolu olabilir */ }
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
        active
          ? 'bg-[#C8102E] text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
      }`}
    >
      <item.icon size={20} className="flex-shrink-0" />
      <span className="sidebar-label">{item.label}</span>
    </Link>
  )
}

function NavSkeleton() {
  return (
    <div className="space-y-0.5 px-3 py-3 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-11 bg-gray-100 dark:bg-gray-700 rounded-lg" />
      ))}
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

        const { data: profil } = await supabase
          .from('kullanici_profiller')
          .select('rol_id, roller(ad)')
          .eq('id', user.id)
          .single()

        if (cancelled) return

        if (!profil) {
          setIsAdmin(true)
          setIsBackupManager(true)
          writeCache({ isAdmin: true, isBackupManager: true, modulIzinleri: {} })
          setLoading(false)
          return
        }

        const rolAd = (profil.roller as { ad?: string } | null)?.ad
        if (rolAd === 'Admin') {
          setIsAdmin(true)
          setIsBackupManager(true)
          writeCache({ isAdmin: true, isBackupManager: true, modulIzinleri: {} })
          setLoading(false)
          return
        }

        setIsAdmin(false)
        const canBackup = rolAd === 'Yonetici' || rolAd === 'Yönetici'
        setIsBackupManager(canBackup)

        if (profil.rol_id) {
          const { data: izinler } = await supabase
            .from('modul_izinleri')
            .select('modul_adi, okuma')
            .eq('rol_id', profil.rol_id)

          if (!cancelled) {
            const map: Record<string, boolean> = {}
            for (const iz of izinler ?? []) map[iz.modul_adi] = iz.okuma
            setModulIzinleri(map)
            writeCache({ isAdmin: false, isBackupManager: canBackup, modulIzinleri: map })
          }
        }
      } catch {
        // Hata olursa varsayılan gösterim devam eder.
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
    return modulIzinleri[item.modul] === true
  }

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex-shrink-0 flex flex-col h-full">
      <div className="px-5 py-5 border-b dark:border-gray-700 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#C8102E] rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm">
          K
        </div>
        <div className="sidebar-logo-text">
          <p className="font-bold text-gray-900 dark:text-white text-base leading-tight tracking-wide">KÖKLÜ ERP</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 leading-tight mt-0.5">Yangın Yönetim</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto">
        {loading ? (
          <NavSkeleton />
        ) : (
          <div className="px-3 py-3 space-y-0.5">
            {NAV_ITEMS.filter(canSee).map(item => {
              const active =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : item.href === '/operasyon'
                    ? pathname.startsWith('/operasyon')
                    : pathname.startsWith(item.href)

              return <NavLink key={item.href} item={item} active={active} />
            })}
          </div>
        )}
      </nav>
    </aside>
  )
}
