import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import EditSubeClient from './EditSubeClient'

export default async function SubeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: sube } = await supabase.from('subeler').select('*').eq('id', id).single()
  if (!sube) notFound()
  return <EditSubeClient sube={sube as any} />
}
