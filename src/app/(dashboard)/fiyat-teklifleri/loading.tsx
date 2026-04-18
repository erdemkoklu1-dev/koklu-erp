export default function TekliflerLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-44 bg-gray-200 rounded" />
        <div className="h-9 w-40 bg-gray-200 rounded-lg" />
      </div>
      <div className="bg-white border rounded-xl overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4 border-b last:border-0">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 rounded" />
              <div className="h-3 w-48 bg-gray-100 rounded" />
            </div>
            <div className="flex gap-3 items-center">
              <div className="h-6 w-20 bg-gray-100 rounded-full" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
              <div className="h-8 w-16 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
