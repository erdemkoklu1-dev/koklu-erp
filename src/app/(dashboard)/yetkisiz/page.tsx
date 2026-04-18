import Link from 'next/link'

export default function YetkisizPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white border rounded-xl shadow-sm p-10 max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-3xl">
          🔒
        </div>
        <h1 className="text-xl font-bold text-gray-900">Erişim Yetkisi Yok</h1>
        <p className="text-sm text-gray-500">
          Bu sayfaya erişim yetkiniz bulunmamaktadır.<br />
          Yönetici ile iletişime geçin.
        </p>
        <Link href="/dashboard"
          className="inline-block bg-[#C8102E] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  )
}
