'use client'

import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'koklu_teslimatlar_tablet_mode'
const CHANGE_EVENT = 'koklu-teslimatlar-tablet-mode-change'

export function readTeslimatlarTabletMode() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function writeTeslimatlarTabletMode(enabled: boolean) {
  localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }))
}

export default function TabletModeShell({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setEnabled(readTeslimatlarTabletMode())

    function sync(event: Event) {
      if (event instanceof CustomEvent) {
        setEnabled(Boolean(event.detail))
      } else {
        setEnabled(readTeslimatlarTabletMode())
      }
    }

    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('teslimat-tablet-mode', enabled)
    document.body.classList.toggle('teslimat-sidebar-open', enabled && sidebarOpen)
    if (!enabled) setSidebarOpen(false)

    return () => {
      document.body.classList.remove('teslimat-tablet-mode')
      document.body.classList.remove('teslimat-sidebar-open')
    }
  }, [enabled, sidebarOpen])

  return (
    <>
      <style>{`
        body.teslimat-tablet-mode main { font-size: 1.06rem; }
        body.teslimat-tablet-mode main .p-6 { padding: 1.5rem; }
        body.teslimat-tablet-mode main .grid { gap: 1.1rem; }
        body.teslimat-tablet-mode main a,
        body.teslimat-tablet-mode main button,
        body.teslimat-tablet-mode main input,
        body.teslimat-tablet-mode main select,
        body.teslimat-tablet-mode main textarea { min-height: 48px; font-size: 1rem; }
        body.teslimat-tablet-mode main table th,
        body.teslimat-tablet-mode main table td { padding-top: 1rem; padding-bottom: 1rem; }
        body.teslimat-tablet-mode main .rounded-lg { border-radius: 0.75rem; }
        body.teslimat-tablet-mode main .text-xs { font-size: 0.86rem; }
        body.teslimat-tablet-mode main .text-sm { font-size: 1rem; }
        body.teslimat-tablet-mode main .text-xl { font-size: 1.55rem; }
        body.teslimat-tablet-mode main .text-2xl { font-size: 2rem; }
        body.teslimat-tablet-mode main .text-3xl { font-size: 2.35rem; }
        body.teslimat-tablet-mode main input[type="checkbox"] { width: 1.35rem; height: 1.35rem; }
        body.teslimat-tablet-mode .teslim-form-actions button,
        body.teslimat-tablet-mode .teslim-form-actions a { min-height: 54px; padding-left: 1rem; padding-right: 1rem; }
        body.teslimat-tablet-mode:not(.teslimat-sidebar-open) aside { width: 76px; }
        body.teslimat-tablet-mode:not(.teslimat-sidebar-open) aside .sidebar-label,
        body.teslimat-tablet-mode:not(.teslimat-sidebar-open) aside .sidebar-logo-text { display: none; }
        body.teslimat-tablet-mode:not(.teslimat-sidebar-open) aside nav a { justify-content: center; padding-left: 0.75rem; padding-right: 0.75rem; }
        body.teslimat-tablet-mode aside { transition: width 160ms ease; }
        @media print { .teslimat-tablet-toggle { display: none !important; } }
      `}</style>

      {enabled && (
        <button
          type="button"
          onClick={() => setSidebarOpen(v => !v)}
          className="teslimat-tablet-toggle fixed left-3 top-14 z-50 flex h-11 w-11 items-center justify-center rounded-lg border bg-white text-gray-700 shadow-lg hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          title={sidebarOpen ? 'Menüyü daralt' : 'Menüyü aç'}
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      {children}
    </>
  )
}
