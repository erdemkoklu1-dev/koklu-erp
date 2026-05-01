'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, User, Sun, Moon } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'
import { useTheme } from '@/components/ThemeProvider'

interface Props {
  email: string
  userId: string
  adSoyad?: string
}

export default function TopBar({ email, userId, adSoyad }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { theme, toggle } = useTheme()

  // Giriş kaydı — component mount olduğunda bir kez
  useEffect(() => {
    fetch('/api/giris-kayit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kullanici_id: userId, email, ad_soyad: adSoyad ?? null, islem_tipi: 'giris' }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    await fetch('/api/giris-kayit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kullanici_id: userId, email, ad_soyad: adSoyad ?? null, islem_tipi: 'cikis' }),
    }).catch(() => {})
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-12 bg-white dark:bg-gray-900 border-b dark:border-gray-700 flex items-center justify-end px-4 gap-3 flex-shrink-0">
      <Link
        href="/profil"
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
      >
        <User size={14} />
        {adSoyad || email}
      </Link>

      {/* Tema toggle */}
      <button
        onClick={toggle}
        title={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      <button
        onClick={handleLogout}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 border dark:border-gray-600 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <LogOut size={14} />
        Çıkış
      </button>
    </header>
  )
}
