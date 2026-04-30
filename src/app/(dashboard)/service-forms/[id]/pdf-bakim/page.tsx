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

function statusDisplay(value: string): { label: string; color: string } {
  const upper = (value ?? '').trim().toUpperCase()
  if (upper === 'SAĞLAM') return { label: 'SAĞLAM', color: '#16a34a' }
  if (upper === 'HASARLI') return { label: 'HASARLI', color: '#dc2626' }
  if (upper === 'DEĞİŞTİRİLDİ') return { label: 'DEĞİŞTİRİLDİ', color: '#ca8a04' }
  if (upper === 'YOK') return { label: 'YOK', color: '#9ca3af' }
  if (upper === 'KARISIK') return { label: 'KARISIK', color: '#ca8a04' }
  return { label: upper || '-', color: '#9ca3af' }
}

const C = {
  red: '#dc2626',
  redDark: '#b91c1c',
  black: '#1a1a1a',
  darkGray: '#374151',
  gray: '#6b7280',
  lightGray: '#9ca3af',
  bgGray: '#f9fafb',
  border: '#e5e7eb',
  white: '#ffffff',
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

  const thStyle: React.CSSProperties = {
    border: `1px solid ${C.redDark}`,
    padding: '6px 8px',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '8pt',
    color: C.white,
    backgroundColor: C.red,
  }

  const infoFields: [string, string | null][] = [
    ['Müşteri', customer?.full_name],
    ['Adres', customer?.address],
    ['Telefon', customer?.phone],
    ['Vergi No', customer?.tax_number],
    ['Teknisyen', form.technician_name],
  ]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6' }}>
      <PrintActions backHref={`/service-forms/${id}`} />
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .pdf-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <div
        className="pdf-page"
        style={{
          maxWidth: '794px',
          margin: '24px auto',
          backgroundColor: C.white,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          position: 'relative',
          minHeight: '1123px',
          paddingTop: '30px',
          paddingBottom: '80px',
          paddingLeft: '35px',
          paddingRight: '35px',
          fontFamily: 'Helvetica, Arial, sans-serif',
          fontSize: '9pt',
          color: C.black,
        }}
      >
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '22pt', fontWeight: 700, color: C.red, lineHeight: 1.1 }}>KÖKLÜ</div>
            <div style={{ fontSize: '10pt', fontWeight: 700, color: C.black, lineHeight: 1.3 }}>YANGIN SÖNDÜRME CİHAZLARI</div>
            <div style={{ fontSize: '10pt', fontWeight: 700, color: C.black, lineHeight: 1.3 }}>SANAYİ VE TİCARET LTD. ŞTİ.</div>
            <div style={{ fontSize: '8pt', color: '#555555', marginTop: '5px', lineHeight: 1.5 }}>
              Merkez: Karaağaç Mah. 774. Sok. No:49 Erzincan | Tel: (0446) 214 45 81
            </div>
            <div style={{ fontSize: '8pt', color: '#555555', lineHeight: 1.5 }}>
              Şube: Kışla Cd. Seferağa San. Sit. No:181/B İstanbul | Tel: (0534) 311 49 05
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18pt', fontWeight: 700, color: C.red, lineHeight: 1.1 }}>BAKIM FORMU</div>
            <div style={{ fontSize: '8pt', color: '#555555', marginTop: '8px' }}>Tarih: {toTrDate(form.service_date)}</div>
            <div style={{ fontSize: '8pt', color: '#555555' }}>Servis: {controlLabel}</div>
            <div style={{ fontSize: '8pt', color: '#555555' }}>Form No: {form.form_number}</div>
          </div>
        </div>

        {/* Red divider */}
        <div style={{ height: '2px', backgroundColor: C.red, marginBottom: '14px' }} />

        {/* Customer info box */}
        <section style={{
          border: `1px solid ${C.border}`,
          backgroundColor: C.bgGray,
          borderRadius: '3px',
          padding: '10px 14px',
          marginBottom: '14px',
        }}>
          {infoFields.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', marginBottom: '3px', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, width: '100pt', flexShrink: 0, color: C.darkGray, fontSize: '9pt' }}>{label}:</div>
              <div style={{ color: C.black, fontSize: '9pt' }}>{value ?? '-'}</div>
            </div>
          ))}
        </section>

        {/* Section title */}
        <div style={{ fontWeight: 700, fontSize: '10pt', color: C.black, marginBottom: '6px' }}>
          CİHAZ KONTROL TABLOSU
        </div>

        {/* Device table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: '62pt' }} />
            <col style={{ width: '62pt' }} />
            <col style={{ width: '62pt' }} />
            <col style={{ width: '62pt' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>Malın Cinsi</th>
              <th style={thStyle}>Gövde</th>
              <th style={thStyle}>Vana</th>
              <th style={thStyle}>Hortum</th>
              <th style={thStyle}>Saat</th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ border: `1px solid ${C.border}`, padding: '20px', textAlign: 'center', color: C.gray, fontSize: '8pt' }}>
                  Kayıtlı satır bulunamadı.
                </td>
              </tr>
            ) : (
              groupedRows.map((item: any, idx: number) => {
                const rowBg = idx % 2 === 0 ? C.white : C.bgGray
                const statuses: string[] = [item.body_status, item.valve_status, item.hose_status, item.gauge_status]
                return (
                  <Fragment key={item.id}>
                    <tr style={{ backgroundColor: rowBg }}>
                      <td style={{ border: `1px solid ${C.border}`, padding: '6px 8px' }}>
                        <div style={{ fontWeight: 600, fontSize: '8pt' }}>
                          {item.device_name ?? '-'} ({item.quantity ?? 0} Adet)
                        </div>
                        <div style={{ fontSize: '7pt', color: C.gray, marginTop: '2px' }}>
                          Seri No: {item.serial_number ?? '-'}
                        </div>
                      </td>
                      {statuses.map((status, si) => {
                        const { label, color } = statusDisplay(status)
                        return (
                          <td key={si} style={{ border: `1px solid ${C.border}`, padding: '5px 3px', textAlign: 'center', fontSize: '6.5pt', fontWeight: 700, color }}>
                            {label}
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td colSpan={5} style={{ border: `1px solid ${C.border}`, padding: '4px 8px', fontSize: '7pt', color: C.darkGray, backgroundColor: C.bgGray }}>
                        <span style={{ fontWeight: 700 }}>Açıklama:</span>{' '}
                        {customer?.full_name ?? 'Müşteri'} bünyesinde bulunan {item.quantity ?? 0} adet {item.device_name ?? 'cihaz'} için geçerlidir.
                        {item.notes ? ` Not: ${item.notes}` : ''}
                      </td>
                    </tr>
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>

        {/* Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          {([
            ['Genel Notlar', form.general_notes],
            ['Müşteriye Not', form.customer_note],
          ] as [string, string | null][]).map(([label, value]) => (
            <div key={label} style={{ border: `1px solid ${C.border}`, borderRadius: '3px', padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: '9pt', color: C.darkGray, marginBottom: '6px' }}>{label}</div>
              <div style={{ fontSize: '8pt', minHeight: '48px', color: C.black, whiteSpace: 'pre-wrap' }}>{value ?? '-'}</div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          marginBottom: '20px',
          border: `1px solid ${C.border}`,
          borderTop: `2px solid ${C.red}`,
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          {([
            ['Toplam Cihaz', String(totalDevices), true],
            ['Sonraki Servis', toTrDate(form.next_service_date), false],
            ['Vergi No', customer?.tax_number ?? '-', false],
          ] as [string, string, boolean][]).map(([label, value, large], i) => (
            <div key={label} style={{
              padding: '10px 12px',
              borderRight: i < 2 ? `1px solid ${C.border}` : undefined,
            }}>
              <div style={{ fontSize: '8pt', fontWeight: 700, color: C.darkGray }}>{label}</div>
              <div style={{ fontSize: large ? '14pt' : '9pt', fontWeight: large ? 700 : 400, color: C.black, marginTop: '2px' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Signature */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {(['Müşteri Onay İmzası', 'Firma Yetkili İmza / Kaşe'] as string[]).map(label => (
            <div key={label} style={{ border: `1px solid ${C.border}`, borderRadius: '3px', padding: '10px 12px', minHeight: '70px' }}>
              <div style={{ fontSize: '8pt', fontWeight: 700, color: C.darkGray }}>{label}</div>
              <div style={{ marginTop: '50px', borderBottom: `1px dashed ${C.lightGray}` }} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          position: 'absolute',
          bottom: '25px',
          left: '35px',
          right: '35px',
          borderTop: `1px solid ${C.border}`,
          paddingTop: '6px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '7pt', color: '#888888' }}>
            KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LİMİTED ŞİRKETİ · Ticaret Sicil No: 4213
          </div>
          <div style={{ fontSize: '7pt', color: '#888888' }}>
            Merkez: Karaağaç Mah. 774. Sok. No:49 Erzincan | Tel: (0446) 214 45 81
          </div>
          <div style={{ fontSize: '7pt', color: '#888888' }}>
            Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular - İstanbul | Tel: (0534) 311 49 05
          </div>
        </div>
      </div>
    </div>
  )
}
