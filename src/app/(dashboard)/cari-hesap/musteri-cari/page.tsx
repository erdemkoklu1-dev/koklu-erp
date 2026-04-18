import { createServiceClient } from '@/lib/supabase/service'
import MusteriCariClient from './MusteriCariClient'

export default async function MusteriCariPage() {
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // Önce iban/bank_name ile dene, hata alırsa bunlar olmadan çek
  let customersData: any[] | null = null
  const { data: withBank, error: bankErr } = await supabase
    .from('customers')
    .select('id, full_name, phone, tax_number, email, address, iban, bank_name')
    .order('full_name')
    .limit(2000)

  if (bankErr) {
    // Kolonlar henüz yok — sadece temel alanları çek
    const { data: basic } = await supabase
      .from('customers')
      .select('id, full_name, phone, tax_number, email, address')
      .order('full_name')
      .limit(2000)
    customersData = basic
  } else {
    customersData = withBank
  }

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, customer_id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, invoice_type')
      .eq('invoice_type', 'satis')
      .neq('status', 'iptal')
      .order('invoice_date', { ascending: false })
      .limit(2000),
    supabase
      .from('payments')
      .select('id, invoice_id, payment_date, amount, method, reference_no')
      .order('payment_date', { ascending: false })
      .limit(2000),
  ])

  return (
    <MusteriCariClient
      customers={customersData ?? []}
      invoices={invoices ?? []}
      payments={payments ?? []}
      today={today}
    />
  )
}
