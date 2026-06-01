'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { TechnicalSetting } from '@/lib/technical-reports/types'

type SettingRow = TechnicalSetting & {
  id: string
  aciklama: string | null
}

export default function TechnicalSettingsTable({ settings }: { settings: SettingRow[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<SettingRow>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function edit(row: SettingRow) {
    setEditingId(row.id)
    setDraft({
      ayar_degeri: row.ayar_degeri,
      birim: row.birim ?? '',
      aciklama: row.aciklama ?? '',
    })
    setMessage(null)
  }

  async function save(id: string) {
    setSaving(true)
    setMessage(null)
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from('teknik_hesap_ayarlari')
        .update({
          ayar_degeri: String(draft.ayar_degeri ?? ''),
          birim: draft.birim || null,
          aciklama: draft.aciklama || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      setMessage({ type: 'success', text: 'Teknik ayar güncellendi.' })
      setEditingId(null)
      router.refresh()
    } catch (error) {
      console.error('[teknik-ayarlar] update failed', { id, error })
      setMessage({ type: 'error', text: 'Teknik ayar güncellenemedi.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {message && (
        <p className={`rounded-lg border px-3 py-2 text-sm ${
          message.type === 'success'
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {message.text}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left">Grup</th>
                <th className="px-4 py-3 text-left">Ayar</th>
                <th className="px-4 py-3 text-left">Değer</th>
                <th className="px-4 py-3 text-left">Birim</th>
                <th className="px-4 py-3 text-left">Açıklama</th>
                <th className="px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {settings.map(row => {
                const editing = editingId === row.id
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">{row.ayar_grubu}</td>
                    <td className="px-4 py-3 font-medium">{row.ayar_adi}</td>
                    <td className="px-4 py-3">
                      {editing ? <input value={draft.ayar_degeri ?? ''} onChange={e => setDraft(prev => ({ ...prev, ayar_degeri: e.target.value }))} className="w-full rounded-md border px-2 py-1 dark:border-gray-600" /> : row.ayar_degeri}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? <input value={draft.birim ?? ''} onChange={e => setDraft(prev => ({ ...prev, birim: e.target.value }))} className="w-28 rounded-md border px-2 py-1 dark:border-gray-600" /> : row.birim ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? <input value={draft.aciklama ?? ''} onChange={e => setDraft(prev => ({ ...prev, aciklama: e.target.value }))} className="w-full rounded-md border px-2 py-1 dark:border-gray-600" /> : row.aciklama}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => save(row.id)} disabled={saving} className="rounded-md bg-[#C8102E] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Kaydet</button>
                          <button type="button" onClick={() => setEditingId(null)} disabled={saving} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600">Vazgeç</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => edit(row)} className="text-[#C8102E] hover:underline">Düzenle</button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {settings.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Teknik ayar bulunamadı.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
