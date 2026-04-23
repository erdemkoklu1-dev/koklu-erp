import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import PersonelDuzenleClient from './PersonelDuzenleClient'

export const dynamic = 'force-dynamic'

export default async function PersonelDuzenlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: personel }, { data: subeler }, { data: roller }] = await Promise.all([
    supabase.from('personeller').select('*').eq('id', id).single(),
    supabase.from('subeler').select('id, ad').order('ad'),
    supabase.from('roller').select('id, ad').order('ad'),
  ])

  if (!personel) notFound()

  return <PersonelDuzenleClient personel={personel as any} subeler={subeler ?? []} roller={roller ?? []} />
}
