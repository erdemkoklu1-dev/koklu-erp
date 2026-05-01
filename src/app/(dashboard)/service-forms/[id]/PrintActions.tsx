'use client'

import Link from 'next/link'

export default function PrintActions({ backHref }: { backHref: string }) {
  return (
    <div className="print:hidden sticky top-0 z-10 bg-white dark:bg-gray-800 border-b">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href={backHref}
          className="text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50">
          ← Forma Dön
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-md hover:bg-[#a50d26]">
          Yazdır / PDF Kaydet
        </button>
      </div>
    </div>
  )
}
