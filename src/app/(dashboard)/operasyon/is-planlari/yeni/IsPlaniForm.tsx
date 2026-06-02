'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { createIsPlaniAction, type IsPlaniFormState } from '../actions'

type Customer = {
  id: string
  full_name: string | null
  sube_id: string | null
}

type Branch = {
  id: string
  ad: string | null
}

type Person = {
  id: string
  ad: string | null
  soyad: string | null
  sube_id?: string | null
}

type Props = {
  customers: Customer[]
  subeler: Branch[]
  personeller: Person[]
  defaultSubeId: string
  lockedSubeId?: string | null
}

const PLAN_TURLERI = ['Periyodik Bakım', 'Yangın Tüpü Kontrolü', 'Yangın Alarm Bakımı', 'HFC / Gazlı Sistem Bakımı', 'Davlumbaz Bakımı', 'Teslimat Planı', 'Dolum Toplama Planı', 'Arıza Planı', 'Genel Saha Görevi']
const TEKRAR_TIPLERI = ['Tek seferlik', 'Günlük', 'Haftalık', '15 Günde Bir', 'Aylık', '3 Ayda Bir', '6 Ayda Bir', 'Yıllık', 'Özel']
const initialState: IsPlaniFormState = {}

export default function IsPlaniForm({ customers, subeler, personeller, defaultSubeId, lockedSubeId = null }: Props) {
  const [state, formAction, pending] = useActionState(createIsPlaniAction, initialState)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedSubeId, setSelectedSubeId] = useState(lockedSubeId ?? defaultSubeId)

  const visiblePeople = useMemo(() => {
    if (!selectedSubeId) return personeller
    return personeller.filter(person => !person.sube_id || person.sube_id === selectedSubeId)
  }, [personeller, selectedSubeId])

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-2">
      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2" role="alert">
          {state.error}
        </div>
      )}

      {lockedSubeId && <input type="hidden" name="sube_id" value={lockedSubeId} />}

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Başlık *</span>
        <input name="baslik" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Açıklama</span>
        <textarea name="aciklama" rows={3} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Kayıtlı Müşteri</span>
        <select
          name="customer_id"
          value={selectedCustomerId}
          onChange={event => {
            const value = event.target.value
            setSelectedCustomerId(value)
            const customer = customers.find(row => row.id === value)
            if (customer?.sube_id && !lockedSubeId) setSelectedSubeId(customer.sube_id)
          }}
          className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">Genel operasyon</option>
          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Manuel Müşteri Adı</span>
        <input
          name="manual_customer_name"
          placeholder="Kayıtlı olmayan müşteri"
          disabled={!!selectedCustomerId}
          className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
        />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Şube *</span>
        <select
          name={lockedSubeId ? undefined : 'sube_id'}
          required
          value={selectedSubeId}
          disabled={!!lockedSubeId}
          onChange={event => setSelectedSubeId(event.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
        >
          <option value="">Lütfen bu kaydın ait olduğu şubeyi seçin.</option>
          {subeler.map(sube => <option key={sube.id} value={sube.id}>{sube.ad}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Sorumlu Personel</span>
        <select name="sorumlu_personel_id" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">Seçiniz</option>
          {visiblePeople.map(person => <option key={person.id} value={person.id}>{person.ad} {person.soyad}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Plan Türü *</span>
        <select name="plan_turu" required defaultValue="Periyodik Bakım" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {PLAN_TURLERI.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Başlangıç Tarihi *</span>
        <input type="date" name="baslangic_tarihi" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Bitiş Tarihi</span>
        <input type="date" name="bitis_tarihi" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Tekrar Tipi</span>
        <select name="tekrar_tipi" defaultValue="Aylık" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {TEKRAR_TIPLERI.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Tekrar Aralığı</span>
        <input type="number" name="tekrar_araligi" min={1} defaultValue={1} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Üretilecek İş Sayısı</span>
        <input type="number" name="is_sayisi" min={1} max={120} defaultValue={24} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Durum</span>
        <select name="durum" defaultValue="Aktif" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {['Taslak', 'Aktif', 'Beklemede'].map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Notlar</span>
        <textarea name="notlar" rows={3} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <div className="flex justify-end gap-2 md:col-span-2">
        <Link href="/operasyon/is-planlari" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">Vazgeç</Link>
        <button disabled={pending} className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25] disabled:opacity-60">
          {pending ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </form>
  )
}
