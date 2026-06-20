import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

export async function POST(req: NextRequest) {
  try {
    const {
      invoice_id, amount, payment_date, method,
      reference_no, notes,
      mahsup_tarihi, mahsup_aciklama,
    } = await req.json()

    if (!invoice_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Geçersiz parametre' }, { status: 400 })
    }

    const isMahsup = method === 'vergi_mahsup'

    if (isMahsup && !mahsup_tarihi) {
      return NextResponse.json({ error: 'Mahsup tarihi zorunludur' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const firmaId = await requireCurrentFirmaId()
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, firma_id')
      .eq('id', invoice_id)
      .maybeSingle()
    if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
    if (!invoice) return NextResponse.json({ error: 'Fatura bulunamadı' }, { status: 404 })
    if (invoice.firma_id !== firmaId) {
      return NextResponse.json({ error: 'Seçilen fatura kullanıcının firmasına ait değil.' }, { status: 403 })
    }

    // Ödeme kaydı ekle
    // NOT: paid_amount ve status, DB trigger (trg_payment_sync_invoice) tarafından
    // payments INSERT/UPDATE/DELETE sonrası otomatik güncellenir.
    // Burada elle güncelleme yapmak çift sayıma yol açar.
    const { error: payErr } = await supabase.from('payments').insert([{
      invoice_id,
      direction: 'tahsilat',
      method: method ?? 'havale_eft',
      amount,
      payment_date: isMahsup ? mahsup_tarihi : payment_date,
      reference_no: reference_no ?? null,
      notes: isMahsup ? (mahsup_aciklama ?? null) : (notes ?? null),
      firma_id: firmaId,
    }])

    if (payErr) {
      return NextResponse.json({ error: payErr.message }, { status: 500 })
    }

    // Mahsup alanları trigger kapsamında değil, sadece bunları güncelle
    if (isMahsup) {
      const { error: updateErr } = await supabase
        .from('invoices')
        .update({
          mahsup_durumu: 'vergi_mahsup',
          mahsup_tarihi: mahsup_tarihi,
          mahsup_aciklama: mahsup_aciklama ?? null,
        })
        .eq('id', invoice_id)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
