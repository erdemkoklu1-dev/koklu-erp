'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { APP_MODULES } from '@/lib/auth/modules'

type Rol = { id: string; ad: string; renk: string; aciklama: string | null }
type Izin = { id: string; rol_id: string; modul_adi: string; okuma: boolean; yazma: boolean; silme: boolean }
type IzinMap = Record<string, Record<string, Izin>>

const MODULE_GROUPS = APP_MODULES.reduce<Record<string, typeof APP_MODULES>>((acc, module) => {
  acc[module.group] = [...(acc[module.group] ?? []), module]
  return acc
}, {})

function buildIzinMap(izinler: Izin[]): IzinMap {
  const map: IzinMap = {}
  for (const iz of izinler) {
    if (!map[iz.rol_id]) map[iz.rol_id] = {}
    map[iz.rol_id][iz.modul_adi] = iz
  }
  return map
}

export default function RollerClient({ roller: initialRoller, izinler: initialIzinler }: { roller: Rol[]; izinler: Izin[] }) {
  const supabase = createClient()
  const [roller, setRoller] = useState<Rol[]>(initialRoller)
  const [izinMap, setIzinMap] = useState<IzinMap>(buildIzinMap(initialIzinler))
  const [seciliRolId, setSeciliRolId] = useState<string>(roller[0]?.id ?? '')
  const [yeniRolModal, setYeniRolModal] = useState(false)
  const [yeniAd, setYeniAd] = useState('')
  const [yeniAciklama, setYeniAciklama] = useState('')
  const [yeniRenk, setYeniRenk] = useState('#607D8B')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState('')
  const [kayitMesaji, setKayitMesaji] = useState('')

  const seciliRol = roller.find(r => r.id === seciliRolId)
  const isAdmin = seciliRol?.ad === 'Admin' || seciliRol?.ad === 'Super Admin'

  async function toggleIzin(rolId: string, modul: string, alan: 'okuma' | 'yazma' | 'silme') {
    const mevcut = izinMap[rolId]?.[modul]
    const yeni = {
      okuma: mevcut?.okuma ?? false,
      yazma: mevcut?.yazma ?? false,
      silme: mevcut?.silme ?? false,
    }

    if (alan === 'okuma') {
      yeni.okuma = !yeni.okuma
      if (!yeni.okuma) {
        yeni.yazma = false
        yeni.silme = false
      }
    } else {
      if (!yeni.okuma && !yeni[alan]) yeni.okuma = true
      yeni[alan] = !yeni[alan]
    }

    const oncekiIzinMap = izinMap
    setHata('')
    setKayitMesaji('')
    setIzinMap(prev => ({
      ...prev,
      [rolId]: {
        ...prev[rolId],
        [modul]: { ...(mevcut ?? { id: '', rol_id: rolId, modul_adi: modul }), ...yeni },
      },
    }))

    const res = await fetch('/api/yonetim/role-permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol_id: rolId, modul_adi: modul, ...yeni }),
    })
    const data = await res.json()

    if (!res.ok) {
      setIzinMap(oncekiIzinMap)
      setHata(data.error ?? 'Yetki kaydedilemedi')
      return
    }

    setIzinMap(prev => ({
      ...prev,
      [rolId]: { ...prev[rolId], [modul]: data as Izin },
    }))
    try {
      sessionStorage.removeItem('koklu_sidebar_perms_v2')
    } catch {}
    setKayitMesaji('Yetki kaydedildi.')
  }

  async function handleYeniRol() {
    if (!yeniAd.trim()) {
      setHata('Rol adı zorunlu')
      return
    }
    setKaydediliyor(true)
    setHata('')
    const { data, error } = await supabase.from('roller').insert({ ad: yeniAd.trim(), aciklama: yeniAciklama || null, renk: yeniRenk }).select().single()
    setKaydediliyor(false)
    if (error) {
      setHata(error.message)
      return
    }
    if (data) {
      setRoller(prev => [...prev, data as Rol])
      setSeciliRolId(data.id)
    }
    setYeniRolModal(false)
    setYeniAd('')
    setYeniAciklama('')
    setYeniRenk('#607D8B')
  }

  return (
    <div className="flex gap-5">
      <div className="w-64 flex-shrink-0 space-y-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Roller</h3>
          <button onClick={() => { setYeniRolModal(true); setHata('') }} className="rounded-lg bg-gray-800 px-2.5 py-1.5 text-xs text-white hover:bg-gray-700">
            + Yeni Rol
          </button>
        </div>
        {roller.map(r => (
          <button key={r.id} onClick={() => setSeciliRolId(r.id)} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${seciliRolId === r.id ? 'border-[#C8102E] bg-red-50' : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'}`}>
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: r.renk }} />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.ad}</span>
          </button>
        ))}
      </div>

      <div className="flex-1">
        {seciliRol && (
          <div className="overflow-hidden rounded-lg border bg-white dark:bg-gray-800">
            <div className="flex items-center gap-3 border-b px-5 py-3">
              <span className="h-4 w-4 rounded-full" style={{ backgroundColor: seciliRol.renk }} />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{seciliRol.ad}</h3>
              {hata && <span className="ml-auto rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{hata}</span>}
              {kayitMesaji && !hata && <span className="ml-auto rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">{kayitMesaji}</span>}
              {isAdmin && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-400 dark:bg-gray-700">Değiştirilemez</span>}
            </div>
            <table className="w-full">
              <thead className="border-b bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="w-1/2 px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">MODÜL</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">OKUMA</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">YAZMA</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">SİLME</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(MODULE_GROUPS).flatMap(([group, modules]) => [
                  <tr key={`group-${group}`} className="bg-gray-50 dark:bg-gray-700">
                    <td colSpan={4} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">{group}</td>
                  </tr>,
                  ...modules.map(module => {
                    const iz = izinMap[seciliRol.id]?.[module.key]
                    return (
                      <tr key={module.key} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-sm text-gray-800 dark:text-gray-200">{module.label}</td>
                        {(['okuma', 'yazma', 'silme'] as const).map(alan => (
                          <td key={alan} className="px-3 py-3 text-center">
                            <input type="checkbox" checked={iz?.[alan] ?? false} disabled={isAdmin} onChange={() => !isAdmin && toggleIzin(seciliRol.id, module.key, alan)} className="h-4 w-4 cursor-pointer accent-[#C8102E] disabled:cursor-not-allowed" />
                          </td>
                        ))}
                      </tr>
                    )
                  }),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {yeniRolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Yeni Rol Ekle</h3>
              <button onClick={() => setYeniRolModal(false)} className="text-xl text-gray-400 hover:text-gray-600">x</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {hata && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{hata}</div>}
              <Field label="Rol Adı *" value={yeniAd} onChange={setYeniAd} />
              <Field label="Açıklama" value={yeniAciklama} onChange={setYeniAciklama} />
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Renk</label>
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" value={yeniRenk} onChange={e => setYeniRenk(e.target.value)} className="h-9 w-10 cursor-pointer rounded border" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{yeniRenk}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t px-5 py-4">
              <button onClick={handleYeniRol} disabled={kaydediliyor} className="flex-1 rounded-lg bg-[#C8102E] py-2 text-sm font-medium text-white hover:bg-[#a50d26] disabled:opacity-50">
                {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setYeniRolModal(false)} className="flex-1 rounded-lg border py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
    </div>
  )
}
