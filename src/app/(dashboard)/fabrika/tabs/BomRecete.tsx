'use client'

import { useState, useEffect, useMemo } from 'react'

type Urun = {
  id: string; ad: string; kategori: string
  kdv_haric_fiyat: number
}
type Hammadde = {
  id: string; ad: string; birim: string; birim_maliyet: number; mevcut_stok: number
}
type ReceteItem = {
  id: string; urun_id: string; hammadde_id: string; miktar: number; birim: string; notlar: string | null
  hammaddeler: Hammadde
}

export default function BomRecete() {
  const [urunler, setUrunler] = useState<Urun[]>([])
  const [hammaddeler, setHammaddeler] = useState<Hammadde[]>([])
  const [selectedUrun, setSelectedUrun] = useState<Urun | null>(null)
  const [recete, setRecete] = useState<ReceteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [receteLoading, setReceteLoading] = useState(false)
  const [iscilikMaliyeti, setIscilikMaliyeti] = useState<number>(0)

  // Düzenle modal
  const [duzMode, setDuzMode] = useState(false)
  const [addForm, setAddForm] = useState({ hammadde_id: '', miktar: '', birim: 'adet', notlar: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editMiktar, setEditMiktar] = useState('')

  const [urunSearch, setUrunSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/fabrika/hammaddeler').then(r => r.json()),
      fetch('/api/fabrika/urunler').then(r => r.json()),
    ]).then(([h, u]) => {
      setHammaddeler(Array.isArray(h) ? h : [])
      setUrunler(Array.isArray(u) ? u : [])
    }).catch(err => {
      console.error('BOM yükleme hatası:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  async function loadRecete(urun: Urun) {
    setSelectedUrun(urun)
    setReceteLoading(true)
    setDuzMode(false)
    const res = await fetch(`/api/fabrika/receteler?urun_id=${urun.id}`)
    const data = await res.json()
    setRecete(Array.isArray(data) ? data : [])
    setReceteLoading(false)
  }

  async function handleAddItem() {
    if (!selectedUrun || !addForm.hammadde_id || !addForm.miktar) return
    setAddSaving(true)
    const hm = hammaddeler.find(h => h.id === addForm.hammadde_id)
    await fetch('/api/fabrika/receteler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urun_id: selectedUrun.id,
        hammadde_id: addForm.hammadde_id,
        miktar: Number(addForm.miktar),
        birim: addForm.birim || hm?.birim || 'adet',
        notlar: addForm.notlar || null,
      }),
    })
    setAddSaving(false)
    setAddForm({ hammadde_id: '', miktar: '', birim: 'adet', notlar: '' })
    loadRecete(selectedUrun)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/fabrika/receteler?id=${id}`, { method: 'DELETE' })
    if (selectedUrun) loadRecete(selectedUrun)
  }

  async function handleEdit(id: string) {
    await fetch('/api/fabrika/receteler', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, miktar: Number(editMiktar) }),
    })
    setEditId(null)
    if (selectedUrun) loadRecete(selectedUrun)
  }

  const hammaddeMaliyeti = useMemo(() => {
    return recete.reduce((sum, r) => {
      return sum + Number(r.miktar) * Number(r.hammaddeler?.birim_maliyet ?? 0)
    }, 0)
  }, [recete])

  const toplamMaliyet = hammaddeMaliyeti + iscilikMaliyeti
  const satisFiyati = Number(selectedUrun?.kdv_haric_fiyat ?? 0)
  const karMarji = satisFiyati > 0 ? ((satisFiyati - toplamMaliyet) / satisFiyati * 100) : 0

  const filteredUrunler = urunler.filter(u =>
    !urunSearch || u.ad.toLowerCase().includes(urunSearch.toLowerCase())
  )

  if (loading) return <div className="p-6 text-sm text-gray-400">Yükleniyor...</div>

  return (
    <div className="p-6 flex gap-6 h-full min-h-0">
      {/* Sol panel — ürün listesi */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        <input
          placeholder="Ürün ara..."
          value={urunSearch}
          onChange={e => setUrunSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
        />
        <div className="bg-white border rounded-xl overflow-hidden flex-1 overflow-y-auto">
          {filteredUrunler.length === 0 && (
            <div className="p-4 text-sm text-gray-400 text-center">
              {urunler.length === 0 ? 'Stok kaydı olan ürün yok.\nÜretim tamamlandığında buraya gelir.' : 'Ürün bulunamadı'}
            </div>
          )}
          {filteredUrunler.map(u => (
            <button key={u.id} onClick={() => loadRecete(u)}
              className={`w-full text-left px-4 py-3 border-b text-sm transition-colors ${
                selectedUrun?.id === u.id
                  ? 'bg-[#C8102E] text-white'
                  : 'hover:bg-gray-50 text-gray-800'
              }`}>
              <div className="font-medium leading-snug">{u.ad}</div>
              <div className={`text-xs mt-0.5 ${selectedUrun?.id === u.id ? 'text-red-100' : 'text-gray-400'}`}>
                {u.kategori}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sağ panel — reçete */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {!selectedUrun ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 bg-white border rounded-xl">
            Soldan bir ürün seçin
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{selectedUrun.ad}</h3>
              <button onClick={() => setDuzMode(!duzMode)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  duzMode ? 'bg-gray-100 text-gray-700' : 'border-[#C8102E] text-[#C8102E] hover:bg-red-50'
                }`}>
                {duzMode ? '✓ Bitti' : recete.length === 0 ? '+ Reçete Tanımla' : '✎ Reçete Düzenle'}
              </button>
            </div>

            {receteLoading ? (
              <div className="text-sm text-gray-400">Yükleniyor...</div>
            ) : (
              <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">Hammadde</th>
                      <th className="px-4 py-2 text-right">Miktar</th>
                      <th className="px-4 py-2 text-left">Birim</th>
                      <th className="px-4 py-2 text-right">Birim Maliyet</th>
                      <th className="px-4 py-2 text-right">Satır Toplam</th>
                      {duzMode && <th className="px-4 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recete.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-xs">
                        Reçete tanımlanmamış
                      </td></tr>
                    )}
                    {recete.map(r => {
                      const bm = Number(r.hammaddeler?.birim_maliyet ?? 0)
                      const toplam = Number(r.miktar) * bm
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{r.hammaddeler?.ad ?? '—'}</td>
                          <td className="px-4 py-2 text-right">
                            {duzMode && editId === r.id ? (
                              <input type="number" value={editMiktar} onChange={e => setEditMiktar(e.target.value)}
                                className="w-20 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                            ) : (
                              <span onDoubleClick={() => { setEditId(r.id); setEditMiktar(String(r.miktar)) }}
                                className="cursor-pointer">
                                {Number(r.miktar).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-500">{r.birim}</td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {bm > 0 ? `₺${bm.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            {toplam > 0 ? `₺${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                          {duzMode && (
                            <td className="px-4 py-2 flex gap-1 items-center justify-end">
                              {editId === r.id ? (
                                <button onClick={() => handleEdit(r.id)}
                                  className="text-xs text-green-700 hover:underline">Kaydet</button>
                              ) : null}
                              <button onClick={() => handleDelete(r.id)}
                                className="text-xs text-red-600 hover:underline">Sil</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}

                    {/* Yeni satır ekle */}
                    {duzMode && (
                      <tr className="bg-blue-50">
                        <td className="px-4 py-2">
                          <select value={addForm.hammadde_id}
                            onChange={e => {
                              const hm = hammaddeler.find(h => h.id === e.target.value)
                              setAddForm(f => ({ ...f, hammadde_id: e.target.value, birim: hm?.birim ?? 'adet' }))
                            }}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                            <option value="">Hammadde seç</option>
                            {hammaddeler.map(h => <option key={h.id} value={h.id}>{h.ad}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" min="0.001" step="0.001" value={addForm.miktar}
                            onChange={e => setAddForm(f => ({ ...f, miktar: e.target.value }))}
                            placeholder="Miktar"
                            className="w-20 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{addForm.birim}</td>
                        <td colSpan={duzMode ? 3 : 2} className="px-4 py-2">
                          <button onClick={handleAddItem} disabled={addSaving || !addForm.hammadde_id || !addForm.miktar}
                            className="text-xs bg-[#C8102E] text-white px-3 py-1 rounded hover:bg-[#a50d26] disabled:opacity-50">
                            {addSaving ? '...' : '+ Ekle'}
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Maliyet özet */}
            {recete.length > 0 && (
              <div className="bg-white border rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Toplam Hammadde Maliyeti</span>
                  <span className="font-medium">₺{hammaddeMaliyeti.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">+ İşçilik Maliyeti</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">₺</span>
                    <input type="number" min="0" step="1" value={iscilikMaliyeti || ''}
                      onChange={e => setIscilikMaliyeti(Number(e.target.value) || 0)}
                      className="w-24 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                  </div>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>= Toplam Üretim Maliyeti</span>
                  <span>₺{toplamMaliyet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Satış Fiyatı (KDV Hariç)</span>
                  <span>₺{satisFiyati.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className={`flex justify-between font-bold ${karMarji >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  <span>Kar Marjı</span>
                  <span>%{karMarji.toFixed(1)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
