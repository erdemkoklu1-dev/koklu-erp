'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

export type UpdateInvoiceResult =
  | { success: true }
  | { success: false; error: string }

interface ItemUpdate {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  kdv_rate: number
}

interface ItemInsert {
  line_order: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  kdv_rate: number
}

interface BrokerUpdate {
  id: string
  commission_rate: number
  commission_amount: number
}

interface BrokerInsert {
  broker_id: string
  commission_rate: number
  commission_amount: number
}

interface InvoiceData {
  invoice_type: string
  customer_id: string | null
  supplier_name: string | null
  supplier_tax_no: string | null
  invoice_date: string
  due_date: string | null
  subtotal: number
  kdv_amount: number
  stopaj_rate: number
  stopaj_amount: number
  total_amount: number
  description: string | null
  notes: string | null
  sube_id: string | null
}

export async function updateInvoiceAction(
  invoiceId: string,
  invoiceData: InvoiceData,
  itemsToDelete: string[],
  itemsToUpdate: ItemUpdate[],
  itemsToInsert: ItemInsert[],
  brokersToDelete: string[],
  brokersToUpdate: BrokerUpdate[],
  brokersToInsert: BrokerInsert[]
): Promise<UpdateInvoiceResult> {
  const supabase = createServiceClient()

  const { error: invErr } = await supabase
    .from('invoices')
    .update(invoiceData)
    .eq('id', invoiceId)

  if (invErr) {
    console.error('[updateInvoiceAction] invoices update hatası:', invErr)
    const schemaMismatch = /schema cache|column|could not find/i.test(invErr.message)
    return {
      success: false,
      error: schemaMismatch
        ? 'Fatura güncellenemedi. Kayıt alanları ile veritabanı şeması arasında uyumsuzluk var.'
        : invErr.message,
    }
  }

  for (const id of itemsToDelete) {
    const { error } = await supabase.from('invoice_items').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
  }

  for (const item of itemsToUpdate) {
    const { error } = await supabase.from('invoice_items').update({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      kdv_rate: item.kdv_rate,
    }).eq('id', item.id)
    if (error) return { success: false, error: error.message }
  }

  if (itemsToInsert.length > 0) {
    const { error } = await supabase.from('invoice_items').insert(
      itemsToInsert.map(item => ({ invoice_id: invoiceId, ...item }))
    )
    if (error) return { success: false, error: error.message }
  }

  for (const id of brokersToDelete) {
    const { error } = await supabase.from('invoice_brokers').delete().eq('id', id)
    if (error) return { success: false, error: error.message }
  }

  for (const b of brokersToUpdate) {
    const { error } = await supabase.from('invoice_brokers').update({
      commission_rate: b.commission_rate,
      commission_amount: b.commission_amount,
    }).eq('id', b.id)
    if (error) return { success: false, error: error.message }
  }

  if (brokersToInsert.length > 0) {
    const { error } = await supabase.from('invoice_brokers').insert(
      brokersToInsert.map(b => ({
        invoice_id: invoiceId,
        broker_id: b.broker_id,
        commission_rate: b.commission_rate,
        commission_amount: b.commission_amount,
        is_paid: false,
      }))
    )
    if (error) return { success: false, error: error.message }
  }

  revalidatePath('/cari-hesap/gelen-faturalar')
  revalidatePath('/cari-hesap/giden-faturalar')
  revalidatePath('/cari-hesap/faturalar')
  revalidatePath(`/cari-hesap/faturalar/${invoiceId}`)
  revalidatePath(`/cari-hesap/faturalar/${invoiceId}/edit`)

  return { success: true }
}
