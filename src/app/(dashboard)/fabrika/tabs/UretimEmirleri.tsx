'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Urun = { id: string; ad: string; kategori: string }

type Emir = {
  id: string; emir_no: string
  urunler: Urun | null
  miktar: number; durum: string
  planlanan_baslangic: string | null; planlanan_bitis: string | null
  gercek_baslangic: string | null; gercek_bitis: string | null
  sorumlu: string | null; notlar: string | null; created_at: string
}

type YetersizHammadde = { ad: string; gereken: number; mevcut: number; birim: string }

const DURUM_BADGE: Record<string, string> = {
  'planlandı':   'bg-gray-100 text-gray-600',
  'üretimde':    'bg-blue-100 text-blue-700',
  'tamamlandı':  'bg-green-100 text-green-700',
  'iptal':       'bg-red-100 text-red-700',
}

export default function UretimEmirleri() {
  const [emirler, setEmirleri] = useState<Emir[]>([])
  const [urunler, setUrunler] = useState<Urun[]>([])
  const [loading, setLoading] = useState(true)
  const [durumFilter, setDurumFilter] = useState('')

  // Yeni emir modal
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({
    urun_id: '', miktar: '', planlanan_baslangic: '', planlanan_bitis: '',
    sorumlu: '', notlar: '',
  })
  const [saving, setSaving] = useState(false)
  const [stokUyari, setStokUyari] = useState<YetersizHammadde[]>([])
  const [uyariOnay, setUyariOnay] = useState(false)
  const [receteSizUyari, setReceteSizUyari] = useState(false)

  async function load() {
    try {
      const [eRes, uRes] = await Promise.all([
        fetch('/api/fabrika/uretim-emirleri'),
        fetch('/api/fabrika/urunler'),
      ])
      const e = await eRes.json()
      const u = await uRes.json()
      setEmirleri(Array.isArray(e) ? e : [])
      setUrunler(Array.isArray(u) ? u : [])
    } catch (err: any) {
      console.error('Üretim emirleri yükleme hatası:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function checkStok() {
    if (!form.urun_id || !form.miktar) return []
    const rRes = await fetch(`/api/fabrika/receteler?urun_id=${form.urun_id}`)
    const raw = await rRes.json()
    const recete: any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : [])
    if (recete.length === 0) {
      setReceteSizUyari(true)
      return []
    }
    const yetersiz: YetersizHammadde[] = []
    for (const r of recete) {
      const gereken = Number(r.miktar) * Number(form.miktar)
      const mevcut  = Number(r.hammaddeler?.mevcut_stok ?? 0)
      if (mevcut < gereken) {
        yetersiz.push({ ad: r.hammaddeler?.ad ?? '?', gereken, mevcut, birim: r.birim })
      }
    }
    return yetersiz
  }

  async function handleCreate(force = false) {
    if (!force) {
      setReceteSizUyari(false)
      const yetersiz = await checkStok()
      if (yetersiz.length > 0) {
        setStokUyari(yetersiz)
        setUyariOnay(true)
        return
      }
    }
    setSaving(true)
    const res = await fetch('/api/fabrika/uretim-emirleri', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, miktar: Number(form.miktar) }),
    })
    setSaving(false)
    if (res.ok) {
      setModalOpen(false)
      setUyariOnay(false)
      setStokUyari([])
      setReceteSizUyari(false)
      setForm({ urun_id: '', miktar: '', planlanan_baslangic: '', planlanan_bitis: '', sorumlu: '', notlar: '' })
      load()
    }
  }

  const filtered = emirler.filter(e => !durumFilter || e.durum === durumFilter)

  if (loading) return <div className="p-6 text-sm text-gray-400">Yükleniyor...</div>

  return (
    <div className="p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
          <option value="">Tüm Durumlar</option>
          <option value="planlandı">Planlandı</option>
          <option value="üretimde">Üretimde</option>
          <option value="tamamlandı">Tamamlandı</option>
          <option value="iptal">İptal</option>
        </select>
        <button onClick={() => setModalOpen(true)}
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#a50d26]">
          + Yeni Üretim Emri
        </button>
      </div>

      {/* Tablo */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
            <tr>
              <th className="px-4 py-2 text-left">Emir No</th>
              <th className="px-4 py-2 text-left">Ürün</th>
              <th className="px-4 py-2 text-right">Miktar</th>
              <th className="px-4 py-2 text-left">Pl. Başlangıç</th>
              <th className="px-4 py-2 text-left">Pl. Bitiş</th>
              <th className="px-4 py-2 text-left">Durum</th>
              <th className="px-4 py-2 text-left">Sorumlu</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Kayıt yok</td></tr>
            )}
            {filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.emir_no}</td>
                <td className="px-4 py-3 font-medium">{e.urunler?.ad ?? '—'}</td>
                <td className="px-4 py-3 text-right">{Number(e.miktar).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-gray-500">{e.planlanan_baslangic ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{e.planlanan_bitis ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DURUM_BADGE[e.durum] ?? ''}`}>
                    {e.durum}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{e.sorumlu ?? '—'}</td>
                <td className="px-4 py-3">
                  <Link href={`/fabrika/uretim-emirleri/${e.id}`}
                    className="text-xs text-[#C8102E] hover:underline">Detay →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Yeni Emir Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Yeni Üretim Emri</h3>
              <button onClick={() => { setModalOpen(false); setUyariOnay(false); setStokUyari([]); setReceteSizUyari(false) }}
                className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Reçete yok uyarısı */}
              {receteSizUyari && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  ℹ️ Bu ürün için henüz reçete tanımlanmamış. Stok kontrolü yapılmadan emir oluşturulacak.
                </div>
              )}
              {/* Stok uyarısı */}
              {uyariOnay && stokUyari.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-amber-700 mb-2">
                    ⚠️ Uyarı: Şu hammaddeler yetersiz:
                  </div>
                  <ul className="space-y-1 text-amber-800">
                    {stokUyari.map(h => (
                      <li key={h.ad} className="text-xs">
                        • {h.ad}: Gerekli {h.gereken.toLocaleString('tr-TR')} {h.birim},
                        Mevcut {h.mevcut.toLocaleString('tr-TR')} {h.birim}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 text-amber-700 text-xs">Yine de oluşturmak istiyor musunuz?</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => handleCreate(true)} disabled={saving}
                      className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
                      {saving ? '...' : 'Evet, Oluştur'}
                    </button>
                    <button onClick={() => { setUyariOnay(false); setStokUyari([]) }}
                      className="px-3 py-1.5 text-xs border rounded-lg text-gray-600">İptal</button>
                  </div>
                </div>
              )}

              {!uyariOnay && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Ürün *</label>
                    <select value={form.urun_id} onChange={e => setForm(f => ({ ...f, urun_id: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                      <option value="">Seçiniz</option>
                      {urunler.map(u => <option key={u.id} value={u.id}>{u.ad}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Miktar *</label>
                    <input type="number" min="1" value={form.miktar}
                      onChange={e => setForm(f => ({ ...f, miktar: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Planlanan Başlangıç</label>
                    <input type="date" value={form.planlanan_baslangic}
                      onChange={e => setForm(f => ({ ...f, planlanan_baslangic: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Planlanan Bitiş</label>
                    <input type="date" value={form.planlanan_bitis}
                      onChange={e => setForm(f => ({ ...f, planlanan_bitis: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Sorumlu</label>
                    <input value={form.sorumlu}
                      onChange={e => setForm(f => ({ ...f, sorumlu: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notlar</label>
                    <input value={form.notlar}
                      onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                </div>
              )}
            </div>
            {!uyariOnay && (
              <div className="px-6 py-4 border-t flex justify-end gap-2">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">İptal</button>
                <button onClick={() => handleCreate(false)} disabled={saving || !form.urun_id || !form.miktar}
                  className="px-4 py-2 text-sm bg-[#C8102E] text-white rounded-lg hover:bg-[#a50d26] disabled:opacity-50">
                  {saving ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
