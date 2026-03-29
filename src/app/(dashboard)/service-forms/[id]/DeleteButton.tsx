'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteServiceForm } from './delete-action'

export default function DeleteButton({ formId }: { formId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    const confirmed = window.confirm('Bu formu silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz.')
    if (!confirmed) return

    setBusy(true)
    try {
      const result = await deleteServiceForm(formId)
      if (!result.ok) {
        window.alert(`Silme başarısız: ${result.error}`)
        return
      }
      router.push('/service-forms')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleDelete}
      className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
      🗑️ Sil
    </button>
  )
}
