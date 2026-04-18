export default function CihazlarLoading() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="h-6 w-48 bg-gray-200 rounded" />
        <div className="flex gap-2">
          <div className="h-9 w-32 bg-gray-200 rounded-lg" />
          <div className="h-9 w-32 bg-gray-200 rounded-lg" />
        </div>
      </div>
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="h-7 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white border rounded-xl overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-4 border-b last:border-0">
              <div className="h-4 w-48 bg-gray-100 rounded flex-1" />
              <div className="h-4 w-20 bg-gray-100 rounded" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
