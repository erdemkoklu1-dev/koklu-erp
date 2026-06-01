import { createServiceClient } from '@/lib/supabase/service'
import { requireAdminPageAccess } from '@/lib/backup/authorization'
import KullanicilarClient from './KullanicilarClient'

export default async function KullanicilarPage() {
  await requireAdminPageAccess()
  const supabase = createServiceClient()

  const { data: roller } = await supabase
    .from('roller')
    .select('id, ad, renk')
    .order('ad')

  const { data: subeler } = await supabase
    .from('subeler')
    .select('id, ad')
    .eq('aktif', true)
    .order('ad')

  return <KullanicilarClient roller={roller ?? []} subeler={subeler ?? []} />
}
