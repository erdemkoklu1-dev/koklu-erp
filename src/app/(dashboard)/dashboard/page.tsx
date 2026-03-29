export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-[#C8102E] rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">K</div>
        <h1 className="text-2xl font-bold text-gray-900">KÖKLÜ ERP</h1>
        <p className="text-gray-500 mt-2">Dashboard hazırlanıyor... FAZ 2 başlıyor!</p>
        <div className="mt-6 flex gap-3 justify-center">
          <div className="bg-white border rounded-lg px-4 py-3 text-sm">
            <div className="font-semibold text-gray-900">✅ Auth</div>
            <div className="text-gray-500">Tamamlandı</div>
          </div>
          <div className="bg-white border rounded-lg px-4 py-3 text-sm">
            <div className="font-semibold text-gray-900">✅ Supabase</div>
            <div className="text-gray-500">Bağlı</div>
          </div>
          <div className="bg-white border rounded-lg px-4 py-3 text-sm">
            <div className="font-semibold text-[#C8102E]">🔜 Müşteri</div>
            <div className="text-gray-500">Sıradaki</div>
          </div>
        </div>
      </div>
    </div>
  )
}