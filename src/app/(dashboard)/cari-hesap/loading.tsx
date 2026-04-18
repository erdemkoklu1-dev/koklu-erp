export default function CariHesapLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="h-7 w-36 bg-gray-200 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border rounded-xl p-5 space-y-3">
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-8 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white border rounded-xl overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex justify-between px-4 py-4 border-b last:border-0">
            <div className="h-4 w-48 bg-gray-100 rounded" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
