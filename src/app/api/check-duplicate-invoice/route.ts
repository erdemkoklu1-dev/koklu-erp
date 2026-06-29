import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

// Dosyadan yüklenen faturanın aynısı sistemde var mı kontrol eder.
// Eşleştirme: aynı firma + aynı tür + toplam tutar (±1 TL) + (varsa) karşı taraf VKN.
// Satışta müşteri VKN (musteri_vergi_no), alışta tedarikçi VKN (supplier_tax_no) ile eşleşir.
// Tarih, OCR'da değişebildiği için zorunlu kriter değildir.
export async function POST(req: NextRequest) {
  try {
    const { total_amount, tax_no, invoice_type } = await req.json()
    const target = Number(total_amount)
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ duplicate: null })
    }

    const type = invoice_type === 'alis' ? 'alis' : 'satis'
    const vknColumn = type === 'alis' ? 'supplier_tax_no' : 'musteri_vergi_no'

    const supabase = createServiceClient()
    const firmaId = await requireCurrentFirmaId()

    const { data: rows, error } = await supabase
      .from('invoices')
      .select('invoice_number, total_amount, musteri_vergi_no, supplier_tax_no, invoice_date')
      .eq('firma_id', firmaId)
      .eq('invoice_type', type)
      .gte('total_amount', target - 1)
      .lte('total_amount', target + 1)

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ duplicate: null })
    }

    const taxNo = String(tax_no ?? '').replace(/\D/g, '')

    // VKN biliniyorsa yalnızca VKN'si eşleşen kaydı duplicate say (farklı taraf,
    // aynı tutar yanlış pozitif vermesin). VKN yoksa tutar eşleşmesi yeterli.
    let match: typeof rows[number] | undefined
    if (taxNo) {
      match = rows.find(r => String((r as Record<string, unknown>)[vknColumn] ?? '').replace(/\D/g, '') === taxNo)
    } else {
      match = rows[0]
    }

    if (!match) return NextResponse.json({ duplicate: null })

    return NextResponse.json({
      duplicate: {
        invoice_number: match.invoice_number,
        total_amount: Number(match.total_amount) || 0,
        invoice_date: match.invoice_date ?? null,
      },
    })
  } catch {
    // Dedup hatası kaydı engellememeli — sadece uyarı gösteremeyiz.
    return NextResponse.json({ duplicate: null })
  }
}
