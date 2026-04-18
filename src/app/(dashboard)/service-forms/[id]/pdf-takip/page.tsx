import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import PrintActions from '../PrintActions'

function toTrDate(value: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function normalizeDeviceName(name: string) {
  const raw = (name ?? '').trim()
  if (!raw) return 'Cihaz'
  const match = raw.match(/^(.*?)(\d+(?:[.,]\d+)?)\s*KG$/i)
  if (!match) return raw
  const body = match[1].trim()
  const kg = match[2].replace(',', '.')
  return `${kg} KG ${body}`.trim()
}

function deviceLabel(device: any) {
  const base = device.custom_device_name ?? device.device_types?.name ?? 'Cihaz'
  const cap = device.capacity ? ` ${device.capacity} KG` : ''
  return normalizeDeviceName(`${base}${cap}`.trim())
}

export default async function ServiceFormTakipPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: form, error: formError } = await supabase
    .from('service_forms')
    .select('*, customers(full_name, phone, address, email, tax_number, type, authorized_person, authorized_phone, notes)')
    .eq('id', id)
    .single()

  if (formError || !form) notFound()

  const { data: items } = await supabase
    .from('service_form_items')
    .select('*')
    .eq('service_form_id', id)
    .order('created_at')

  const { data: devices } = await supabase
    .from('devices')
    .select(
      'custom_device_name, brand, capacity, quantity, serial_number, invoice_date, last_fill_date, control1_date, control2_date, control3_date, expiry_date, device_types(name)'
    )
    .eq('customer_id', form.customer_id)
    .eq('is_active', true)
    .order('created_at')

  const formRows = items ?? []
  const deviceRows = devices ?? []
  const serviceNames = new Set(
    formRows.map((item: any) => normalizeDeviceName(String(item.device_name ?? '').trim()).toLowerCase())
  )

  const grouped = new Map<string, any>()
  for (const device of deviceRows) {
    const label = deviceLabel(device)
    const key = `${label}__${device.brand ?? ''}__${toTrDate(device.invoice_date)}__${toTrDate(device.last_fill_date)}__${toTrDate(device.control1_date)}__${toTrDate(device.control2_date)}__${toTrDate(device.control3_date)}__${toTrDate(device.expiry_date)}`
    const lower = label.toLowerCase()
    const existsInForm = serviceNames.size === 0 || serviceNames.has(lower)
    if (!existsInForm) continue

    if (!grouped.has(key)) {
      grouped.set(key, {
        label,
        brand: device.brand ?? '-',
        invoiceDate: toTrDate(device.invoice_date),
        fillDate: toTrDate(device.last_fill_date),
        control1: toTrDate(device.control1_date),
        control2: toTrDate(device.control2_date),
        control3: toTrDate(device.control3_date),
        expiryDate: toTrDate(device.expiry_date),
        quantity: 0,
        serials: [] as string[],
      })
    }
    const row = grouped.get(key)
    row.quantity += (device.quantity ?? 1)
    if (device.serial_number) row.serials.push(device.serial_number)
  }

  const trackingRows = Array.from(grouped.values())
  const totalDevices = trackingRows.reduce((sum, row) => sum + row.quantity, 0)
  const customer = form.customers as any
  const customerAuthorized =
    customer?.authorized_person ??
    customer?.authorized_name ??
    customer?.contact_person ??
    customer?.contact_name ??
    customer?.notes ??
    '-'

  return (
    <div className="min-h-screen bg-white text-black">
      <PrintActions backHref={`/service-forms/${id}`} />

      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <header className="border-2 border-black p-4">
          <h1 className="text-xl font-bold tracking-wide">MÜŞTERİ TAKİP FORMU</h1>
          <div className="grid grid-cols-3 gap-2 text-sm mt-3">
            <div>
              <span className="font-semibold">{customer?.type === 'company' ? 'Vergi No' : 'TC No'}:</span>{' '}
              {customer?.tax_number ?? '-'}
            </div>
            <div>
              <span className="font-semibold">Telefon:</span> {customer?.phone ?? '-'}
            </div>
            <div className="text-right">
              <span className="font-semibold">Mail:</span> {customer?.email ?? '-'}
            </div>
            <div className="col-span-2">
              <span className="font-semibold">Adı:</span> {customer?.full_name ?? '-'}
            </div>
            <div className="text-right">
              <span className="font-semibold">Form No:</span> {form.form_number}
            </div>
            <div className="col-span-2">
              <span className="font-semibold">Adres:</span> {customer?.address ?? '-'}
            </div>
            <div className="text-right">
              <span className="font-semibold">Yetkili:</span> {customerAuthorized}
            </div>
            <div className="text-right">
              <span className="font-semibold">Yetkili Tel:</span> {customer?.authorized_phone ?? '-'}
            </div>
          </div>
        </header>

        <section className="border border-black">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-2 text-center">Adet</th>
                <th className="border border-black px-2 py-2 text-left">Malın Cinsi</th>
                <th className="border border-black px-2 py-2 text-left">Markası</th>
                <th className="border border-black px-2 py-2 text-center">Fatura Tar</th>
                <th className="border border-black px-2 py-2 text-center">Dolum Tar</th>
                <th className="border border-black px-2 py-2 text-center">1. Kontrol</th>
                <th className="border border-black px-2 py-2 text-center">2. Kontrol</th>
                <th className="border border-black px-2 py-2 text-center">3. Kontrol</th>
                <th className="border border-black px-2 py-2 text-center">Bitiş Tarih</th>
              </tr>
            </thead>
            <tbody>
              {trackingRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border border-black px-2 py-6 text-center">
                    Takip satırı bulunamadı. Bu müşteriye ait cihaz kaydı gerekli.
                  </td>
                </tr>
              ) : (
                trackingRows.map((item, idx) => (
                  <Fragment key={`${item.label}-${idx}`}>
                    <tr>
                      <td className="border border-black px-2 py-2 text-center font-semibold">{item.quantity}</td>
                      <td className="border border-black px-2 py-2">{item.label}</td>
                      <td className="border border-black px-2 py-2">{item.brand}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.invoiceDate}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.fillDate}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.control1}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.control2}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.control3}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.expiryDate}</td>
                    </tr>
                    <tr>
                      <td className="border border-black px-2 py-1 text-center text-[10px] font-semibold">SERİ NO</td>
                      <td colSpan={8} className="border border-black px-2 py-1 text-[10px]">
                        {item.serials.length > 0 ? item.serials.join(', ') : '-'}
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="grid grid-cols-4 gap-3 text-sm">
          <div className="border border-black p-3">
            <div className="font-semibold">Toplam Cihaz</div>
            <div className="text-lg font-bold">{totalDevices}</div>
          </div>
          <div className="border border-black p-3">
            <div className="font-semibold">Servis Tarihi</div>
            <div>{toTrDate(form.service_date)}</div>
          </div>
          <div className="border border-black p-3">
            <div className="font-semibold">Sonraki Servis</div>
            <div>{toTrDate(form.next_service_date)}</div>
          </div>
          <div className="border border-black p-3">
            <div className="font-semibold">Servis Tipi</div>
            <div>{form.control_number ? `${form.control_number}. Kontrol` : 'Dolum / Genel'}</div>
          </div>
        </section>

        <section className="border border-black p-3 text-xs leading-5">
          <div className="font-semibold uppercase">KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LİMİTED ŞİRKETİ</div>
          <div>Ticaret Sicil No: 4213</div>
          <div>Merkez: Karaağaç Mah. 774. Sok. No:49 Erzincan | Tel: (0446) 214 45 81</div>
          <div>Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular - İstanbul | Tel: (0534) 311 49 05</div>
        </section>

        <section className="grid grid-cols-2 gap-4 pt-6 text-sm">
          <div className="border-t border-black pt-2">
            <div className="text-gray-600">Müşteri Onay İmzası</div>
          </div>
          <div className="border-t border-black pt-2 text-right">
            <div className="text-gray-600">Firma Yetkili Imza / Kase</div>
          </div>
        </section>
      </main>
    </div>
  )
}
