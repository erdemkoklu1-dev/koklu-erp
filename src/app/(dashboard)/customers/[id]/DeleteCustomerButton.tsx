'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type DependencyCounts = Record<string, number>
type DependencyResult = {
  dependencies: DependencyCounts
  dependency_total: number
}

const DEPENDENCY_LABELS: Record<string, string> = {
  service_forms: 'Servis formu',
  devices: 'Cihaz',
  faturalar: 'Giden fatura',
  gelen_faturalar: 'Gelen fatura',
  payments: 'Odeme',
  on_kayitlar: 'On kayit',
  documents: 'Belge',
  customer_accounts: 'Cari hesap',
  teklifler: 'Teklif',
  proforma_faturalar: 'Proforma',
  mutabakat_formlari: 'Mutabakat',
}

export default function DeleteCustomerButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dependencyResult, setDependencyResult] = useState<DependencyResult | null>(null)

  async function openDialog() {
    setOpen(true)
    setError('')
    setMessage('')
    setDependencyResult(null)
    setChecking(true)
    try {
      const res = await fetch(`/api/customers/${customerId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bagli kayit kontrolu yapilamadi')
      setDependencyResult({ dependencies: data.dependencies ?? {}, dependency_total: data.dependency_total ?? 0 })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bagli kayit kontrolu yapilamadi')
    } finally {
      setChecking(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Silinemedi')
      if (data.deactivated) {
        setMessage(data.message ?? 'Bagli kayit oldugu icin musteri pasif duruma alindi.')
        setDependencyResult({ dependencies: data.dependencies ?? {}, dependency_total: data.dependency_total ?? 0 })
        router.refresh()
      } else {
        router.push('/customers')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Silinemedi')
    } finally {
      setLoading(false)
    }
  }

  const dependencyTotal = dependencyResult?.dependency_total ?? 0
  const dependencyRows = Object.entries(dependencyResult?.dependencies ?? {}).filter(([, count]) => count > 0)

  return (
    <>
      <button
        onClick={openDialog}
        className="border border-red-300 text-red-600 px-3 py-1.5 rounded-lg text-sm hover:bg-red-50 transition-colors"
      >
        Sil
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Musteriyi Sil</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{customerName}</span> icin bagli kayit kontrolu yapilir.
                  Bagli kayit varsa kalici silme yerine musteri pasif duruma alinir.
                </p>
              </div>
            </div>

            {checking && (
              <p className="text-sm text-gray-500 dark:text-gray-400">Bagli kayitlar kontrol ediliyor...</p>
            )}

            {!checking && dependencyResult && dependencyTotal > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">{dependencyTotal} bagli kayit bulundu. Kalici silme yapilmayacak.</p>
                <div className="mt-1 space-y-0.5">
                  {dependencyRows.map(([key, count]) => (
                    <div key={key}>{DEPENDENCY_LABELS[key] ?? key}: {count}</div>
                  ))}
                </div>
              </div>
            )}

            {!checking && dependencyResult && dependencyTotal === 0 && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Bagli kayit bulunmadi. Onaylarsaniz musteri kalici olarak silinir.
              </p>
            )}

            {message && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{message}</p>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleDelete}
                disabled={loading || checking || Boolean(message)}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Isleniyor...' : dependencyTotal > 0 ? 'Pasife Al' : 'Evet, Sil'}
              </button>
              <button
                onClick={() => { setOpen(false); setError(''); setMessage('') }}
                disabled={loading}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50"
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
