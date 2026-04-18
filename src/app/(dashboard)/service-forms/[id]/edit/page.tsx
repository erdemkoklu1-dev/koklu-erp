import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditServiceFormClient from './EditServiceFormClient'

export default async function EditServiceFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: sf } = await supabase
    .from('service_forms')
    .select('*, customers(full_name)')
    .eq('id', id)
    .single()

  if (!sf) notFound()

  const { data: items } = await supabase
    .from('service_form_items')
    .select('*')
    .eq('service_form_id', id)

  return (
    <EditServiceFormClient
      id={id}
      initialForm={{
        technician_name: sf.technician_name ?? '',
        service_date: sf.service_date ?? '',
        control_number: sf.control_number ?? '',
        general_notes: sf.general_notes ?? '',
        customer_note: sf.customer_note ?? '',
        next_service_date: sf.next_service_date ?? '',
      }}
      initialItems={(items ?? []).map((i: any) => ({
        id: i.id,
        device_name: i.device_name ?? '',
        serial_number: i.serial_number ?? '',
        quantity: i.quantity ?? 1,
        body_status: i.body_status ?? 'SAĞLAM',
        valve_status: i.valve_status ?? 'SAĞLAM',
        hose_status: i.hose_status ?? 'SAĞLAM',
        gauge_status: i.gauge_status ?? 'SAĞLAM',
        notes: i.notes ?? '',
      }))}
      customerName={(sf.customers as any)?.full_name ?? ''}
    />
  )
}
