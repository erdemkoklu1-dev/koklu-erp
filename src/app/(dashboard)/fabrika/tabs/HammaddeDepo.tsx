'use client'

import { useState, useEffect, useMemo } from 'react'

type Hammadde = {
  id: string
  ad: string
  birim: string
  mevcut_stok: number
  minimum_stok: number
  birim_maliyet: number
  kategori: string
  notlar: string | null
  tedarikci_id: string | null
  tedarikciler: { id: string; firma_adi: string } | null
}

type Tedarikci = { id: string; firma_adi: string }

type DepoHareket = {
  id: string
  hareket_tipi: string
  miktar: number
  tarih: string
  referans_no: string | null
  aciklama: string | null
}

const KATEGORILER = ['kimyasal', 'metal', 'plastik', 'gaz', 'diger']

const STOK_DURUM = (h: Hammadde) => {
  const m = Number(h.mevcut_stok), min = Number(h.minimum_stok)
  if (m < min)         return 'kritik'
  if (m < min * 1.5)   return 'uyari'
  return 'yeterli'
}

const DURUM_BADGE: Record<string, string> = {
  kritik:  'bg-red-100 text-red-700',
  uyari:   'bg-amber-100 text-amber-700',
  yeterli: 'bg-green-100 text-green-700',
}
const DURUM_LABEL: Record<string, string> = {
  kritik: '🔴 Kritik', uyari: '🟡 Uyarı', yeterli: '🟢 Yeterli',
}

export default function HammaddeDepo() {
  const [hammaddeler, setHammaddeler] = useState<Hammadde[]>([])
  const [tedarikciler, setTedarikciler] = useState<Tedarikci[]>([])
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [durumFilter, setDurumFilter] = useState('')

  // Ekle modal
  const [ekleOpen, setEkleOpen] = useState(false)
  const [ekleForm, setEkleForm] = useState({
    ad: '', kategori: 'kimyasal', birim: 'adet',
    mevcut_stok: '', minimum_stok: '', birim_maliyet: '',
    tedarikci_id: '', notlar: '',
  })
  const [ekleSaving, setEkleSaving] = useState(false)

  // Stok giriş modal
  const [stokOpen, setStokOpen] = useState(false)
  const [stokForm, setStokForm] = useState({
    hammadde_id: '', miktar: '', tarih: new Date().toISOString().split('T')[0],
    referans_no: '', aciklama: '',
  })
  const [stokSaving, setStokSaving] = useState(false)

  // Hareket geçmişi modal
  const [hareketModal, setHareketModal] = useState<{ hammadde: Hammadde | null; items: DepoHareket[] }>({
    hammadde: null, items: [],
  })
  const [hareketLoading, setHareketLoading] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/fabrika/hammaddeler')
      const raw = await res.json()
      const h: Hammadde[] = Array.isArray(raw) ? raw : []
      setHammaddeler(h)

      const seen = new Map<string, Tedarikci>()
      h.forEach(ham => {
        if (ham.tedarikciler) seen.set(ham.tedarikciler.id, ham.tedarikciler)
      })
      setTedarikciler(Array.from(seen.values()))
    } catch (err: any) {
      console.error('Hammadde yükleme hatası:', err)
      setHata('Veriler yüklenemedi: ' + (err?.message ?? 'Bilinmeyen hata'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return hammaddeler.filter(h => {
      if (search && !h.ad.toLowerCase().includes(search.toLowerCase())) return false
      if (kategoriFilter && h.kategori !== kategoriFilter) return false
      if (durumFilter && STOK_DURUM(h) !== durumFilter) return false
      return true
    })
  }, [hammaddeler, search, kategoriFilter, durumFilter])

  async function handleEkle() {
    if (!ekleForm.ad || !ekleForm.kategori || !ekleForm.birim) return
    setEkleSaving(true)
    const res = await fetch('/api/fabrika/hammaddeler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...ekleForm,
        mevcut_stok: Number(ekleForm.mevcut_stok) || 0,
        minimum_stok: Number(ekleForm.minimum_stok) || 0,
        birim_maliyet: Number(ekleForm.birim_maliyet) || 0,
        tedarikci_id: ekleForm.tedarikci_id || null,
      }),
    })
    setEkleSaving(false)
    if (res.ok) {
      setEkleOpen(false)
      setEkleForm({ ad: '', kategori: 'kimyasal', birim: 'adet', mevcut_stok: '', minimum_stok: '', birim_maliyet: '', tedarikci_id: '', notlar: '' })
      load()
    }
  }

  async function handleStokGiris() {
    if (!stokForm.hammadde_id || !stokForm.miktar) return
    setStokSaving(true)
    const res = await fetch('/api/fabrika/stok-giris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...stokForm, miktar: Number(stokForm.miktar) }),
    })
    setStokSaving(false)
    if (res.ok) {
      setStokOpen(false)
      setStokForm({ hammadde_id: '', miktar: '', tarih: new Date().toISOString().split('T')[0], referans_no: '', aciklama: '' })
      load()
    }
  }

  async function openHareket(h: Hammadde) {
    setHareketModal({ hammadde: h, items: [] })
    setHareketLoading(true)
    const res = await fetch(`/api/fabrika/depo-hareketleri?kaynak=hammadde&limit=100`)
    const all: (DepoHareket & { kaynak_id: string })[] = await res.json()
    setHareketModal({ hammadde: h, items: all.filter(d => d.kaynak_id === h.id) })
    setHareketLoading(false)
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Yükleniyor...</div>
  if (hata) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{hata}</div>
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Hammadde ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] w-48"
          />
          <select value={kategoriFilter} onChange={e => setKategoriFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
            <option value="">Tüm Kategoriler</option>
            {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={durumFilter} onChange={e => setDurumFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
            <option value="">Tüm Durumlar</option>
            <option value="kritik">🔴 Kritik</option>
            <option value="uyari">🟡 Uyarı</option>
            <option value="yeterli">🟢 Yeterli</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStokOpen(true)}
            className="flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            📦 Stok Girişi
          </button>
          <button onClick={() => setEkleOpen(true)}
            className="flex items-center gap-1 bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#a50d26]">
            + Hammadde Ekle
          </button>
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
            <tr>
              <th className="px-4 py-2 text-left">Hammadde</th>
              <th className="px-4 py-2 text-left">Kategori</th>
              <th className="px-4 py-2 text-right">Mevcut Stok</th>
              <th className="px-4 py-2 text-right">Min. Stok</th>
              <th className="px-4 py-2 text-center">Stok Durumu</th>
              <th className="px-4 py-2 text-right">Birim Maliyet</th>
              <th className="px-4 py-2 text-right">Toplam Değer</th>
              <th className="px-4 py-2 text-center">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Hammadde bulunamadı</td></tr>
            )}
            {filtered.map(h => {
              const durum = STOK_DURUM(h)
              const toplam = Number(h.mevcut_stok) * Number(h.birim_maliyet)
              return (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{h.ad}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{h.kategori}</td>
                  <td className="px-4 py-3 text-right">{Number(h.mevcut_stok).toLocaleString('tr-TR')} {h.birim}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{Number(h.minimum_stok).toLocaleString('tr-TR')} {h.birim}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${DURUM_BADGE[durum]}`}>
                      {DURUM_LABEL[durum]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(h.birim_maliyet) > 0 ? `₺${Number(h.birim_maliyet).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {toplam > 0 ? `₺${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openHareket(h)} className="text-xs text-[#C8102E] hover:underline">
                      Hareket Geç.
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Hammadde Ekle Modal */}
      {ekleOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Hammadde Ekle</h3>
              <button onClick={() => setEkleOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ad *</label>
                  <input value={ekleForm.ad} onChange={e => setEkleForm(f => ({ ...f, ad: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Kategori *</label>
                  <select value={ekleForm.kategori} onChange={e => setEkleForm(f => ({ ...f, kategori: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Birim *</label>
                  <select value={ekleForm.birim} onChange={e => setEkleForm(f => ({ ...f, birim: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    {['kg','litre','adet','m3','metre'].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mevcut Stok</label>
                  <input type="number" min="0" step="0.001" value={ekleForm.mevcut_stok}
                    onChange={e => setEkleForm(f => ({ ...f, mevcut_stok: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Minimum Stok</label>
                  <input type="number" min="0" step="0.001" value={ekleForm.minimum_stok}
                    onChange={e => setEkleForm(f => ({ ...f, minimum_stok: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Birim Maliyet (₺)</label>
                  <input type="number" min="0" step="0.01" value={ekleForm.birim_maliyet}
                    onChange={e => setEkleForm(f => ({ ...f, birim_maliyet: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tedarikçi</label>
                  <select value={ekleForm.tedarikci_id} onChange={e => setEkleForm(f => ({ ...f, tedarikci_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    <option value="">Seçiniz</option>
                    {tedarikciler.map(t => <option key={t.id} value={t.id}>{t.firma_adi}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Notlar</label>
                  <textarea value={ekleForm.notlar} onChange={e => setEkleForm(f => ({ ...f, notlar: e.target.value }))}
                    rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setEkleOpen(false)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">İptal</button>
              <button onClick={handleEkle} disabled={ekleSaving || !ekleForm.ad}
                className="px-4 py-2 text-sm bg-[#C8102E] text-white rounded-lg hover:bg-[#a50d26] disabled:opacity-50">
                {ekleSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stok Giriş Modal */}
      {stokOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Stok Girişi</h3>
              <button onClick={() => setStokOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hammadde *</label>
                <select value={stokForm.hammadde_id} onChange={e => setStokForm(f => ({ ...f, hammadde_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="">Seçiniz</option>
                  {hammaddeler.map(h => <option key={h.id} value={h.id}>{h.ad} ({h.birim})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Miktar *</label>
                <input type="number" min="0.001" step="0.001" value={stokForm.miktar}
                  onChange={e => setStokForm(f => ({ ...f, miktar: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tarih</label>
                <input type="date" value={stokForm.tarih}
                  onChange={e => setStokForm(f => ({ ...f, tarih: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Referans No</label>
                <input value={stokForm.referans_no}
                  onChange={e => setStokForm(f => ({ ...f, referans_no: e.target.value }))}
                  placeholder="İrsaliye / Fatura no"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Açıklama</label>
                <input value={stokForm.aciklama}
                  onChange={e => setStokForm(f => ({ ...f, aciklama: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setStokOpen(false)} className="px-4 py-2 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">İptal</button>
              <button onClick={handleStokGiris} disabled={stokSaving || !stokForm.hammadde_id || !stokForm.miktar}
                className="px-4 py-2 text-sm bg-[#C8102E] text-white rounded-lg hover:bg-[#a50d26] disabled:opacity-50">
                {stokSaving ? 'Kaydediliyor...' : 'Stok Ekle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hareket Geçmişi Modal */}
      {hareketModal.hammadde && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Hareket Geçmişi — {hareketModal.hammadde.ad}
              </h3>
              <button onClick={() => setHareketModal({ hammadde: null, items: [] })}
                className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="overflow-auto flex-1">
              {hareketLoading ? (
                <div className="p-6 text-center text-sm text-gray-400">Yükleniyor...</div>
              ) : hareketModal.items.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">Hareket kaydı yok</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">Tarih</th>
                      <th className="px-4 py-2 text-left">Tür</th>
                      <th className="px-4 py-2 text-right">Miktar</th>
                      <th className="px-4 py-2 text-left">Referans</th>
                      <th className="px-4 py-2 text-left">Açıklama</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {hareketModal.items.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500">{d.tarih}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.hareket_tipi === 'giris'    ? 'bg-green-100 text-green-700' :
                            d.hareket_tipi === 'cikis'    ? 'bg-red-100 text-red-700' :
                            d.hareket_tipi === 'fire'     ? 'bg-amber-100 text-amber-700' :
                                                            'bg-blue-100 text-blue-700'
                          }`}>{d.hareket_tipi}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-medium">{Number(d.miktar).toLocaleString('tr-TR')}</td>
                        <td className="px-4 py-2 text-gray-500">{d.referans_no ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-500">{d.aciklama ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
