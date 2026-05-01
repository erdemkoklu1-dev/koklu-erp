'use client'

import { useState, useEffect } from 'react'

type StokItem = {
  id: string
  urun_id: string
  stok_adedi: number
  updated_at: string
  urunler: { id: string; ad: string; kategori: string; kdv_haric_fiyat: number } | null
}

type Urun = { id: string; ad: string; kategori: string; kdv_haric_fiyat: number }

export default function UrunDepo() {
  const [stoklar, setStoklar] = useState<StokItem[]>([])
  const [urunler, setUrunler] = useState<Urun[]>([])
  const [loading, setLoading] = useState(true)

  // Stok ayar modal
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    urun_id: '', miktar: '', hareket_tipi: 'giris', referans_no: '', aciklama: '',
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [sRes, uRes] = await Promise.all([
        fetch('/api/fabrika/urun-stok'),
        fetch('/api/fabrika/urunler'),
      ])
      const s = await sRes.json()
      const u = await uRes.json()
      setStoklar(Array.isArray(s) ? s : [])
      setUrunler(Array.isArray(u) ? u : [])
    } catch (err: any) {
      console.error('Ürün depo yükleme hatası:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleStokAyar() {
    if (!form.urun_id || !form.miktar) return
    setSaving(true)
    await fetch('/api/fabrika/urun-stok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, miktar: Number(form.miktar) }),
    })
    setSaving(false)
    setModalOpen(false)
    setForm({ urun_id: '', miktar: '', hareket_tipi: 'giris', referans_no: '', aciklama: '' })
    load()
  }

  // Merge: show all urunler that have stok OR not
  const stokMap = new Map(stoklar.map(s => [s.urun_id, s]))
  const allRows = urunler.map(u => ({
    urun: u,
    stok: stokMap.get(u.id),
  }))

  const formatDate = (d: string) => new Date(d).toLocaleDateString('tr-TR')

  if (loading) return <div className="p-6 text-sm text-gray-400 dark:text-gray-500">Yükleniyor...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModalOpen(true)}
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#a50d26]">
          📦 Stok Girişi / Çıkışı
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase border-b">
            <tr>
              <th className="px-4 py-2 text-left">Ürün Adı</th>
              <th className="px-4 py-2 text-left">Kategori</th>
              <th className="px-4 py-2 text-right">Stok Adedi</th>
              <th className="px-4 py-2 text-right">Stok Değeri (KDV Hariç)</th>
              <th className="px-4 py-2 text-left">Son Güncelleme</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allRows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">Ürün bulunamadı</td></tr>
            )}
            {allRows.map(({ urun, stok }) => {
              const adet = Number(stok?.stok_adedi ?? 0)
              const deger = adet * Number(urun.kdv_haric_fiyat)
              return (
                <tr key={urun.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{urun.ad}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 capitalize">{urun.kategori}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${adet === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                      {adet.toLocaleString('tr-TR')} adet
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {deger > 0 ? `₺${deger.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">
                    {stok ? formatDate(stok.updated_at) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Stok Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Ürün Stok Hareketi</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Ürün *</label>
                <select value={form.urun_id} onChange={e => setForm(f => ({ ...f, urun_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="">Seçiniz</option>
                  {urunler.map(u => <option key={u.id} value={u.id}>{u.ad}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">İşlem Türü *</label>
                <select value={form.hareket_tipi} onChange={e => setForm(f => ({ ...f, hareket_tipi: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="giris">Giriş (Stok Ekle)</option>
                  <option value="cikis">Çıkış (Stok Düş)</option>
                  <option value="fire">Fire</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Miktar *</label>
                <input type="number" min="0.001" step="0.001" value={form.miktar}
                  onChange={e => setForm(f => ({ ...f, miktar: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Referans No</label>
                <input value={form.referans_no} onChange={e => setForm(f => ({ ...f, referans_no: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Açıklama</label>
                <input value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50">İptal</button>
              <button onClick={handleStokAyar} disabled={saving || !form.urun_id || !form.miktar}
                className="px-4 py-2 text-sm bg-[#C8102E] text-white rounded-lg hover:bg-[#a50d26] disabled:opacity-50">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
