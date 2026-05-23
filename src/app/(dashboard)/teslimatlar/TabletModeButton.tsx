'use client'

import { TabletSmartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { readTeslimatlarTabletMode, writeTeslimatlarTabletMode } from './TabletModeShell'

export default function TabletModeButton() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(readTeslimatlarTabletMode())

    function sync(event: Event) {
      if (event instanceof CustomEvent) {
        setEnabled(Boolean(event.detail))
      } else {
        setEnabled(readTeslimatlarTabletMode())
      }
    }

    window.addEventListener('koklu-teslimatlar-tablet-mode-change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('koklu-teslimatlar-tablet-mode-change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return (
    <button
      type="button"
      onClick={() => writeTeslimatlarTabletMode(!enabled)}
      className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
        enabled
          ? 'border-[#C8102E] bg-red-50 text-[#C8102E] hover:bg-red-100 dark:bg-red-900/20'
          : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      <TabletSmartphone size={17} />
      {enabled ? 'Tablet Modu Kapat' : 'Tablet Modu'}
    </button>
  )
}
