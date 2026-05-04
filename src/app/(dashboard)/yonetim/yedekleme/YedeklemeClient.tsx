'use client'

import { useEffect, useMemo, useState } from 'react'
import { Database, Download, History, PlayCircle, RefreshCw, Settings, Upload } from 'lucide-react'

type TableOption = { key: string; label: string }
type GroupOption = { key: string; label: string; tables: string[] }
type HistoryRow = {
  id: string
  created_at: string
  backup_type: string
  included_tables: string[]
  total_rows: number
  file_size: number
  storage_saved: boolean
  storage_path: string | null
  download_url: string | null
  user_name: string | null
  status: string
}

type SettingsState = {
  enabled: boolean
  weekday: number
  run_at: string
  storage_enabled: boolean
}

type DryRunResult = {
  table_count: number
  total_rows: number
  tables: Array<{ file: string; rows: number; table?: string; inserted?: number; skipped?: number }>
}

type RestoreResult = {
  message: string
  summary: {
    service_forms: { inserted: number; skipped: number; errors: string[] }
    service_form_items: { inserted: number; skipped: number; errors: string[] }
  }
}

const BUTTON = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const PRIMARY = `${BUTTON} bg-[#C8102E] text-white hover:bg-[#a60d26]`
const SECONDARY = `${BUTTON} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`
const CARD = 'rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800'
const INPUT = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'

function formatBytes(size: number | null | undefined) {
  if (!size) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function YedeklemeClient({ tables, groups }: { tables: TableOption[]; groups: GroupOption[] }) {
  const [selectedGroup, setSelectedGroup] = useState(groups[0]?.key ?? '')
  const [customTables, setCustomTables] = useState<string[]>([])
  const [saveToStorage, setSaveToStorage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [settings, setSettings] = useState<SettingsState>({ enabled: false, weekday: 1, run_at: '03:00', storage_enabled: true })
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)

  const selectedTables = useMemo(() => {
    if (selectedGroup === 'custom') return customTables
    return groups.find(group => group.key === selectedGroup)?.tables ?? []
  }, [customTables, groups, selectedGroup])

  async function loadHistory() {
    const res = await fetch('/api/backup/history')
    const json = await res.json()
    if (res.ok) setHistory(json.rows ?? [])
  }

  async function loadSettings() {
    const res = await fetch('/api/backup/settings')
    const json = await res.json()
    if (res.ok) setSettings(json.settings)
  }

  useEffect(() => {
    loadHistory()
    loadSettings()
  }, [])

  async function runBackup(type: 'full' | 'selected') {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/backup/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, tables: selectedTables, saveToStorage }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Yedek olusturulamadi')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="(.+)"/)?.[1] ?? 'backup.zip'
      downloadBlob(blob, filename)
      setMessage(saveToStorage ? 'ZIP indirildi ve Storage kaydi denendi.' : 'ZIP indirildi.')
      await loadHistory()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Islem tamamlanamadi')
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/backup/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Ayarlar kaydedilemedi')
      setMessage('Otomatik yedek ayarlari kaydedildi.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ayarlar kaydedilemedi')
    } finally {
      setLoading(false)
    }
  }

  async function runDryRun() {
    if (!restoreFile) return
    setLoading(true)
    setMessage(null)
    setDryRun(null)
    setRestoreResult(null)
    try {
      const form = new FormData()
      form.append('file', restoreFile)
      const res = await fetch('/api/backup/dry-run', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Dry-run tamamlanamadi')
      setDryRun(json)
      setMessage('Onizleme tamamlandi.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Dry-run tamamlanamadi')
    } finally {
      setLoading(false)
    }
  }

  function handleRestore() {
    if (!dryRun || !restoreFile) return
    const insertCount = dryRun.tables.reduce((sum, t) => sum + (t.inserted ?? t.rows), 0)
    const skipCount = dryRun.tables.reduce((sum, t) => sum + (t.skipped ?? 0), 0)
    const confirmed = window.confirm(
      `${insertCount} kayit eklenecek, ${skipCount} kayit atlanacak (zaten mevcut).\n\nDevam etmek istiyor musunuz?`
    )
    if (!confirmed) return
    restoreServiceForms()
  }

  async function restoreServiceForms() {
    if (!restoreFile) return
    setRestoring(true)
    setMessage(null)
    setRestoreResult(null)
    try {
      const form = new FormData()
      form.append('file', restoreFile)
      form.append('confirm', 'true')
      const res = await fetch('/api/backup/restore-service-forms', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Servis formu importu tamamlanamadi')
      setRestoreResult(json)
      setMessage(json.message ?? 'Servis formu importu tamamlandi.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Servis formu importu tamamlanamadi')
    } finally {
      setRestoring(false)
    }
  }

  function toggleCustomTable(key: string) {
    setCustomTables(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Yedekleme</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">JSON ve ZIP tabanli uygulama ici yedekleme.</p>
        </div>
        <button type="button" onClick={loadHistory} className={SECONDARY}>
          <RefreshCw size={16} /> Gecmisi yenile
        </button>
      </div>

      {message && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <div className="mb-4 flex items-center gap-2">
            <Download size={18} className="text-[#C8102E]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tam Yedek Al</h3>
          </div>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">Kritik tablolar manifest ile birlikte tek ZIP olarak indirilir.</p>
          <label className="mb-4 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={saveToStorage} onChange={e => setSaveToStorage(e.target.checked)} />
            Storage kaydi olustur
          </label>
          <button type="button" disabled={loading} onClick={() => runBackup('full')} className={PRIMARY}>
            <Database size={16} /> Tam yedek indir
          </button>
        </section>

        <section className={CARD}>
          <div className="mb-4 flex items-center gap-2">
            <Database size={18} className="text-[#C8102E]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tablo Bazli Export</h3>
          </div>
          <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} className={`${INPUT} mb-4 w-full`}>
            {groups.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}
            <option value="custom">Ozel secim</option>
          </select>
          {selectedGroup === 'custom' && (
            <div className="mb-4 grid grid-cols-2 gap-2">
              {tables.map(table => (
                <label key={table.key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input type="checkbox" checked={customTables.includes(table.key)} onChange={() => toggleCustomTable(table.key)} />
                  {table.label}
                </label>
              ))}
            </div>
          )}
          <button type="button" disabled={loading || selectedTables.length === 0} onClick={() => runBackup('selected')} className={PRIMARY}>
            <Download size={16} /> Secili export indir
          </button>
        </section>
      </div>

      <section className={CARD}>
        <div className="mb-4 flex items-center gap-2">
          <History size={18} className="text-[#C8102E]" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Yedek Gecmisi</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2">Kullanici</th>
                <th className="px-3 py-2">Tip</th>
                <th className="px-3 py-2">Tablolar</th>
                <th className="px-3 py-2">Kayit</th>
                <th className="px-3 py-2">Boyut</th>
                <th className="px-3 py-2">Storage</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Link</th>
              </tr>
            </thead>
            <tbody>
              {history.map(row => (
                <tr key={row.id} className="border-t dark:border-gray-700">
                  <td className="px-3 py-2">{new Date(row.created_at).toLocaleString('tr-TR')}</td>
                  <td className="px-3 py-2">{row.user_name ?? '-'}</td>
                  <td className="px-3 py-2">{row.backup_type}</td>
                  <td className="max-w-xs px-3 py-2">{row.included_tables?.join(', ')}</td>
                  <td className="px-3 py-2">{row.total_rows ?? 0}</td>
                  <td className="px-3 py-2">{formatBytes(row.file_size)}</td>
                  <td className="px-3 py-2">{row.storage_saved ? 'Evet' : 'Hayir'}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    {row.download_url ? <a className="text-[#C8102E] underline" href={row.download_url}>Indir</a> : '-'}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-500">Kayit bulunamadi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={CARD}>
          <div className="mb-4 flex items-center gap-2">
            <Settings size={18} className="text-[#C8102E]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Otomatik Yedek Ayarlari</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={settings.enabled} onChange={e => setSettings(prev => ({ ...prev, enabled: e.target.checked }))} />
              Haftalik otomatik yedek
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={settings.storage_enabled} onChange={e => setSettings(prev => ({ ...prev, storage_enabled: e.target.checked }))} />
              Storage kaydi olustur
            </label>
            <select value={settings.weekday} onChange={e => setSettings(prev => ({ ...prev, weekday: Number(e.target.value) }))} className={INPUT}>
              <option value={1}>Pazartesi</option>
              <option value={2}>Sali</option>
              <option value={3}>Carsamba</option>
              <option value={4}>Persembe</option>
              <option value={5}>Cuma</option>
              <option value={6}>Cumartesi</option>
              <option value={0}>Pazar</option>
            </select>
            <input type="time" value={settings.run_at} onChange={e => setSettings(prev => ({ ...prev, run_at: e.target.value }))} className={INPUT} />
          </div>
          <button type="button" disabled={loading} onClick={saveSettings} className={`${PRIMARY} mt-4`}>
            <Settings size={16} /> Ayarlari kaydet
          </button>
        </section>

        <section className={CARD}>
          <div className="mb-4 flex items-center gap-2">
            <Upload size={18} className="text-[#C8102E]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Geri Yukleme Onizleme</h3>
          </div>
          <input
            type="file"
            accept=".zip,.json,application/zip,application/json"
            onChange={e => {
              setRestoreFile(e.target.files?.[0] ?? null)
              setDryRun(null)
              setRestoreResult(null)
            }}
            className={`${INPUT} w-full`}
          />
          <button type="button" disabled={loading || !restoreFile} onClick={runDryRun} className={`${SECONDARY} mt-4`}>
            <PlayCircle size={16} /> Dry-run calistir
          </button>
          {dryRun && (() => {
            const totalInsertable = dryRun.tables.reduce((sum, t) => sum + (t.inserted ?? t.rows), 0)
            return (
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700">
                  Yalnizca servis formlari ve servis form kalemleri geri yuklenebilir.
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                      <th className="p-2 text-left">Tablo</th>
                      <th className="p-2 text-center">Toplam</th>
                      <th className="p-2 text-center text-green-600">Eklenecek</th>
                      <th className="p-2 text-center text-yellow-600">Atlanacak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.tables.map(t => (
                      <tr key={t.file} className="border-b dark:border-gray-600">
                        <td className="p-2 font-medium text-gray-900 dark:text-gray-100">{t.table ?? t.file}</td>
                        <td className="p-2 text-center">{t.rows}</td>
                        <td className="p-2 text-center text-green-600 font-bold">{t.inserted ?? t.rows}</td>
                        <td className="p-2 text-center text-yellow-600">{t.skipped ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={restoring || totalInsertable === 0}
                    className={PRIMARY}
                  >
                    <Upload size={16} /> {restoring ? 'Geri yukleniyor...' : `Geri Yukle (${totalInsertable} kayit)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDryRun(null); setRestoreResult(null) }}
                    className={SECONDARY}
                  >
                    Iptal
                  </button>
                </div>
              </div>
            )
          })()}
          {restoreResult && (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <div className="font-semibold">{restoreResult.message}</div>
              <div className="mt-2">
                Servis formlari: {restoreResult.summary.service_forms.inserted} eklendi, {restoreResult.summary.service_forms.skipped} atlandi.
              </div>
              <div>
                Kalemler: {restoreResult.summary.service_form_items.inserted} eklendi, {restoreResult.summary.service_form_items.skipped} atlandi.
              </div>
              {[...restoreResult.summary.service_forms.errors, ...restoreResult.summary.service_form_items.errors].map(error => (
                <div key={error} className="mt-1 text-red-700">{error}</div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
