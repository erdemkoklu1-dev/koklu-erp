import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const { payments, payment_date, method, reference_no, notes } = await req.json()

    if (!Array.isArray(payments) || payments.length === 0 || !payment_date || !method) {
      return NextResponse.json({ error: 'Eksik parametre' }, { status: 400 })
    }

    const supabase = createServiceClient()
    let eklendi = 0
    let toplam = 0
    const hatalar: string[] = []

    for (const p of payments) {
      if (!p.invoice_id || !p.amount || p.amount <= 0) continue

      const { error } = await supabase.from('payments').insert({
        invoice_id:  p.invoice_id,
        direction:   'tahsilat',
        method:      method,
        amount:      p.amount,
        payment_date,
        reference_no: reference_no ?? null,
        notes:        notes ?? null,
      })

      if (error) {
        hatalar.push(`${p.invoice_id}: ${error.message}`)
      } else {
        eklendi++
        toplam += p.amount
      }
    }

    if (eklendi === 0) {
      return NextResponse.json({ error: hatalar[0] ?? 'Kayıt başarısız' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, eklendi, toplam, hatalar })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
