import CariHesapTabs from './_components/CariHesapTabs'

export default function CariHesapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">₺</div>
        <h1 className="text-lg font-bold text-gray-900">Cari Hesap</h1>
      </div>
      <CariHesapTabs />
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
