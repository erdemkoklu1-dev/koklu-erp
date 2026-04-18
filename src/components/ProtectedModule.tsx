'use client'

import { usePermission } from '@/hooks/usePermission'

interface Props {
  modul: string
  gerekli: 'okuma' | 'yazma' | 'silme'
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function ProtectedModule({ modul, gerekli, children, fallback = null }: Props) {
  const izinler = usePermission(modul)
  return izinler[gerekli] ? <>{children}</> : <>{fallback}</>
}
