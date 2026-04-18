import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import DuzenleTeklifClient from './DuzenleTeklifClient'

export default async function TeklifDuzenlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: teklif }, { data: kalemler }] = await Promise.all([
    supabase.from('teklifler').select('*').eq('id', id).single(),
    supabase.from('teklif_kalemleri').select('*').eq('teklif_id', id).order('sira_no'),
  ])

  if (!teklif) notFound()

  return <DuzenleTeklifClient teklif={teklif} kalemlerData={kalemler ?? []} />
}
