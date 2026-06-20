import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import DuzenleTeklifClient from './DuzenleTeklifClient'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export default async function TeklifDuzenlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  const [{ data: teklif }, { data: kalemler }] = await Promise.all([
    applyTenantScope(supabase.from('teklifler').select('*').eq('id', id), tenantAccess).maybeSingle(),
    applyTenantScope(supabase.from('teklif_kalemleri').select('*').eq('teklif_id', id).order('sira_no'), tenantAccess),
  ])

  if (!teklif) notFound()

  return <DuzenleTeklifClient teklif={teklif} kalemlerData={kalemler ?? []} />
}
