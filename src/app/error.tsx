'use client'

import { useEffect } from 'react'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[RootError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border shadow-sm p-8 text-center space-y-4">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Beklenmeyen bir hata oluştu</h2>
          <p className="text-sm text-gray-500 mt-1">
            {error.message || 'Lütfen sayfayı yenileyin veya yöneticinizle iletişime geçin.'}
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 mt-2 font-mono">Hata kodu: {error.digest}</p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[#C8102E] text-white text-sm rounded-lg hover:bg-[#a50d26] transition-colors"
          >
            Tekrar Dene
          </button>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-4 py-2 border text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    </div>
  )
}
