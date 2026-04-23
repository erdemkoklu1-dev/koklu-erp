import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import SubeDetayClient from './SubeDetayClient'

export default async function SubeDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: sube } = await supabase.from('subeler').select('*').eq('id', id).single()
  if (!sube) notFound()

  const [
    { data: musteriler },
    { data: tumMusteriler },
    { data: gidenFaturalar },
    { data: gelenFaturalar },
    { data: servisFormlari },
    { data: gelirGiderler },
    { data: calisanlar },
    { data: personelPersoneller },
  ] = await Promise.all([
    supabase.from('customers').select('id, full_name, il, phone').eq('sube_id', id).order('full_name'),
    supabase.from('customers').select('id, full_name, il, phone, sube_id').order('full_name'),
    supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, customer_id, customers(full_name)')
      .eq('sube_id', id).eq('invoice_type', 'satis').neq('status', 'iptal')
      .order('invoice_date', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, supplier_name')
      .eq('sube_id', id).eq('invoice_type', 'alis').neq('status', 'iptal')
      .order('invoice_date', { ascending: false }),
    supabase
      .from('service_forms')
      .select('id, form_number, service_date, technician_name, customers(full_name)')
      .eq('sube_id', id)
      .order('service_date', { ascending: false }),
    supabase.from('sube_gider_gelir').select('*').eq('sube_id', id).order('tarih', { ascending: false }),
    supabase
      .from('kullanici_profiller')
      .select('id, ad_soyad, email, telefon, roller(ad)')
      .eq('sube_id', id),
    supabase
      .from('personeller')
      .select('id, sicil_no, ad, soyad, pozisyon, durum')
      .eq('sube_id', id)
      .order('ad'),
  ])

  function normalizeRel(rows: any[] | null, key: string) {
    return (rows ?? []).map(r => ({
      ...r,
      [key]: Array.isArray(r[key]) ? (r[key][0] ?? null) : r[key],
    }))
  }

  return (
    <SubeDetayClient
      sube={sube as any}
      musteriler={musteriler ?? []}
      tumMusteriler={(tumMusteriler ?? []) as any[]}
      gidenFaturalar={normalizeRel(gidenFaturalar as any[], 'customers')}
      gelenFaturalar={gelenFaturalar ?? []}
      servisFormlari={normalizeRel(servisFormlari as any[], 'customers')}
      gelirGiderler={gelirGiderler ?? []}
      calisanlar={normalizeRel(calisanlar as any[], 'roller')}
      personeller={personelPersoneller ?? []}
    />
  )
}
