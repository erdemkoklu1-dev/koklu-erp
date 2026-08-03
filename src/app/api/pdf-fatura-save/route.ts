import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { assertBranchBelongsToFirma, assertCustomerBelongsToFirma, requireCurrentTenantActor } from '@/lib/auth/tenant-scope'
import { matchCustomerForImport, normalizeCustomerTaxNo } from '@/lib/customer-matching'
import { importInvoiceAtomically } from '@/lib/invoice-import/atomic-service'

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
  fatura_tarihi: string | null   // YYYY-MM-DD — null ise DB'ye null yazılır
  vade_tarihi?: string | null
  senaryo?: string | null
  musteri_adi: string
  musteri_vkn?: string | null
  musteri_adresi?: string | null
  musteri_il?: string | null
  musteri_ilce?: string | null
  kdv_matrahi?: number | null
  kdv_tutari?: number | null
  odenecek_tutar?: number | null
  kalemler: PdfInvoiceItem[]
  banka_bilgileri?: Array<{ iban: string; banka_adi?: string | null }>
  sube_id?: string | null
  customer_id?: string | null
  force_new_customer?: boolean
}

function normNo(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: PdfInvoiceRow[] } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Satır verisi boş' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { firmaId, userId } = await requireCurrentTenantActor()

    // ── Mevcut fatura numaraları ───────────────────────────────────
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('invoice_type', 'satis')
      .eq('firma_id', firmaId)
    const existingNos = new Set((existingInvoices ?? []).map(i => normNo(i.invoice_number)))

    // ── Mevcut müşteriler ─────────────────────────────────────────
    // tc_kimlik sütunu varsa TCKN ile eşleştirmeyi de destekle
    type CustomerRow = { id: string; full_name: string; tax_number: string | null; tc_kimlik?: string | null; address?: string | null }
    let existingCustomers: CustomerRow[] = []
    {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, tax_number, tc_kimlik, address')
        .eq('firma_id', firmaId)
      if (error) {
        // tc_kimlik sütunu henüz eklenmemiş — temel sütunlarla devam et
        const { data: data2 } = await supabase.from('customers').select('id, full_name, tax_number, address').eq('firma_id', firmaId)
        existingCustomers = data2 ?? []
      } else {
        existingCustomers = data ?? []
      }
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
        const normalizedInvoiceNo = normNo(row.fatura_no)
        if (!row.fatura_no || existingNos.has(normalizedInvoiceNo)) {
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
        try {
        let customerId: string | undefined

        if (row.customer_id) {
          const selectedCustomer = existingCustomers.find(c => c.id === row.customer_id)
          if (!selectedCustomer) throw new Error(`Seçilen müşteri bulunamadı (${row.musteri_adi})`)
          await assertCustomerBelongsToFirma(row.customer_id, firmaId)
          customerId = selectedCustomer.id
        } else if (!row.force_new_customer) {
          const match = matchCustomerForImport(existingCustomers, {
            name: row.musteri_adi,
            taxNo: row.musteri_vkn,
            address: row.musteri_adresi,
          })

          if (match.status === 'matched') {
            customerId = match.customer.id
          } else if (match.status === 'suspicious') {
            throw new Error(`Şüpheli müşteri eşleşmesi onaylanmadan kaydedilemez (${row.musteri_adi} / ${normalizeCustomerTaxNo(row.musteri_vkn)})`)
          }
        }

          await assertBranchBelongsToFirma(row.sube_id ?? null, firmaId)
          const atomic = await importInvoiceAtomically(supabase, firmaId, userId, row, customerId)
          results.push({
            filename: row.filename,
            fatura_no: row.fatura_no,
            musteri_adi: row.musteri_adi,
            status: atomic.status,
            customer_id: atomic.customer_id,
            invoice_id: atomic.invoice_id,
            musteri_yeni: atomic.musteri_yeni,
            cihaz_sayisi: atomic.cihaz_sayisi,
          })
          existingNos.add(normalizedInvoiceNo)
        } catch (error) {
          results.push({
            filename: row.filename,
            fatura_no: row.fatura_no,
            musteri_adi: row.musteri_adi,
            status: 'hata',
            musteri_yeni: false,
            cihaz_sayisi: 0,
            error: error instanceof Error ? error.message : 'Bilinmeyen içe aktarma hatası.',
          })
        }
        continue

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
