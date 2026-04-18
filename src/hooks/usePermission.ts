'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Izinler = { okuma: boolean; yazma: boolean; silme: boolean }

const cache = new Map<string, Izinler>()

export function usePermission(modul: string): Izinler {
  const [izinler, setIzinler] = useState<Izinler>({ okuma: false, yazma: false, silme: false })

  useEffect(() => {
    const supabase = createClient()

    async function fetchIzin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const key = `${user.id}:${modul}`
      if (cache.has(key)) {
        setIzinler(cache.get(key)!)
        return
      }

      const { data: profil } = await supabase
        .from('kullanici_profiller')
        .select('rol_id, roller(ad)')
        .eq('id', user.id)
        .single()

      if (!profil) return

      // Admin: tam yetki
      if ((profil.roller as any)?.ad === 'Admin') {
        const tam = { okuma: true, yazma: true, silme: true }
        cache.set(key, tam)
        setIzinler(tam)
        return
      }

      const { data: izin } = await supabase
        .from('modul_izinleri')
        .select('okuma, yazma, silme')
        .eq('rol_id', profil.rol_id)
        .eq('modul_adi', modul)
        .single()

      const sonuc: Izinler = {
        okuma: izin?.okuma ?? false,
        yazma: izin?.yazma ?? false,
        silme: izin?.silme ?? false,
      }
      cache.set(key, sonuc)
      setIzinler(sonuc)
    }

    fetchIzin()
  }, [modul])

  return izinler
}
