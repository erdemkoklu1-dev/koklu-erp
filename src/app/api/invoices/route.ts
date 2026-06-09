import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { EMPTY_BRANCH_ID, resolveBranchFilter } from '@/lib/auth/branch-scope'

export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, customers(full_name)')
      .order('invoice_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const invoices = (data ?? []).map((inv: any) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      total_amount: inv.total_amount,
      customer_name: inv.customers?.full_name ?? null,
    }))
    return NextResponse.json(invoices)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { invoice, items } = body

    if (!invoice) {
      return NextResponse.json({ error: 'Fatura verisi eksik' }, { status: 400 })
    }

    if (!invoice.invoice_date) {
      return NextResponse.json({ error: 'Fatura tarihi zorunludur' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const access = await getCurrentAccess()
    const branchId = resolveBranchFilter(access, invoice.sube_id)
    if (branchId === EMPTY_BRANCH_ID || !branchId) {
      return NextResponse.json({ error: 'Şube seçilmelidir' }, { status: 400 })
    }

    // Fatura numarası üret
    const year = Number(invoice.year ?? new Date().getFullYear())
    const prefix = String(invoice.prefix ?? 'KE')

    const { data: invNum, error: rpcErr } = await supabase.rpc(
      'increment_invoice_series',
      { p_prefix: prefix, p_year: year }
    )

    if (rpcErr) {
      console.error('[invoices] rpc error:', rpcErr)
      return NextResponse.json(
        { error: `Fatura numarası oluşturulamadı: ${rpcErr.message}` },
        { status: 500 }
      )
    }

    if (!invNum) {
      return NextResponse.json({ error: 'Fatura numarası boş döndü' }, { status: 500 })
    }

    const { data: createdInvoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: String(invNum),
        invoice_type: invoice.invoice_type,
        customer_id: invoice.customer_id || null,
        musteri_unvan: invoice.musteri_unvan || null,
        musteri_vergi_no: invoice.musteri_vergi_no || null,
        musteri_telefon: invoice.musteri_telefon || null,
        musteri_email: invoice.musteri_email || null,
        musteri_adres: invoice.musteri_adres || null,
        musteri_il: invoice.musteri_il || null,
        musteri_ilce: invoice.musteri_ilce || null,
        supplier_name: invoice.supplier_name || null,
        supplier_tax_no: invoice.supplier_tax_no || null,
        tedarikci_adres: invoice.tedarikci_adres || null,
        tedarikci_il: invoice.tedarikci_il || null,
        tedarikci_ilce: invoice.tedarikci_ilce || null,
        sube_id: branchId,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date || null,
        subtotal: Number(invoice.subtotal) || 0,
        kdv_rate: Number(invoice.kdv_rate) || 20,
        kdv_amount: Number(invoice.kdv_amount) || 0,
        stopaj_rate: Number(invoice.stopaj_rate) || 0,
        stopaj_amount: Number(invoice.stopaj_amount) || 0,
        total_amount: Number(invoice.total_amount) || 0,
        paid_amount: 0,
        status: 'kesildi',
        description: invoice.description || null,
        notes: invoice.notes || null,
      })
      .select('id')
      .single()

    if (invErr) {
      console.error('[invoices] insert error:', invErr)
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }

    if (!createdInvoice?.id) {
      return NextResponse.json({ error: 'Fatura ID alınamadı' }, { status: 500 })
    }

    if (items && items.length > 0) {
      const itemRows = items.map((item: any, idx: number) => ({
        invoice_id: createdInvoice.id,
        line_order: idx + 1,
        description: String(item.description || ''),
        quantity: Number(item.quantity) || 1,
        unit: String(item.unit || 'adet'),
        unit_price: Number(item.unit_price) || 0,
        kdv_rate: Number(item.kdv_rate) || 20,
      }))

      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows)
      if (itemsErr) {
        console.error('[invoices] items insert error:', itemsErr)
        await supabase.from('invoices').delete().eq('id', createdInvoice.id)
        return NextResponse.json(
          { error: `Fatura kalemleri kaydedilemedi: ${itemsErr.message}` },
          { status: 500 }
        )
      }
    }

    const { brokers } = body
    if (brokers && brokers.length > 0) {
      const brokerRows = brokers
        .filter((b: any) => b.broker_id)
        .map((b: any) => ({
          invoice_id: createdInvoice.id,
          broker_id: b.broker_id,
          commission_rate: Number(b.commission_rate) || 0,
          commission_amount: Number(b.commission_amount) || 0,
          is_paid: false,
          notes: b.notes || null,
        }))
      if (brokerRows.length > 0) {
        const { error: brokerErr } = await supabase.from('invoice_brokers').insert(brokerRows)
        if (brokerErr) {
          console.error('[invoices] brokers insert error:', brokerErr)
        }
      }
    }

    return NextResponse.json({ id: createdInvoice.id })
  } catch (err: any) {
    console.error('[invoices] unexpected error:', err)
    return NextResponse.json({ error: err.message ?? 'Beklenmeyen hata' }, { status: 500 })
  }
}
