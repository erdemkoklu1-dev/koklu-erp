import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import YonetimTabs from './YonetimTabs'

export default async function YonetimLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin kontrolü
  const svc = createServiceClient()
  const { data: profil } = await svc
    .from('kullanici_profiller')
    .select('roller(ad)')
    .eq('id', user.id)
    .single()

  if ((profil?.roller as any)?.ad !== 'Admin') redirect('/yetkisiz')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <h1 className="text-lg font-bold text-gray-900">Yönetim Paneli</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <YonetimTabs />
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  )
}
