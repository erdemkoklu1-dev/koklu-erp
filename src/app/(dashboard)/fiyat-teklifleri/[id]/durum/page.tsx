'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type Durum = 'taslak' | 'gonderildi' | 'bekliyor' | 'kazanildi' | 'kaybedildi' | 'iptal'

const DURUM_OPTIONS: { value: Durum; label: string; className: string }[] = [
  { value: 'taslak',     label: 'Taslak',     className: 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300' },
  { value: 'gonderildi', label: 'Gönderildi', className: 'border-blue-400 text-blue-700' },
  { value: 'bekliyor',   label: 'Bekliyor',   className: 'border-yellow-400 text-yellow-700' },
  { value: 'kazanildi',  label: 'Kazanıldı',  className: 'border-green-500 text-green-700' },
  { value: 'kaybedildi', label: 'Kaybedildi', className: 'border-red-400 text-red-700' },
  { value: 'iptal',      label: 'İptal',      className: 'border-gray-400 text-gray-500 dark:text-gray-400' },
]

export default function DurumGuncellemePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [mevcutDurum, setMevcutDurum] = useState<Durum>('taslak')
  const [secilenDurum, setSecilenDurum] = useState<Durum>('taslak')
  const [teklif_no, setTeklifNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('teklifler').select('durum, teklif_no').eq('id', id).single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setMevcutDurum(data.durum as Durum)
          setSecilenDurum(data.durum as Durum)
          setTeklifNo(data.teklif_no)
        }
      })
  }, [id])

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('teklifler').update({ durum: secilenDurum }).eq('id', id)
    if (err) { setError(err.message); setSaving(false); return }
    router.push(`/fiyat-teklifleri/${id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/fiyat-teklifleri/${id}`} className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700">← {teklif_no}</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Durum Güncelle</h1>
      </div>

      <div className="p-6 max-w-md mx-auto">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5 space-y-4">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mevcut Durum</div>
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {DURUM_OPTIONS.find(d => d.value === mevcutDurum)?.label}
            </span>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Yeni Durum Seçin</div>
            <div className="space-y-2">
              {DURUM_OPTIONS.map(opt => (
                <label key={opt.value}
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                    secilenDurum === opt.value
                      ? 'bg-gray-50 dark:bg-gray-700 ' + opt.className
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                  }`}>
                  <input type="radio" name="durum" value={opt.value}
                    checked={secilenDurum === opt.value}
                    onChange={() => setSecilenDurum(opt.value)}
                    className="accent-[#C8102E]" />
                  <span className="font-medium">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving || secilenDurum === mevcutDurum}
              className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
              {saving ? 'Kaydediliyor...' : 'Güncelle'}
            </button>
            <Link href={`/fiyat-teklifleri/${id}`}
              className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors">
              İptal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
