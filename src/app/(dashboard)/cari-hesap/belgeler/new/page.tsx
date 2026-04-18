import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import BelgeYukleClient from './BelgeYukleClient'

export default async function BelgeYukleNewPage({
  searchParams,
}: {
  searchParams: Promise<{ customer_id?: string; invoice_id?: string }>
}) {
  const { customer_id, invoice_id } = await searchParams
  const supabase = createServiceClient()

  const [{ data: customers }, { data: invoices }] = await Promise.all([
    supabase.from('customers').select('id, full_name').order('full_name'),
    supabase.from('invoices')
      .select('id, invoice_number, customer_id, total_amount, paid_amount')
      .eq('invoice_type', 'satis')
      .in('status', ['kesildi', 'gonderildi', 'kismi_odendi'])
      .order('invoice_date', { ascending: false }),
  ])

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cari-hesap/belgeler" className="text-sm text-gray-500 hover:text-gray-700">← Belgeler</Link>
        <span className="text-gray-300">/</span>
        <h2 className="text-base font-semibold text-gray-900">Belge Yükle</h2>
      </div>

      <div className="bg-white border rounded-xl p-6">
        <BelgeYukleClient
          customers={customers ?? []}
          invoices={invoices ?? []}
          defaultCustomerId={customer_id}
          defaultInvoiceId={invoice_id}
        />
      </div>
    </div>
  )
}
