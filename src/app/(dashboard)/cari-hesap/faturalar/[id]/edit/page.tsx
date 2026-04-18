import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import EditFaturaClient from './EditFaturaClient'

export default async function EditFaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: invoice },
    { data: items },
    { data: customers },
    { data: brokersData },
    { data: invBrokers },
  ] = await Promise.all([
    supabase.from('invoices').select('*, customers(id, full_name, tax_number)').eq('id', id).single(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('line_order'),
    supabase.from('customers').select('id, full_name, tax_number').eq('is_active', true).order('full_name'),
    supabase.from('brokers').select('id, full_name, company_name').eq('is_active', true).order('full_name'),
    supabase.from('invoice_brokers').select('*, brokers(full_name, company_name)').eq('invoice_id', id),
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
    />
  )
}
