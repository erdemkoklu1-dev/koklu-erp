'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TechnicalReportRow } from '@/lib/technical-reports/types'
import TechnicalReportDeleteButton from './TechnicalReportDeleteButton'

type Option = { id: string; label: string }

type Props = {
  report: TechnicalReportRow
  customers: Option[]
  subeler: Option[]
}

type Message = { type: 'success' | 'error'; text: string } | null

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export default function TechnicalReportActions({ report, customers, subeler }: Props) {
  const router = useRouter()
  const [message, setMessage] = useState<Message>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const defaultCustomerId = report.customer_id ?? customers[0]?.id ?? ''
  const defaultSubeId = report.sube_id ?? subeler[0]?.id ?? ''
  const hasMaterials = Array.isArray(report.material_list) && report.material_list.length > 0
  const defaultQuoteTitle = useMemo(() => `${report.rapor_no} Teknik Rapor Teklifi`, [report.rapor_no])

  function openPdfPage() {
    window.open(`/teknik-raporlar/${report.id}/yazdir`, '_blank', 'noopener,noreferrer')
    setMessage({ type: 'success', text: 'PDF için yazdırma sayfası açıldı.' })
  }

  async function postAction(endpoint: string, successFallback: string) {
    setLoading(endpoint)
    setMessage(null)
    try {
      const response = await fetch(endpoint, { method: 'POST' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || successFallback)
      setMessage({ type: 'success', text: json.message || successFallback })
      router.refresh()
      return json
    } catch (err) {
      console.error('[teknik-raporlar][detail-actions] action failed', { endpoint, err })
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' })
      return null
    } finally {
      setLoading(null)
    }
  }

  async function copyReport() {
    const json = await postAction(`/api/teknik-raporlar/${report.id}/copy`, 'Teknik rapor kopyalandı.')
    if (json?.id) router.push(`/teknik-raporlar/${json.id}`)
  }

  async function cancelReport() {
    const json = await postAction(`/api/teknik-raporlar/${report.id}/cancel`, 'Teknik rapor iptal edildi.')
    if (json) setCancelOpen(false)
  }

  async function createQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setLoading('quote')
    setMessage(null)

    try {
      const response = await fetch(`/api/teknik-raporlar/${report.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: String(form.get('customerId') || ''),
          subeId: String(form.get('subeId') || ''),
          title: String(form.get('title') || ''),
          validityDate: String(form.get('validityDate') || ''),
          description: String(form.get('description') || ''),
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Teklif oluşturulamadı. Lütfen tekrar deneyin.')
      setMessage({ type: 'success', text: json.message || 'Teknik rapor teklife aktarıldı.' })
      setQuoteOpen(false)
      router.refresh()
      if (json.teklifId && confirm('Teklif oluşturuldu. Oluşturulan teklif detayına gitmek ister misiniz?')) {
        router.push(`/fiyat-teklifleri/${json.teklifId}`)
      }
    } catch (err) {
      console.error('[teknik-raporlar][quote-modal] quote failed', err)
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Teklif oluşturulamadı. Lütfen tekrar deneyin.' })
    } finally {
      setLoading(null)
    }
  }

  function handleQuoteClick() {
    setMessage(null)
    if (!hasMaterials) {
      setMessage({ type: 'error', text: 'Bu raporda teklife aktarılabilecek ihtiyaç kalemi bulunmuyor.' })
      return
    }
    setQuoteOpen(true)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={openPdfPage} className="rounded-lg border px-4 py-2 text-sm font-semibold dark:border-gray-600">PDF İndir</button>
        <button
          type="button"
          onClick={handleQuoteClick}
          disabled={report.durum === 'İptal'}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
        >
          Teklife Aktar
        </button>
        <button
          type="button"
          onClick={copyReport}
          disabled={loading === `/api/teknik-raporlar/${report.id}/copy`}
          className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:border-gray-600"
        >
          {loading === `/api/teknik-raporlar/${report.id}/copy` ? 'Kopyalanıyor...' : 'Kopyala'}
        </button>
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          disabled={report.durum === 'İptal'}
          className="rounded-lg border px-4 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
        >
          İptal Et
        </button>
        <TechnicalReportDeleteButton reportId={report.id} buttonClassName="rounded-lg border px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-gray-600" />
      </div>

      {message && (
        <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </p>
      )}

      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-gray-800">
            <div className="border-b px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Teknik Raporu İptal Et</h3>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
              Bu teknik rapor iptal edilecek. Devam etmek istiyor musunuz?
            </div>
            <div className="flex gap-3 border-t px-5 py-4 dark:border-gray-700">
              <button type="button" onClick={() => setCancelOpen(false)} disabled={loading === `/api/teknik-raporlar/${report.id}/cancel`} className="flex-1 rounded-lg border py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600">Vazgeç</button>
              <button type="button" onClick={cancelReport} disabled={loading === `/api/teknik-raporlar/${report.id}/cancel`} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {loading === `/api/teknik-raporlar/${report.id}/cancel` ? 'İptal ediliyor...' : 'İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={createQuote} className="w-full max-w-lg rounded-lg bg-white shadow-2xl dark:bg-gray-800">
            <div className="border-b px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Teklife Aktar</h3>
              {report.teklif_id && (
                <p className="mt-2 text-xs text-amber-700">
                  Bu rapor daha önce bir teklife aktarılmış. Yeni teklif oluşturabilir veya mevcut teklifi açabilirsiniz.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-2">
              <label>
                Müşteri
                <select name="customerId" defaultValue={defaultCustomerId} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600">
                  <option value="">Manuel müşteri bilgisi</option>
                  {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.label}</option>)}
                </select>
              </label>
              <label>
                Şube
                <select name="subeId" defaultValue={defaultSubeId} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600">
                  {subeler.map(sube => <option key={sube.id} value={sube.id}>{sube.label}</option>)}
                </select>
              </label>
              <label className="md:col-span-2">
                Teklif Başlığı
                <input name="title" defaultValue={defaultQuoteTitle} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600" />
              </label>
              <label>
                Geçerlilik Tarihi
                <input name="validityDate" type="date" defaultValue={addDays(7)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600" />
              </label>
              <label className="md:col-span-2">
                Açıklama
                <textarea name="description" rows={3} defaultValue={`Teknik rapor no: ${report.rapor_no}`} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600" />
              </label>
            </div>
            <div className="flex flex-wrap gap-3 border-t px-5 py-4 dark:border-gray-700">
              {report.teklif_id && (
                <button type="button" onClick={() => router.push(`/fiyat-teklifleri/${report.teklif_id}`)} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600">
                  Mevcut Teklifi Aç
                </button>
              )}
              <button type="button" onClick={() => setQuoteOpen(false)} disabled={loading === 'quote'} className="ml-auto rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600">Vazgeç</button>
              <button type="submit" disabled={loading === 'quote'} className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a50d26] disabled:opacity-60">
                {loading === 'quote' ? 'Oluşturuluyor...' : 'Yeni Teklif Oluştur'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
