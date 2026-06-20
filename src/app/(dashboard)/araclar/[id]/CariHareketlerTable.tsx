'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'

type IslemYonu = 'alacak' | 'borc'

export type CariHareketRow = {
  id: string
  araci_id: string
  hareket_tarihi: string
  vade_tarihi: string | null
  hareket_tipi: string
  islem_yonu: IslemYonu
  tutar: number
  para_birimi: string
  aciklama: string | null
  kategori: string | null
  durum: string
  odeme_tarihi: string | null
  bagli_fatura_id: string | null
  bagli_fatura_no: string | null
  bagli_musteri_adi: string | null
  kaynak: string
  belge_no: string | null
  sube_id: string | null
  subeler?: { ad: string } | null
}

type Sube = { id: string; ad: string }

type Props = {
  brokerId: string
  initialRows: CariHareketRow[]
  subeler: Sube[]
}

const hareketTipleri: Record<string, { yon: IslemYonu; kategori: string; durum: string }> = {
  'Manuel Alacak': { yon: 'alacak', kategori: 'Manuel Alacak', durum: 'Bekliyor' },
  'Düzeltme Alacağı': { yon: 'alacak', kategori: 'Düzeltme', durum: 'Bekliyor' },
  'Ödeme': { yon: 'borc', kategori: 'Ödeme', durum: 'Ödendi' },
  'Avans': { yon: 'borc', kategori: 'Avans', durum: 'Mahsup Edildi' },
  'Kesinti': { yon: 'borc', kategori: 'Kesinti', durum: 'Mahsup Edildi' },
  'Düzeltme Borcu': { yon: 'borc', kategori: 'Düzeltme', durum: 'Bekliyor' },
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function isOverdue(row: CariHareketRow) {
  if (row.islem_yonu !== 'alacak' || !row.vade_tarihi) return false
  if (['Ödendi', 'İptal', 'Mahsup Edildi'].includes(row.durum)) return false
  return row.vade_tarihi < today()
}

function statusClass(row: CariHareketRow) {
  if (row.durum === 'Ödendi') return 'bg-green-50 text-green-700 border-green-200'
  if (row.durum === 'İptal') return 'bg-red-50 text-red-600 border-red-200'
  if (isOverdue(row)) return 'bg-red-50 text-red-700 border-red-200'
  if (row.durum === 'Kısmi Ödendi') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (row.durum === 'Mahsup Edildi') return 'bg-violet-50 text-violet-700 border-violet-200'
  return 'bg-gray-50 text-gray-700 border-gray-200'
}

export default function CariHareketlerTable({ brokerId, initialRows, subeler }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('tum')
  const [form, setForm] = useState({
    hareket_tipi: 'Manuel Alacak',
    hareket_tarihi: today(),
    vade_tarihi: '',
    tutar: '',
    aciklama: '',
    kategori: '',
    durum: 'Bekliyor',
    odeme_tarihi: '',
    belge_no: '',
    sube_id: '',
  })

  const filteredRows = useMemo(() => {
    if (filter === 'geciken') return rows.filter(isOverdue)
    if (filter === 'alacak') return rows.filter(row => row.islem_yonu === 'alacak')
    if (filter === 'borc') return rows.filter(row => row.islem_yonu === 'borc')
    if (filter === 'bekleyen') return rows.filter(row => !['Ödendi', 'İptal', 'Mahsup Edildi'].includes(row.durum))
    return rows
  }, [rows, filter])

  function updateTip(tip: string) {
    const config = hareketTipleri[tip]
    setForm(prev => ({
      ...prev,
      hareket_tipi: tip,
      kategori: config.kategori,
      durum: config.durum,
      odeme_tarihi: tip === 'Ödeme' ? (prev.odeme_tarihi || prev.hareket_tarihi) : prev.odeme_tarihi,
    }))
  }

  function resetForm() {
    setForm({
      hareket_tipi: 'Manuel Alacak',
      hareket_tarihi: today(),
      vade_tarihi: '',
      tutar: '',
      aciklama: '',
      kategori: '',
      durum: 'Bekliyor',
      odeme_tarihi: '',
      belge_no: '',
      sube_id: '',
    })
    setEditingId(null)
    setError('')
  }

  function startEdit(row: CariHareketRow) {
    if (row.kaynak === 'Fatura Komisyonu') {
      setError('Fatura kaynaklı komisyon hareketi doğrudan düzenlenemez. Komisyonu bağlı faturalar bölümünden düzenleyin.')
      return
    }
    setEditingId(row.id)
    setShowForm(true)
    setError('')
    setForm({
      hareket_tipi: row.hareket_tipi,
      hareket_tarihi: row.hareket_tarihi,
      vade_tarihi: row.vade_tarihi ?? '',
      tutar: String(row.tutar),
      aciklama: row.aciklama ?? '',
      kategori: row.kategori ?? '',
      durum: row.durum,
      odeme_tarihi: row.odeme_tarihi ?? '',
      belge_no: row.belge_no ?? '',
      sube_id: row.sube_id ?? '',
    })
  }

  async function saveMovement(e: React.FormEvent) {
    e.preventDefault()
    const tutar = Number(form.tutar)
    if (!Number.isFinite(tutar) || tutar <= 0) {
      setError('Tutar sıfırdan büyük olmalıdır.')
      return
    }
    const config = hareketTipleri[form.hareket_tipi]
    setSaving(true)
    setError('')

    const payload = {
      araci_id: brokerId,
      hareket_tarihi: form.hareket_tarihi,
      vade_tarihi: form.vade_tarihi || null,
      hareket_tipi: form.hareket_tipi,
      islem_yonu: config.yon,
      tutar,
      para_birimi: 'TRY',
      aciklama: form.aciklama || null,
      kategori: form.kategori || config.kategori,
      durum: form.durum,
      odeme_tarihi: form.odeme_tarihi || (form.hareket_tipi === 'Ödeme' ? form.hareket_tarihi : null),
      belge_no: form.belge_no || null,
      sube_id: form.sube_id || null,
      kaynak: form.hareket_tipi === 'Ödeme' ? 'Ödeme' : config.kategori,
      updated_at: new Date().toISOString(),
    }

    const result = editingId
      ? await supabase
          .from('araci_cari_hareketleri')
          .update(payload)
          .eq('id', editingId)
          .neq('kaynak', 'Fatura Komisyonu')
          .select('*, subeler(ad)')
          .single()
      : await fetch('/api/tenant-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'araci_cari_hareketleri', payload }),
        }).then(async res => {
          const data = await res.json()
          return res.ok ? { data, error: null } : { data: null, error: { message: data?.error ?? `HTTP ${res.status}` } }
        })

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    const saved = result.data as CariHareketRow
    setRows(prev => editingId ? prev.map(row => row.id === saved.id ? saved : row) : [saved, ...prev])
    resetForm()
    setShowForm(false)
    setSaving(false)
    router.refresh()
  }

  async function updateStatus(row: CariHareketRow, durum: string) {
    const odeme_tarihi = durum === 'Ödendi' ? today() : row.odeme_tarihi
    const { data, error } = await supabase
      .from('araci_cari_hareketleri')
      .update({ durum, odeme_tarihi, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('*, subeler(ad)')
      .single()
    if (error) {
      setError(error.message)
      return
    }
    setRows(prev => prev.map(item => item.id === row.id ? data as CariHareketRow : item))
    router.refresh()
  }

  async function deleteMovement(row: CariHareketRow) {
    if (row.kaynak === 'Fatura Komisyonu') {
      setError('Fatura kaynaklı komisyon hareketi silinemez. Fatura bağlantısı kaldırılırsa hareket pasife alınmalıdır.')
      return
    }
    const ok = window.confirm('Bu cari hareket silinecek. Aracı bakiyesi değişebilir. Devam etmek istiyor musunuz?')
    if (!ok) return
    const { error } = await supabase
      .from('araci_cari_hareketleri')
      .delete()
      .eq('id', row.id)
      .neq('kaynak', 'Fatura Komisyonu')
    if (error) {
      setError(error.message)
      return
    }
    setRows(prev => prev.filter(item => item.id !== row.id))
    router.refresh()
  }

  return (
    <div className="bg-white dark:bg-gray-800 border rounded-lg">
      <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cari Hareketler</h2>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Alacak, borç, ödeme, avans ve kesinti kayıtları</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <option value="tum">Tüm hareketler</option>
            <option value="alacak">Alacaklar</option>
            <option value="borc">Borç / Ödeme</option>
            <option value="bekleyen">Bekleyenler</option>
            <option value="geciken">Gecikenler</option>
          </select>
          <button
            onClick={() => { resetForm(); setShowForm(v => !v) }}
            className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors"
          >
            + Cari Hareket Ekle
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={saveMovement} className="p-5 border-b bg-gray-50 dark:bg-gray-700 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Hareket Tipi</label>
              <select
                value={form.hareket_tipi}
                onChange={e => updateTip(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800"
              >
                {Object.keys(hareketTipleri).map(tip => <option key={tip} value={tip}>{tip}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Hareket Tarihi</label>
              <input type="date" value={form.hareket_tarihi} onChange={e => setForm(prev => ({ ...prev, hareket_tarihi: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Vade Tarihi</label>
              <input type="date" value={form.vade_tarihi} onChange={e => setForm(prev => ({ ...prev, vade_tarihi: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Tutar</label>
              <input type="number" min="0" step="0.01" value={form.tutar} onChange={e => setForm(prev => ({ ...prev, tutar: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" required />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
              <input value={form.aciklama} onChange={e => setForm(prev => ({ ...prev, aciklama: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="Açıklama" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Kategori</label>
              <input value={form.kategori} onChange={e => setForm(prev => ({ ...prev, kategori: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder={hareketTipleri[form.hareket_tipi].kategori} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Durum</label>
              <select value={form.durum} onChange={e => setForm(prev => ({ ...prev, durum: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
                <option>Bekliyor</option>
                <option>Vadesi Geldi</option>
                <option>Ödendi</option>
                <option>Kısmi Ödendi</option>
                <option>İptal</option>
                <option>Mahsup Edildi</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Ödeme Tarihi</label>
              <input type="date" value={form.odeme_tarihi} onChange={e => setForm(prev => ({ ...prev, odeme_tarihi: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Belge No</label>
              <input value={form.belge_no} onChange={e => setForm(prev => ({ ...prev, belge_no: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Şube</label>
              <select value={form.sube_id} onChange={e => setForm(prev => ({ ...prev, sube_id: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
                <option value="">Şube seçilmedi</option>
                {subeler.map(sube => <option key={sube.id} value={sube.id}>{sube.ad}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50">
              {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button type="button" onClick={() => { resetForm(); setShowForm(false) }}
              className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              İptal
            </button>
          </div>
        </form>
      )}

      {!showForm && error && <p className="px-5 py-3 border-b text-sm text-red-600">{error}</p>}

      {filteredRows.length === 0 ? (
        <div className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
          Cari hareket kaydı bulunmuyor.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarih</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vade</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tip</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Açıklama</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Müşteri</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Alacak</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Borç</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ödeme Tarihi</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatTRDate(row.hareket_tarihi)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {row.vade_tarihi ? formatTRDate(row.vade_tarihi) : '-'}
                    {isOverdue(row) && <span className="ml-2 text-xs text-red-600">Gecikmiş</span>}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{row.hareket_tipi}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{row.aciklama ?? '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {row.bagli_fatura_id ? (
                      <Link href={`/cari-hesap/faturalar/${row.bagli_fatura_id}`} className="text-[#C8102E] hover:underline">
                        {row.bagli_fatura_no ?? 'Fatura'}
                      </Link>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.bagli_musteri_adi ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                    {row.islem_yonu === 'alacak' ? formatCurrency(row.tutar) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">
                    {row.islem_yonu === 'borc' ? formatCurrency(row.tutar) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusClass(row)}`}>
                      {isOverdue(row) ? 'Gecikmiş' : row.durum}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{row.odeme_tarihi ? formatTRDate(row.odeme_tarihi) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!['Ödendi', 'İptal'].includes(row.durum) && (
                        <button onClick={() => updateStatus(row, 'Ödendi')} className="text-xs text-green-700 hover:underline">
                          Ödendi
                        </button>
                      )}
                      {row.durum !== 'İptal' && (
                        <button onClick={() => updateStatus(row, 'İptal')} className="text-xs text-red-600 hover:underline">
                          İptal
                        </button>
                      )}
                      <button onClick={() => startEdit(row)} className="text-xs text-gray-600 dark:text-gray-300 hover:underline">
                        Düzenle
                      </button>
                      <button onClick={() => deleteMovement(row)} className="text-xs text-red-600 hover:underline">
                        Sil
                      </button>
                      {row.belge_no && <span className="text-xs text-gray-400 dark:text-gray-500">Belge: {row.belge_no}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
