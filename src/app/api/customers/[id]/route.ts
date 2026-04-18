import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID eksik' }, { status: 400 })

    const supabase = createServiceClient()

    // Önce müşteriye ait fatura ID'lerini çek
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('customer_id', id)
    const invoiceIds = (invoices ?? []).map(i => i.id)

    // Faturalara bağlı alt tabloları temizle
    if (invoiceIds.length > 0) {
      await supabase.from('invoice_brokers').delete().in('invoice_id', invoiceIds)
      await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds)
      await supabase.from('payments').delete().in('invoice_id', invoiceIds)
      await supabase.from('invoices').delete().in('id', invoiceIds)
    }

    // Diğer bağlı tablolar
    await supabase.from('devices').delete().eq('customer_id', id)
    await supabase.from('on_kayitlar').delete().eq('customer_id', id)

    // Müşteriyi sil
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
