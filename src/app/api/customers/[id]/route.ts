import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

type DependencyCounts = {
  service_forms: number
  devices: number
  faturalar: number
  gelen_faturalar: number
  payments: number
  on_kayitlar: number
  documents: number
  customer_accounts: number
  teklifler: number
  proforma_faturalar: number
  mutabakat_formlari: number
}

async function countRows(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  column: string,
  value: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
  if (error) throw error
  return count ?? 0
}

async function getCustomerDependencies(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<DependencyCounts> {
  const [
    serviceForms,
    devices,
    invoicesResult,
    onKayitlar,
    documents,
    customerAccounts,
    teklifler,
    proformaFaturalar,
    mutabakatFormlari,
  ] = await Promise.all([
    countRows(supabase, 'service_forms', 'customer_id', id),
    countRows(supabase, 'devices', 'customer_id', id),
    supabase.from('invoices').select('id, invoice_type').eq('customer_id', id),
    countRows(supabase, 'on_kayitlar', 'customer_id', id),
    countRows(supabase, 'documents', 'customer_id', id),
    countRows(supabase, 'customer_accounts', 'customer_id', id),
    countRows(supabase, 'teklifler', 'musteri_id', id),
    countRows(supabase, 'proforma_faturalar', 'customer_id', id),
    countRows(supabase, 'mutabakat_formlari', 'musteri_id', id),
  ])

  if (invoicesResult.error) throw invoicesResult.error

  const invoices = invoicesResult.data ?? []
  const invoiceIds = invoices.map(invoice => invoice.id as string).filter(Boolean)
  let payments = 0
  if (invoiceIds.length > 0) {
    const { count, error } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds)
    if (error) throw error
    payments = count ?? 0
  }

  return {
    service_forms: serviceForms,
    devices,
    faturalar: invoices.filter(invoice => invoice.invoice_type === 'satis').length,
    gelen_faturalar: invoices.filter(invoice => invoice.invoice_type === 'alis').length,
    payments,
    on_kayitlar: onKayitlar,
    documents,
    customer_accounts: customerAccounts,
    teklifler,
    proforma_faturalar: proformaFaturalar,
    mutabakat_formlari: mutabakatFormlari,
  }
}

function totalDependencies(counts: DependencyCounts) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID eksik' }, { status: 400 })

    const supabase = createServiceClient()
    const tenantAccess = await getCurrentTenantAccessFromSession()
    let customerQuery = supabase.from('customers').select('id').eq('id', id)
    customerQuery = applyTenantScope(customerQuery, tenantAccess)
    const { data: customer, error: customerError } = await customerQuery.maybeSingle()
    if (customerError) throw customerError
    if (!customer) return NextResponse.json({ error: 'Müşteri bulunamadı veya bu kayda erişim yetkiniz yok.' }, { status: 404 })

    if (req.nextUrl.searchParams.get('record') === '1') {
      let fullCustomerQuery = supabase.from('customers').select('*').eq('id', id)
      fullCustomerQuery = applyTenantScope(fullCustomerQuery, tenantAccess)
      const { data: fullCustomer, error: fullCustomerError } = await fullCustomerQuery.maybeSingle()
      if (fullCustomerError) throw fullCustomerError

      let devicesQuery = supabase
        .from('devices')
        .select('*')
        .eq('customer_id', id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      devicesQuery = applyTenantScope(devicesQuery, tenantAccess)
      const { data: devices, error: devicesError } = await devicesQuery
      if (devicesError) throw devicesError

      return NextResponse.json({ ok: true, customer: fullCustomer, devices: devices ?? [] })
    }

    const dependencies = await getCustomerDependencies(supabase, id)

    return NextResponse.json({
      ok: true,
      dependencies,
      dependency_total: totalDependencies(dependencies),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID eksik' }, { status: 400 })

    const supabase = createServiceClient()
    const tenantAccess = await getCurrentTenantAccessFromSession()
    let customerQuery = supabase.from('customers').select('id').eq('id', id)
    customerQuery = applyTenantScope(customerQuery, tenantAccess)
    const { data: customer, error: customerError } = await customerQuery.maybeSingle()
    if (customerError) throw customerError
    if (!customer) return NextResponse.json({ error: 'Müşteri bulunamadı veya bu kayda erişim yetkiniz yok.' }, { status: 404 })

    const dependencies = await getCustomerDependencies(supabase, id)
    const dependencyTotal = totalDependencies(dependencies)

    if (dependencyTotal > 0) {
      let deactivateQuery = supabase.from('customers').update({ is_active: false }).eq('id', id)
      deactivateQuery = applyTenantScope(deactivateQuery, tenantAccess)
      const { error } = await deactivateQuery
      if (error) return NextResponse.json({ error: 'Musteri pasife alinamadi.' }, { status: 500 })

      return NextResponse.json({
        ok: true,
        deactivated: true,
        deleted: false,
        dependencies,
        dependency_total: dependencyTotal,
        message: 'Bu musteriye bagli servis formu, cihaz, fatura veya diger kayitlar bulundugu icin kalici silme yapilamadi. Musteri pasif duruma alindi.',
      })
    }

    let deleteQuery = supabase.from('customers').delete().eq('id', id)
    deleteQuery = applyTenantScope(deleteQuery, tenantAccess)
    const { error } = await deleteQuery
    if (error) return NextResponse.json({ error: 'Musteri silinemedi.' }, { status: 500 })

    return NextResponse.json({ ok: true, deleted: true, deactivated: false })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
