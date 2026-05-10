'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import { Eye, Trash2, X } from 'lucide-react'
import { deleteHatirlatmaKaydi } from './actions'

export type GecmisActionRecord = {
  id: string
  kanal: string | null
  alici_email: string | null
  alici_telefon: string | null
  mesaj_icerigi: string | null
  gonderim_zamani: string | null
  planli_gonderim_zamani: string | null
  durum: string | null
  hata_mesaji: string | null
  created_at: string | null
  musteri: { id: string; full_name: string } | null
  cihaz: { id: string; ad: string } | null
}

function formatDateTime(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' '
    + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-gray-100 py-2 last:border-0 dark:border-gray-700">
      <div className="text-xs font-medium uppercase text-gray-400">{label}</div>
      <div className="break-words text-sm text-gray-800 dark:text-gray-100">{value || '-'}</div>
    </div>
  )
}

export default function GecmisActions({ record, canDelete }: { record: GecmisActionRecord; canDelete: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const alici = record.alici_email ?? record.alici_telefon ?? '-'

  function handleDelete() {
    setMessage(null)
    if (!canDelete) {
      setMessage('Bu kaydi silme yetkiniz yok.')
      return
    }

    const confirmed = window.confirm('Bu gönderim kaydı silinecek. Devam etmek istiyor musunuz?')
    if (!confirmed) return

    startTransition(async () => {
      const result = await deleteHatirlatmaKaydi(record.id)
      setMessage(result.message)
      if (result.ok) {
        setOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="inline-flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => { setMessage(null); setOpen(true) }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-[#C8102E] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
          title="Detay"
          aria-label="Detay"
        >
          <Eye size={15} />
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-900/20"
            title="Sil"
            aria-label="Sil"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {message && (
        <div className="mt-1 text-right text-xs text-red-600">{message}</div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gönderim detayı</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
              <DetailRow label="Müşteri" value={record.musteri?.full_name} />
              <DetailRow label="Cihaz" value={record.cihaz?.ad} />
              <DetailRow label="Kanal" value={record.kanal} />
              <DetailRow label="Alıcı" value={alici} />
              <DetailRow label="Durum" value={record.durum} />
              <DetailRow label="Kayıt tarihi" value={formatDateTime(record.created_at)} />
              <DetailRow label="Gönderim tarihi" value={formatDateTime(record.gonderim_zamani)} />
              <DetailRow label="Planlı gönderim" value={formatDateTime(record.planli_gonderim_zamani)} />
              <DetailRow label="Tam hata mesajı" value={record.hata_mesaji} />
              <DetailRow
                label="Mesaj içeriği"
                value={record.mesaj_icerigi ? (
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    {record.mesaj_icerigi}
                  </pre>
                ) : null}
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={15} /> Sil
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
