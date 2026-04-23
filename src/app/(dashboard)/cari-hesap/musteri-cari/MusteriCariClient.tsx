'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatTRDate, PAYMENT_METHOD_LABELS } from '@/lib/finance/formatters'
import { createClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  full_name: string
  phone: string | null
  tax_number: string | null
  email: string | null
  address: string | null
  iban?: string | null
  bank_name?: string | null
}
type Invoice = {
  id: string; customer_id: string | null; invoice_number: string | null
  invoice_date: string | null; due_date: string | null
  total_amount: number | null; paid_amount: number | null
  status: string | null; invoice_type: string | null
}
type Payment = {
  id: string; invoice_id: string | null; payment_date: string | null
  amount: number | null; method: string | null; reference_no: string | null
}
type Mutabakat = {
  id: string
  musteri_id: string
  mutabakat_tarihi: string
  bizim_bakiye: number
  musteri_bakiyesi: number | null
  durum: string
  notlar: string | null
  created_at: string
}

type Props = {
  customers: Customer[]
  invoices: Invoice[]
  payments: Payment[]
  today: string
}

const MUTABAKAT_DURUM_LABELS: Record<string, { label: string; cls: string }> = {
  taslak:     { label: 'Taslak',     cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  gonderildi: { label: 'Gönderildi', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  onaylandi:  { label: 'Onaylandı',  cls: 'bg-green-50 text-green-700 border-green-200' },
  itiraz:     { label: 'İtiraz',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  fark_var:   { label: 'Fark Var',   cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function MusteriCariClient({ customers, invoices, payments, today }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'faturalar' | 'odemeler' | 'ekstre' | 'notlar' | 'mutabakat'>('faturalar')
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState<string[]>([])

  // Mutabakat state
  const [mutabakatList, setMutabakatList] = useState<Mutabakat[]>([])
  const [mutabakatLoading, setMutabakatLoading] = useState(false)
  const [showMutabakatModal, setShowMutabakatModal] = useState(false)
  const [mutabakatTarih, setMutabakatTarih] = useState(today)
  const [mutabakatBakiye, setMutabakatBakiye] = useState('')
  const [mutabakatNotlar, setMutabakatNotlar] = useState('')
  const [mutabakatSaving, setMutabakatSaving] = useState(false)
  const [mutabakatDurumEdit, setMutabakatDurumEdit] = useState<string | null>(null)
  const [musteriBakiyeEdit, setMusteriBakiyeEdit] = useState('')

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      if (!inv.customer_id) continue
      const list = m.get(inv.customer_id) ?? []
      list.push(inv)
      m.set(inv.customer_id, list)
    }
    return m
  }, [invoices])

  type RowSummary = Customer & {
    totalInvoice: number
    totalPaid: number
    kalan: number
    gecikmisTutar: number
    lastDate: string | null
  }

  const rows: RowSummary[] = useMemo(() => {
    return customers.map(c => {
      const cinvs = invoiceMap.get(c.id) ?? []
      const totalInvoice = cinvs.reduce((s, i) => s + (i.total_amount ?? 0), 0)
      const totalPaid    = cinvs.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
      const kalan        = Math.max(0, totalInvoice - totalPaid)
      const lastDate     = cinvs.length > 0 ? cinvs[0].invoice_date : null
      const gecikmisTutar = cinvs.reduce((s, i) => {
        const effDue = i.due_date ?? i.invoice_date
        if (!effDue || effDue >= today) return s
        const k = Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0))
        return s + k
      }, 0)
      return { ...c, totalInvoice, totalPaid, kalan, gecikmisTutar, lastDate }
    })
  }, [customers, invoiceMap, today])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      (r.phone ?? '').includes(q) ||
      (r.tax_number ?? '').includes(q) ||
      (r.email ?? '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const selected = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId])
  const selInvoices = useMemo(() => selectedId ? (invoiceMap.get(selectedId) ?? []) : [], [selectedId, invoiceMap])
  const selPayments = useMemo(() => {
    const ids = new Set(selInvoices.map(i => i.id))
    return payments.filter(p => p.invoice_id && ids.has(p.invoice_id))
  }, [selInvoices, payments])

  const ekstre = useMemo(() => {
    type EksRow = { date: string; tip: string; aciklama: string; borc: number; alacak: number; bakiye: number }
    const eksList: Omit<EksRow, 'bakiye'>[] = []
    for (const inv of selInvoices) {
      eksList.push({ date: inv.invoice_date ?? '', tip: 'Fatura', aciklama: inv.invoice_number ?? '-', borc: inv.total_amount ?? 0, alacak: 0 })
    }
    for (const p of selPayments) {
      const inv = selInvoices.find(i => i.id === p.invoice_id)
      eksList.push({ date: p.payment_date ?? '', tip: 'Ödeme', aciklama: inv?.invoice_number ? `${inv.invoice_number} ödemesi` : 'Ödeme', borc: 0, alacak: p.amount ?? 0 })
    }
    eksList.sort((a, b) => a.date.localeCompare(b.date))
    let bakiye = 0
    return eksList.map(r => { bakiye += r.borc - r.alacak; return { ...r, bakiye } })
  }, [selInvoices, selPayments])

  const toplamAlacak = useMemo(() => rows.reduce((s, r) => s + r.kalan, 0), [rows])
  const gecikmisSayi = useMemo(() => rows.filter(r => r.gecikmisTutar > 0).length, [rows])

  // ── Mutabakat işlemleri ──────────────────────────────────────────
  const fetchMutabakat = useCallback(async (musteriId: string) => {
    setMutabakatLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('mutabakat_formlari')
      .select('*')
      .eq('musteri_id', musteriId)
      .order('created_at', { ascending: false })
    setMutabakatList(data ?? [])
    setMutabakatLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'mutabakat' && selectedId) {
      fetchMutabakat(selectedId)
    }
  }, [activeTab, selectedId, fetchMutabakat])

  function openMutabakatModal() {
    setMutabakatTarih(today)
    setMutabakatBakiye(selected ? String(selected.kalan.toFixed(2)) : '')
    setMutabakatNotlar('')
    setShowMutabakatModal(true)
  }

  async function saveMutabakat() {
    if (!selectedId || !mutabakatTarih) return
    setMutabakatSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('mutabakat_formlari')
      .insert({
        musteri_id: selectedId,
        mutabakat_tarihi: mutabakatTarih,
        bizim_bakiye: parseFloat(mutabakatBakiye) || 0,
        durum: 'taslak',
        notlar: mutabakatNotlar || null,
      })
      .select('id')
      .single()
    setMutabakatSaving(false)
    if (error) { alert('Kayıt hatası: ' + error.message); return }
    setShowMutabakatModal(false)
    if (data?.id) {
      router.push(`/cari-hesap/musteri-cari/mutabakat/${data.id}`)
    } else {
      fetchMutabakat(selectedId)
    }
  }

  async function updateMutabakatDurum(id: string, durum: string, musteriBakiyesi?: number | null) {
    const supabase = createClient()
    const update: any = { durum }
    if (musteriBakiyesi !== undefined) update.musteri_bakiyesi = musteriBakiyesi
    await supabase.from('mutabakat_formlari').update(update).eq('id', id)
    if (selectedId) fetchMutabakat(selectedId)
  }

  async function deleteMutabakat(id: string) {
    if (!confirm('Bu mutabakat formunu silmek istediğinizden emin misiniz?')) return
    const supabase = createClient()
    await supabase.from('mutabakat_formlari').delete().eq('id', id)
    if (selectedId) fetchMutabakat(selectedId)
  }

  // ── Print (Müşteri Cari PDF) ─────────────────────────────────────
  function handlePrint() {
    window.print()
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Print-only Cari Raporu ── */}
      {selected && (
        <div className="print-only hidden">
          <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '210mm', margin: '0 auto', padding: '10mm', fontSize: '11px', color: '#111' }}>
            {/* Başlık */}
            <div style={{ borderBottom: '2px solid #C8102E', paddingBottom: '8px', marginBottom: '12px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#C8102E' }}>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
              <div style={{ fontSize: '11px', color: '#555' }}>SANAYİ VE TİCARET LİMİTED ŞİRKETİ · Ticaret Sicil No: 4213</div>
              <div style={{ fontSize: '11px', color: '#555' }}>Karaağaç Mah. 774. Sok. No:49 Erzincan · Tel: (0446) 214 45 81</div>
            </div>

            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>MÜŞTERİ CARİ RAPORU</div>

            {/* Müşteri bilgileri */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px', marginBottom: '10px', backgroundColor: '#f9fafb' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{selected.full_name}</div>
              {selected.tax_number && <div>VKN: {selected.tax_number}</div>}
              {selected.phone && <div>Tel: {selected.phone}</div>}
              {selected.address && <div>{selected.address}</div>}
            </div>

            <div style={{ fontSize: '10px', color: '#888', marginBottom: '10px' }}>
              Rapor Tarihi: {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>

            {/* Hesap Özeti */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' }}>
              {[
                { label: 'Toplam Fatura', val: formatCurrency(selected.totalInvoice) },
                { label: 'Tahsil Edilen', val: formatCurrency(selected.totalPaid) },
                { label: 'Kalan Alacak', val: formatCurrency(selected.kalan) },
                { label: 'Gecikmiş', val: formatCurrency(selected.gecikmisTutar) },
              ].map(kpi => (
                <div key={kpi.label} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9px', color: '#888' }}>{kpi.label}</div>
                  <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{kpi.val}</div>
                </div>
              ))}
            </div>

            {/* Faturalar */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', borderBottom: '1px solid #e5e7eb', paddingBottom: '2px' }}>Faturalar</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Fatura No</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Tarih</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Vade</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Tutar</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Ödenen</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Kalan</th>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'center' }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {selInvoices.map(inv => {
                    const k = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                    const effDue = inv.due_date ?? inv.invoice_date
                    const late = effDue && effDue < today && k > 0
                    return (
                      <tr key={inv.id} style={{ backgroundColor: late ? '#fff5f5' : 'white' }}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px' }}>{formatTRDate(inv.invoice_date)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', color: late ? '#dc2626' : undefined }}>{formatTRDate(effDue)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right' }}>{formatCurrency(inv.total_amount)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right', color: '#16a34a' }}>{formatCurrency(inv.paid_amount)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right', color: k > 0 ? '#ea580c' : '#9ca3af', fontWeight: k > 0 ? 'bold' : undefined }}>{k > 0 ? formatCurrency(k) : '—'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'center' }}>{inv.status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Ödemeler */}
            {selPayments.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', borderBottom: '1px solid #e5e7eb', paddingBottom: '2px' }}>Ödemeler</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Tarih</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Tutar</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Yöntem</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Referans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selPayments.map(p => (
                      <tr key={p.id}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px' }}>{formatTRDate(p.payment_date)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right', color: '#16a34a', fontWeight: 'bold' }}>{formatCurrency(p.amount)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px' }}>{PAYMENT_METHOD_LABELS[p.method ?? ''] ?? p.method}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', fontFamily: 'monospace' }}>{p.reference_no ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Hesap Ekstresi */}
            {ekstre.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', borderBottom: '1px solid #e5e7eb', paddingBottom: '2px' }}>Hesap Ekstresi</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Tarih</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>İşlem</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Açıklama</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Borç</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Alacak</th>
                      <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Bakiye</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ekstre.map((row, i) => (
                      <tr key={i}>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px' }}>{formatTRDate(row.date)}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px' }}>{row.tip}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', fontFamily: 'monospace' }}>{row.aciklama}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right' }}>{row.borc > 0 ? formatCurrency(row.borc) : '—'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right', color: '#16a34a' }}>{row.alacak > 0 ? formatCurrency(row.alacak) : '—'}</td>
                        <td style={{ border: '1px solid #e5e7eb', padding: '3px 6px', textAlign: 'right', fontWeight: 'bold', color: row.bakiye > 0 ? '#ea580c' : row.bakiye < 0 ? '#16a34a' : '#9ca3af' }}>
                          {row.bakiye === 0 ? '—' : formatCurrency(Math.abs(row.bakiye))}
                          {row.bakiye < 0 && ' (alacak)'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* İmza alanı */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '11px' }}>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
                <div style={{ fontSize: '10px', color: '#555' }}>SANAYİ VE TİCARET LİMİTED ŞİRKETİ</div>
                <div style={{ marginTop: '20px', borderTop: '1px solid #111', paddingTop: '4px', width: '160px', fontSize: '10px' }}>Kaşe ve İmza</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: '#555', marginBottom: '20px' }}>Tarih: ___________</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sol Panel ── */}
      <div className="no-print w-72 flex-shrink-0 border-r bg-white flex flex-col h-full">
        <div className="px-4 py-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Müşteri Cari</h2>
            <Link href="/cari-hesap/faturalar/new"
              className="text-xs bg-[#C8102E] text-white px-2 py-1 rounded-lg hover:bg-[#a50d26]">
              + Fatura
            </Link>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Müşteri ara..."
            className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
          />
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{filtered.length} / {rows.length} müşteri</span>
            {gecikmisSayi > 0 && <span className="text-orange-600">{gecikmisSayi} gecikmiş</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelectedId(r.id); setActiveTab('faturalar') }}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedId === r.id ? 'bg-red-50 border-l-2 border-[#C8102E]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium truncate ${r.gecikmisTutar > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {r.full_name}
                </span>
                {r.kalan > 0 && (
                  <span className={`text-xs font-semibold ml-2 flex-shrink-0 ${r.gecikmisTutar > 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {formatCurrency(r.kalan)}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-0.5">
                {r.gecikmisTutar > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Gecikmiş</span>
                )}
                {r.totalInvoice === 0 && (
                  <span className="text-xs text-gray-300">Fatura yok</span>
                )}
                {r.kalan === 0 && r.totalInvoice > 0 && (
                  <span className="text-xs text-green-500">Kapandı</span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {search ? `"${search}" için sonuç bulunamadı` : 'Müşteri yok'}
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3 bg-gray-50">
          <div className="text-xs text-gray-500">Toplam Alacak</div>
          <div className="text-base font-bold text-orange-600">{formatCurrency(toplamAlacak)}</div>
        </div>
      </div>

      {/* ── Sağ Panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 no-print">
        {!selected ? (
          <div className="flex items-center justify-center h-full min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">Listeden bir müşteri seçin</p>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">

            {/* Müşteri başlık */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{selected.full_name}</h3>
                  <div className="flex gap-4 mt-1 text-xs text-gray-400">
                    {selected.phone && <span>{selected.phone}</span>}
                    {selected.email && <span>{selected.email}</span>}
                    {selected.tax_number && <span>VKN: {selected.tax_number}</span>}
                  </div>
                  {selected.address && <div className="text-xs text-gray-400 mt-0.5">{selected.address}</div>}
                  {(selected.bank_name || selected.iban) && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                      {selected.bank_name && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-medium">
                          {selected.bank_name}
                        </span>
                      )}
                      {selected.iban && (
                        <span className="text-xs text-gray-700 font-mono tracking-wide">
                          {selected.iban}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    PDF İndir
                  </button>
                  <button
                    onClick={openMutabakatModal}
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1"
                  >
                    Mutabakat Formu
                  </button>
                  <Link href={`/customers/${selected.id}`}
                    className="text-xs text-[#C8102E] hover:underline font-medium flex-shrink-0">
                    Müşteri Kartı →
                  </Link>
                </div>
              </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border rounded-xl p-3">
                <div className="text-xs text-gray-500">Toplam Fatura</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(selected.totalInvoice)}</div>
                <div className="text-xs text-gray-400">{selInvoices.length} fatura</div>
              </div>
              <div className="bg-white border rounded-xl p-3">
                <div className="text-xs text-gray-500">Tahsilat</div>
                <div className="text-lg font-bold text-green-700 mt-0.5">{formatCurrency(selected.totalPaid)}</div>
                <div className="text-xs text-gray-400">{selPayments.length} ödeme</div>
              </div>
              <div className={`rounded-xl p-3 border ${selected.kalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
                <div className={`text-xs ${selected.kalan > 0 ? 'text-orange-600' : 'text-gray-500'}`}>Kalan Alacak</div>
                <div className={`text-lg font-bold mt-0.5 ${selected.kalan > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                  {selected.kalan > 0 ? formatCurrency(selected.kalan) : '—'}
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${selected.gecikmisTutar > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                <div className={`text-xs ${selected.gecikmisTutar > 0 ? 'text-red-600' : 'text-gray-500'}`}>Gecikmiş</div>
                <div className={`text-lg font-bold mt-0.5 ${selected.gecikmisTutar > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                  {selected.gecikmisTutar > 0 ? formatCurrency(selected.gecikmisTutar) : '—'}
                </div>
                {selected.lastDate && (
                  <div className="text-xs text-gray-400">Son: {formatTRDate(selected.lastDate)}</div>
                )}
              </div>
            </div>

            {/* Sekmeler */}
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="border-b px-4 flex gap-0 overflow-x-auto">
                {(['faturalar', 'odemeler', 'ekstre', 'mutabakat', 'notlar'] as const).map(tab => {
                  const labels: Record<string, string> = {
                    faturalar: 'Faturalar', odemeler: 'Ödemeler',
                    ekstre: 'Hesap Özeti', notlar: 'Notlar', mutabakat: 'Mutabakat Formları'
                  }
                  return (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-[#C8102E] text-[#C8102E]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                      {labels[tab]}
                    </button>
                  )
                })}
              </div>

              {/* Sekme 1: Faturalar */}
              {activeTab === 'faturalar' && (
                <div>
                  <div className="px-4 py-2 border-b bg-gray-50 flex justify-end">
                    <Link href={`/cari-hesap/faturalar/new?customer_id=${selected.id}`}
                      className="text-xs bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
                      + Yeni Fatura
                    </Link>
                  </div>
                  {selInvoices.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Henüz fatura yok.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Fatura No</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Tarih</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Vade</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Tutar</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Ödenen</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Kalan</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selInvoices.map(inv => {
                            const k = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                            const effDue = inv.due_date ?? inv.invoice_date
                            const late = effDue && effDue < today && k > 0
                            return (
                              <tr key={inv.id} className={`hover:bg-gray-50 ${late ? 'bg-red-50/40' : ''}`}>
                                <td className="px-4 py-2.5">
                                  <Link href={`/cari-hesap/faturalar/${inv.id}`}
                                    className="font-mono text-xs text-[#C8102E] hover:underline">
                                    {inv.invoice_number}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{formatTRDate(inv.invoice_date)}</td>
                                <td className={`px-4 py-2.5 text-xs ${late ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                  {formatTRDate(effDue)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-800">{formatCurrency(inv.total_amount)}</td>
                                <td className="px-4 py-2.5 text-right text-xs text-green-700">{formatCurrency(inv.paid_amount)}</td>
                                <td className={`px-4 py-2.5 text-right text-sm font-semibold ${k > 0 ? (late ? 'text-red-600' : 'text-orange-600') : 'text-gray-300'}`}>
                                  {k > 0 ? formatCurrency(k) : '—'}
                                </td>
                                <td className="px-4 py-2.5">
                                  <StatusBadge status={inv.status} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sekme 2: Ödemeler */}
              {activeTab === 'odemeler' && (
                <div>
                  {selPayments.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Henüz ödeme kaydı yok.</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Tarih</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Tutar</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Yöntem</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Referans</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Fatura</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {selPayments.map(p => {
                              const inv = selInvoices.find(i => i.id === p.invoice_id)
                              return (
                                <tr key={p.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 text-xs text-gray-600">{formatTRDate(p.payment_date)}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(p.amount)}</td>
                                  <td className="px-4 py-2.5 text-xs text-gray-600">{PAYMENT_METHOD_LABELS[p.method ?? ''] ?? p.method}</td>
                                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{p.reference_no ?? '—'}</td>
                                  <td className="px-4 py-2.5 text-xs">
                                    {inv && <Link href={`/cari-hesap/faturalar/${inv.id}`} className="text-[#C8102E] hover:underline font-mono">{inv.invoice_number}</Link>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t px-4 py-3 bg-gray-50 flex justify-between text-sm">
                        <span className="text-gray-500">Toplam Ödenen</span>
                        <span className="font-bold text-green-700">{formatCurrency(selPayments.reduce((s, p) => s + (p.amount ?? 0), 0))}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Sekme 3: Hesap Özeti (Ekstre) */}
              {activeTab === 'ekstre' && (
                <div>
                  {ekstre.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">İşlem kaydı yok.</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Tarih</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">İşlem</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Açıklama</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Borç</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Alacak</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Bakiye</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {ekstre.map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatTRDate(row.date)}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.tip === 'Fatura' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                                    {row.tip}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-700 font-mono">{row.aciklama}</td>
                                <td className="px-4 py-2.5 text-right text-sm text-gray-800">
                                  {row.borc > 0 ? formatCurrency(row.borc) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm text-green-700">
                                  {row.alacak > 0 ? formatCurrency(row.alacak) : '—'}
                                </td>
                                <td className={`px-4 py-2.5 text-right text-sm font-bold ${row.bakiye > 0 ? 'text-orange-600' : row.bakiye < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                  {row.bakiye === 0 ? '—' : formatCurrency(Math.abs(row.bakiye))}
                                  {row.bakiye < 0 && <span className="text-xs font-normal ml-1">(alacak)</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t px-4 py-3 bg-gray-50 flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Güncel Bakiye</span>
                        <span className={`text-base font-bold ${(ekstre[ekstre.length - 1]?.bakiye ?? 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatCurrency(Math.abs(ekstre[ekstre.length - 1]?.bakiye ?? 0))}
                          {(ekstre[ekstre.length - 1]?.bakiye ?? 0) < 0 && <span className="text-xs font-normal ml-1">(müşteri alacaklı)</span>}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Sekme 4: Mutabakat Formları */}
              {activeTab === 'mutabakat' && (
                <div>
                  <div className="px-4 py-2 border-b bg-gray-50 flex justify-between items-center">
                    <span className="text-xs text-gray-500">Mutabakat Mektupları</span>
                    <button
                      onClick={openMutabakatModal}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                    >
                      + Yeni Mutabakat
                    </button>
                  </div>

                  {mutabakatLoading ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Yükleniyor...</div>
                  ) : mutabakatList.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Henüz mutabakat formu yok.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Mutabakat Tarihi</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Bizim Bakiye</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Müşteri Bakiyesi</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Durum</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {mutabakatList.map(m => {
                            const durumCfg = MUTABAKAT_DURUM_LABELS[m.durum] ?? { label: m.durum, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
                            const isEditing = mutabakatDurumEdit === m.id
                            return (
                              <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-xs text-gray-600">{formatTRDate(m.mutabakat_tarihi)}</td>
                                <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatCurrency(m.bizim_bakiye)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  {m.musteri_bakiyesi != null ? (
                                    <span className={`text-sm font-medium ${m.musteri_bakiyesi !== m.bizim_bakiye ? 'text-red-600' : 'text-green-600'}`}>
                                      {formatCurrency(m.musteri_bakiyesi)}
                                    </span>
                                  ) : <span className="text-gray-300 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-2.5">
                                  {isEditing ? (
                                    <div className="flex flex-col gap-1">
                                      <select
                                        className="border rounded px-2 py-1 text-xs"
                                        defaultValue={m.durum}
                                        onChange={async e => {
                                          await updateMutabakatDurum(m.id, e.target.value)
                                          setMutabakatDurumEdit(null)
                                        }}
                                      >
                                        {Object.entries(MUTABAKAT_DURUM_LABELS).map(([k, v]) => (
                                          <option key={k} value={k}>{v.label}</option>
                                        ))}
                                      </select>
                                      {(m.durum === 'itiraz' || m.durum === 'fark_var') && (
                                        <div className="flex gap-1">
                                          <input
                                            type="number"
                                            placeholder="Müşteri bakiyesi"
                                            value={musteriBakiyeEdit}
                                            onChange={e => setMusteriBakiyeEdit(e.target.value)}
                                            className="border rounded px-2 py-1 text-xs w-28"
                                          />
                                          <button
                                            onClick={() => {
                                              const v = parseFloat(musteriBakiyeEdit)
                                              if (!isNaN(v)) updateMutabakatDurum(m.id, m.durum, v)
                                              setMutabakatDurumEdit(null)
                                            }}
                                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                                          >
                                            Kaydet
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setMutabakatDurumEdit(m.id); setMusteriBakiyeEdit(String(m.musteri_bakiyesi ?? '')) }}
                                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 ${durumCfg.cls}`}
                                    >
                                      {durumCfg.label} ▾
                                    </button>
                                  )}
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="flex gap-2 justify-end">
                                    <Link
                                      href={`/cari-hesap/musteri-cari/mutabakat/${m.id}`}
                                      className="text-xs text-blue-600 hover:underline font-medium"
                                    >
                                      PDF →
                                    </Link>
                                    <button
                                      onClick={() => deleteMutabakat(m.id)}
                                      className="text-xs text-red-400 hover:text-red-600"
                                    >
                                      Sil
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sekme 5: Notlar */}
              {activeTab === 'notlar' && (
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { setNotes(p => [...p, note.trim()]); setNote('') } }}
                      placeholder="Not ekle... (Enter ile kaydet)"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                    />
                    <button
                      onClick={() => { if (note.trim()) { setNotes(p => [...p, note.trim()]); setNote('') } }}
                      className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]"
                    >
                      Ekle
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-6">Henüz not yok.</div>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((n, i) => (
                        <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-800">{n}</p>
                          <button onClick={() => setNotes(p => p.filter((_, j) => j !== i))}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Mutabakat Oluşturma Modal ── */}
      {showMutabakatModal && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Mutabakat Formu Oluştur</h3>
              <button onClick={() => setShowMutabakatModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Müşteri</label>
                <div className="border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">{selected.full_name}</div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mutabakat Tarihi</label>
                <input
                  type="date"
                  value={mutabakatTarih}
                  onChange={e => setMutabakatTarih(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Bizim Bakiyemiz (TL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={mutabakatBakiye}
                  onChange={e => setMutabakatBakiye(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {selected.kalan > 0 && (
                  <div className="text-xs text-gray-400 mt-1">
                    Güncel kalan alacak: {formatCurrency(selected.kalan)}
                    {' '}<button onClick={() => setMutabakatBakiye(String(selected.kalan.toFixed(2)))} className="text-blue-600 hover:underline">Kullan</button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notlar</label>
                <textarea
                  value={mutabakatNotlar}
                  onChange={e => setMutabakatNotlar(e.target.value)}
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="İsteğe bağlı..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => setShowMutabakatModal(false)}
                className="border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                İptal
              </button>
              <button
                onClick={saveMutabakat}
                disabled={mutabakatSaving || !mutabakatTarih || !mutabakatBakiye}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {mutabakatSaving ? 'Kaydediliyor...' : 'Kaydet ve PDF Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    taslak:       { label: 'Taslak',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    kesildi:      { label: 'Kesildi',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    gonderildi:   { label: 'Gönderildi',   cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    kismi_odendi: { label: 'Kısmi Ödendi', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    odendi:       { label: 'Ödendi',       cls: 'bg-green-50 text-green-700 border-green-200' },
    iptal:        { label: 'İptal',        cls: 'bg-red-50 text-red-600 border-red-200' },
  }
  const c = cfg[status ?? '']
  if (!c) return null
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>{c.label}</span>
}
