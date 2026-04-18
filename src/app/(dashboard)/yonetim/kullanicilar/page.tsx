import { createServiceClient } from '@/lib/supabase/service'
import KullanicilarClient from './KullanicilarClient'

export default async function KullanicilarPage() {
  const supabase = createServiceClient()

  const { data: roller } = await supabase
    .from('roller')
    .select('id, ad, renk')
    .order('ad')

  return <KullanicilarClient roller={roller ?? []} />
}
