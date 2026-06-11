import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { canReadModule, getCurrentAccess, getModulePermissionMap } from '@/lib/auth/authorization'
import { applyBranchScope, EMPTY_BRANCH_ID, filterVisibleBranches } from '@/lib/auth/branch-scope'
import { TESLIMAT_CANCELLED_STATUS_ALIASES, quotedTeslimatStatuses } from '@/lib/teslimat-status'

type CardTone = 'default' | 'green' | 'yellow' | 'red' | 'blue'

type ReminderDeviceRow = {
  expiry_date: string | null
  customers: { id?: string; full_name?: string | null; sube_id?: string | null } | { id?: string; full_name?: string | null; sube_id?: string | null }[] | null
}

type ReminderCustomerRow = {
  id: string
  name: string
  days: number
  deviceCount: number
}

function safe(n: number | null | undefined) {
  return n ?? 0
}

function isTechnicalRole(role: string | null | undefined) {
  const value = (role ?? '').toLocaleLowerCase('tr-TR')
  return value.includes('teknik') || value.includes('saha')
}

function isAccountingRole(role: string | null | undefined) {
  const value = (role ?? '').toLocaleLowerCase('tr-TR')
  return value.includes('muhasebe') || value.includes('idari') || value.includes('idarı')
}

function KpiCard({
  href,
  title,
  value,
  detail,
  tone = 'default',
  icon,
}: {
  href: string
  title: string
  value: string | number
  detail?: string
  tone?: CardTone
  icon: React.ReactNode
}) {
  const styles: Record<CardTone, string> = {
    default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100',
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  return (
    <Link href={href} className={`block rounded-xl border p-5 transition-shadow hover:shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">{title}</div>
          <div className="mt-2 text-2xl font-bold">{value}</div>
          {detail && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</div>}
        </div>
        <div className="rounded-lg bg-white/70 p-2 text-[#C8102E] shadow-sm dark:bg-gray-900/40">{icon}</div>
      </div>
    </Link>
  )
}

function scopedCustomerQuery(svc: ReturnType<typeof createServiceClient>, access: Awaited<ReturnType<typeof getCurrentAccess>>) {
  const query = svc.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true)
  return applyBranchScope(query, access)
}

async function countRows(query: PromiseLike<{ count: number | null }>) {
  const { count } = await query
  return count ?? 0
}

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default async function DashboardPage() {
  const svc = createServiceClient()
  const access = await getCurrentAccess()
  const permissions = await getModulePermissionMap(access)
  const role = access?.role ?? 'Admin'
  const isAdmin = access?.isAdmin ?? false
  const isTechnical = isTechnicalRole(role)
  const isAccounting = isAccountingRole(role)

  const can = (module: string) => isAdmin || canReadModule(permissions, module)
  const canFinance = !isTechnical && (isAdmin || isAccounting || can('current_account') || can('invoices') || can('incoming_invoices') || can('outgoing_invoices'))
  const canCustomers = can('customers')
  const canServiceForms = can('service_forms')
  const canDeliveries = can('deliveries')
  const canOperations = can('operations') || can('operation_requests') || can('operation_work_plans')
  const canTechnicalReports = can('technical_reports')
  const canReminders = can('reminders')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const in90Days = new Date(today)
  in90Days.setDate(in90Days.getDate() + 90)
  const in90DaysStr = in90Days.toISOString().slice(0, 10)

  const { data: allBranches } = await svc.from('subeler').select('id, ad').eq('aktif', true).order('ad')
  const visibleBranches = filterVisibleBranches((allBranches ?? []) as { id: string; ad: string }[], access)
  const branchLabel = isAdmin
    ? 'Tüm şubeler'
    : visibleBranches.length === 1
      ? visibleBranches[0].ad
      : visibleBranches.length > 1
        ? `${visibleBranches.length} yetkili şube`
        : 'Yetkili şube yok'

  const customerCount = canCustomers ? await countRows(scopedCustomerQuery(svc, access)) : 0

  const newCustomerCount = canCustomers
    ? await countRows(applyBranchScope(
        svc.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('created_at', monthStart),
        access,
      ))
    : 0

  const serviceCount = canServiceForms
    ? await countRows(applyBranchScope(
        svc.from('service_forms').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        access,
      ))
    : 0

  const pendingServiceCount = canServiceForms
    ? await countRows(applyBranchScope(
        svc.from('service_forms').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
        access,
      ))
    : 0

  const deliveryCount = canDeliveries
    ? await countRows(applyBranchScope(
        svc.from('teslimatlar').select('*', { count: 'exact', head: true }).neq('durum', 'tamamlandi').not('durum', 'in', quotedTeslimatStatuses(TESLIMAT_CANCELLED_STATUS_ALIASES)),
        access,
      ))
    : 0

  const requestCount = canOperations
    ? await countRows(applyBranchScope(
        svc.from('musteri_talepleri').select('*', { count: 'exact', head: true }).not('durum', 'in', '("Tamamlandı","İptal")'),
        access,
      ))
    : 0

  const workPlanCount = canOperations
    ? await countRows(applyBranchScope(
        svc.from('planli_isler').select('*', { count: 'exact', head: true }).eq('durum', 'Bekliyor'),
        access,
      ))
    : 0

  const technicalReportCount = canTechnicalReports
    ? await countRows(applyBranchScope(
        svc.from('teknik_raporlar').select('*', { count: 'exact', head: true }).gte('rapor_tarihi', monthStart),
        access,
      ))
    : 0

  let expiringDevices: ReminderDeviceRow[] = []
  if (canReminders) {
    let deviceQuery = svc
      .from('devices')
      .select('expiry_date, customers!inner(id, full_name, sube_id)')
      .eq('is_active', true)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', in90DaysStr)
      .order('expiry_date', { ascending: true })
      .limit(500)

    if (access && !access.isAdmin) {
      deviceQuery = access.branchIds.length > 0
        ? deviceQuery.in('customers.sube_id', access.branchIds)
        : deviceQuery.eq('customers.sube_id', EMPTY_BRANCH_ID)
    }

    const { data } = await deviceQuery
    expiringDevices = (data ?? []) as ReminderDeviceRow[]
  }

  let recentServices: Array<{ id: string; form_number: string | null; service_date: string | null; status: string | null; customers: { full_name?: string | null } | null }> = []
  if (canServiceForms) {
    const { data } = await applyBranchScope(
      svc
        .from('service_forms')
        .select('id, form_number, service_date, status, customers(full_name)')
        .order('created_at', { ascending: false })
        .limit(5),
      access,
    )
    recentServices = (data ?? []) as typeof recentServices
  }

  let monthlyIncome = 0
  let monthlyExpense = 0
  let receivableAmount = 0
  let overdueDebtAmount = 0
  let overdueDebtSupplierCount = 0

  if (canFinance) {
    const [incomeRes, expenseRes, receivableRes, debtRes] = await Promise.all([
      applyBranchScope(
        svc.from('invoices').select('total_amount').eq('invoice_type', 'satis').gte('invoice_date', monthStart).neq('status', 'iptal'),
        access,
      ),
      applyBranchScope(
        svc.from('invoices').select('total_amount').eq('invoice_type', 'alis').gte('invoice_date', monthStart).neq('status', 'iptal'),
        access,
      ),
      applyBranchScope(
        svc.from('invoices').select('total_amount, paid_amount').eq('invoice_type', 'satis').neq('status', 'odendi').neq('status', 'iptal'),
        access,
      ),
      applyBranchScope(
        svc.from('invoices').select('total_amount, paid_amount, supplier_name').eq('invoice_type', 'alis').lt('due_date', todayStr).neq('status', 'odendi').neq('status', 'iptal'),
        access,
      ),
    ])

    const incomeRows = (incomeRes.data ?? []) as { total_amount: number | null }[]
    const expenseRows = (expenseRes.data ?? []) as { total_amount: number | null }[]
    const receivableRows = (receivableRes.data ?? []) as { total_amount: number | null; paid_amount: number | null }[]
    const debts = (debtRes.data ?? []) as { total_amount: number | null; paid_amount: number | null; supplier_name: string | null }[]

    monthlyIncome = incomeRows.reduce((sum, row) => sum + safe(row.total_amount), 0)
    monthlyExpense = expenseRows.reduce((sum, row) => sum + safe(row.total_amount), 0)
    receivableAmount = receivableRows.reduce((sum, row) => sum + Math.max(0, safe(row.total_amount) - safe(row.paid_amount)), 0)
    overdueDebtAmount = debts.reduce((sum, row) => sum + Math.max(0, safe(row.total_amount) - safe(row.paid_amount)), 0)
    overdueDebtSupplierCount = new Set(debts.map(row => row.supplier_name).filter(Boolean)).size
  }

  const reminderMap = new Map<string, ReminderCustomerRow>()
  for (const device of expiringDevices) {
    const customer = relationOne(device.customers)
    if (!customer?.id) continue

    const days = device.expiry_date ? Math.floor((new Date(device.expiry_date).getTime() - today.getTime()) / 86400000) : 0
    const current = reminderMap.get(customer.id)

    if (current) {
      current.deviceCount += 1
      current.days = Math.min(current.days, days)
    } else {
      reminderMap.set(customer.id, {
        id: customer.id,
        name: customer.full_name ?? '-',
        days,
        deviceCount: 1,
      })
    }
  }
  const reminderRows = Array.from(reminderMap.values()).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'tr-TR'))
  const reminderDeviceCount = reminderRows.reduce((sum, row) => sum + row.deviceCount, 0)

  const net = monthlyIncome - monthlyExpense
  const dateLabel = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Genel Bakış</h1>
          <p className="mt-0.5 text-sm capitalize text-gray-400 dark:text-gray-500">{dateLabel}</p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Kapsam: {branchLabel} · Rol: {role}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canServiceForms && (
            <Link href="/service-forms/new" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">
              + Servis Formu
            </Link>
          )}
          {canCustomers && (
            <Link href="/customers/new" className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a50d26]">
              + Yeni Müşteri
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {canCustomers && (
          <KpiCard href="/customers" title="Toplam Müşteri" value={customerCount.toLocaleString('tr-TR')} detail={`${newCustomerCount} yeni bu ay`} icon={<Users size={18} />} />
        )}
        {canServiceForms && (
          <KpiCard href="/service-forms" title="Bu Ay Servis" value={serviceCount.toLocaleString('tr-TR')} detail={`${pendingServiceCount} bekliyor`} tone="green" icon={<ClipboardList size={18} />} />
        )}
        {canDeliveries && (
          <KpiCard href="/teslimatlar" title="Açık Teslimatlar" value={deliveryCount.toLocaleString('tr-TR')} detail="aktif teslimat takibi" tone="blue" icon={<Package size={18} />} />
        )}
        {canOperations && (
          <KpiCard href="/operasyon" title="Operasyon" value={(requestCount + workPlanCount).toLocaleString('tr-TR')} detail={`${requestCount} talep · ${workPlanCount} iş`} tone="yellow" icon={<BriefcaseBusiness size={18} />} />
        )}
        {canTechnicalReports && (
          <KpiCard href="/teknik-raporlar" title="Teknik Raporlar" value={technicalReportCount.toLocaleString('tr-TR')} detail="bu ay oluşturulan" icon={<FileText size={18} />} />
        )}
        {canReminders && (
          <KpiCard href="/hatirlatmalar" title="Hatırlatmalar" value={reminderRows.length.toLocaleString('tr-TR')} detail={`${reminderDeviceCount.toLocaleString('tr-TR')} cihaz`} tone={reminderRows.length > 0 ? 'red' : 'default'} icon={<Bell size={18} />} />
        )}
        {canFinance && (
          <KpiCard href="/cari-hesap/giden-faturalar" title="Bekleyen Alacak" value={formatCurrency(receivableAmount)} detail="ödenmemiş satış faturaları" tone={receivableAmount > 0 ? 'yellow' : 'default'} icon={<Wallet size={18} />} />
        )}
        {canFinance && (
          <KpiCard href="/cari-hesap/gelen-faturalar" title="Vadesi Geçen Borç" value={formatCurrency(overdueDebtAmount)} detail={`${overdueDebtSupplierCount} tedarikçi`} tone={overdueDebtAmount > 0 ? 'red' : 'default'} icon={<AlertTriangle size={18} />} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {canFinance && (
          <section className="rounded-xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-sm font-semibold text-gray-800 dark:text-gray-100">Bu Ay Mali Özet</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><TrendingUp size={15} className="text-green-600" />Toplam Gelir</span>
                <span className="font-semibold text-green-700">{formatCurrency(monthlyIncome)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><TrendingDown size={15} className="text-red-600" />Toplam Gider</span>
                <span className="font-semibold text-red-700">{formatCurrency(monthlyExpense)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Net</span>
                <span className={`font-bold ${net >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(net)}</span>
              </div>
            </div>
          </section>
        )}

        {canReminders && (
          <section className="rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b px-5 py-3 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Hatırlatmalar</h2>
              <Link href="/hatirlatmalar" className="text-xs font-medium text-[#C8102E] hover:underline">Tümü →</Link>
            </div>
            <div className="divide-y dark:divide-gray-700">
              {reminderRows.length > 0 ? reminderRows.slice(0, 5).map(row => (
                <Link key={row.id} href={`/customers/${row.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{row.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${row.days < 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                    {row.deviceCount} cihaz {row.days < 0 ? `${Math.abs(row.days)}g gecikti` : `${row.days} gün`}
                  </span>
                </Link>
              )) : <div className="px-5 py-8 text-center text-sm text-gray-400">90 gün içinde hatırlatma yok.</div>}
            </div>
          </section>
        )}

        {canServiceForms && (
          <section className="rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b px-5 py-3 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Son Servis Formları</h2>
              <Link href="/service-forms" className="text-xs font-medium text-[#C8102E] hover:underline">Tümü →</Link>
            </div>
            <div className="divide-y dark:divide-gray-700">
              {recentServices.length > 0 ? recentServices.map(service => (
                <Link key={service.id} href={`/service-forms/${service.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div>
                    <div className="font-mono font-semibold text-[#C8102E]">{service.form_number ?? `#${service.id.slice(0, 6)}`}</div>
                    <div className="text-xs text-gray-400">{service.customers?.full_name ?? '-'}</div>
                  </div>
                  <div className="text-xs text-gray-500">{formatTRDate(service.service_date)}</div>
                </Link>
              )) : <div className="px-5 py-8 text-center text-sm text-gray-400">Servis formu yok.</div>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
