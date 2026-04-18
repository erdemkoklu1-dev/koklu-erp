import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import ProfilClient from './ProfilClient'

export default async function ProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const svc = createServiceClient()
  const { data: profil } = await svc
    .from('kullanici_profiller')
    .select('*, roller(id, ad, renk)')
    .eq('id', user.id)
    .single()

  const { data: sonGiris } = await svc
    .from('giris_kayitlari')
    .select('created_at, ip_adresi')
    .eq('kullanici_id', user.id)
    .eq('islem_tipi', 'giris')
    .order('created_at', { ascending: false })
    .limit(2) // en son 2 giriş (1. aktif oturum, 2. önceki)

  return (
    <ProfilClient
      userId={user.id}
      email={user.email ?? ''}
      profil={profil}
      sonGiris={sonGiris?.[1] ?? null}
    />
  )
}
