'use client'

import { Printer } from 'lucide-react'

export default function OperationPrintButton({ label = 'Yazdır' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      <Printer size={16} />
      {label}
    </button>
  )
}
