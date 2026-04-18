import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export type PdfInvoiceItem = {
  urun_adi: string
  miktar: number
  birim: string
  birim_fiyat: number
  iskonto_orani: number
  iskonto_tutari: number
  kdv_orani: number
  kdv_tutari: number
  satir_toplam: number
}

export type PdfInvoiceRow = {
  filename: string
  fatura_no: string
  fatura_tarihi: string          // YYYY-MM-DD
  vade_tarihi?: string | null
  senaryo?: string | null
  musteri_adi: string
  musteri_vkn?: string | null
  musteri_adresi?: string | null
  kdv_matrahi?: number | null
  kdv_tutari?: number | null
  odenecek_tutar?: number | null
  kalemler: PdfInvoiceItem[]
  banka_bilgileri?: Array<{ iban: string; banka_adi?: string | null }>
}

function normalizeName(n: string): string {
  return n.toLowerCase().replace(/\s+/g, ' ').trim()
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

/** 2 yıl garanti → 6, 12, 18 ay; 4 yıl garanti → 1, 2, 3 yıl */
function calcControlDates(invoiceDate: string, expiryDate: string): [string, string, string] {
  const diffYears =
    (new Date(expiryDate).getTime() - new Date(invoiceDate).getTime()) /
    (365.25 * 24 * 60 * 60 * 1000)
  if (diffYears >= 3.5) {
    return [addYears(invoiceDate, 1), addYears(invoiceDate, 2), addYears(invoiceDate, 3)]
  }
  return [addMonths(invoiceDate, 6), addMonths(invoiceDate, 12), addMonths(invoiceDate, 18)]
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: PdfInvoiceRow[] } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Satır verisi boş' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // ── Mevcut fatura numaraları ───────────────────────────────────
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
    const existingNos = new Set((existingInvoices ?? []).map(i => i.invoice_number))

    // ── Mevcut müşteriler ─────────────────────────────────────────
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, full_name, tax_number')
    const customerByVkn  = new Map<string, string>()
    const customerByName = new Map<string, string>()
    for (const c of existingCustomers ?? []) {
      if (c.tax_number) customerByVkn.set(c.tax_number.trim(), c.id)
      customerByName.set(normalizeName(c.full_name), c.id)
    }

    const createdCustomerIds: string[] = []
    const createdInvoiceIds:  string[] = []

    const results: Array<{
      filename:     string
      fatura_no:    string
      musteri_adi:  string
      status:       'eklendi' | 'atilandi' | 'hata'
      customer_id?: string
      invoice_id?:  string
      musteri_yeni: boolean
      cihaz_sayisi: number
      error?:       string
    }> = []

    try {
      for (const row of rows) {
        // ── Duplicate kontrolü ────────────────────────────────────
        if (!row.fatura_no || existingNos.has(row.fatura_no)) {
          results.push({
            filename:     row.filename,
            fatura_no:    row.fatura_no ?? '',
            musteri_adi:  row.musteri_adi,
            status:       'atilandi',
            musteri_yeni: false,
            cihaz_sayisi: 0,
          })
          continue
        }

        // ── Müşteri bul: önce VKN, sonra isim ────────────────────
        let customerId: string | undefined
        let musteriYeni = false

        if (row.musteri_vkn) {
          customerId = customerByVkn.get(row.musteri_vkn.trim())
        }
        if (!customerId) {
          customerId = customerByName.get(normalizeName(row.musteri_adi))
        }

        // ── Yeni müşteri oluştur ──────────────────────────────────
        if (!customerId) {
          const { data: newCust, error: custErr } = await supabase
            .from('customers')
            .insert({
              full_name:  row.musteri_adi.trim(),
              type:       'company',
              tax_number: row.musteri_vkn  || null,
              address:    row.musteri_adresi || null,
              is_active:  true,
            })
            .select('id')
            .single()

          if (custErr) throw new Error(`Müşteri oluşturulamadı (${row.musteri_adi}): ${custErr.message}`)
          customerId = newCust.id as string
          createdCustomerIds.push(customerId)
          customerByName.set(normalizeName(row.musteri_adi), customerId)
          if (row.musteri_vkn) customerByVkn.set(row.musteri_vkn.trim(), customerId)
          musteriYeni = true
        }

        // ── Tutar hesapla ─────────────────────────────────────────
        const subtotal     = row.kdv_matrahi    ?? 0
        const kdv_amount   = row.kdv_tutari     ?? 0
        const total_amount = row.odenecek_tutar ?? (subtotal + kdv_amount)
        const kdv_rate     = subtotal > 0 ? Math.round(kdv_amount / subtotal * 100) : 20

        // ── Fatura oluştur ────────────────────────────────────────
        const bankaNotu = (row.banka_bilgileri ?? [])
          .map(b => b.banka_adi ? `${b.banka_adi}: ${b.iban}` : b.iban)
          .join(' | ')

        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: row.fatura_no,
            invoice_type:   'satis',
            customer_id:    customerId,
            invoice_date:   row.fatura_tarihi,
            due_date:       row.vade_tarihi   || null,
            subtotal,
            kdv_rate,
            kdv_amount,
            stopaj_rate:    0,
            stopaj_amount:  0,
            total_amount,
            paid_amount:    0,
            status:         'kesildi',
            description:    row.senaryo ? `PDF e-Fatura: ${row.senaryo}` : 'PDF e-Fatura',
            notes:          bankaNotu || null,
          })
          .select('id')
          .single()

        if (invErr) throw new Error(`Fatura oluşturulamadı (${row.fatura_no}): ${invErr.message}`)

        createdInvoiceIds.push(inv.id)
        existingNos.add(row.fatura_no)

        // ── Fatura kalemleri (invoice_items) ─────────────────────
        const validKalemler = (row.kalemler ?? []).filter(k => k.urun_adi?.trim())
        if (validKalemler.length > 0) {
          const itemRows = validKalemler.map((k, idx) => ({
            invoice_id:      inv.id,
            line_order:      idx + 1,
            description:     k.urun_adi,
            quantity:        k.miktar        || 1,
            unit:            k.birim         || 'adet',
            unit_price:      k.birim_fiyat   || 0,
            discount_rate:   k.iskonto_orani  || 0,
            discount_amount: k.iskonto_tutari || 0,
            kdv_rate:        k.kdv_orani     || 20,
            notes:           null,
          }))

          const { error: itemErr } = await supabase
            .from('invoice_items')
            .insert(itemRows)

          if (itemErr) {
            console.error(`[pdf-fatura-save] invoice_items hatası (${row.fatura_no}):`, itemErr.message)
          }
        }

        // ── Cihazlar (devices) ─────────────────────────────────────
        // Her fatura kalemi müşterinin cihazlar listesine eklenir
        let cihazSayisi = 0
        if (validKalemler.length > 0 && row.fatura_tarihi) {
          const expiryDate   = addYears(row.fatura_tarihi, 2)
          const [c1, c2, c3] = calcControlDates(row.fatura_tarihi, expiryDate)
          const now          = Date.now()

          const deviceRows = validKalemler.map((k, idx) => ({
            customer_id:        customerId as string,
            custom_device_name: k.urun_adi,
            brand:              null,
            capacity:           null,
            quantity:           Math.max(1, Math.round(k.miktar || 1)),
            serial_number:      null,
            invoice_date:       row.fatura_tarihi,
            last_fill_date:     row.fatura_tarihi,
            expiry_date:        expiryDate,
            control1_date:      c1,
            control2_date:      c2,
            control3_date:      c3,
            is_active:          true,
            qr_code:            `KOKLU-${(customerId as string).slice(0, 8)}-${now}-${idx}`,
          }))

          const { error: devErr } = await supabase
            .from('devices')
            .insert(deviceRows)

          if (devErr) {
            console.error(`[pdf-fatura-save] devices hatası (${row.fatura_no}):`, devErr.message)
          } else {
            cihazSayisi = deviceRows.length
          }
        }

        results.push({
          filename:     row.filename,
          fatura_no:    row.fatura_no,
          musteri_adi:  row.musteri_adi,
          status:       'eklendi',
          customer_id:  customerId,
          invoice_id:   inv.id,
          musteri_yeni: musteriYeni,
          cihaz_sayisi: cihazSayisi,
        })
      }
    } catch (err: unknown) {
      // Rollback
      if (createdInvoiceIds.length > 0) {
        await supabase.from('invoices').delete().in('id', createdInvoiceIds)
      }
      if (createdCustomerIds.length > 0) {
        await supabase.from('customers').delete().in('id', createdCustomerIds)
      }
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const eklendi     = results.filter(r => r.status === 'eklendi').length
    const atilandi    = results.filter(r => r.status === 'atilandi').length
    const yeniMusteri = results.filter(r => r.musteri_yeni).length
    const toplamCihaz = results.reduce((s, r) => s + r.cihaz_sayisi, 0)

    return NextResponse.json({ results, eklendi, atilandi, yeniMusteri, toplamCihaz })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
