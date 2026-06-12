'use client'

import { useMemo, useState, useTransition } from 'react'
import type { CompanyStampSettings } from '@/lib/company-stamp'
import { deleteCompanyStampAction, saveCompanyStampAction } from './actions'

export default function CompanyStampSettingsClient({ settings }: { settings: CompanyStampSettings }) {
  const [preview, setPreview] = useState(settings.stampDataUrl ?? '')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const hasStamp = Boolean(preview)
  const updatedAt = useMemo(() => {
    if (!settings.updatedAt) return null
    const date = new Date(settings.updatedAt)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }, [settings.updatedAt])

  function onFileChange(file: File | null) {
    if (!file) {
      setPreview(settings.stampDataUrl ?? '')
      return
    }
    setPreview(URL.createObjectURL(file))
  }

  function deleteStamp() {
    if (!window.confirm('Kaşe görseli silinsin mi?')) return
    setMessage('')
    startTransition(async () => {
      const result = await deleteCompanyStampAction()
      setMessage(result.message ?? 'İşlem tamamlandı.')
      if (result.ok) setPreview('')
    })
  }

  return (
    <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Kaşe ve İmza Ayarları</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Bakım formu ve müşteri takip formunda firma onay alanına basılacak merkezi kaşe görselini yönetin.
        </p>
      </div>

      <form
        action={formData => {
          setMessage('')
          startTransition(async () => {
            const result = await saveCompanyStampAction(formData)
            setMessage(result.message ?? 'İşlem tamamlandı.')
          })
        }}
        className="grid gap-5 lg:grid-cols-[280px_1fr]"
      >
        <div className="rounded-md border bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Önizleme</div>
          <div className="flex h-40 items-center justify-center rounded border border-dashed bg-white dark:border-gray-700 dark:bg-gray-950">
            {hasStamp ? (
              <img
                src={preview}
                alt="Firma kaşe önizlemesi"
                className="max-h-32 w-auto object-contain"
              />
            ) : (
              <span className="text-xs text-gray-400">Kaşe görseli yüklenmedi.</span>
            )}
          </div>
          {settings.stampFileName && (
            <div className="mt-2 truncate text-xs text-gray-500 dark:text-gray-400">{settings.stampFileName}</div>
          )}
          {updatedAt && <div className="mt-1 text-xs text-gray-400">Son güncelleme: {updatedAt}</div>}
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Kaşe görseli</label>
            <input
              type="file"
              name="stamp"
              accept="image/png,image/jpeg,image/webp"
              onChange={event => onFileChange(event.target.files?.[0] ?? null)}
              className="block w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
            <p className="mt-1 text-xs text-gray-400">PNG, JPG, JPEG veya WEBP. En fazla 2 MB.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              name="defaultStamped"
              defaultChecked={settings.defaultStamped}
              className="h-4 w-4 rounded border-gray-300 text-[#C8102E]"
            />
            Bakım ve takip formlarında varsayılan olarak kaşeli çıktı seçili gelsin.
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25] disabled:opacity-60"
            >
              {isPending ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
            </button>
            <button
              type="button"
              onClick={deleteStamp}
              disabled={isPending || !settings.stampDataUrl}
              className="rounded-md border px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-gray-700"
            >
              Kaşeyi Sil
            </button>
          </div>

          {message && <div className="text-sm text-gray-600 dark:text-gray-300">{message}</div>}
        </div>
      </form>
    </section>
  )
}
