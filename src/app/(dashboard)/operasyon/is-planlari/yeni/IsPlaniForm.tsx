'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { createIsPlaniAction, type IsPlaniFormState } from '../actions'

type Customer = {
  id: string
  full_name: string | null
  phone?: string | null
  address?: string | null
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

type InitialValues = {
  mode?: 'single' | 'periodic'
  sourceRequestId?: string | null
  sourceRequestNo?: string | null
  existingPlanId?: string | null
  baslik?: string
  aciklama?: string
  customerId?: string
  manualCustomerName?: string
  phone?: string
  address?: string
  subeId?: string
  planTuru?: string
  oncelik?: string
  baslangicTarihi?: string
  bitisTarihi?: string
  tekrarTipi?: string
  tekrarAraligi?: number
  isSayisi?: number
  durum?: string
}

type Props = {
  customers: Customer[]
  subeler: Branch[]
  personeller: Person[]
  defaultSubeId: string
  lockedSubeId?: string | null
  initialValues?: InitialValues
  requestNotFound?: boolean
}

const PLAN_TURLERI = ['Periyodik Bakım', 'Yangın Tüpü Kontrolü', 'Yangın Alarm Bakımı', 'HFC / Gazlı Sistem Bakımı', 'Davlumbaz Bakımı', 'Teslimat Planı', 'Dolum Toplama Planı', 'Arıza Planı', 'Genel Saha Görevi']
const TEKRAR_TIPLERI = ['Tek seferlik', 'Günlük', 'Haftalık', '15 Günde Bir', 'Aylık', '3 Ayda Bir', '6 Ayda Bir', 'Yıllık', 'Özel']
const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Acil']
const initialState: IsPlaniFormState = {}

export default function IsPlaniForm({
  customers,
  subeler,
  personeller,
  defaultSubeId,
  lockedSubeId = null,
  initialValues,
  requestNotFound = false,
}: Props) {
  const [state, formAction, pending] = useActionState(createIsPlaniAction, initialState)
  const [mode, setMode] = useState<'single' | 'periodic'>(initialValues?.mode ?? 'periodic')
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialValues?.customerId ?? '')
  const [selectedSubeId, setSelectedSubeId] = useState(lockedSubeId ?? initialValues?.subeId ?? defaultSubeId)
  const selectedCustomer = customers.find(row => row.id === selectedCustomerId)

  const visiblePeople = useMemo(() => {
    if (!selectedSubeId) return personeller
    return personeller.filter(person => !person.sube_id || person.sube_id === selectedSubeId)
  }, [personeller, selectedSubeId])

  const phone = selectedCustomer?.phone ?? initialValues?.phone ?? ''
  const address = selectedCustomer?.address ?? initialValues?.address ?? ''
  const isSingle = mode === 'single'

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-2">
      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2" role="alert">
          {state.error}
        </div>
      )}

      {requestNotFound && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 md:col-span-2">
          URL’deki talep bulunamadı veya bu şube için erişiminiz yok. Form boş iş planı olarak açıldı.
        </div>
      )}

      {initialValues?.sourceRequestId && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 md:col-span-2">
          Bu iş planı bir talepten oluşturuluyor: <Link href={`/operasyon/talepler/${initialValues.sourceRequestId}`} className="font-medium underline">{initialValues.sourceRequestNo ?? 'Talep detayı'}</Link>
        </div>
      )}

      {initialValues?.existingPlanId && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 md:col-span-2">
          Bu talep için daha önce iş planı oluşturulmuş. <Link href={`/operasyon/is-planlari/${initialValues.existingPlanId}`} className="font-medium underline">Mevcut iş planını aç</Link>
        </div>
      )}

      <input type="hidden" name="plan_modu" value={mode} />
      {initialValues?.sourceRequestId && <input type="hidden" name="source_request_id" value={initialValues.sourceRequestId} />}
      {phone && <input type="hidden" name="source_phone" value={phone} />}
      {address && <input type="hidden" name="source_address" value={address} />}
      {lockedSubeId && <input type="hidden" name="sube_id" value={lockedSubeId} />}
      {isSingle && (
        <>
          <input type="hidden" name="tekrar_tipi" value="Tek seferlik" />
          <input type="hidden" name="tekrar_araligi" value="1" />
          <input type="hidden" name="is_sayisi" value="1" />
        </>
      )}

      <div className="md:col-span-2">
        <div className="inline-flex rounded-md border bg-gray-50 p-1 text-sm dark:border-gray-700 dark:bg-gray-900">
          <button type="button" onClick={() => setMode('single')} className={`rounded px-3 py-1.5 ${isSingle ? 'bg-white font-semibold shadow-sm dark:bg-gray-800' : 'text-gray-600 dark:text-gray-300'}`}>
            Tek Seferlik İş Planı
          </button>
          <button type="button" onClick={() => setMode('periodic')} className={`rounded px-3 py-1.5 ${!isSingle ? 'bg-white font-semibold shadow-sm dark:bg-gray-800' : 'text-gray-600 dark:text-gray-300'}`}>
            Periyodik İş Planı
          </button>
        </div>
      </div>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Başlık *</span>
        <input name="baslik" required defaultValue={initialValues?.baslik ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      <label className="space-y-1 md:col-span-2">
        <span className="text-sm font-medium">Açıklama</span>
        <textarea name="aciklama" rows={3} defaultValue={initialValues?.aciklama ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
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
          defaultValue={initialValues?.manualCustomerName ?? ''}
          placeholder="Kayıtlı olmayan müşteri"
          disabled={!!selectedCustomerId}
          className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
        />
      </label>

      {(phone || address) && (
        <div className="grid gap-3 rounded-md border bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900 md:col-span-2 md:grid-cols-2">
          <div><span className="text-xs text-gray-500">Telefon</span><div className="font-medium">{phone || '-'}</div></div>
          <div><span className="text-xs text-gray-500">Adres</span><div className="font-medium">{address || '-'}</div></div>
        </div>
      )}

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
        <select name="plan_turu" required defaultValue={initialValues?.planTuru ?? 'Periyodik Bakım'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {PLAN_TURLERI.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Öncelik</span>
        <select name="oncelik" defaultValue={initialValues?.oncelik ?? 'Normal'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {ONCELIKLER.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-sm font-medium">Başlangıç Tarihi *</span>
        <input type="date" name="baslangic_tarihi" required defaultValue={initialValues?.baslangicTarihi ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      </label>

      {!isSingle && (
        <label className="space-y-1">
          <span className="text-sm font-medium">Bitiş Tarihi</span>
          <input type="date" name="bitis_tarihi" defaultValue={initialValues?.bitisTarihi ?? ''} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
        </label>
      )}

      {!isSingle && (
        <>
          <label className="space-y-1">
            <span className="text-sm font-medium">Tekrar Tipi</span>
            <select name="tekrar_tipi" defaultValue={initialValues?.tekrarTipi ?? 'Aylık'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {TEKRAR_TIPLERI.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Tekrar Aralığı</span>
            <input type="number" name="tekrar_araligi" min={1} defaultValue={initialValues?.tekrarAraligi ?? 1} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Üretilecek İş Sayısı</span>
            <input type="number" name="is_sayisi" min={1} max={120} defaultValue={initialValues?.isSayisi ?? 24} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>
        </>
      )}

      <label className="space-y-1">
        <span className="text-sm font-medium">Durum</span>
        <select name="durum" defaultValue={initialValues?.durum ?? 'Aktif'} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
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
