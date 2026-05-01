export default function CustomersLoading() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-gray-200 rounded" />
        <div className="h-9 w-36 bg-gray-200 rounded-lg" />
      </div>
      <div className="h-10 bg-gray-100 dark:bg-gray-700 rounded-lg" />
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b bg-gray-50 dark:bg-gray-700">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded" />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} className="grid grid-cols-5 gap-4 px-4 py-4 border-b last:border-0">
            {[...Array(5)].map((_, j) => (
              <div key={j} className="h-4 bg-gray-100 dark:bg-gray-700 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
