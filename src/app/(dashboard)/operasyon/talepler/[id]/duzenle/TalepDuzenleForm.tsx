'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { updateTalepAction, type TalepFormState } from '../../actions'
import { TALEP_STATUS_OPTIONS, normalizeTalepStatus } from '../../status'

type Talep = {
  id: string
  baslik: string | null
  aciklama: string | null
  kategori: string | null
  oncelik: string | null
  durum: string | null
  hedef_tarih: string | null
  kaynak: string | null
  notlar: string | null
}

const KATEGORILER = ['Arıza', 'Bakım Talebi', 'Kurulum', 'Teklif Talebi', 'Ürün Talebi', 'Dolum Talebi', 'Teslimat Talebi', 'Şikayet', 'Periyodik Kontrol', 'Diğer']
const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Acil']
const KAYNAKLAR = ['Telefon', 'WhatsApp', 'E-posta', 'Yüz yüze', 'Sistem', 'Diğer']
const initialState: TalepFormState = {}

export default function TalepDuzenleForm({ talep }: { talep: Talep }) {
  const [state, formAction, pending] = useActionState(updateTalepAction, initialState)
  const status = normalizeTalepStatus(talep.durum)

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-2">
      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2" role="alert">
          {state.error}
        </div>
      )}
      <input type="hidden" name="id" value={talep.id} />

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Başlık *</span>
        <input name="baslik" required defaultValue={talep.baslik ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Açıklama *</span>
        <textarea name="aciklama" required rows={4} defaultValue={talep.aciklama ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Kategori *</span>
        <select name="kategori" required defaultValue={talep.kategori ?? 'Arıza'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {KATEGORILER.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Öncelik *</span>
        <select name="oncelik" required defaultValue={talep.oncelik ?? 'Normal'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {ONCELIKLER.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Durum</span>
        <select name="durum" defaultValue={status === 'unknown' ? 'new' : status} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {TALEP_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Hedef Tarih</span>
        <input type="date" name="hedef_tarih" defaultValue={talep.hedef_tarih ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Kaynak</span>
        <select name="kaynak" defaultValue={talep.kaynak ?? 'Telefon'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {KAYNAKLAR.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Notlar</span>
        <textarea name="notlar" rows={3} defaultValue={talep.notlar ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <div className="flex justify-end gap-2 md:col-span-2">
        <Link href={`/operasyon/talepler/${talep.id}`} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">Vazgeç</Link>
        <button disabled={pending} className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25] disabled:opacity-60">
          {pending ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </form>
  )
}
