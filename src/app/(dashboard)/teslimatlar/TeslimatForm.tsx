'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTeslimatAction, updateTeslimatAction } from './actions'
import {
  GERI_TIPLERI_ACIKLAMA,
  GERI_TESLIM_GEREKTIREN_TIPLER,
  HAREKET_TIPI_LABELS,
  HAREKET_TIPLERI,
  MUSTERI_ENVANTER_TIPLERI,
  STOKTAN_DUSEN_TIPLER,
  type HareketTipi,
  type HareketYonu,
} from '@/lib/teslimatlar'

type Option = { id: string; label: string; meta?: string | null; kategori?: string | null; birim?: string | null; fiyat?: number | null }

type KalemState = {
  urun_mode: 'kayitli' | 'manuel'
  urun_id: string
  aciklama: string
  hareket_yonu: HareketYonu
  hareket_tipi: HareketTipi
  miktar: string
  birim: string
  birim_fiyat: string
  tutarli_gir: boolean
  stoktan_duser_mi: boolean
  musteri_envanterine_isler_mi: boolean
  emanet_mi: boolean
  geri_alinmasi_gerekir_mi: boolean
  hedef_tarih: string
  faturalanir_mi: boolean
  notlar: string
}

const emptyKalem = (hedefTarih = ''): KalemState => ({
  urun_mode: 'kayitli',
  urun_id: '',
  aciklama: '',
  hareket_yonu: 'giden',
  hareket_tipi: 'yeni_cihaz_teslim',
  miktar: '1',
  birim: 'adet',
  birim_fiyat: '',
  tutarli_gir: false,
  stoktan_duser_mi: true,
  musteri_envanterine_isler_mi: true,
  emanet_mi: false,
  geri_alinmasi_gerekir_mi: false,
  hedef_tarih: hedefTarih,
  faturalanir_mi: true,
  notlar: '',
})

export type TeslimatFormInitialValue = {
  id: string
  customer_id: string
  sube_id: string | null
  personel_id: string | null
  teslimat_tarihi: string
  hedef_tarih: string | null
  durum: 'taslak' | 'sevkte' | 'tamamlandi'
  on_kayit_secimi: 'olusturulsun' | 'mevcut_kayda_eklensin' | 'olusturulmasin'
  aciklama: string | null
  notlar: string | null
  kalemler: Array<Partial<KalemState> & { urun_id: string | null }>
}

export default function TeslimatForm({
  customers,
  subeler,
  personeller,
  urunler,
  initialValue,
}: {
  customers: Option[]
  subeler: Option[]
  personeller: Option[]
  urunler: Option[]
  initialValue?: TeslimatFormInitialValue
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const defaultSubeId = subeler.find(s => {
    const label = s.label.toLocaleLowerCase('tr-TR')
    return label.includes('erzincan') && label.includes('merkez')
  })?.id ?? ''
  const [customerMode, setCustomerMode] = useState<'kayitli' | 'manuel'>('kayitli')
  const [customerId, setCustomerId] = useState(initialValue?.customer_id ?? '')
  const [manualCustomer, setManualCustomer] = useState({ full_name: '', phone: '', address: '', authorized_person: '' })
  const [manualCustomerAdd, setManualCustomerAdd] = useState(false)
  const [subeId, setSubeId] = useState(initialValue?.sube_id ?? defaultSubeId)
  const [personelId, setPersonelId] = useState(initialValue?.personel_id ?? '')
  const [teslimatTarihi, setTeslimatTarihi] = useState(initialValue?.teslimat_tarihi ?? new Date().toISOString().slice(0, 10))
  const [hedefTarih, setHedefTarih] = useState(initialValue?.hedef_tarih ?? '')
  const [durum, setDurum] = useState<'taslak' | 'sevkte' | 'tamamlandi'>(initialValue?.durum ?? 'taslak')
  const [onKayitSecimi, setOnKayitSecimi] = useState<'olusturulsun' | 'mevcut_kayda_eklensin' | 'olusturulmasin'>(initialValue?.on_kayit_secimi ?? 'olusturulmasin')
  const [aciklama, setAciklama] = useState(initialValue?.aciklama ?? '')
  const [notlar, setNotlar] = useState(initialValue?.notlar ?? '')
  const [gelismisAcik, setGelismisAcik] = useState<Set<number>>(new Set())
  const [kalemler, setKalemler] = useState<KalemState[]>(() => {
    if (!initialValue?.kalemler?.length) return [emptyKalem()]
    return initialValue.kalemler.map(k => ({
      ...emptyKalem(initialValue.hedef_tarih ?? ''),
      ...k,
      urun_mode: k.urun_id ? 'kayitli' : 'manuel',
      urun_id: k.urun_id ?? '',
      miktar: String(k.miktar ?? 1),
      birim_fiyat: Number(k.birim_fiyat ?? 0) > 0 ? String(k.birim_fiyat) : '',
      tutarli_gir: Number(k.birim_fiyat ?? 0) > 0,
      hedef_tarih: k.hedef_tarih ?? '',
      notlar: k.notlar ?? '',
    }))
  })

  const toplam = useMemo(() => kalemler.reduce((sum, item) => {
    if (!item.tutarli_gir) return sum
    return sum + (Number(item.miktar) || 0) * (Number(item.birim_fiyat) || 0)
  }, 0), [kalemler])

  function updateKalem(index: number, patch: Partial<KalemState>) {
    setKalemler(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  function updateHedefTarih(value: string) {
    setHedefTarih(value)
    if (!value) return
    setKalemler(prev => prev.map(item => item.hedef_tarih ? item : { ...item, hedef_tarih: value }))
  }

  function handleTipChange(index: number, hareket_tipi: HareketTipi) {
    const hareket_yonu: HareketYonu = ['dolum_icin_alindi', 'bakim_icin_alindi', 'yenileme_icin_alindi', 'emanet_geri_alindi', 'hurda_icin_alindi'].includes(hareket_tipi)
      ? 'gelen'
      : 'giden'
    const faturalanirMi = hareket_yonu === 'giden' && hareket_tipi !== 'emanet_teslim'
    if (faturalanirMi && onKayitSecimi === 'olusturulmasin') {
      setOnKayitSecimi('olusturulsun')
    }
    if (hareket_tipi === 'emanet_teslim' || hareket_tipi === 'emanet_geri_alindi') {
      setOnKayitSecimi('olusturulmasin')
    }
    updateKalem(index, {
      hareket_tipi,
      hareket_yonu,
      stoktan_duser_mi: hareket_yonu === 'giden' && STOKTAN_DUSEN_TIPLER.has(hareket_tipi),
      musteri_envanterine_isler_mi: hareket_yonu === 'giden' && MUSTERI_ENVANTER_TIPLERI.has(hareket_tipi),
      emanet_mi: hareket_tipi === 'emanet_teslim',
      geri_alinmasi_gerekir_mi: GERI_TESLIM_GEREKTIREN_TIPLER.has(hareket_tipi),
      faturalanir_mi: faturalanirMi,
    })
  }

  function handleUrunChange(index: number, urunId: string) {
    const urun = urunler.find(u => u.id === urunId)
    updateKalem(index, {
      urun_mode: 'kayitli',
      urun_id: urunId,
      aciklama: urun?.label ?? '',
      birim: urun?.birim ?? 'adet',
      birim_fiyat: urun?.fiyat ? String(urun.fiyat) : '',
    })
  }

  function handleUrunModeChange(index: number, mode: 'kayitli' | 'manuel') {
    updateKalem(index, {
      urun_mode: mode,
      urun_id: mode === 'manuel' ? '' : kalemler[index]?.urun_id ?? '',
      aciklama: mode === 'manuel' ? '' : kalemler[index]?.aciklama ?? '',
    })
  }

  function submit() {
    setError('')
    const payload = {
      customer_id: customerId,
      manual_customer: customerMode === 'manuel' ? {
        ...manualCustomer,
        add_to_customers: manualCustomerAdd,
      } : null,
      sube_id: subeId || null,
      personel_id: personelId || null,
      teslimat_tarihi: teslimatTarihi,
      hedef_tarih: hedefTarih || null,
      durum,
      on_kayit_secimi: onKayitSecimi,
      aciklama,
      notlar,
      kalemler: kalemler.map(item => ({
        ...item,
        urun_id: item.urun_id || null,
        miktar: Number(item.miktar) || 0,
        birim_fiyat: item.tutarli_gir ? Number(item.birim_fiyat) || 0 : 0,
        hedef_tarih: item.hedef_tarih || null,
      })),
    }

    startTransition(async () => {
      const result = initialValue?.id
        ? await updateTeslimatAction(initialValue.id, JSON.stringify(payload))
        : await createTeslimatAction(JSON.stringify(payload))
      if (!result.ok || !result.id) {
        setError(result.message)
        return
      }
      router.push(`/teslimatlar/${result.id}`)
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-3">
        <div className="grid gap-2 text-sm md:col-span-2">
          <span className="font-medium">Müşteri</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCustomerMode('kayitli')} className={`rounded-md border px-3 py-2 text-xs ${customerMode === 'kayitli' ? 'border-[#C8102E] text-[#C8102E]' : ''}`}>Kayıtlı müşteri</button>
            <button type="button" onClick={() => setCustomerMode('manuel')} className={`rounded-md border px-3 py-2 text-xs ${customerMode === 'manuel' ? 'border-[#C8102E] text-[#C8102E]' : ''}`}>Manuel müşteri</button>
          </div>
          {customerMode === 'kayitli' ? (
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
              <option value="">Seçin</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          ) : (
            <div className="grid gap-2 rounded-md border p-3 dark:border-gray-700 md:grid-cols-2">
              <input value={manualCustomer.full_name} onChange={e => setManualCustomer(prev => ({ ...prev, full_name: e.target.value }))} placeholder="Müşteri adı" className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              <input value={manualCustomer.phone} onChange={e => setManualCustomer(prev => ({ ...prev, phone: e.target.value }))} placeholder="Telefon" className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              <input value={manualCustomer.authorized_person} onChange={e => setManualCustomer(prev => ({ ...prev, authorized_person: e.target.value }))} placeholder="Yetkili kişi" className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              <input value={manualCustomer.address} onChange={e => setManualCustomer(prev => ({ ...prev, address: e.target.value }))} placeholder="Adres" className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              <label className="flex items-center gap-2 text-xs md:col-span-2">
                <input type="checkbox" checked={manualCustomerAdd} onChange={e => setManualCustomerAdd(e.target.checked)} />
                Müşterilere ekle
              </label>
            </div>
          )}
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Şube</span>
          <select value={subeId} onChange={e => setSubeId(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            <option value="">Şube seçilmedi</option>
            {subeler.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Personel</span>
          <select value={personelId} onChange={e => setPersonelId(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            <option value="">Personel seçilmedi</option>
            {personeller.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Teslimat tarihi</span>
          <input type="date" value={teslimatTarihi} onChange={e => setTeslimatTarihi(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Hedef tarih</span>
          <input type="date" value={hedefTarih} onChange={e => updateHedefTarih(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Durum</span>
          <select value={durum} onChange={e => setDurum(e.target.value as typeof durum)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            <option value="taslak">Taslak</option>
            <option value="sevkte">Sevkte</option>
            <option value="tamamlandi">Tamamlandı</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="font-medium">Ön kayıt seçimi</span>
          <select value={onKayitSecimi} onChange={e => setOnKayitSecimi(e.target.value as typeof onKayitSecimi)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            <option value="olusturulmasin">Oluşturulmasın</option>
            <option value="olusturulsun">Uygun kalemlerden ön kayıt oluştur</option>
            <option value="mevcut_kayda_eklensin">Mevcut açık ön kayda eklenecek olarak işaretle</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Açıklama</span>
          <input value={aciklama} onChange={e => setAciklama(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
        </label>
      </div>

      <div className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b px-5 py-3 dark:border-gray-700">
          <h3 className="font-semibold">Kalemler</h3>
          <button type="button" onClick={() => setKalemler(prev => [...prev, emptyKalem(hedefTarih)])} className="rounded-md bg-[#C8102E] px-3 py-2 text-sm font-semibold text-white">Kalem ekle</button>
        </div>
        <div className="space-y-4 p-5">
          {kalemler.map((item, index) => {
            const kalemToplam = item.tutarli_gir ? (Number(item.miktar) || 0) * (Number(item.birim_fiyat) || 0) : 0
            return (
              <div key={index} className="space-y-4 rounded-md border p-4 dark:border-gray-700">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1 text-xs lg:col-span-2">
                <span>Ürün / manuel kalem</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleUrunModeChange(index, 'kayitli')} className={`rounded-md border px-3 py-2 ${item.urun_mode === 'kayitli' ? 'border-[#C8102E] text-[#C8102E]' : ''}`}>Kayıtlı ürün</button>
                  <button type="button" onClick={() => handleUrunModeChange(index, 'manuel')} className={`rounded-md border px-3 py-2 ${item.urun_mode === 'manuel' ? 'border-[#C8102E] text-[#C8102E]' : ''}`}>Manuel ürün</button>
                </div>
                {item.urun_mode === 'kayitli' ? <select value={item.urun_id} onChange={e => handleUrunChange(index, e.target.value)} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900">
                  <option value="">Kayıtlı ürün seçin</option>
                  {urunler.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select> : <input value={item.aciklama} onChange={e => updateKalem(index, { aciklama: e.target.value, urun_id: '' })} placeholder="Manuel ürün adı / açıklaması" className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900" />}
              </label>
              <label className="grid gap-1 text-xs lg:col-span-2">
                <span>Ürün veya işlem açıklaması</span>
                <input value={item.aciklama} onChange={e => updateKalem(index, { aciklama: e.target.value })} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="grid gap-1 text-xs">
                <span>Tip</span>
                <select value={item.hareket_tipi} onChange={e => handleTipChange(index, e.target.value as HareketTipi)} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900">
                  {HAREKET_TIPLERI.map(tip => <option key={tip} value={tip}>{HAREKET_TIPI_LABELS[tip]}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span>Yön</span>
                <select value={item.hareket_yonu} onChange={e => updateKalem(index, { hareket_yonu: e.target.value as HareketYonu })} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900">
                  <option value="giden">Giden</option>
                  <option value="gelen">Gelen</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                <span>Miktar</span>
                <input type="number" min="0" step="any" value={item.miktar} onChange={e => updateKalem(index, { miktar: e.target.value })} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="grid gap-1 text-xs">
                <span>Birim</span>
                <input value={item.birim} onChange={e => updateKalem(index, { birim: e.target.value })} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <label className="grid gap-1 text-xs">
                <span>Hedef tarih</span>
                <input type="date" value={item.hedef_tarih} onChange={e => updateKalem(index, { hedef_tarih: e.target.value })} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              {item.tutarli_gir && (
                <>
                  <label className="grid gap-1 text-xs">
                    <span>Birim fiyat</span>
                    <input type="number" min="0" step="0.01" value={item.birim_fiyat} onChange={e => updateKalem(index, { birim_fiyat: e.target.value })} className="rounded border px-2 py-2 dark:border-gray-700 dark:bg-gray-900" />
                  </label>
                  <div className="grid gap-1 text-xs">
                    <span>Toplam</span>
                    <div className="rounded border bg-gray-50 px-2 py-2 font-semibold dark:border-gray-700 dark:bg-gray-900">
                      {kalemToplam.toLocaleString('tr-TR')} TL
                    </div>
                  </div>
                </>
              )}
              </div>
              {/* Tip açıklama paneli */}
              <div className="rounded-lg bg-blue-50 p-3 text-xs dark:bg-blue-900/20">
                <div className="font-semibold text-blue-800 dark:text-blue-300">{HAREKET_TIPI_LABELS[item.hareket_tipi]}</div>
                <p className="mt-1 text-blue-700 dark:text-blue-400">{GERI_TIPLERI_ACIKLAMA[item.hareket_tipi]}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.stoktan_duser_mi && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-800 dark:text-blue-200">📦 Stoktan düşülecek</span>}
                  {item.musteri_envanterine_isler_mi && <span className="rounded bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-800 dark:text-green-200">👤 Cihaz listesine eklenecek</span>}
                  {item.emanet_mi && <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700 dark:bg-orange-800 dark:text-orange-200">🔄 Emanet olarak kaydedilecek</span>}
                  {item.geri_alinmasi_gerekir_mi && <span className="rounded bg-yellow-100 px-2 py-0.5 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200">⏳ Geri teslim takibi açılacak</span>}
                  {item.faturalanir_mi && <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-700 dark:bg-purple-800 dark:text-purple-200">📋 Ön kayda dahil</span>}
                  {item.tutarli_gir && <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-700 dark:text-gray-300">💰 Fiyatlı işlem</span>}
                </div>
              </div>

              {/* Gelişmiş ayarlar (checkbox'lar) */}
              <div className="border-t pt-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setGelismisAcik(prev => {
                    const next = new Set(prev)
                    next.has(index) ? next.delete(index) : next.add(index)
                    return next
                  })}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {gelismisAcik.has(index) ? '▲ Gelişmiş ayarları gizle' : '▼ Gelişmiş ayarları göster'}
                </button>
                {gelismisAcik.has(index) && (
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.tutarli_gir} onChange={e => updateKalem(index, { tutarli_gir: e.target.checked })} /> Fiyatlı işlem olarak gir</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.stoktan_duser_mi} onChange={e => updateKalem(index, { stoktan_duser_mi: e.target.checked })} /> Şube stokundan düş</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.musteri_envanterine_isler_mi} onChange={e => updateKalem(index, { musteri_envanterine_isler_mi: e.target.checked })} /> Müşteri cihaz listesine ekle</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.emanet_mi} onChange={e => updateKalem(index, { emanet_mi: e.target.checked })} /> Emanet cihaz olarak bırakıldı</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.geri_alinmasi_gerekir_mi} onChange={e => updateKalem(index, { geri_alinmasi_gerekir_mi: e.target.checked })} /> Bu işlem sonrası geri teslim yapılacak</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={item.faturalanir_mi} onChange={e => updateKalem(index, { faturalanir_mi: e.target.checked })} /> Ön kayda / faturaya dahil edilsin</label>
                  </div>
                )}
              </div>
                {kalemler.length > 1 && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setKalemler(prev => prev.filter((_, i) => i !== index))} className="text-sm text-red-600">Sil</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <textarea value={notlar} onChange={e => setNotlar(e.target.value)} placeholder="Notlar" className="min-h-24 w-full rounded-lg border p-3 text-sm dark:border-gray-700 dark:bg-gray-800" />

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex items-center justify-between rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="text-lg font-bold">Toplam: {toplam.toLocaleString('tr-TR')} TL</div>
        <button type="button" onClick={submit} disabled={isPending} className="rounded-md bg-[#C8102E] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {isPending ? 'Kaydediliyor...' : initialValue?.id ? 'Değişiklikleri kaydet' : 'Teslimatı kaydet'}
        </button>
      </div>
    </div>
  )
}
