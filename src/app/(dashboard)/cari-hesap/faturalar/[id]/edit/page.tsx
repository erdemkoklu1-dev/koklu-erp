import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import EditFaturaClient from './EditFaturaClient'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { filterVisibleBranches } from '@/lib/auth/branch-scope'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export default async function EditFaturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ kaynak?: string }>
}) {
  const { id } = await params
  const { kaynak } = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  const [
    { data: invoice },
    { data: items },
    { data: customers },
    { data: brokersData },
    { data: invBrokers },
    { data: subelerData },
  ] = await Promise.all([
    applyTenantScope(supabase.from('invoices').select('*, customers(id, full_name, tax_number, phone, email, address, il, sube_id)').eq('id', id), tenantAccess).maybeSingle(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('line_order'),
    applyTenantScope(supabase.from('customers').select('id, full_name, tax_number, phone, email, address, il, sube_id').eq('is_active', true).order('full_name'), tenantAccess),
    applyTenantScope(supabase.from('brokers').select('id, full_name, company_name').eq('is_active', true).order('full_name'), tenantAccess),
    supabase.from('invoice_brokers').select('*, brokers(full_name, company_name)').eq('invoice_id', id),
    applyTenantScope(supabase.from('subeler').select('id, ad, sehir').eq('aktif', true).order('ad'), tenantAccess),
  ])

  if (!invoice) notFound()

  return (
    <EditFaturaClient
      invoiceId={id}
      invoice={invoice}
      initialItems={items ?? []}
      customers={customers ?? []}
      allBrokers={brokersData ?? []}
      initialBrokers={invBrokers ?? []}
      subeler={filterVisibleBranches(subelerData ?? [], access)}
      kaynak={kaynak}
    />
  )
}
