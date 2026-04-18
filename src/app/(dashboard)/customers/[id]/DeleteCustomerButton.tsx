'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Silinemedi')
      router.push('/customers')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Silinemedi')
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50 transition-colors"
      >
        Sil
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Müşteriyi Sil</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-medium text-gray-800">{customerName}</span> adlı müşteri ve
                  bağlı tüm cihazlar, faturalar, ön kayıtlar kalıcı olarak silinecek. Bu işlem geri alınamaz.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
              <button
                onClick={() => { setOpen(false); setError('') }}
                disabled={loading}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
