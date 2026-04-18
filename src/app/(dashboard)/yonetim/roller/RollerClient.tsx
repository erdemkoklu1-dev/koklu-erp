'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const MODULLER: { key: string; label: string }[] = [
  { key: 'musteriler',       label: 'Müşteriler' },
  { key: 'cihazlar',         label: 'Cihazlar' },
  { key: 'servis_formlari',  label: 'Servis Formları' },
  { key: 'cari_hesap',       label: 'Cari Hesap' },
  { key: 'faturalar',        label: 'Faturalar' },
  { key: 'fiyat_teklifleri', label: 'Fiyat Teklifleri' },
  { key: 'hatirlatmalar',    label: 'Hatırlatmalar' },
  { key: 'aracilar',         label: 'Aracılar' },
  { key: 'fabrika',          label: 'Fabrika' },
  { key: 'yonetim',          label: 'Yönetim' },
]

type Rol = { id: string; ad: string; renk: string; aciklama: string | null }
type Izin = { id: string; rol_id: string; modul_adi: string; okuma: boolean; yazma: boolean; silme: boolean }

type IzinMap = Record<string, Record<string, Izin>>

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
  const [roller, setRoller]           = useState<Rol[]>(initialRoller)
  const [izinMap, setIzinMap]         = useState<IzinMap>(buildIzinMap(initialIzinler))
  const [seciliRolId, setSeciliRolId] = useState<string>(roller[0]?.id ?? '')
  const [yeniRolModal, setYeniRolModal] = useState(false)
  const [yeniAd, setYeniAd]           = useState('')
  const [yeniAciklama, setYeniAciklama] = useState('')
  const [yeniRenk, setYeniRenk]       = useState('#607D8B')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata]               = useState('')

  const seciliRol = roller.find(r => r.id === seciliRolId)
  const isAdmin = seciliRol?.ad === 'Admin'

  async function toggleIzin(rolId: string, modul: string, alan: 'okuma' | 'yazma' | 'silme') {
    const mevcut = izinMap[rolId]?.[modul]
    let yeni = {
      okuma:  mevcut?.okuma  ?? false,
      yazma:  mevcut?.yazma  ?? false,
      silme:  mevcut?.silme  ?? false,
    }

    if (alan === 'okuma') {
      yeni.okuma = !yeni.okuma
      if (!yeni.okuma) { yeni.yazma = false; yeni.silme = false }
    } else {
      if (!yeni.okuma && !yeni[alan]) yeni.okuma = true // okuma zorunlu
      yeni[alan] = !yeni[alan]
    }

    // Optimistic update
    setIzinMap(prev => ({
      ...prev,
      [rolId]: {
        ...prev[rolId],
        [modul]: { ...(mevcut ?? { id: '', rol_id: rolId, modul_adi: modul }), ...yeni },
      },
    }))

    if (mevcut?.id) {
      await supabase.from('modul_izinleri').update(yeni).eq('id', mevcut.id)
    } else {
      const { data } = await supabase.from('modul_izinleri')
        .insert({ rol_id: rolId, modul_adi: modul, ...yeni })
        .select().single()
      if (data) {
        setIzinMap(prev => ({
          ...prev,
          [rolId]: { ...prev[rolId], [modul]: data as Izin },
        }))
      }
    }
  }

  async function handleYeniRol() {
    if (!yeniAd.trim()) { setHata('Rol adı zorunlu'); return }
    setKaydediliyor(true); setHata('')
    const { data, error } = await supabase.from('roller')
      .insert({ ad: yeniAd.trim(), aciklama: yeniAciklama || null, renk: yeniRenk })
      .select().single()
    setKaydediliyor(false)
    if (error) { setHata(error.message); return }
    if (data) {
      setRoller(prev => [...prev, data as Rol])
      setSeciliRolId(data.id)
    }
    setYeniRolModal(false)
    setYeniAd(''); setYeniAciklama(''); setYeniRenk('#607D8B')
  }

  return (
    <div className="flex gap-5">
      {/* Sol: Rol Listesi */}
      <div className="w-64 flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Roller</h3>
          <button onClick={() => { setYeniRolModal(true); setHata('') }}
            className="text-xs bg-gray-800 text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-700">
            + Yeni Rol
          </button>
        </div>
        {roller.map(r => (
          <button key={r.id} onClick={() => setSeciliRolId(r.id)}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2 ${seciliRolId === r.id ? 'border-[#C8102E] bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.renk }} />
            <span className="text-sm font-medium text-gray-800">{r.ad}</span>
          </button>
        ))}
      </div>

      {/* Sağ: İzin Matrisi */}
      <div className="flex-1">
        {seciliRol && (
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center gap-3">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: seciliRol.renk }} />
              <h3 className="font-semibold text-gray-900">{seciliRol.ad}</h3>
              {isAdmin && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Değiştirilemez</span>}
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 w-1/2">MODÜL</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">OKUMA</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">YAZMA</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">SİLME</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {MODULLER.map(m => {
                  const iz = izinMap[seciliRol.id]?.[m.key]
                  return (
                    <tr key={m.key} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-800">{m.label}</td>
                      {(['okuma', 'yazma', 'silme'] as const).map(alan => (
                        <td key={alan} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={iz?.[alan] ?? false}
                            disabled={isAdmin}
                            onChange={() => !isAdmin && toggleIzin(seciliRol.id, m.key, alan)}
                            className="w-4 h-4 accent-[#C8102E] cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Yeni Rol Modal */}
      {yeniRolModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Yeni Rol Ekle</h3>
              <button onClick={() => setYeniRolModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {hata && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{hata}</div>}
              <div>
                <label className="text-xs font-medium text-gray-600">Rol Adı *</label>
                <input value={yeniAd} onChange={e => setYeniAd(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Açıklama</label>
                <input value={yeniAciklama} onChange={e => setYeniAciklama(e.target.value)}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Renk</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={yeniRenk} onChange={e => setYeniRenk(e.target.value)}
                    className="w-10 h-9 rounded cursor-pointer border" />
                  <span className="text-sm text-gray-600">{yeniRenk}</span>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={handleYeniRol} disabled={kaydediliyor}
                className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50">
                {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setYeniRolModal(false)} className="flex-1 border py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
