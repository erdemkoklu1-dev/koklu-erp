import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { EMPTY_BRANCH_ID, resolveBranchFilter } from '@/lib/auth/branch-scope'
import { assertBranchBelongsToFirma, requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

export type GelenImportRow = {
  alici_adi: string
  fatura_no: string
  fatura_tarihi: string   // YYYY-MM-DD
  gelis_tarihi?: string   // YYYY-MM-DD
  senaryo: string         // TICARIFATURA | TEMELFATURA
  durum: string
  tutar: number
  sube_id?: string | null
}

function normalizeSupplierName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}

function mapGelenStatus(durum: string): string {
  const d = durum.toLowerCase()
  if (d.includes('onaylandi') || d.includes('onaylandı')) return 'odendi'
  return 'kesildi'
}

function calcAmounts(tutar: number, senaryo: string) {
  const KDV = 20
  if (senaryo === 'TEMELFATURA') {
    const subtotal = Math.round((tutar / 1.2) * 100) / 100
    const kdv_amount = Math.round((tutar - subtotal) * 100) / 100
    return { subtotal, kdv_rate: KDV, kdv_amount, total_amount: tutar }
  } else {
    const kdv_amount = Math.round(tutar * (KDV / 100) * 100) / 100
    const total_amount = Math.round((tutar + kdv_amount) * 100) / 100
    return { subtotal: tutar, kdv_rate: KDV, kdv_amount, total_amount }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: GelenImportRow[] } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Satır verisi boş' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const firmaId = await requireCurrentFirmaId()
    const access = await getCurrentAccess()

    function incomingBranchId(requested?: string | null) {
      const branchId = resolveBranchFilter(access, requested)
      if (branchId === EMPTY_BRANCH_ID) throw new Error('Gelen fatura için yetkili şube bulunamadı')
      if (!access?.isAdmin && !branchId) throw new Error('Gelen fatura için şube seçimi zorunlu')
      return branchId
    }

    const [{ data: existingInvoices }, { data: existingSuppliers }] = await Promise.all([
      supabase.from('invoices').select('invoice_number').eq('invoice_type', 'alis').eq('firma_id', firmaId),
      supabase.from('invoices').select('supplier_name').eq('invoice_type', 'alis').eq('firma_id', firmaId).not('supplier_name', 'is', null),
    ])

    const existingNos = new Set((existingInvoices ?? []).map(i => i.invoice_number))
    const existingSupplierNames = new Set(
      (existingSuppliers ?? []).map(i => normalizeSupplierName(i.supplier_name ?? ''))
    )

    const createdInvoiceIds: string[] = []
    const results: Array<{
      fatura_no: string
      alici_adi: string
      status: 'eklendi' | 'atilandi' | 'hata'
      invoice_id?: string
      error?: string
      tedarikci_yeni: boolean
    }> = []

    try {
      for (const row of rows) {
        if (existingNos.has(row.fatura_no)) {
          results.push({ fatura_no: row.fatura_no, alici_adi: row.alici_adi, status: 'atilandi', tedarikci_yeni: false })
          continue
        }

        const normalizedName = normalizeSupplierName(row.alici_adi)
        const tedarikciYeni = !existingSupplierNames.has(normalizedName)

        const { subtotal, kdv_rate, kdv_amount, total_amount } = calcAmounts(row.tutar, row.senaryo)
        const status = mapGelenStatus(row.durum)

        const notesParts = [`Durum: ${row.durum}`]
        if (row.gelis_tarihi) notesParts.push(`Geliş Tarihi: ${row.gelis_tarihi}`)
        const notes = notesParts.join(' | ')

        const subeId = incomingBranchId(row.sube_id)
        await assertBranchBelongsToFirma(subeId, firmaId)
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: row.fatura_no,
            invoice_type:   'alis',
            supplier_name:  row.alici_adi.trim(),
            invoice_date:   row.fatura_tarihi,
            subtotal,
            kdv_rate,
            kdv_amount,
            stopaj_rate:    0,
            stopaj_amount:  0,
            total_amount,
            paid_amount:    0,
            status,
            description:    `e-Fatura Gelen: ${row.senaryo}`,
            notes,
            sube_id:        subeId,
            firma_id:       firmaId,
          })
          .select('id')
          .single()

        if (invErr) throw new Error(`Fatura oluşturulamadı (${row.fatura_no}): ${invErr.message}`)

        createdInvoiceIds.push(inv.id)
        existingNos.add(row.fatura_no)
        existingSupplierNames.add(normalizedName)
        results.push({
          fatura_no: row.fatura_no,
          alici_adi: row.alici_adi,
          status: 'eklendi',
          invoice_id: inv.id,
          tedarikci_yeni: tedarikciYeni,
        })
      }
    } catch (err: any) {
      if (createdInvoiceIds.length > 0) {
        await supabase.from('invoices').delete().in('id', createdInvoiceIds)
      }
      return NextResponse.json({ error: err.message }, { status: 500 })
    }

    const eklendi      = results.filter(r => r.status === 'eklendi').length
    const atilandi     = results.filter(r => r.status === 'atilandi').length
    const yeniTedarikci = results.filter(r => r.tedarikci_yeni).length

    return NextResponse.json({ results, eklendi, atilandi, yeniTedarikci })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
