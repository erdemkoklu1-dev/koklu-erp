'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Urun = {
  id: string
  kategori: 'cihaz' | 'dolum' | 'yedek_parca'
  ad: string
  kapasite: string | null
  tip: string | null
  kdv_dahil_fiyat: number
  kdv_haric_fiyat: number
  periyodik_bakim_fiyati: number | null
  dolum_fiyati: number | null
  birim: string
  aktif: boolean
}

type Tab = 'tumu' | 'cihaz' | 'dolum' | 'yedek_parca'

const KAT_LABEL: Record<string, string> = {
  cihaz: 'Cihaz', dolum: 'Dolum/Bakım', yedek_parca: 'Yedek Parça',
}
const KAT_BADGE: Record<string, string> = {
  cihaz: 'bg-red-50 text-red-700 border-red-200',
  dolum: 'bg-blue-50 text-blue-700 border-blue-200',
  yedek_parca: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '-'
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n) + ' ₺'
}

const EMPTY: Partial<Urun> = {
  kategori: 'cihaz', ad: '', kapasite: '', tip: 'KKT',
  kdv_dahil_fiyat: 0, kdv_haric_fiyat: 0,
  periyodik_bakim_fiyati: null, dolum_fiyati: null,
  birim: 'adet', aktif: true,
}

export default function CihazlarPage() {
  const supabase = createClient()
  const [urunler, setUrunler] = useState<Urun[]>([])
  const [tab, setTab] = useState<Tab>('tumu')
  const [loading, setLoading] = useState(true)

  // Modal
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Urun>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Toplu güncelleme
  const [topluModal, setTopluModal] = useState(false)
  const [topluFiltre, setTopluFiltre] = useState<Tab>('tumu')
  const [topluYon, setTopluYon] = useState<'artis' | 'azalis'>('artis')
  const [topluOran, setTopluOran] = useState('')
  const [topluSaving, setTopluSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('urunler').select('*').order('kategori').order('kdv_dahil_fiyat')
      if (error) throw error
      setUrunler((data as Urun[]) ?? [])
    } catch (e) {
      console.error('Ürünler yüklenemedi:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const goruntulenenler = tab === 'tumu' ? urunler : urunler.filter(u => u.kategori === tab)

  // Özet
  const toplam   = urunler.filter(u => u.aktif).length
  const cihazSay = urunler.filter(u => u.aktif && u.kategori === 'cihaz').length
  const dolumSay = urunler.filter(u => u.aktif && u.kategori === 'dolum').length
  const parcaSay = urunler.filter(u => u.aktif && u.kategori === 'yedek_parca').length

  // Modal aç
  function openNew() {
    setEditId(null); setForm(EMPTY); setErr(''); setModal(true)
  }
  function openEdit(u: Urun) {
    setEditId(u.id); setForm({ ...u }); setErr(''); setModal(true)
  }

  // KDV dahil girilince hariç otomatik
  function setKdvDahil(val: number) {
    setForm(f => ({ ...f, kdv_dahil_fiyat: val, kdv_haric_fiyat: Math.round(val / 1.20 * 100) / 100 }))
  }

  async function handleSave() {
    if (!form.ad?.trim()) { setErr('Ürün adı gereklidir.'); return }
    setSaving(true); setErr('')
    const payload = {
      kategori: form.kategori,
      ad: form.ad,
      kapasite: form.kapasite || null,
      tip: form.tip || null,
      kdv_dahil_fiyat: form.kdv_dahil_fiyat ?? 0,
      kdv_haric_fiyat: form.kdv_haric_fiyat ?? 0,
      periyodik_bakim_fiyati: form.kategori === 'dolum' ? (form.periyodik_bakim_fiyati ?? null) : null,
      dolum_fiyati: form.kategori === 'dolum' ? (form.dolum_fiyati ?? null) : null,
      birim: form.birim ?? 'adet',
      aktif: form.aktif ?? true,
      updated_at: new Date().toISOString(),
    }
    if (editId) {
      const { error } = await supabase.from('urunler').update(payload).eq('id', editId)
      if (error) { setErr(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('urunler').insert([payload])
      if (error) { setErr(error.message); setSaving(false); return }
    }
    setSaving(false); setModal(false); load()
  }

  async function toggleAktif(u: Urun) {
    await supabase.from('urunler').update({ aktif: !u.aktif, updated_at: new Date().toISOString() }).eq('id', u.id)
    setUrunler(prev => prev.map(x => x.id === u.id ? { ...x, aktif: !u.aktif } : x))
  }

  async function handleSil(u: Urun) {
    if (!confirm(`"${u.ad}" silinsin mi?`)) return
    await supabase.from('urunler').delete().eq('id', u.id)
    setUrunler(prev => prev.filter(x => x.id !== u.id))
  }

  // Toplu fiyat güncelle — seri yerine paralel (çok daha hızlı)
  async function handleTopluGuncelle() {
    const oran = parseFloat(topluOran)
    if (isNaN(oran) || oran <= 0) return
    setTopluSaving(true)
    try {
      const hedefler = topluFiltre === 'tumu' ? urunler : urunler.filter(u => u.kategori === topluFiltre)
      const cogul = topluYon === 'artis' ? 1 + oran / 100 : 1 - oran / 100

      await Promise.all(hedefler.map(u => {
        const yeniDahil = Math.round(u.kdv_dahil_fiyat * cogul * 100) / 100
        const yeniHaric = Math.round(yeniDahil / 1.20 * 100) / 100
        const yeniPB = u.periyodik_bakim_fiyati != null ? Math.round(u.periyodik_bakim_fiyati * cogul * 100) / 100 : null
        const yeniDF = u.dolum_fiyati != null ? Math.round(u.dolum_fiyati * cogul * 100) / 100 : null
        return supabase.from('urunler').update({
          kdv_dahil_fiyat: yeniDahil, kdv_haric_fiyat: yeniHaric,
          periyodik_bakim_fiyati: yeniPB, dolum_fiyati: yeniDF,
          updated_at: new Date().toISOString(),
        }).eq('id', u.id)
      }))
      setTopluModal(false); setTopluOran(''); load()
    } catch (e) {
      console.error('Toplu güncelleme hatası:', e)
    } finally {
      setTopluSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cihaz & Ürün Kataloğu</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTopluModal(true)}
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            📊 Toplu Fiyat Güncelle
          </button>
          <Link href="/fiyat-teklifleri/fiyat-listesi" target="_blank"
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            📄 Fiyat Listesi
          </Link>
          <button onClick={openNew}
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Ürün Ekle
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Özet kartlar */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Toplam Ürün</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{toplam}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-xs text-red-600">Cihazlar</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{cihazSay}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-xs text-blue-600">Dolum/Bakım</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{dolumSay}</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-xs text-yellow-600">Yedek Parça</div>
            <div className="text-2xl font-bold text-yellow-700 mt-1">{parcaSay}</div>
          </div>
        </div>

        {/* Sekme filtresi */}
        <div className="flex gap-1">
          {([
            { value: 'tumu',       label: 'Tümü' },
            { value: 'cihaz',      label: 'Cihazlar' },
            { value: 'dolum',      label: 'Dolumlar' },
            { value: 'yedek_parca', label: 'Yedek Parça' },
          ] as const).map(opt => (
            <button key={opt.value} onClick={() => setTab(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                tab === opt.value ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-gray-400'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Tablo */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ÜRÜN ADI</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">KATEGORİ</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">KDV DAHİL</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">KDV HARİÇ</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">PERİYODİK BAKIM</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">DOLUM</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">DURUM</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Yükleniyor...</td></tr>
              ) : goruntulenenler.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Ürün bulunamadı.</td></tr>
              ) : goruntulenenler.map((u, idx) => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.aktif ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.ad}</div>
                    {u.tip && <div className="text-xs text-gray-400 dark:text-gray-500">{u.tip}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${KAT_BADGE[u.kategori]}`}>
                      {KAT_LABEL[u.kategori]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                    {u.kategori !== 'dolum' ? fmt(u.kdv_dahil_fiyat) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">
                    {u.kategori !== 'dolum' ? fmt(u.kdv_haric_fiyat) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 dark:text-gray-300">
                    {u.kategori === 'dolum' ? fmt(u.periyodik_bakim_fiyati) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                    {u.kategori === 'dolum' ? fmt(u.dolum_fiyati) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleAktif(u)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${u.aktif ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow transition-all ${u.aktif ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(u)} title="Düzenle"
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-700 transition-colors text-base">✏️</button>
                      <button onClick={() => handleSil(u)} title="Sil"
                        className="text-gray-400 dark:text-gray-500 hover:text-red-600 transition-colors text-base">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Ürün Ekle/Düzenle Modalı ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{editId ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-2xl font-bold leading-none">×</button>
            </div>
            <div className="p-5 space-y-3">
              {/* Kategori */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Kategori</label>
                <div className="flex gap-1">
                  {([
                    { value: 'cihaz', label: 'Cihaz' },
                    { value: 'dolum', label: 'Dolum/Bakım' },
                    { value: 'yedek_parca', label: 'Yedek Parça' },
                  ] as const).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => ({ ...f, kategori: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        form.kategori === opt.value ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ürün adı */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Ürün Adı <span className="text-red-500">*</span></label>
                <input value={form.ad ?? ''} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                  placeholder="Ürün adı"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>

              {/* Kapasite + Tip */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Kapasite</label>
                  <input value={form.kapasite ?? ''} onChange={e => setForm(f => ({ ...f, kapasite: e.target.value }))}
                    placeholder="6 Kg"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Tip</label>
                  <select value={form.tip ?? ''} onChange={e => setForm(f => ({ ...f, tip: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                    <option value="">Seçiniz</option>
                    <option value="KKT">KKT</option>
                    <option value="KÖPÜKLÜ">KÖPÜKLÜ</option>
                    <option value="CO2">CO2</option>
                    <option value="Otomatik">Otomatik</option>
                    <option value="Diger">Diğer</option>
                  </select>
                </div>
              </div>

              {/* Fiyatlar */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">KDV Dahil Fiyat (₺)</label>
                  <input type="number" min={0} step="any" value={form.kdv_dahil_fiyat ?? ''}
                    onChange={e => setKdvDahil(parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">KDV Hariç Fiyat (₺)</label>
                  <input type="number" min={0} step="any" value={form.kdv_haric_fiyat ?? ''}
                    onChange={e => setForm(f => ({ ...f, kdv_haric_fiyat: parseFloat(e.target.value) || 0 }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-gray-50 dark:bg-gray-700" />
                </div>
              </div>

              {/* Dolum özel fiyatlar */}
              {form.kategori === 'dolum' && (
                <div className="grid grid-cols-2 gap-3 pt-1 border-t">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Periyodik Bakım (₺)</label>
                    <input type="number" min={0} step="any" value={form.periyodik_bakim_fiyati ?? ''}
                      onChange={e => setForm(f => ({ ...f, periyodik_bakim_fiyati: parseFloat(e.target.value) || null }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Dolum Fiyatı (₺)</label>
                    <input type="number" min={0} step="any" value={form.dolum_fiyati ?? ''}
                      onChange={e => setForm(f => ({ ...f, dolum_fiyati: parseFloat(e.target.value) || null }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                </div>
              )}

              {/* Aktif toggle */}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Aktif</span>
                <div onClick={() => setForm(f => ({ ...f, aktif: !f.aktif }))}
                  className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${form.aktif ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow transition-all ${form.aktif ? 'left-5' : 'left-0.5'}`} />
                </div>
              </div>

              {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setModal(false)}
                className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toplu Fiyat Güncelleme Modalı ── */}
      {topluModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Toplu Fiyat Güncelle</h2>
              <button onClick={() => setTopluModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-2xl font-bold leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Kategori</label>
                <div className="flex gap-1 flex-wrap">
                  {([
                    { value: 'tumu', label: 'Tümü' },
                    { value: 'cihaz', label: 'Cihazlar' },
                    { value: 'dolum', label: 'Dolumlar' },
                    { value: 'yedek_parca', label: 'Yedek Parça' },
                  ] as const).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setTopluFiltre(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        topluFiltre === opt.value ? 'bg-gray-800 text-white border-gray-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">İşlem</label>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setTopluYon('artis')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${topluYon === 'artis' ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'}`}>
                    📈 Zam (%)
                  </button>
                  <button type="button" onClick={() => setTopluYon('azalis')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${topluYon === 'azalis' ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'}`}>
                    📉 İndirim (%)
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">Oran (%)</label>
                <input type="number" min={0.1} step="any" value={topluOran} onChange={e => setTopluOran(e.target.value)}
                  placeholder="Örn: 10"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              {topluOran && parseFloat(topluOran) > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                  {topluFiltre === 'tumu' ? 'Tüm' : KAT_LABEL[topluFiltre]} ürünlere %{topluOran}{' '}
                  {topluYon === 'artis' ? 'zam' : 'indirim'} uygulanacak
                  ({topluFiltre === 'tumu' ? urunler.length : urunler.filter(u => u.kategori === topluFiltre).length} ürün).
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={handleTopluGuncelle} disabled={topluSaving || !topluOran}
                className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
                {topluSaving ? 'Güncelleniyor...' : 'Uygula'}
              </button>
              <button onClick={() => setTopluModal(false)}
                className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
