import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Sidebar, { type SidebarPermissionSet } from './Sidebar'
import TopBar from './TopBar'
import { isAdminRole } from '@/lib/auth/authorization'

function isBackupManagerRole(role: string | null | undefined) {
  return role === 'Yönetici' || role === 'Yonetici'
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const email = user.email ?? ''
  const svc = createServiceClient()
  const { data: profil } = await svc
    .from('kullanici_profiller')
    .select('ad_soyad, rol_id, roller(ad)')
    .eq('id', user.id)
    .single()

  const role = (profil?.roller as { ad?: string } | null)?.ad ?? null
  const isAdmin = !profil || isAdminRole(role)
  const isBackupManager = isAdmin || isBackupManagerRole(role)
  let modulIzinleri: Record<string, boolean> = {}

  if (!isAdmin && profil?.rol_id) {
    const { data: izinler } = await svc
      .from('modul_izinleri')
      .select('modul_adi, okuma')
      .eq('rol_id', profil.rol_id)

    modulIzinleri = Object.fromEntries((izinler ?? []).map(row => [row.modul_adi, row.okuma === true]))
  }

  const sidebarPermissionSet: SidebarPermissionSet = {
    isAdmin,
    isBackupManager,
    modulIzinleri,
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 print:block print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Sidebar permissionSet={sidebarPermissionSet} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 print:block print:overflow-visible">
        <div className="print:hidden">
          <TopBar email={email} userId={user.id} adSoyad={profil?.ad_soyad ?? undefined} />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  )
}
