import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import CustomersClient, { type CustomerRow, type ControlStatus } from './CustomersClient'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import PrintButton from '@/components/PrintButton'
import { getCurrentAccess } from '@/lib/auth/authorization'

function resolveCityInfo(il: string | null, address: string | null): {
  city: 'Erzincan' | 'İstanbul' | 'Diğer'
  otherCityName: string | null
} {
  // Önce il alanı varsa onu kullan
  const src = il?.trim() || null
  if (src) {
    if (src === 'Erzincan') return { city: 'Erzincan', otherCityName: null }
    if (src === 'İstanbul') return { city: 'İstanbul', otherCityName: null }
    return { city: 'Diğer', otherCityName: src }
  }
  // il yoksa adrese bak (eski mantık — yanlış tespite açık, uyarı amaçlı tutuluyor)
  if (!address) return { city: 'Diğer', otherCityName: null }
  const a = address.toLowerCase()
  if (a.includes('erzincan')) return { city: 'Erzincan', otherCityName: null }
  if (a.includes('istanbul') || a.includes('i̇stanbul')) return { city: 'İstanbul', otherCityName: null }
  // Adresteki ili bul
  const found = TURKEY_PROVINCES.find(p => a.includes(p.toLowerCase())) ?? null
  return { city: 'Diğer', otherCityName: found }
}

function computeControlStatus(devices: any[]): { status: ControlStatus; daysUntilNext: number | null } {
  if (!devices || devices.length === 0) return { status: 'no-device', daysUntilNext: null }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const priority: ControlStatus[] = ['expired', 'overdue', 'urgent', 'soon', 'ok']
  let worstStatus: ControlStatus = 'ok'
  let minDays: number | null = null

  for (const d of devices) {
    if (d.expiry_date && new Date(d.expiry_date) <= today) {
      worstStatus = 'expired'
      continue
    }

    const controlDates = [d.control1_date, d.control2_date, d.control3_date]
      .filter(Boolean)
      .map((s: string) => new Date(s))

    const nextControl = controlDates
      .filter(cd => { cd.setHours(0,0,0,0); return cd > today })
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null

    const overdueControl = controlDates
      .filter(cd => { cd.setHours(0,0,0,0); return cd <= today })
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

    let deviceStatus: ControlStatus = 'ok'
    let deviceDays: number | null = null

    if (nextControl) {
      deviceDays = Math.ceil((nextControl.getTime() - today.getTime()) / 86400000)
      if (deviceDays < 0) deviceStatus = 'overdue'
      else if (deviceDays <= 30) deviceStatus = 'urgent'
      else if (deviceDays <= 90) deviceStatus = 'soon'
      else deviceStatus = 'ok'
    } else if (overdueControl) {
      deviceDays = Math.ceil((overdueControl.getTime() - today.getTime()) / 86400000)
      deviceStatus = 'overdue'
    }

    if (priority.indexOf(deviceStatus) < priority.indexOf(worstStatus)) {
      worstStatus = deviceStatus
    }
    if (deviceDays !== null && (minDays === null || deviceDays < minDays)) {
      minDays = deviceDays
    }
  }

  return { status: worstStatus, daysUntilNext: minDays }
}

export default async function CustomersPage() {
  const supabase = await createClient()
  const access = await getCurrentAccess()

  let customerQuery = supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .order('full_name')

  if (access && !access.isAdmin) {
    customerQuery = access.branchIds.length > 0
      ? customerQuery.in('sube_id', access.branchIds)
      : customerQuery.in('sube_id', ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: customers } = await customerQuery

  const { data: devices } = await supabase
    .from('devices')
    .select('customer_id, control1_date, control2_date, control3_date, expiry_date')
    .eq('is_active', true)

  // Group devices by customer_id
  const devicesByCustomer = new Map<string, any[]>()
  for (const d of devices ?? []) {
    if (!devicesByCustomer.has(d.customer_id)) devicesByCustomer.set(d.customer_id, [])
    devicesByCustomer.get(d.customer_id)!.push(d)
  }

  const rows: CustomerRow[] = (customers ?? []).map(c => {
    const { status, daysUntilNext } = computeControlStatus(devicesByCustomer.get(c.id) ?? [])
    return {
      id: c.id,
      full_name: c.full_name,
      type: c.type,
      tax_number: c.tax_number ?? null,
      phone: c.phone,
      email: c.email,
      address: c.address,
      created_at: c.created_at,
      ...resolveCityInfo(c.il ?? null, c.address),
      controlStatus: status,
      daysUntilNext,
    }
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Müşteriler Listesi · {new Date().toLocaleString('tr-TR')}</div>
      </div>

      {/* Üst bar */}
      <div className="no-print bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Müşteri Yönetimi</h1>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link href="/invoice-import"
            className="border border-[#C8102E] text-[#C8102E] px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
            + Dosyadan Müşteri Ekle
          </Link>
          <Link href="/customers/new"
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Müşteri
          </Link>
        </div>
      </div>

      <CustomersClient customers={rows} />
    </div>
  )
}
