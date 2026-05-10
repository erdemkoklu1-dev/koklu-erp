'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTeslimatAction } from './actions'

export function TeslimatSilButton({ id, teslimatNo }: { id: string; teslimatNo: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    const confirmed = window.confirm(`${teslimatNo} numaralı teslimat silinecek. Devam etmek istiyor musunuz?`)
    if (!confirmed) return

    setError('')
    startTransition(async () => {
      const result = await deleteTeslimatAction(id)
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={handleClick} disabled={isPending} className="text-red-600 disabled:opacity-50">
        {isPending ? 'Siliniyor...' : 'Sil'}
      </button>
      {error && <span className="max-w-48 text-xs text-red-600">{error}</span>}
    </span>
  )
}
