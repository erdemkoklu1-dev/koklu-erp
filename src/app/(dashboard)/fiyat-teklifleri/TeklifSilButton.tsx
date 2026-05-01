'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function TeklifSilButton({ id, teklifNo }: { id: string; teklifNo: string }) {
  const [modal, setModal]       = useState(false)
  const [siliniyor, setSiliniyor] = useState(false)
  const router = useRouter()

  async function handleSil() {
    setSiliniyor(true)
    const supabase = createClient()
    const { error } = await supabase.from('teklifler').delete().eq('id', id)
    if (error) {
      alert('Silinemedi: ' + error.message)
      setSiliniyor(false)
      return
    }
    setModal(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={() => setModal(true)}
        className="text-red-500 text-sm font-medium hover:underline">
        Sil
      </button>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Teklifi Sil</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{teklifNo}</span> numaralı teklif
                ve tüm kalemleri kalıcı olarak silinecek. Emin misiniz?
              </p>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={handleSil} disabled={siliniyor}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                {siliniyor ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
              <button onClick={() => setModal(false)}
                className="flex-1 border py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
