import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const email = user.email ?? ''

  // Profil bilgisi (ad_soyad için)
  const svc = createServiceClient()
  const { data: profil } = await svc
    .from('kullanici_profiller')
    .select('ad_soyad')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 print:block print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Sidebar />
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
