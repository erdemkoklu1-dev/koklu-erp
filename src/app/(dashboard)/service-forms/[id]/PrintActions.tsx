'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function PrintActions({
  backHref,
  defaultStamped = false,
  hasStamp = false,
}: {
  backHref: string
  defaultStamped?: boolean
  hasStamp?: boolean
}) {
  const [stamped, setStamped] = useState(defaultStamped && hasStamp)

  useEffect(() => {
    document.body.classList.toggle('company-stamp-enabled', stamped && hasStamp)
    document.body.classList.toggle('company-stamp-disabled', !stamped || !hasStamp)

    return () => {
      document.body.classList.remove('company-stamp-enabled', 'company-stamp-disabled')
    }
  }, [hasStamp, stamped])

  return (
    <div className="print:hidden sticky top-0 z-10 bg-white dark:bg-gray-800 border-b">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href={backHref}
          className="text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50">
          ← Forma Dön
        </Link>
        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-sm dark:border-gray-600">
            <button
              type="button"
              disabled={!hasStamp}
              onClick={() => setStamped(true)}
              className={`px-3 py-1.5 disabled:text-gray-400 ${stamped && hasStamp ? 'bg-[#C8102E] text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              Kaşeli çıktı
            </button>
            <button
              type="button"
              onClick={() => setStamped(false)}
              className={`border-l border-gray-300 px-3 py-1.5 dark:border-gray-600 ${!stamped || !hasStamp ? 'bg-[#C8102E] text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              Kaşesiz çıktı
            </button>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-md hover:bg-[#a50d26]">
            Yazdır / PDF Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
