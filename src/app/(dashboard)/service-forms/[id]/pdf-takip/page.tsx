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
  const controlLabel = form.control_number ? `${form.control_number}. Kontrol` : 'Dolum / Genel Bakım'

  const thStyle: React.CSSProperties = {
    border: `1px solid ${C.redDark}`,
    padding: '5px 4px',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '7pt',
    color: C.white,
    backgroundColor: C.red,
  }

  const infoFields: [string, string | null][] = [
    ['Müşteri', customer?.full_name],
    ['Vergi No', customer?.tax_number],
    ['Telefon', customer?.phone],
    ['Adres', customer?.address],
    ['Servis Tarihi', toTrDate(form.service_date)],
    ['Servis Tipi', controlLabel],
    ['Sonraki Servis', toTrDate(form.next_service_date)],
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
            <div style={{ fontSize: '16pt', fontWeight: 700, color: C.red, lineHeight: 1.1 }}>MÜŞTERİ</div>
            <div style={{ fontSize: '16pt', fontWeight: 700, color: C.red, lineHeight: 1.1 }}>TAKİP FORMU</div>
            <div style={{ fontSize: '8pt', color: '#555555', marginTop: '8px' }}>Form No: {form.form_number}</div>
          </div>
        </div>

        {/* Red divider */}
        <div style={{ height: '2px', backgroundColor: C.red, marginBottom: '14px' }} />

        {/* Customer / service info box */}
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
          CİHAZ TAKİP TABLOSU
        </div>

        {/* Tracking table — 9 columns, portrait A4 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '30pt' }} />
            <col style={{ width: '115pt' }} />
            <col style={{ width: '38pt' }} />
            <col style={{ width: '50pt' }} />
            <col style={{ width: '50pt' }} />
            <col style={{ width: '50pt' }} />
            <col style={{ width: '50pt' }} />
            <col style={{ width: '50pt' }} />
            <col style={{ width: '55pt' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Adet</th>
              <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '6px' }}>Malın Cinsi</th>
              <th style={thStyle}>Marka</th>
              <th style={thStyle}>Fat.Tar</th>
              <th style={thStyle}>Dol.Tar</th>
              <th style={thStyle}>1.Knt</th>
              <th style={thStyle}>2.Knt</th>
              <th style={thStyle}>3.Knt</th>
              <th style={thStyle}>Bitiş</th>
            </tr>
          </thead>
          <tbody>
            {trackingRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ border: `1px solid ${C.border}`, padding: '20px', textAlign: 'center', color: C.gray, fontSize: '8pt' }}>
                  Takip satırı bulunamadı. Bu müşteriye ait cihaz kaydı gerekli.
                </td>
              </tr>
            ) : (
              trackingRows.map((item, idx) => {
                const rowBg = idx % 2 === 0 ? C.white : C.bgGray
                return (
                  <Fragment key={`${item.label}-${idx}`}>
                    <tr style={{ backgroundColor: rowBg }}>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontWeight: 700, fontSize: '8pt' }}>
                        {item.quantity}
                      </td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 6px', fontSize: '7pt' }}>
                        <div style={{ fontWeight: 600 }}>{item.label}</div>
                        {item.serials.length > 0 && (
                          <div style={{ fontSize: '6pt', color: C.gray, marginTop: '2px' }}>
                            Seri: {item.serials.join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.brand}</td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.invoiceDate}</td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.fillDate}</td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.control1}</td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.control2}</td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.control3}</td>
                      <td style={{ border: `1px solid ${C.border}`, padding: '5px 4px', textAlign: 'center', fontSize: '7pt' }}>{item.expiryDate}</td>
                    </tr>
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>

        {/* Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140pt 1fr',
          marginBottom: '20px',
          border: `1px solid ${C.border}`,
          borderTop: `2px solid ${C.red}`,
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 12px', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '8pt', fontWeight: 700, color: C.darkGray }}>Toplam Cihaz</div>
            <div style={{ fontSize: '14pt', fontWeight: 700, color: C.black, marginTop: '2px' }}>{totalDevices}</div>
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '8pt', fontWeight: 700, color: C.darkGray }}>Sonraki Servis</div>
                <div style={{ fontSize: '9pt', color: C.black, marginTop: '2px' }}>{toTrDate(form.next_service_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: '8pt', fontWeight: 700, color: C.darkGray }}>Servis Tipi</div>
                <div style={{ fontSize: '9pt', color: C.black, marginTop: '2px' }}>{controlLabel}</div>
              </div>
            </div>
          </div>
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
