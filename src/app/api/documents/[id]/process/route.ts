import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { invoice_id, amount, payment_date, method, reference_no } = body

    if (!invoice_id || !amount || !payment_date) {
      return NextResponse.json({ error: 'invoice_id, amount ve payment_date zorunlu' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (!doc) return NextResponse.json({ error: 'Belge bulunamadı' }, { status: 404 })
    if (doc.processed) return NextResponse.json({ error: 'Bu belge zaten işlendi' }, { status: 400 })

    // Faturanın var olduğunu kontrol et
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount, status')
      .eq('id', invoice_id)
      .single()

    if (!invoice) return NextResponse.json({ error: 'Fatura bulunamadı' }, { status: 404 })

    // Ödeme kaydı oluştur
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        invoice_id,
        direction: 'tahsilat',
        method: method ?? 'havale_eft',
        amount: parseFloat(amount),
        payment_date,
        reference_no: reference_no || null,
        notes: `Dekont: ${doc.file_name}`,
      })
      .select()
      .single()

    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

    // Belgeyi işlenmiş olarak işaretle
    await supabase
      .from('documents')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        payment_id: payment.id,
        invoice_id,
        amount: parseFloat(amount),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, payment_id: payment.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Beklenmeyen hata' }, { status: 500 })
  }
}
