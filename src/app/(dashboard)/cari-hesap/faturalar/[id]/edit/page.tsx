import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import EditFaturaClient from './EditFaturaClient'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { filterVisibleBranches } from '@/lib/auth/branch-scope'

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

  const [
    { data: invoice },
    { data: items },
    { data: customers },
    { data: brokersData },
    { data: invBrokers },
    { data: subelerData },
  ] = await Promise.all([
    supabase.from('invoices').select('*, customers(id, full_name, tax_number, phone, email, address, il, sube_id)').eq('id', id).single(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('line_order'),
    supabase.from('customers').select('id, full_name, tax_number, phone, email, address, il, sube_id').eq('is_active', true).order('full_name'),
    supabase.from('brokers').select('id, full_name, company_name').eq('is_active', true).order('full_name'),
    supabase.from('invoice_brokers').select('*, brokers(full_name, company_name)').eq('invoice_id', id),
    supabase.from('subeler').select('id, ad, sehir').eq('aktif', true).order('ad'),
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
