import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export type ImportRow = {
  alici_adi: string
  fatura_no: string
  fatura_tarihi: string   // YYYY-MM-DD
  senaryo: string         // TICARIFATURA | TEMELFATURA
  durum: string
  tutar: number
}

function normalizeCustomerName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

function mapStatus(durum: string): string {
  const d = durum.toLowerCase()
  if (d.includes('kabul')) return 'odendi'
  if (d.includes('gönderildi') || d.includes('gonderildi')) return 'gonderildi'
  return 'kesildi'
}

function calcAmounts(tutar: number, senaryo: string) {
  const KDV = 20
  // TEMELFATURA = KDV dahil fiyat → total = tutar, subtotal = tutar/1.20
  // TICARIFATURA = KDV hariç fiyat → subtotal = tutar, total = tutar * 1.20
  if (senaryo === 'TEMELFATURA') {
    const subtotal = Math.round((tutar / 1.20) * 100) / 100
    const kdv_amount = Math.round((tutar - subtotal) * 100) / 100
    return { subtotal, kdv_rate: KDV, kdv_amount, total_amount: tutar }
  } else {
    // TICARIFATURA
    const kdv_amount = Math.round(tutar * (KDV / 100) * 100) / 100
    const total_amount = Math.round((tutar + kdv_amount) * 100) / 100
    return { subtotal: tutar, kdv_rate: KDV, kdv_amount, total_amount }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: ImportRow[] } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Satır verisi boş' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Mevcut fatura numaralarını çek
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
    const existingNos = new Set((existingInvoices ?? []).map(i => i.invoice_number))

    // Mevcut müşterileri çek
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, full_name')
    const customerMap = new Map<string, string>() // normalizedName → id
    for (const c of existingCustomers ?? []) {
      customerMap.set(normalizeCustomerName(c.full_name), c.id)
    }

    const createdCustomerIds: string[] = []
    const createdInvoiceIds: string[] = []

    const results: Array<{
      fatura_no: string
      alici_adi: string
      status: 'eklendi' | 'atilandi' | 'hata'
      customer_id?: string
      invoice_id?: string
      error?: string
      musteri_yeni: boolean
    }> = []

    try {
      for (const row of rows) {
        // Duplicate kontrolü
        if (existingNos.has(row.fatura_no)) {
          results.push({ fatura_no: row.fatura_no, alici_adi: row.alici_adi, status: 'atilandi', musteri_yeni: false })
          continue
        }

        // Müşteri bul veya oluştur
        const normalizedName = normalizeCustomerName(row.alici_adi)
        let customerId = customerMap.get(normalizedName)
        let musteriYeni = false

        if (!customerId) {
          const { data: newCustomer, error: custErr } = await supabase
            .from('customers')
            .insert({
              full_name: row.alici_adi.trim(),
              type: 'company',
              is_active: true,
            })
            .select('id')
            .single()

          if (custErr) throw new Error(`Müşteri oluşturulamadı (${row.alici_adi}): ${custErr.message}`)
          customerId = newCustomer!.id as string
          createdCustomerIds.push(customerId as string)
          customerMap.set(normalizedName, customerId as string)
          musteriYeni = true
        }

        // Fatura oluştur
        const { subtotal, kdv_rate, kdv_amount, total_amount } = calcAmounts(row.tutar, row.senaryo)
        const status = mapStatus(row.durum)

        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: row.fatura_no,
            invoice_type:   'satis',
            customer_id:    customerId,
            invoice_date:   row.fatura_tarihi,
            subtotal,
            kdv_rate,
            kdv_amount,
            stopaj_rate:    0,
            stopaj_amount:  0,
            total_amount,
            paid_amount:    0,
            status,
            description:    `e-Fatura: ${row.senaryo}`,
            notes:          `Durum: ${row.durum}`,
          })
          .select('id')
          .single()

        if (invErr) throw new Error(`Fatura oluşturulamadı (${row.fatura_no}): ${invErr.message}`)

        createdInvoiceIds.push(inv.id)
        existingNos.add(row.fatura_no) // Aynı dosyada duplicate önleme
        results.push({
          fatura_no: row.fatura_no,
          alici_adi: row.alici_adi,
          status: 'eklendi',
          customer_id: customerId,
          invoice_id: inv.id,
          musteri_yeni: musteriYeni,
        })
      }
    } catch (err: any) {
      // Rollback: oluşturulanları sil
      if (createdInvoiceIds.length > 0) {
        await supabase.from('invoices').delete().in('id', createdInvoiceIds)
      }
      if (createdCustomerIds.length > 0) {
        await supabase.from('customers').delete().in('id', createdCustomerIds)
      }
      return NextResponse.json({ error: err.message }, { status: 500 })
    }

    const eklendi  = results.filter(r => r.status === 'eklendi').length
    const atilandi = results.filter(r => r.status === 'atilandi').length
    const yeniMusteri = results.filter(r => r.musteri_yeni).length

    return NextResponse.json({ results, eklendi, atilandi, yeniMusteri })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
