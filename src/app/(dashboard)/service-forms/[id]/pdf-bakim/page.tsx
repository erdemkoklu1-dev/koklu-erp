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

function mergeStatus(current: string | null, next: string | null) {
  const normalizedNext = next && next.trim().length > 0 ? next : '-'
  if (!current) return normalizedNext
  if (current === normalizedNext) return current
  return 'KARISIK'
}

export default async function ServiceFormBakimPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: form, error: formError } = await supabase
    .from('service_forms')
    .select('*, customers(full_name, phone, address, tax_number)')
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
    .select('custom_device_name, capacity, quantity, serial_number, device_types(name)')
    .eq('customer_id', form.customer_id)
    .eq('is_active', true)
    .order('created_at')

  const itemRows = items ?? []
  const rows =
    itemRows.length > 0
      ? itemRows
      : (devices ?? []).map((device: any) => {
          const baseName = device.custom_device_name ?? device.device_types?.name ?? 'Cihaz'
          const capacity = device.capacity ? ` ${device.capacity} KG` : ''
          return {
            id: `device-${baseName}-${device.serial_number ?? Math.random().toString(36).slice(2)}`,
            device_name: normalizeDeviceName(`${baseName}${capacity}`.trim()),
            serial_number: device.serial_number ?? '-',
            quantity: device.quantity ?? 1,
            body_status: 'SAĞLAM',
            valve_status: 'SAĞLAM',
            hose_status: 'SAĞLAM',
            gauge_status: 'SAĞLAM',
            notes: null,
          }
        })

  const grouped = new Map<string, any>()
  for (const row of rows) {
    const name = normalizeDeviceName((row.device_name ?? 'Cihaz').trim())
    if (!grouped.has(name)) {
      grouped.set(name, {
        id: `group-${name}`,
        device_name: name,
        quantity: 0,
        serials: [] as string[],
        body_status: null as string | null,
        valve_status: null as string | null,
        hose_status: null as string | null,
        gauge_status: null as string | null,
        notes: [] as string[],
      })
    }

    const g = grouped.get(name)
    g.quantity += Number(row.quantity ?? 0)
    g.body_status = mergeStatus(g.body_status, row.body_status)
    g.valve_status = mergeStatus(g.valve_status, row.valve_status)
    g.hose_status = mergeStatus(g.hose_status, row.hose_status)
    g.gauge_status = mergeStatus(g.gauge_status, row.gauge_status)

    const serial = row.serial_number?.trim()
    if (serial && serial !== '-' && !g.serials.includes(serial)) {
      g.serials.push(serial)
    }
    const note = row.notes?.trim()
    if (note && !g.notes.includes(note)) {
      g.notes.push(note)
    }
  }

  const groupedRows = Array.from(grouped.values()).map(group => ({
    ...group,
    serial_number: group.serials.length > 0 ? group.serials.join(', ') : '-',
    notes: group.notes.length > 0 ? group.notes.join(' | ') : null,
    body_status: group.body_status ?? '-',
    valve_status: group.valve_status ?? '-',
    hose_status: group.hose_status ?? '-',
    gauge_status: group.gauge_status ?? '-',
  }))

  const totalDevices = groupedRows.reduce((sum: number, row: any) => sum + (row.quantity ?? 0), 0)
  const customer = form.customers as any
  const controlLabel = form.control_number ? `${form.control_number}. Kontrol` : 'Dolum / Genel Bakım'

  return (
    <div className="min-h-screen bg-white text-black">
      <PrintActions backHref={`/service-forms/${id}`} />

      <main className="max-w-5xl mx-auto p-6 space-y-4">
        <header className="border-2 border-black p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">FIRMA BAKIM FORMU</h1>
              <div className="text-sm mt-1 font-semibold">{customer?.full_name ?? '-'}</div>
            </div>
            <div className="text-sm text-right">
              <div>Tarih: {toTrDate(form.service_date)}</div>
              <div>Servis Turu: {controlLabel}</div>
              <div>Form No: {form.form_number}</div>
            </div>
          </div>
        </header>

        <section className="border border-black p-4 text-sm">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="font-semibold">Musteri:</span> {customer?.full_name ?? '-'}
            </div>
            <div>
              <span className="font-semibold">Telefon:</span> {customer?.phone ?? '-'}
            </div>
            <div>
              <span className="font-semibold">Adres:</span> {customer?.address ?? '-'}
            </div>
            <div>
              <span className="font-semibold">Teknisyen:</span> {form.technician_name ?? '-'}
            </div>
          </div>
        </section>

        <section className="border border-black">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-2 text-left">Malin Cinsi</th>
                <th className="border border-black px-2 py-2 text-left">Seri No</th>
                <th className="border border-black px-2 py-2 text-center">Govde</th>
                <th className="border border-black px-2 py-2 text-center">Vana</th>
                <th className="border border-black px-2 py-2 text-center">Hortum</th>
                <th className="border border-black px-2 py-2 text-center">Saat</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-black px-2 py-6 text-center">
                    Kayitli satir bulunamadi.
                  </td>
                </tr>
              ) : (
                groupedRows.map((item: any) => (
                  <Fragment key={item.id}>
                    <tr>
                      <td className="border border-black px-2 py-2">
                        {item.device_name ?? '-'} ({item.quantity ?? 0} Adet)
                      </td>
                      <td className="border border-black px-2 py-2">{item.serial_number ?? '-'}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.body_status ?? '-'}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.valve_status ?? '-'}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.hose_status ?? '-'}</td>
                      <td className="border border-black px-2 py-2 text-center">{item.gauge_status ?? '-'}</td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="border border-black px-2 py-1.5 text-[11px]">
                        <span className="font-semibold">Aciklama:</span> {customer?.full_name ?? 'Musteri'} bunyesinde
                        bulunan {item.quantity ?? 0} adet {item.device_name ?? 'cihaz'} icin gecerlidir.
                        {item.notes ? ` Not: ${item.notes}` : ''}
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="grid grid-cols-2 gap-4 text-sm">
          <div className="border border-black p-3">
            <div className="font-semibold mb-2">Genel Notlar</div>
            <div className="min-h-16 whitespace-pre-wrap">{form.general_notes ?? '-'}</div>
          </div>
          <div className="border border-black p-3">
            <div className="font-semibold mb-2">Musteriye Not</div>
            <div className="min-h-16 whitespace-pre-wrap">{form.customer_note ?? '-'}</div>
          </div>
        </section>

        <footer className="grid grid-cols-3 gap-3 text-sm pt-3">
          <div className="border border-black p-3">
            <div className="font-semibold">Toplam Cihaz</div>
            <div className="text-lg font-bold">{totalDevices}</div>
          </div>
          <div className="border border-black p-3">
            <div className="font-semibold">Sonraki Servis</div>
            <div>{toTrDate(form.next_service_date)}</div>
          </div>
          <div className="border border-black p-3">
            <div className="font-semibold">Vergi No</div>
            <div>{customer?.tax_number ?? '-'}</div>
          </div>
        </footer>

        <section className="border border-black p-3 text-xs leading-5">
          <div className="font-semibold uppercase">KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LİMİTED ŞİRKETİ</div>
          <div>Ticaret Sicil No: 4213</div>
          <div>Merkez: Karaağaç Mah. 774. Sok. No:49 Erzincan | Tel: (0446) 214 45 81</div>
          <div>Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular - İstanbul | Tel: (0534) 311 49 05</div>
        </section>
      </main>
    </div>
  )
}
