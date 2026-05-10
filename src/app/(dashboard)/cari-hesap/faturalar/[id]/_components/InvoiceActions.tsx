'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { formatCurrency } from '@/lib/finance/formatters'

type Props = {
  invoiceId: string
  status: string
  kalan?: number
  kaynak?: string
}

export default function InvoiceActions({ invoiceId, status, kalan = 0, kaynak }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    payment_date: today,
    amount: kalan > 0 ? String(kalan.toFixed(2)) : '',
    method: 'havale_eft',
    reference_no: '',
    notes: '',
    mahsup_tarihi: today,
    mahsup_aciklama: '',
  })
  const [payError, setPayError] = useState('')
  const [paying, setPaying] = useState(false)

  const isMahsup = form.method === 'vergi_mahsup'

  async function handleCancel() {
    if (!confirm('Bu faturayı iptal etmek istediğinizden emin misiniz?')) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('invoices').update({ status: 'iptal' }).eq('id', invoiceId)
    router.refresh()
    setLoading(false)
  }

  async function handleDelete() {
    setLoading(true)
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/cari-hesap/faturalar')
    } else {
      setLoading(false)
      setConfirmDelete(false)
      alert('Silme işlemi başarısız oldu.')
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault()
    if (paying) return  // Double tıklamayı engelle
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setPayError('Geçerli bir tutar girin.'); return }
    if (isMahsup && !form.mahsup_tarihi) { setPayError('Mahsup tarihi zorunludur.'); return }
    setPaying(true); setPayError('')

    const res = await fetch('/api/odeme-kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_id: invoiceId,
        amount: amt,
        payment_date: form.payment_date,
        method: form.method,
        reference_no: form.reference_no || null,
        notes: form.notes || null,
        mahsup_tarihi: isMahsup ? form.mahsup_tarihi : undefined,
        mahsup_aciklama: isMahsup ? (form.mahsup_aciklama || null) : undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setPayError(data.error ?? 'Kayıt hatası'); setPaying(false); return }

    setPaying(false)
    setShowModal(false)
    router.refresh()
  }

  function openModal() {
    setShowModal(true)
    setForm(p => ({ ...p, amount: kalan > 0 ? String(kalan.toFixed(2)) : '' }))
  }

  function onMethodChange(method: string) {
    setForm(p => ({
      ...p,
      method,
      // Mahsup seçilince tutarı kalan'a eşitle
      amount: method === 'vergi_mahsup' && kalan > 0 ? String(kalan.toFixed(2)) : p.amount,
    }))
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-300">Kalıcı olarak silinecek, emin misiniz?</span>
        <button onClick={handleDelete} disabled={loading}
          className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
          {loading ? 'Siliniyor...' : 'Evet, Sil'}
        </button>
        <button onClick={() => setConfirmDelete(false)}
          className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
          İptal
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Ödeme Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 rounded-t-2xl ${isMahsup ? 'bg-violet-600' : 'bg-green-600'}`}>
              <div className="text-white font-semibold">Ödeme Ekle</div>
              {kalan > 0 && (
                <div className={`text-xs mt-0.5 ${isMahsup ? 'text-violet-100' : 'text-green-100'}`}>
                  Kalan: <strong>{formatCurrency(kalan)}</strong>
                </div>
              )}
            </div>
            <form onSubmit={handlePayment} className="p-5 space-y-4">

              {/* Ödeme Yöntemi — önce seçilsin */}
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ödeme Yöntemi</label>
                <select value={form.method} onChange={e => onMethodChange(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-800">
                  <option value="nakit">Nakit</option>
                  <option value="havale_eft">Havale / EFT</option>
                  <option value="kredi_karti">Kredi Kartı</option>
                  <option value="cek">Çek</option>
                  <option value="senet">Senet</option>
                  <option value="vergi_mahsup">Vergi Borcuna Mahsup</option>
                </select>
              </div>

              {/* Mahsup alanları */}
              {isMahsup ? (
                <>
                  <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-xs text-violet-700">
                    Bu tutara nakit tahsilat yapılmaz. Devlet bu fatura bedelini vergi borcunuza mahsup eder.
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Mahsup Tarihi <span className="text-red-500">*</span></label>
                    <input type="date" value={form.mahsup_tarihi}
                      onChange={e => setForm(p => ({ ...p, mahsup_tarihi: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Tutar (₺) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" min="0.01" value={form.amount}
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    {kalan > 0 && parseFloat(form.amount) > 0 && parseFloat(form.amount) < kalan && (
                      <p className="text-xs text-orange-500 mt-1">Kısmi mahsup — kalan: {formatCurrency(kalan - parseFloat(form.amount))}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Açıklama (Vergi Dönemi / Kurum)</label>
                    <textarea value={form.mahsup_aciklama}
                      onChange={e => setForm(p => ({ ...p, mahsup_aciklama: e.target.value }))}
                      placeholder="Örn: 2025/Q1 KDV beyannamesi, Hazine ve Maliye Bakanlığı"
                      rows={2}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ödeme Tarihi</label>
                    <input type="date" value={form.payment_date}
                      onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Tutar (₺) <span className="text-red-500">*</span></label>
                    <input type="number" step="0.01" min="0.01" value={form.amount}
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    {kalan > 0 && parseFloat(form.amount) > 0 && parseFloat(form.amount) < kalan && (
                      <p className="text-xs text-orange-500 mt-1">Kısmi ödeme — kalan: {formatCurrency(kalan - parseFloat(form.amount))}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Referans / Dekont No</label>
                    <input value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))}
                      placeholder="Opsiyonel"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Notlar</label>
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </>
              )}

              {payError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{payError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={paying}
                  className={`flex-1 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                    isMahsup ? 'bg-violet-600 hover:bg-violet-700' : 'bg-green-600 hover:bg-green-700'
                  }`}>
                  {paying ? 'Kaydediliyor...' : isMahsup ? 'Mahsubu Kaydet' : 'Ödemeyi Kaydet'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Link href={`/cari-hesap/faturalar/${invoiceId}/edit${kaynak ? `?kaynak=${kaynak}` : ''}`}
          className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50">
          Düzenle
        </Link>
        {status !== 'odendi' && status !== 'iptal' && (
          <button onClick={openModal}
            className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700">
            Ödeme Ekle
          </button>
        )}
        {status !== 'iptal' && (
          <button onClick={handleCancel} disabled={loading}
            className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">
            {loading ? '...' : 'İptal Et'}
          </button>
        )}
        <button onClick={() => setConfirmDelete(true)}
          className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50">
          Sil
        </button>
      </div>
    </>
  )
}
