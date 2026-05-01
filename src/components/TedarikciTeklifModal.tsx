'use client'

import { useState, useEffect, useRef } from 'react'

export interface ParsedKalem {
  sira_no: number
  aciklama: string
  miktar: number
  birim: string
  birim_fiyat: number
  toplam: number
}

export interface ParsedTeklif {
  tedarikci: string
  tarih: string
  ref_no: string
  para_birimi: string
  kalemler: ParsedKalem[]
  ara_toplam: number
  iskonto_toplam: number
  genel_toplam: number
}

const BIRIMLER = ['Adet', 'Set', 'Kg', 'Metre', 'Takım', 'Kutu', 'Paket', 'Lt', 'Hizmet']

// rates: { TRY: 1, EUR: 0.026, USD: 0.028 }  (base = TRY)
// 1 EUR = 1 / rates.EUR TRY
function konvert(amount: number, fromPB: string, toPB: string, rates: Record<string, number>): number {
  if (fromPB === toPB) return amount
  const fromRate = rates[fromPB] ?? 1
  const toRate = rates[toPB] ?? 1
  return Math.round((amount / fromRate) * toRate * 100) / 100
}

interface Props {
  open: boolean
  data: ParsedTeklif | null
  onClose: () => void
  onAktar: (kalemler: ParsedKalem[], paraBirimi: string) => void
}

export default function TedarikciTeklifModal({ open, data, onClose, onAktar }: Props) {
  const [edited, setEdited] = useState<ParsedTeklif | null>(null)
  const [karMarji, setKarMarji] = useState('')
  const [rates, setRates] = useState<Record<string, number>>({ TRY: 1 })
  const [kurYukleniyor, setKurYukleniyor] = useState(false)
  const ratesFetched = useRef(false)

  // Döviz kurlarını çek (modal ilk açılışta, bir kez)
  useEffect(() => {
    if (open && !ratesFetched.current) {
      ratesFetched.current = true
      setKurYukleniyor(true)
      fetch('https://open.er-api.com/v6/latest/TRY')
        .then(r => r.json())
        .then(d => {
          if (d?.rates) {
            setRates({ TRY: 1, EUR: d.rates['EUR'], USD: d.rates['USD'] })
          }
        })
        .catch(() => {})
        .finally(() => setKurYukleniyor(false))
    }
  }, [open])

  // Parse sonucu değişince sıfırla
  useEffect(() => {
    if (data) {
      setEdited(JSON.parse(JSON.stringify(data)))
      setKarMarji('')
    }
  }, [data])

  if (!open || !edited) return null

  // Para birimi değişince tüm fiyatları çevir
  function onParaBirimiChange(yeniPB: string) {
    const eskiPB = edited!.para_birimi
    if (eskiPB === yeniPB) return

    // Kur yoksa sadece etiket değişir
    if (!rates[eskiPB] || !rates[yeniPB]) {
      setEdited(p => p ? { ...p, para_birimi: yeniPB } : p)
      return
    }

    setEdited(prev => {
      if (!prev) return prev
      return {
        ...prev,
        para_birimi: yeniPB,
        kalemler: prev.kalemler.map(k => {
          const birim_fiyat = konvert(k.birim_fiyat, eskiPB, yeniPB, rates)
          const toplam = konvert(k.toplam, eskiPB, yeniPB, rates)
          return { ...k, birim_fiyat, toplam }
        }),
      }
    })
  }

  function updateKalem(idx: number, field: keyof ParsedKalem, value: string | number) {
    setEdited(prev => {
      if (!prev) return prev
      const kalemler = [...prev.kalemler]
      const updated = { ...kalemler[idx], [field]: value }
      if (field === 'miktar' || field === 'birim_fiyat') {
        updated.toplam = Math.round(Number(updated.miktar) * Number(updated.birim_fiyat) * 100) / 100
      }
      kalemler[idx] = updated
      return { ...prev, kalemler }
    })
  }

  function removeKalem(idx: number) {
    setEdited(prev => {
      if (!prev) return prev
      return { ...prev, kalemler: prev.kalemler.filter((_, i) => i !== idx) }
    })
  }

  function addEmptyKalem() {
    setEdited(prev => {
      if (!prev) return prev
      const sira = (prev.kalemler[prev.kalemler.length - 1]?.sira_no ?? 0) + 1
      return {
        ...prev,
        kalemler: [
          ...prev.kalemler,
          { sira_no: sira, aciklama: '', miktar: 1, birim: 'Adet', birim_fiyat: 0, toplam: 0 },
        ],
      }
    })
  }

  function handleAktar() {
    if (!edited) return
    const marj = parseFloat(karMarji) || 0
    const carpani = 1 + marj / 100
    const kalemler: ParsedKalem[] = edited.kalemler.map((k, i) => ({
      ...k,
      sira_no: i + 1,
      birim_fiyat: marj > 0 ? Math.round(k.birim_fiyat * carpani * 100) / 100 : k.birim_fiyat,
      toplam: marj > 0 ? Math.round(k.toplam * carpani * 100) / 100 : k.toplam,
    }))
    onAktar(kalemler, edited.para_birimi)
  }

  const genelToplam = edited.kalemler.reduce((s, k) => s + k.toplam, 0)
  const marj = parseFloat(karMarji) || 0

  // Kur bilgisi: 1 EUR/USD = X TRY
  const kurBilgisi = (pb: string) => {
    if (pb === 'TRY' || !rates[pb]) return null
    const kur = Math.round((1 / rates[pb]) * 100) / 100
    return `1 ${pb} ≈ ${kur.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TRY`
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            Teklif Önizleme{edited.tedarikci ? ` — ${edited.tedarikci}` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center">
            &times;
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Tedarikçi & para birimi */}
          <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded-lg">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Tedarikçi</label>
              <input
                value={edited.tedarikci}
                onChange={e => setEdited(p => p ? { ...p, tedarikci: e.target.value } : p)}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                placeholder="Tedarikçi adı"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                Para Birimi
                {kurYukleniyor && <span className="ml-1 text-gray-400">(kur yükleniyor…)</span>}
              </label>
              <select
                value={edited.para_birimi}
                onChange={e => onParaBirimiChange(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
              >
                <option value="TRY">TRY</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
              {kurBilgisi(edited.para_birimi) && (
                <p className="text-xs text-blue-600 mt-1">{kurBilgisi(edited.para_birimi)}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Toplam</label>
              <p className="font-bold text-base text-gray-900 pt-1">
                {genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {edited.para_birimi}
              </p>
            </div>
          </div>

          {/* Kalem tablosu */}
          {edited.kalemler.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 border rounded-lg">
              Kalem bulunamadı. Aşağıdan manuel satır ekleyebilirsiniz.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[650px]">
                <thead>
                  <tr className="bg-[#C8102E] text-white text-xs">
                    <th className="px-2 py-2 text-center w-10">No</th>
                    <th className="px-2 py-2 text-left">Açıklama</th>
                    <th className="px-2 py-2 text-center w-20">Miktar</th>
                    <th className="px-2 py-2 text-center w-24">Birim</th>
                    <th className="px-2 py-2 text-right w-28">Birim Fiyat</th>
                    <th className="px-2 py-2 text-right w-24">Toplam</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {edited.kalemler.map((kalem, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          value={kalem.aciklama}
                          onChange={e => updateKalem(idx, 'aciklama', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] min-w-[180px]"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={kalem.miktar}
                          onChange={e => updateKalem(idx, 'miktar', parseFloat(e.target.value) || 0)}
                          className="w-full border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={BIRIMLER.includes(kalem.birim) ? kalem.birim : 'Adet'}
                          onChange={e => updateKalem(idx, 'birim', e.target.value)}
                          className="w-full border rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                        >
                          {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={kalem.birim_fiyat}
                          onChange={e => updateKalem(idx, 'birim_fiyat', parseFloat(e.target.value) || 0)}
                          className="w-full border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right text-xs font-medium text-gray-700">
                        {kalem.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => removeKalem(idx)}
                          className="text-red-400 hover:text-red-600 text-lg font-bold leading-none"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={addEmptyKalem} className="text-sm text-blue-600 hover:underline">
            + Satır Ekle
          </button>

          {/* Kar marjı */}
          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-gray-700">Kar Marjı (%)</label>
              <input
                type="number"
                value={karMarji}
                onChange={e => setKarMarji(e.target.value)}
                placeholder="ör: 20"
                className="w-24 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
              />
              {marj > 0 && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                  Aktarılacak toplam: {(genelToplam * (1 + marj / 100)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {edited.para_birimi}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Tüm fiyatlara bu oran uygulanarak müşteriye teklif fiyatı oluşturulur.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="border border-gray-300 px-5 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            İptal
          </button>
          <button
            onClick={handleAktar}
            disabled={edited.kalemler.length === 0}
            className="bg-[#C8102E] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50"
          >
            Forma Aktar ({edited.kalemler.length} kalem)
          </button>
        </div>
      </div>
    </div>
  )
}
