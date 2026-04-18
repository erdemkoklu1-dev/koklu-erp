'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function BrokerActions({ brokerId }: { brokerId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('brokers').update({ is_active: false }).eq('id', brokerId)
    router.push('/araclar')
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Emin misiniz?</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {deleting ? 'Siliniyor...' : 'Evet, Sil'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          İptal
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/araclar/${brokerId}/edit`}
        className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
      >
        Düzenle
      </Link>
      <button
        onClick={() => setConfirming(true)}
        className="border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50 transition-colors"
      >
        Sil
      </button>
    </div>
  )
}
