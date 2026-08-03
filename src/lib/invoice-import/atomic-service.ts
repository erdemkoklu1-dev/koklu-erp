import type { createServiceClient } from '@/lib/supabase/service'
import { buildCustomerImportInsert } from './customer-payload'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface AtomicInvoiceImportRow {
  fatura_no: string
  fatura_tarihi: string | null
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
  kalemler?: Array<{
    urun_adi: string
    miktar: number
    birim: string
    birim_fiyat: number
    kdv_orani: number
  }>
  banka_bilgileri?: Array<{ iban: string; banka_adi?: string | null }>
  sube_id?: string | null
}

export interface AtomicInvoiceImportResult {
  status: 'eklendi' | 'atilandi'
  customer_id?: string
  invoice_id?: string
  musteri_yeni: boolean
  cihaz_sayisi: number
}

function addMonths(date: string, months: number): string {
  const value = new Date(date)
  value.setMonth(value.getMonth() + months)
  return value.toISOString().slice(0, 10)
}

function addYears(date: string, years: number): string {
  const value = new Date(date)
  value.setFullYear(value.getFullYear() + years)
  return value.toISOString().slice(0, 10)
}

export async function importInvoiceAtomically(
  supabase: ServiceClient,
  firmaId: string,
  userId: string,
  row: AtomicInvoiceImportRow,
  customerId?: string,
): Promise<AtomicInvoiceImportResult> {
  const subtotal = row.kdv_matrahi ?? 0
  const kdvAmount = row.kdv_tutari ?? 0
  const items = (row.kalemler ?? []).filter(item => item.urun_adi?.trim())
  const date = row.fatura_tarihi
  const expiry = date ? addYears(date, 2) : null
  const customer = buildCustomerImportInsert({
    name: row.musteri_adi,
    taxNumber: row.musteri_vkn,
    address: row.musteri_adresi,
    city: row.musteri_il,
    district: row.musteri_ilce,
    branchId: row.sube_id,
    firmaId,
  })

  const { data, error } = await supabase.rpc('invoice_import_atomic', {
    p_firma_id: firmaId,
    p_user_id: userId,
    p_customer: customer,
    p_invoice: {
      invoice_number: row.fatura_no,
      invoice_type: 'satis',
      customer_id: customerId ?? null,
      musteri_unvan: row.musteri_adi || null,
      musteri_vergi_no: row.musteri_vkn || null,
      musteri_adres: row.musteri_adresi || null,
      musteri_il: row.musteri_il || null,
      musteri_ilce: row.musteri_ilce || null,
      invoice_date: date,
      due_date: row.vade_tarihi || null,
      subtotal,
      kdv_rate: subtotal > 0 ? Math.round(kdvAmount / subtotal * 100) : 20,
      kdv_amount: kdvAmount,
      total_amount: row.odenecek_tutar ?? subtotal + kdvAmount,
      status: 'kesildi',
      description: row.senaryo ? `PDF e-Fatura: ${row.senaryo}` : 'PDF e-Fatura',
      notes: (row.banka_bilgileri ?? []).map(bank => bank.banka_adi ? `${bank.banka_adi}: ${bank.iban}` : bank.iban).join(' | ') || null,
      sube_id: row.sube_id || null,
    },
    p_items: items.map((item, index) => ({
      line_order: index + 1,
      description: item.urun_adi,
      quantity: item.miktar || 1,
      unit: item.birim || 'adet',
      unit_price: item.birim_fiyat || 0,
      kdv_rate: item.kdv_orani || 20,
      notes: null,
    })),
    p_devices: date && expiry ? items.map((item, index) => ({
      custom_device_name: item.urun_adi,
      quantity: Math.max(1, Math.round(item.miktar || 1)),
      invoice_date: date,
      expiry_date: expiry,
      control1_date: addMonths(date, 6),
      control2_date: addMonths(date, 12),
      control3_date: addMonths(date, 18),
      qr_code: `KOKLU-${row.fatura_no.replace(/\W/g, '')}-${index}`,
    })) : [],
  })

  if (error) {
    const missingRpc = error.message.includes('invoice_import_atomic') || error.code === 'PGRST202'
    throw new Error(missingRpc
      ? 'Atomik fatura içe aktarma migration’ı uygulanmamış.'
      : error.message)
  }
  return data as AtomicInvoiceImportResult
}
