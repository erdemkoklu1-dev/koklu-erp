import HatirlatmaTabs from './HatirlatmaTabs'

export default function HatirlatmalarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-base font-bold text-gray-900">Hatırlatmalar</h1>
        <p className="text-xs text-gray-400 mt-0.5">Müşterilere bakım ve SKT hatırlatması gönderin</p>
      </div>
      <HatirlatmaTabs />
      <div className="flex-1">{children}</div>
    </div>
  )
}
