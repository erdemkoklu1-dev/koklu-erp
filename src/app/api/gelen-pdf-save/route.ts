import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { matchExistingSupplier } from '@/lib/gelen-fatura-supplier-matching'
import { isOwnCompanySupplierName } from '@/lib/gelen-fatura-parser-v2/supplierClassifier'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { EMPTY_BRANCH_ID, resolveBranchFilter } from '@/lib/auth/branch-scope'
import { assertBranchBelongsToFirma, requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

export type GelenPdfItem = {
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

export type GelenPdfRow = {
  filename: string
  fatura_no: string
  fatura_tarihi: string          // YYYY-MM-DD
  vade_tarihi?: string | null
  senaryo?: string | null
  satici_adi: string
  satici_vkn?: string | null    // maps to supplier_tax_no
  tedarikci_adres?: string | null
  tedarikci_il?: string | null
  kdv_matrahi?: number | null
  kdv_tutari?: number | null
  odenecek_tutar?: number | null
  kalemler: GelenPdfItem[]
  banka_bilgileri?: Array<{ iban: string; banka_adi?: string | null }>
  gider_kategorisi: string
  bakiye_notu?: string | null
  sube_id?: string | null
}

function normNo(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').toUpperCase()
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: GelenPdfRow[] } = await req.json()
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

    // Mevcut alis fatura numaraları
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('invoice_type', 'alis')
      .eq('firma_id', firmaId)
    const existingNos = new Set((existingInvoices ?? []).map(i => normNo(i.invoice_number)))

    // Mevcut tedarikçi isimleri (alış faturaları + manuel tedarikçiler)
    const [{ data: existingSuppliers }, { data: manualSuppliers }] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, supplier_name, supplier_tax_no')
        .eq('invoice_type', 'alis')
        .not('supplier_name', 'is', null),
      supabase
        .from('tedarikciler')
        .select('id, firma_adi, vergi_no')
        .eq('aktif', true),
    ])
    const suppliersForMatch = [
      ...((existingSuppliers ?? []) as { id: string; supplier_name: string | null; supplier_tax_no: string | number | null }[])
        .map(s => ({ id: s.id, name: s.supplier_name, taxNo: s.supplier_tax_no })),
      ...((manualSuppliers ?? []) as { id: string; firma_adi: string | null; vergi_no: string | number | null }[])
        .map(s => ({ id: s.id, name: s.firma_adi, taxNo: s.vergi_no })),
    ]

    const createdInvoiceIds: string[] = []
    const results: Array<{
      filename:      string
      fatura_no:     string
      satici_adi:    string
      status:        'eklendi' | 'atilandi' | 'hata'
      invoice_id?:   string
      tedarikci_yeni: boolean
      gider_kategorisi: string
      error?:        string
    }> = []

    try {
      for (const row of rows) {
        // Fatura no yoksa dosya adından üret
        if (!row.fatura_no) {
          const base = row.filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9ÇĞİÖŞÜçğışöşü]/g, '-')
          row.fatura_no = `PDF-${base}`.slice(0, 80)
        }

        // Duplicate kontrolü
        const normalizedInvoiceNo = normNo(row.fatura_no)
        if (existingNos.has(normalizedInvoiceNo)) {
          results.push({
            filename:     row.filename,
            fatura_no:    row.fatura_no,
            satici_adi:   row.satici_adi,
            status:       'atilandi',
            tedarikci_yeni: false,
            gider_kategorisi: row.gider_kategorisi,
          })
          continue
        }

        // Tedarikçi yeni mi?
        if (isOwnCompanySupplierName(row.satici_adi)) {
          throw new Error(`Satıcı bizim firma olarak parse edildi, manuel tedarikçi seçimi gerekli (${row.fatura_no})`)
        }
        const supplierMatch = matchExistingSupplier(suppliersForMatch, {
          name: row.satici_adi,
          taxNo: row.satici_vkn,
        })
        const tedarikciYeni = supplierMatch.method === 'none'
        const supplierName = supplierMatch.supplier?.name ?? row.satici_adi.trim()

        // Tutarlar
        const subtotal     = row.kdv_matrahi    ?? 0
        const kdv_amount   = row.kdv_tutari     ?? 0
        const total_amount = row.odenecek_tutar ?? (subtotal + kdv_amount)
        const kdv_rate     = subtotal > 0 ? Math.round(kdv_amount / subtotal * 100) : 20

        // Notlar
        const notesParts: string[] = []
        notesParts.push(`Kategori: ${row.gider_kategorisi}`)
        if (row.bakiye_notu) notesParts.push(row.bakiye_notu)
        if ((row.banka_bilgileri ?? []).length > 0) {
          const ibanStr = row.banka_bilgileri!
            .map(b => b.banka_adi ? `${b.banka_adi}: ${b.iban}` : b.iban)
            .join(' | ')
          notesParts.push(ibanStr)
        }

        const subeId = incomingBranchId(row.sube_id)
        await assertBranchBelongsToFirma(subeId, firmaId)
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: row.fatura_no,
            invoice_type:   'alis',
            supplier_name:  supplierName,
            supplier_tax_no:   row.satici_vkn || null,
            tedarikci_adres: row.tedarikci_adres || null,
            tedarikci_il:    row.tedarikci_il || null,
            invoice_date:   row.fatura_tarihi,
            due_date:       row.vade_tarihi || null,
            subtotal,
            kdv_rate,
            kdv_amount,
            stopaj_rate:    0,
            stopaj_amount:  0,
            total_amount,
            paid_amount:    0,
            status:         'kesildi',
            description:    `PDF Gelen Fatura${row.senaryo ? `: ${row.senaryo}` : ''}`,
            notes:          notesParts.join(' | ') || null,
            sube_id:        subeId,
            firma_id:       firmaId,
          })
          .select('id')
          .single()

        if (invErr) throw new Error(`Fatura oluşturulamadı (${row.fatura_no}): ${invErr.message}`)

        createdInvoiceIds.push(inv.id)
        existingNos.add(normalizedInvoiceNo)
        suppliersForMatch.push({ id: inv.id, name: supplierName, taxNo: row.satici_vkn ?? null })

        // Fatura kalemleri
        const validItems = (row.kalemler ?? []).filter(k => k.urun_adi?.trim())
        if (validItems.length > 0) {
          const itemRows = validItems.map((k, idx) => ({
            invoice_id:      inv.id,
            line_order:      idx + 1,
            description:     k.urun_adi,
            quantity:        k.miktar        || 1,
            unit:            k.birim         || 'adet',
            unit_price:      Math.round((k.birim_fiyat || 0) * 100) / 100,
            discount_rate:   k.iskonto_orani  || 0,
            discount_amount: k.iskonto_tutari || 0,
            kdv_rate:        k.kdv_orani     || 20,
            notes:           null,
            firma_id:        firmaId,
          }))

          const { error: itemErr } = await supabase.from('invoice_items').insert(itemRows)
          if (itemErr) {
            console.error(`[gelen-pdf-save] invoice_items hatası (${row.fatura_no}):`, itemErr.message)
          }
        }

        results.push({
          filename:     row.filename,
          fatura_no:    row.fatura_no,
          satici_adi:   supplierName,
          status:       'eklendi',
          invoice_id:   inv.id,
          tedarikci_yeni: tedarikciYeni,
          gider_kategorisi: row.gider_kategorisi,
        })
      }
    } catch (err: unknown) {
      if (createdInvoiceIds.length > 0) {
        await supabase.from('invoices').delete().in('id', createdInvoiceIds)
      }
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const eklendi       = results.filter(r => r.status === 'eklendi').length
    const atilandi      = results.filter(r => r.status === 'atilandi').length
    const yeniTedarikci = results.filter(r => r.tedarikci_yeni).length

    // Kategoriye göre gider özeti
    const kategoriOzet: Record<string, number> = {}
    for (const r of results.filter(s => s.status === 'eklendi')) {
      const k = r.gider_kategorisi
      kategoriOzet[k] = (kategoriOzet[k] ?? 0) + 1
    }

    return NextResponse.json({ results, eklendi, atilandi, yeniTedarikci, kategoriOzet })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
