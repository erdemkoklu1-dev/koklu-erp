'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { createTalepAction, type TalepFormState } from '../actions'
import { TALEP_STATUS_OPTIONS } from '../status'

type Customer = {
  id: string
  full_name: string | null
  sube_id: string | null
}

type Device = {
  id: string
  customer_id: string | null
  custom_device_name: string | null
  capacity: number | null
  serial_number: string | null
  device_types: { name: string | null } | { name: string | null }[] | null
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
  subeler?: { ad: string | null } | { ad: string | null }[] | null
}

type Props = {
  customers: Customer[]
  devices: Device[]
  subeler: Branch[]
  personeller: Person[]
  defaultSubeId: string
  lockedSubeId?: string | null
}

const KATEGORILER = ['Arıza', 'Bakım Talebi', 'Kurulum', 'Teklif Talebi', 'Ürün Talebi', 'Dolum Talebi', 'Teslimat Talebi', 'Şikayet', 'Periyodik Kontrol', 'Diğer']
const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Acil']
const KAYNAKLAR = ['Telefon', 'WhatsApp', 'E-posta', 'Yüz yüze', 'Sistem', 'Diğer']

const initialState: TalepFormState = {}

function deviceLabel(device: Device) {
  const deviceType = Array.isArray(device.device_types) ? device.device_types[0] : device.device_types
  return [device.custom_device_name ?? deviceType?.name ?? 'Cihaz', device.capacity ? `${device.capacity} Kg` : null, device.serial_number].filter(Boolean).join(' - ')
}

export default function TalepForm({ customers, devices, subeler, personeller, defaultSubeId, lockedSubeId = null }: Props) {
  const [state, formAction, pending] = useActionState(createTalepAction, initialState)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedSubeId, setSelectedSubeId] = useState(lockedSubeId ?? defaultSubeId)

  const visibleDevices = useMemo(() => {
    if (!selectedCustomerId) return devices
    return devices.filter(device => device.customer_id === selectedCustomerId)
  }, [devices, selectedCustomerId])

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
          <option value="">Kayıtlı müşteri seçilmedi</option>
          {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Manuel Müşteri Adı</span>
        <input
          name="manual_customer_name"
          placeholder="Sahada hızlı kayıt için müşteri adı"
          disabled={!!selectedCustomerId}
          className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
        />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Cihaz</span>
        <select name="cihaz_id" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">Cihaz seçilmesin</option>
          {visibleDevices.map(device => <option key={device.id} value={device.id}>{deviceLabel(device)}</option>)}
        </select>
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

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Başlık *</span>
        <input name="baslik" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Açıklama *</span>
        <textarea name="aciklama" required rows={4} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Kategori *</span>
        <select name="kategori" required defaultValue="Arıza" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {KATEGORILER.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Öncelik *</span>
        <select name="oncelik" required defaultValue="Normal" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {ONCELIKLER.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Durum</span>
        <select name="durum" defaultValue="new" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {TALEP_STATUS_OPTIONS.filter(option => !['completed', 'cancelled'].includes(option.value)).map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Hedef Tarih</span>
        <input type="date" name="hedef_tarih" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Sorumlu Personel</span>
        <select name="sorumlu_personel_id" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">Seçiniz</option>
          {visiblePeople.map(person => {
            const sube = Array.isArray(person.subeler) ? person.subeler[0] : person.subeler
            return <option key={person.id} value={person.id}>{person.ad} {person.soyad} {sube?.ad ? `- ${sube.ad}` : ''}</option>
          })}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Kaynak</span>
        <select name="kaynak" defaultValue="Telefon" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {KAYNAKLAR.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Notlar</span>
        <textarea name="notlar" rows={3} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <div className="flex justify-end gap-2 md:col-span-2">
        <Link href="/operasyon/talepler" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">Vazgeç</Link>
        <button disabled={pending} className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25] disabled:opacity-60">
          {pending ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </form>
  )
}
