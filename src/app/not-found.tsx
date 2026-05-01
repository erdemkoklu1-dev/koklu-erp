import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-700 p-6">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="text-7xl font-bold text-gray-200 select-none">404</div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Sayfa Bulunamadı</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Aradığınız sayfa mevcut değil veya taşınmış olabilir.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-block px-5 py-2.5 bg-[#C8102E] text-white text-sm font-medium rounded-lg hover:bg-[#a50d26] transition-colors"
        >
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  )
}
