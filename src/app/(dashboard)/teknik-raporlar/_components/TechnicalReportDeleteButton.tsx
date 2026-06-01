'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  reportId: string
  buttonClassName?: string
  onDeleted?: () => void
}

export default function TechnicalReportDeleteButton({ reportId, buttonClassName, onDeleted }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const response = await fetch(`/api/teknik-raporlar/${reportId}`, { method: 'DELETE' })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'Teknik rapor silinemedi. Lütfen tekrar deneyin.')

      setMessage(json.message || 'Teknik rapor silindi.')
      onDeleted?.()
      router.refresh()
      setTimeout(() => setOpen(false), 900)
    } catch (err) {
      console.error('[teknik-raporlar][delete-button] delete failed', err)
      setError(err instanceof Error ? err.message : 'Teknik rapor silinemedi. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClassName ?? 'text-red-600 hover:underline'}
      >
        Sil
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-gray-800">
            <div className="border-b px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Teknik Raporu Sil</h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Bu teknik rapor silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
              </p>
              {message && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>
            <div className="flex gap-3 border-t px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 rounded-lg border py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {loading ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
