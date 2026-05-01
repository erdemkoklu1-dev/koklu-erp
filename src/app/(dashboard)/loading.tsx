export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Topbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-56 bg-gray-100 dark:bg-gray-700 rounded" />
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-36 bg-gray-200 rounded-lg" />
          <div className="h-9 w-32 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-3">
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-8 w-20 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex justify-between">
              <div className="h-5 w-32 bg-gray-200 rounded" />
              <div className="h-4 w-16 bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex justify-between">
                  <div className="h-4 w-40 bg-gray-100 dark:bg-gray-700 rounded" />
                  <div className="h-4 w-16 bg-gray-100 dark:bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b">
              <div className="h-5 w-36 bg-gray-200 rounded" />
            </div>
            <div className="p-4 space-y-4">
              {[...Array(4)].map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-32 bg-gray-100 dark:bg-gray-700 rounded" />
                    <div className="h-3 w-8 bg-gray-100 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full" style={{ width: `${60 + j * 10}%` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
