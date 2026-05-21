import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()

  const invoiceQuery = supabase
    .from('invoices')
    .select('id, invoice_number, supplier_name, supplier_tax_no, invoice_date, total_amount')
    .eq('invoice_type', 'alis')
    .not('supplier_name', 'is', null)

  const manualSupplierQuery = supabase
    .from('tedarikciler')
    .select('id, firma_adi, vergi_no')
    .eq('aktif', true)

  const [{ data: invoiceSuppliers, error: invoiceError }, { data: manualSuppliers, error: manualError }] = await Promise.all([
    invoiceQuery,
    manualSupplierQuery,
  ])

  console.log('[incoming supplier match source]', {
    invoices_table: 'invoices',
    invoices_columns: ['id', 'invoice_number', 'supplier_name', 'supplier_tax_no', 'invoice_date', 'total_amount'],
    invoices_query: "from('invoices').select('id, invoice_number, supplier_name, supplier_tax_no, invoice_date, total_amount').eq('invoice_type', 'alis').not('supplier_name', 'is', null)",
    invoices_count: invoiceSuppliers?.length ?? 0,
    invoices_error: invoiceError?.message ?? null,
    supplier_table: 'tedarikciler',
    supplier_columns: ['id', 'firma_adi', 'vergi_no'],
    supplier_query: "from('tedarikciler').select('id, firma_adi, vergi_no').eq('aktif', true)",
    supplier_count: manualSuppliers?.length ?? 0,
    supplier_error: manualError?.message ?? null,
  })

  if (invoiceError) {
    return NextResponse.json({
      error: invoiceError.message,
    }, { status: 500 })
  }

  return NextResponse.json({
    sources: {
      invoices: {
        table: 'invoices',
        nameColumn: 'supplier_name',
        taxColumn: 'supplier_tax_no',
        query: "from('invoices').select('id, invoice_number, supplier_name, supplier_tax_no, invoice_date, total_amount').eq('invoice_type', 'alis').not('supplier_name', 'is', null)",
        count: invoiceSuppliers?.length ?? 0,
      },
      manualSuppliers: {
        table: 'tedarikciler',
        nameColumn: 'firma_adi',
        taxColumn: 'vergi_no',
        query: "from('tedarikciler').select('id, firma_adi, vergi_no').eq('aktif', true)",
        count: manualError ? 0 : manualSuppliers?.length ?? 0,
        error: manualError?.message ?? null,
      },
    },
    suppliers: [
      ...((invoiceSuppliers ?? []) as { id: string; supplier_name: string | null; supplier_tax_no: string | number | null }[])
        .map(s => ({
          id: s.id,
          name: s.supplier_name,
          taxNo: s.supplier_tax_no,
          source: 'invoice' as const,
          table: 'invoices',
          nameColumn: 'supplier_name',
          taxColumn: 'supplier_tax_no',
        })),
      ...((manualError ? [] : manualSuppliers ?? []) as { id: string; firma_adi: string | null; vergi_no: string | number | null }[])
        .map(s => ({
          id: s.id,
          name: s.firma_adi,
          taxNo: s.vergi_no,
          source: 'manual' as const,
          table: 'tedarikciler',
          nameColumn: 'firma_adi',
          taxColumn: 'vergi_no',
        })),
    ],
    existingInvoices: (invoiceSuppliers ?? []).map(s => ({
      id: s.id,
      invoice_number: s.invoice_number,
      supplier_name: s.supplier_name,
      supplier_tax_no: s.supplier_tax_no,
      invoice_date: s.invoice_date,
      total_amount: s.total_amount,
    })),
  })
}
