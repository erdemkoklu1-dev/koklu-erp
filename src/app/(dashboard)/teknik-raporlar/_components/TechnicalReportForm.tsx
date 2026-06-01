'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculateAlarmNeeds, type AlarmInput } from '@/lib/technical-reports/alarm-calculator'
import { calculateGeneralNeeds, type ExistingDeviceInput, type GeneralNeedsInput } from '@/lib/technical-reports/general-needs-calculator'
import { calculateRoomIntegrity, type RoomIntegrityInput } from '@/lib/technical-reports/room-integrity-calculator'
import { calculateWaterSystem, WATER_SYSTEM_WARNING, type WaterSystemInput, type WaterRiskClass } from '@/lib/technical-reports/water-system-calculator'
import { createReportNo } from '@/lib/technical-reports/report-utils'
import { REPORT_TYPE_LABELS, type MaterialListItem, type TechnicalReportRow, type TechnicalReportType, type TechnicalSetting } from '@/lib/technical-reports/types'
import MaterialListEditor from './MaterialListEditor'

type Option = { id: string; full_name?: string; ad?: string; soyad?: string; address?: string | null; sube_id?: string | null }
type CustomerMode = 'registered' | 'manual'
type Props = {
  customers: Option[]
  subeler: Option[]
  personeller: Option[]
  settings: TechnicalSetting[]
  initialType?: TechnicalReportType
  report?: TechnicalReportRow
}

type AlarmRoomState = {
  id: string
  kat: number
  bolum_adi: string
  bolum_tipi: string
  alan_m2: number | ''
  en: number | ''
  boy: number | ''
  tavan_yuksekligi: number | ''
  ortam_tipi: string
  asma_tavan: boolean
  yukseltilmis_doseme: boolean
  dedektor_tipi: string
  manuel_not: string
  detailsOpen: boolean
}

type ExistingDeviceState = {
  id: string
  cihaz_tipi: string
  kapasite: string
  adet: number | ''
  durum: string
  son_kontrol_tarihi: string
  aciklama: string
}

function capacityOptionsFor(type: string) {
  if (type.includes('Köpüklü')) return ['12 Kg', '25 Kg', '50 Kg']
  if (type.includes('CO2')) return ['2 Kg', '5 Kg', '10 Kg']
  if (type.includes('Arabalı')) return ['25 Kg', '50 Kg']
  if (type.includes('Battaniye') || type.includes('Sistem')) return ['Set']
  return ['2 Kg', '5 Kg', '6 Kg', '12 Kg', '25 Kg', '50 Kg']
}

const reportCards: Array<{ type: TechnicalReportType; text: string }> = [
  { type: 'yangin_alarm_ihtiyac', text: 'Oda, kat, alan ve kullanım tipine göre dedektör, buton, siren ve panel ihtiyacını hesaplar.' },
  { type: 'genel_ihtiyac_raporu', text: 'Binanın mevcut yangın güvenliği durumuna göre eksik sistem ve malzeme ihtiyacını listeler.' },
  { type: 'oda_sizdirmazlik_testi', text: 'Gazlı söndürme sistemleri için oda hacmi, test ölçümleri ve kaçak değerlendirme raporu oluşturur.' },
  { type: 'yangin_dolabi_hidrant_pompa', text: 'Yangın dolabı, hidrant, boru çapı, pompa gücü ve yangın suyu deposu için ön keşif hesabı yapar.' },
]

const sectionTemplates = ['Ofis', 'Oda', 'Koridor', 'Depo', 'Mutfak', 'Elektrik Pano Odası', 'Server Odası', 'Kazan Dairesi', 'Üretim Alanı', 'Diğer']

function inputCls() {
  return 'w-full rounded-md border px-3 py-2 text-sm dark:border-gray-600'
}

function boolValue(value: FormDataEntryValue | null) {
  return value === 'on'
}

function num(form: FormData, key: string) {
  const value = Number(form.get(key) || 0)
  return Number.isFinite(value) ? value : 0
}

function nextId() {
  return crypto.randomUUID()
}

function makeRoom(kat = 1, patch: Partial<AlarmRoomState> = {}): AlarmRoomState {
  return {
    id: nextId(),
    kat,
    bolum_adi: '',
    bolum_tipi: 'Ofis',
    alan_m2: '',
    en: '',
    boy: '',
    tavan_yuksekligi: '',
    ortam_tipi: '',
    asma_tavan: false,
    yukseltilmis_doseme: false,
    dedektor_tipi: 'Otomatik',
    manuel_not: '',
    detailsOpen: false,
    ...patch,
  }
}

function makeExistingDevice(patch: Partial<ExistingDeviceState> = {}): ExistingDeviceState {
  return {
    id: nextId(),
    cihaz_tipi: 'KKT Yangın Söndürme Cihazı',
    kapasite: '6 Kg',
    adet: '',
    durum: 'Geçerli',
    son_kontrol_tarihi: '',
    aciklama: '',
    ...patch,
  }
}

export default function TechnicalReportForm({ customers, subeler, personeller, settings, initialType, report }: Props) {
  const router = useRouter()
  const defaultSubeId = subeler.find(s => s.ad === 'Erzincan Merkez')?.id ?? subeler[0]?.id ?? ''
  const [reportType, setReportType] = useState<TechnicalReportType>(report?.rapor_turu ?? initialType ?? 'yangin_alarm_ihtiyac')
  const [customerMode, setCustomerMode] = useState<CustomerMode>(report && !report.customer_id ? 'manual' : 'registered')
  const [materialList, setMaterialList] = useState<MaterialListItem[]>(report?.material_list ?? [])
  const [calculationResult, setCalculationResult] = useState<any>(report?.calculation_result ?? null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const inputData = report?.input_data ?? {}

  function collect(form: FormData) {
    if (reportType === 'yangin_alarm_ihtiyac') {
      const ids = String(form.get('alarm_room_ids') || '').split(',').filter(Boolean)
      const bolumler = ids.map(id => ({
        kat: String(form.get(`kat_${id}`) || ''),
        bolum_adi: String(form.get(`bolum_adi_${id}`) || ''),
        bolum_tipi: String(form.get(`bolum_tipi_${id}`) || ''),
        alan_m2: num(form, `alan_m2_${id}`),
        en: num(form, `en_${id}`),
        boy: num(form, `boy_${id}`),
        tavan_yuksekligi: num(form, `tavan_${id}`),
        ortam_tipi: String(form.get(`ortam_tipi_${id}`) || ''),
        asma_tavan: boolValue(form.get(`asma_tavan_${id}`)),
        yukseltilmis_doseme: boolValue(form.get(`yukseltilmis_doseme_${id}`)),
        dedektor_tipi: String(form.get(`dedektor_tipi_${id}`) || 'Otomatik'),
        manuel_not: String(form.get(`manuel_not_${id}`) || ''),
      })).filter(r => r.bolum_adi || r.alan_m2 || r.en || r.boy)

      return {
        bina_tipi: String(form.get('bina_tipi') || ''),
        sistem_tipi: String(form.get('sistem_tipi') || 'adresli') as AlarmInput['sistem_tipi'],
        kat_sayisi: num(form, 'kat_sayisi'),
        toplam_alan: num(form, 'toplam_alan'),
        kullanim_amaci: String(form.get('kullanim_amaci') || ''),
        mevcut_sistem_var: boolValue(form.get('mevcut_sistem_var')),
        aciklama: String(form.get('aciklama') || ''),
        bolumler,
      } satisfies AlarmInput
    }

    if (reportType === 'genel_ihtiyac_raporu') {
      const systems = ['yangin_tupu', 'yangin_alarm', 'yangin_dolabi', 'acil_aydinlatma', 'yonlendirme_levhasi', 'davlumbaz_sondurme', 'gazli_sondurme', 'pano_sondurme', 'yangin_kapisi', 'periyodik_bakim']
      const deviceIds = String(form.get('existing_device_ids') || '').split(',').filter(Boolean)
      return {
        bina_tipi: String(form.get('bina_tipi') || ''),
        toplam_alan: num(form, 'toplam_alan'),
        kat_sayisi: num(form, 'kat_sayisi'),
        oda_sayisi: num(form, 'oda_sayisi'),
        calisan_sayisi: num(form, 'calisan_sayisi'),
        ziyaretci_yogunlugu: String(form.get('ziyaretci_yogunlugu') || ''),
        depo_var: boolValue(form.get('depo_var')),
        mutfak_var: boolValue(form.get('mutfak_var')),
        elektrik_pano_odasi_var: boolValue(form.get('elektrik_pano_odasi_var')),
        server_odasi_var: boolValue(form.get('server_odasi_var')),
        otopark_var: boolValue(form.get('otopark_var')),
        uretim_alani_var: boolValue(form.get('uretim_alani_var')),
        mevcut_sistemler: Object.fromEntries(systems.map(key => [key, boolValue(form.get(key))])),
        mevcut_cihazlar: deviceIds.map(id => ({
          cihaz_tipi: String(form.get(`cihaz_tipi_${id}`) || ''),
          kapasite: String(form.get(`kapasite_${id}`) || ''),
          adet: num(form, `cihaz_adet_${id}`),
          durum: String(form.get(`cihaz_durum_${id}`) || 'Geçerli') as ExistingDeviceInput['durum'],
          son_kontrol_tarihi: String(form.get(`son_kontrol_tarihi_${id}`) || ''),
          aciklama: String(form.get(`cihaz_aciklama_${id}`) || ''),
        })).filter(device => device.cihaz_tipi || device.kapasite || device.adet),
      } satisfies GeneralNeedsInput
    }

    if (reportType === 'yangin_dolabi_hidrant_pompa') {
      return {
        bina_tipi: String(form.get('bina_tipi') || ''),
        risk_sinifi: String(form.get('risk_sinifi') || 'orta_riskli') as WaterRiskClass,
        kat_sayisi: num(form, 'kat_sayisi'),
        kat_alani_m2: num(form, 'kat_alani_m2'),
        toplam_alan_m2: num(form, 'toplam_alan_m2'),
        bina_yuksekligi_m: num(form, 'bina_yuksekligi_m'),
        cephe_uzunlugu_m: num(form, 'cephe_uzunlugu_m'),
        tesis_cevre_m: num(form, 'tesis_cevre_m'),
        yangin_dolabi_gerekli: boolValue(form.get('yangin_dolabi_gerekli')),
        hidrant_gerekli: boolValue(form.get('hidrant_gerekli')),
        ana_hat_uzunlugu_m: num(form, 'ana_hat_uzunlugu_m'),
        kolon_hatti_uzunlugu_m: num(form, 'kolon_hatti_uzunlugu_m'),
        esdeger_parca_orani: num(form, 'esdeger_parca_orani'),
        hedef_cikis_basinci_kpa: num(form, 'hedef_cikis_basinci_kpa'),
        elektrik_yedekli: boolValue(form.get('elektrik_yedekli')),
        dizel_yedekli: boolValue(form.get('dizel_yedekli')),
        aciklama: String(form.get('aciklama') || ''),
      } satisfies WaterSystemInput
    }

    return {
      oda_adi: String(form.get('oda_adi') || ''),
      test_tarihi: String(form.get('test_tarihi') || ''),
      oda_eni: num(form, 'oda_eni'),
      oda_boyu: num(form, 'oda_boyu'),
      oda_yuksekligi: num(form, 'oda_yuksekligi'),
      hacim: num(form, 'hacim'),
      net_korunan_hacim: num(form, 'net_korunan_hacim'),
      asma_tavan: boolValue(form.get('asma_tavan')),
      yukseltilmis_doseme: boolValue(form.get('yukseltilmis_doseme')),
      kapi_sayisi: num(form, 'kapi_sayisi'),
      menfez_sayisi: num(form, 'menfez_sayisi'),
      aciklik_notlari: String(form.get('aciklik_notlari') || ''),
      gaz_tipi: String(form.get('gaz_tipi') || ''),
      hedef_tutma_suresi: num(form, 'hedef_tutma_suresi'),
      tasarim_konsantrasyonu: num(form, 'tasarim_konsantrasyonu'),
      oda_sicakligi: num(form, 'oda_sicakligi'),
      sistem_basinci_notu: String(form.get('sistem_basinci_notu') || ''),
      fan_modeli: String(form.get('fan_modeli') || ''),
      manometre_modeli: String(form.get('manometre_modeli') || ''),
      anemometre_modeli: String(form.get('anemometre_modeli') || ''),
      rpm_olcer_modeli: String(form.get('rpm_olcer_modeli') || ''),
      cihaz_seri_no: String(form.get('cihaz_seri_no') || ''),
      kalibrasyon_tarihi: String(form.get('kalibrasyon_tarihi') || ''),
      pozitif_basinç: num(form, 'pozitif_basinc'),
      negatif_basinç: num(form, 'negatif_basinc'),
      test_basinci: num(form, 'test_basinci'),
      test_suresi: num(form, 'test_suresi'),
      baslangic_basinci: num(form, 'baslangic_basinci'),
      bitis_basinci: num(form, 'bitis_basinci'),
      kacak_debisi: num(form, 'kacak_debisi'),
      etkin_kacak_alani: num(form, 'etkin_kacak_alani'),
      sonuc: String(form.get('sonuc') || 'Uygun') as RoomIntegrityInput['sonuc'],
      olcum_notlari: String(form.get('olcum_notlari') || ''),
    } satisfies RoomIntegrityInput
  }

  function calculate(form: HTMLFormElement) {
    const data = collect(new FormData(form))
    const calculated = reportType === 'yangin_alarm_ihtiyac'
      ? calculateAlarmNeeds(data as AlarmInput, settings)
      : reportType === 'genel_ihtiyac_raporu'
        ? calculateGeneralNeeds(data as GeneralNeedsInput, settings)
        : reportType === 'yangin_dolabi_hidrant_pompa'
          ? calculateWaterSystem(data as WaterSystemInput, settings)
          : calculateRoomIntegrity(data as RoomIntegrityInput)
    setCalculationResult(calculated.calculation_result)
    setMaterialList(calculated.material_list)
    setMessage('Hesaplama tamamlandı. İhtiyaç listesini kaydetmeden önce düzenleyebilirsiniz.')
    return { data, calculated }
  }

  async function resolveCustomer(formData: FormData, supabase: ReturnType<typeof createClient>) {
    const subeId = String(formData.get('sube_id') || '')
    if (customerMode === 'registered') {
      const customerId = String(formData.get('customer_id') || '')
      const customer = customers.find(c => c.id === customerId)
      if (!customerId || !customer) throw new Error('Kayıtlı müşteri seçimi zorunludur.')
      return {
        customerId,
        customerName: customer.full_name || '',
        address: String(formData.get('adres') || customer.address || ''),
        manualCustomer: null,
      }
    }

    const manualCustomer = {
      full_name: String(formData.get('manual_customer_name') || '').trim(),
      authorized_person: String(formData.get('manual_authorized_person') || '').trim(),
      authorized_phone: String(formData.get('manual_phone') || '').trim(),
      phone: String(formData.get('manual_phone') || '').trim(),
      email: String(formData.get('manual_email') || '').trim(),
      tax_number: String(formData.get('manual_tax_number') || '').trim(),
      address: String(formData.get('manual_address') || '').trim(),
      sube_id: subeId || null,
      type: 'company',
    }
    if (!manualCustomer.full_name) throw new Error('Manuel müşteri adı / firma unvanı zorunludur.')

    if (boolValue(formData.get('manual_add_customer'))) {
      const { data, error } = await supabase
        .from('customers')
        .insert([manualCustomer])
        .select('id')
        .single()
      if (error) throw new Error(`Müşteri listesine eklenemedi: ${error.message}`)
      return {
        customerId: data.id as string,
        customerName: manualCustomer.full_name,
        address: manualCustomer.address,
        manualCustomer,
      }
    }

    return {
      customerId: null,
      customerName: manualCustomer.full_name,
      address: manualCustomer.address,
      manualCustomer,
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    const form = event.currentTarget
    const formData = new FormData(form)
    const submitIntent = String((event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') || 'detail')
    const subeId = String(formData.get('sube_id') || '')
    if (!subeId) {
      setMessage('Şube seçimi zorunludur.')
      setSaving(false)
      return
    }

    const supabase = createClient()
    try {
      const customer = await resolveCustomer(formData, supabase)
      const { data, calculated } = calculate(form)
      const { data: auth } = await supabase.auth.getUser()
      const input_data = {
        ...data,
        musteri_giris_tipi: customerMode === 'manual' ? 'Manuel Müşteri' : 'Kayıtlı Müşteri',
        manuel_musteri: customer.manualCustomer,
      }
      const payload = {
        rapor_no: report?.rapor_no ?? createReportNo(reportType),
        rapor_turu: reportType,
        baslik: String(formData.get('baslik') || REPORT_TYPE_LABELS[reportType]),
        customer_id: customer.customerId,
        customer_name_snapshot: customer.customerName,
        sube_id: subeId,
        lokasyon: String(formData.get(customerMode === 'manual' ? 'manual_lokasyon' : 'lokasyon') || ''),
        adres: customer.address,
        rapor_tarihi: String(formData.get('rapor_tarihi') || new Date().toISOString().slice(0, 10)),
        hazirlayan_personel_id: String(formData.get('hazirlayan_personel_id') || '') || null,
        durum: 'Hesaplandı',
        standart_profili: String(formData.get('standart_profili') || 'MVP keşif destek hesabı'),
        input_data,
        calculation_result: calculated.calculation_result,
        material_list: materialList.length ? materialList : calculated.material_list,
        notes: String(formData.get('notes') || ''),
        updated_by: auth.user?.id ?? null,
        ...(report ? {} : { created_by: auth.user?.id ?? null }),
      }
      const query = report
        ? supabase.from('teknik_raporlar').update(payload).eq('id', report.id).select('id').single()
        : supabase.from('teknik_raporlar').insert(payload).select('id').single()
      const { data: saved, error } = await query
      if (error) throw error
      router.push(submitIntent === 'print' ? `/teknik-raporlar/${saved.id}/yazdir` : `/teknik-raporlar/${saved.id}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kayıt tamamlanamadı.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {reportCards.map(card => (
          <button
            key={card.type}
            type="button"
            onClick={() => setReportType(card.type)}
            className={`rounded-lg border bg-white p-4 text-left dark:bg-gray-800 ${reportType === card.type ? 'border-[#C8102E] ring-1 ring-[#C8102E]' : 'dark:border-gray-700'}`}
          >
            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{REPORT_TYPE_LABELS[card.type]}</div>
            <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">{card.text}</p>
          </button>
        ))}
      </section>

      <section className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Genel Bilgiler</h2>
          <div className="flex rounded-lg border p-1 text-xs dark:border-gray-600">
            <button type="button" onClick={() => setCustomerMode('registered')} className={`rounded-md px-3 py-1.5 ${customerMode === 'registered' ? 'bg-[#C8102E] text-white' : ''}`}>Kayıtlı Müşteri</button>
            <button type="button" onClick={() => setCustomerMode('manual')} className={`rounded-md px-3 py-1.5 ${customerMode === 'manual' ? 'bg-[#C8102E] text-white' : ''}`}>Manuel Müşteri</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {customerMode === 'registered' ? (
            <label className="text-sm">Müşteri *<select name="customer_id" required defaultValue={report?.customer_id ?? ''} className={inputCls()}><option value="">Müşteri seçin</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
          ) : (
            <>
              <label className="text-sm">Müşteri Adı / Firma Unvanı *<input name="manual_customer_name" defaultValue={inputData.manuel_musteri?.full_name ?? report?.customer_name_snapshot ?? ''} className={inputCls()} /></label>
              <label className="text-sm">Yetkili Kişi<input name="manual_authorized_person" defaultValue={inputData.manuel_musteri?.authorized_person ?? ''} className={inputCls()} /></label>
              <label className="text-sm">Telefon<input name="manual_phone" defaultValue={inputData.manuel_musteri?.phone ?? ''} className={inputCls()} /></label>
              <label className="text-sm">E-posta<input name="manual_email" type="email" defaultValue={inputData.manuel_musteri?.email ?? ''} className={inputCls()} /></label>
              <label className="text-sm">Vergi / TC No<input name="manual_tax_number" defaultValue={inputData.manuel_musteri?.tax_number ?? ''} className={inputCls()} /></label>
              <label className="flex items-center gap-2 pt-6 text-sm"><input name="manual_add_customer" type="checkbox" /> Bu müşteriyi müşteri listesine ekle</label>
            </>
          )}
          <label className="text-sm">Şube *<select name="sube_id" required defaultValue={report?.sube_id ?? defaultSubeId} className={inputCls()}>{subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}</select></label>
          <label className="text-sm">Hazırlayan<select name="hazirlayan_personel_id" defaultValue={report?.hazirlayan_personel_id ?? ''} className={inputCls()}><option value="">Seçiniz</option>{personeller.map(p => <option key={p.id} value={p.id}>{p.ad} {p.soyad}</option>)}</select></label>
          <label className="text-sm">Başlık<input key={reportType} name="baslik" defaultValue={report?.baslik ?? REPORT_TYPE_LABELS[reportType]} className={inputCls()} /></label>
          <label className="text-sm">Rapor Tarihi<input name="rapor_tarihi" type="date" defaultValue={report?.rapor_tarihi ?? new Date().toISOString().slice(0, 10)} className={inputCls()} /></label>
          {customerMode === 'registered' ? (
            <>
              <label className="text-sm">Lokasyon<input name="lokasyon" defaultValue={report?.lokasyon ?? ''} className={inputCls()} /></label>
              <label className="text-sm md:col-span-2">Adres<input name="adres" defaultValue={report?.adres ?? ''} className={inputCls()} /></label>
            </>
          ) : (
            <>
              <label className="text-sm">Lokasyon<input name="manual_lokasyon" defaultValue={report?.lokasyon ?? ''} className={inputCls()} /></label>
              <label className="text-sm md:col-span-2">Adres<input name="manual_address" defaultValue={inputData.manuel_musteri?.address ?? report?.adres ?? ''} className={inputCls()} /></label>
            </>
          )}
          <label className="text-sm">Standart Profili<input name="standart_profili" defaultValue={report?.standart_profili ?? 'MVP keşif destek hesabı'} className={inputCls()} /></label>
        </div>
      </section>

      {reportType === 'yangin_alarm_ihtiyac' && <AlarmFields inputData={inputData} />}
      {reportType === 'genel_ihtiyac_raporu' && <GeneralFields inputData={inputData} />}
      {reportType === 'oda_sizdirmazlik_testi' && <RoomFields inputData={inputData} />}
      {reportType === 'yangin_dolabi_hidrant_pompa' && <WaterSystemFields inputData={inputData} />}

      <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center gap-2 border bg-white/95 p-3 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
        {report && <Link href={`/teknik-raporlar/${report.id}`} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600">Detaya Dön</Link>}
        {!report && <Link href="/teknik-raporlar" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600">Raporlara Dön</Link>}
        <button type="button" onClick={e => calculate(e.currentTarget.form!)} className="rounded-lg border border-[#C8102E] px-4 py-2 text-sm font-semibold text-[#C8102E] hover:bg-red-50">Hesapla</button>
        <button name="submit_intent" value="detail" disabled={saving} className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a50d26] disabled:opacity-60">{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
        <button name="submit_intent" value="print" disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600">Kaydet ve Yazdır</button>
        {message && <span className="text-sm text-gray-600 dark:text-gray-300">{message}</span>}
      </div>

      {calculationResult && (
        <section className="rounded-lg border bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-2 font-semibold">Hesap Sonuçları</h2>
          <ResultSummary result={calculationResult} materialCount={materialList.length} />
          {reportType === 'yangin_dolabi_hidrant_pompa' && <WaterResultCards result={calculationResult} />}
        </section>
      )}

      <MaterialListEditor reportType={reportType} value={materialList} onChange={setMaterialList} />
      <label className="block text-sm">Açıklama ve Notlar<textarea name="notes" rows={4} defaultValue={report?.notes ?? ''} className={inputCls()} /></label>
    </form>
  )
}

function ResultSummary({ result, materialCount }: { result: any; materialCount: number }) {
  const items = [
    ['Toplam Dedektör', result.toplam_dedektor],
    ['Buton', result.buton_adedi],
    ['Siren', result.siren_adedi],
    ['Loop', result.loop_sayisi],
    ['Bölge', result.bolge_sayisi],
    ['İhtiyaç Kalemi', materialCount],
  ].filter(([, value]) => value !== undefined && value !== null)
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
      {items.map(([label, value]) => <div key={label} className="rounded-md bg-gray-50 p-3 dark:bg-gray-900"><div className="text-xs text-gray-500">{label}</div><div className="text-lg font-bold">{value}</div></div>)}
      {Array.isArray(result.oneriler) && <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900"><div className="text-xs text-gray-500">Öneri</div><div className="text-lg font-bold">{result.oneriler.length}</div></div>}
      {result.degerlendirme && <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900"><div className="text-xs text-gray-500">Sonuç</div><div className="text-lg font-bold">{result.degerlendirme}</div></div>}
    </div>
  )
}

function WaterResultCards({ result }: { result: any }) {
  const rows = [
    ['Yangın Dolabı', `${result.yangin_dolabi_adedi ?? 0} adet`],
    ['Hidrant', `${result.hidrant_adedi ?? 0} adet`],
    ['Tasarım Debisi', `${result.tasarim_debisi_l_dak ?? 0} l/dak (${result.tasarim_debisi_m3_h ?? 0} m³/h)`],
    ['Boru Çapı / Hız', `DN${result.boru_cap_mm ?? '-'} / ${result.boru_hizi_m_s ?? '-'} m/s`],
    ['Boru Uzunluğu', `${result.boru_uzunlugu_m ?? 0} m`],
    ['Sürtünme Kaybı', `${result.surtunme_kaybi_mSS ?? 0} mSS`],
    ['Basınç İhtiyacı', `${result.basinc_ihtiyaci_bar ?? 0} bar`],
    ['Motor Gücü', `${result.motor_gucu_kw ?? 0} kW`],
    ['Jokey Pompa', `${result.jokey_pompa_debisi_l_dak ?? 0} l/dak`],
    ['Yangın Suyu Deposu', `${result.yangin_suyu_deposu_m3 ?? 0} m³`],
  ]
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md bg-gray-50 p-3 dark:bg-gray-900">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-base font-bold">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
        {WATER_SYSTEM_WARNING}
      </div>
      {Array.isArray(result.uyarilar) && result.uyarilar.length > 0 && (
        <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-6 text-xs text-amber-800">
          {result.uyarilar.map((warning: string) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  )
}

function AlarmFields({ inputData }: { inputData: any }) {
  const initialRooms: AlarmRoomState[] = Array.isArray(inputData.bolumler) && inputData.bolumler.length > 0
    ? inputData.bolumler.map((room: any) => makeRoom(Number(room.kat || 1), { ...room, kat: Number(room.kat || 1) }))
    : [makeRoom(1, { bolum_adi: 'Genel Alan' })]
  const initialFloorCount = Math.max(Number(inputData.kat_sayisi || 1), ...initialRooms.map(r => r.kat), 1)
  const [floorCount, setFloorCount] = useState(initialFloorCount)
  const [rooms, setRooms] = useState<AlarmRoomState[]>(initialRooms)

  const floors = useMemo(() => Array.from({ length: floorCount }, (_, i) => i + 1), [floorCount])

  function changeFloorCount(next: number) {
    const safeNext = Math.max(1, next || 1)
    if (safeNext < floorCount && rooms.some(room => room.kat > safeNext)) {
      const ok = confirm('Kat sayısını azaltırsanız bazı katlara ait bölüm girişleri silinebilir. Devam etmek istiyor musunuz?')
      if (!ok) return
      setRooms(prev => prev.filter(room => room.kat <= safeNext))
    } else {
      setRooms(prev => {
        const existingFloors = new Set(prev.map(room => room.kat))
        const additions = Array.from({ length: safeNext }, (_, i) => i + 1)
          .filter(kat => !existingFloors.has(kat))
          .map(kat => makeRoom(kat, { bolum_adi: `Kat ${kat} Genel Alan` }))
        return [...prev, ...additions]
      })
    }
    setFloorCount(safeNext)
  }

  function updateRoom(id: string, patch: Partial<AlarmRoomState>) {
    setRooms(prev => prev.map(room => room.id === id ? { ...room, ...patch } : room))
  }

  function addRoom(kat: number, bolumTipi = 'Ofis') {
    setRooms(prev => [...prev, makeRoom(kat, { bolum_tipi: bolumTipi, bolum_adi: bolumTipi })])
  }

  function addFloor() {
    const next = floorCount + 1
    setFloorCount(next)
    setRooms(prev => [...prev, makeRoom(next, { bolum_adi: `Kat ${next} Genel Alan` })])
  }

  return (
    <section className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Yangın Alarm Hesabı</h2>
        <button type="button" onClick={addFloor} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600">+ Kat Ekle</button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="text-sm">Bina Tipi<input name="bina_tipi" defaultValue={inputData.bina_tipi ?? ''} className={inputCls()} /></label>
        <label className="text-sm">Sistem Tipi<select name="sistem_tipi" defaultValue={inputData.sistem_tipi ?? 'adresli'} className={inputCls()}><option value="adresli">Adresli</option><option value="konvansiyonel">Konvansiyonel</option></select></label>
        <label className="text-sm">Kat Sayısı<input name="kat_sayisi" type="number" min="1" value={floorCount} onChange={e => changeFloorCount(Number(e.target.value))} className={inputCls()} /></label>
        <label className="text-sm">Toplam Alan m²<input name="toplam_alan" type="number" defaultValue={inputData.toplam_alan ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Kullanım Amacı<input name="kullanim_amaci" defaultValue={inputData.kullanim_amaci ?? ''} className={inputCls()} /></label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input name="mevcut_sistem_var" type="checkbox" defaultChecked={inputData.mevcut_sistem_var} /> Mevcut sistem var</label>
      </div>
      <input type="hidden" name="alarm_room_ids" value={rooms.map(room => room.id).join(',')} />
      <div className="mt-5 space-y-4">
        {floors.map(kat => (
          <div key={kat} className="rounded-lg border p-3 dark:border-gray-700">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Kat {kat}</h3>
              <div className="flex flex-wrap gap-2">
                {sectionTemplates.slice(0, 5).map(template => <button key={template} type="button" onClick={() => addRoom(kat, template)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-600">{template}</button>)}
                <button type="button" onClick={() => addRoom(kat)} className="rounded border border-[#C8102E] px-2 py-1 text-xs font-medium text-[#C8102E]">+ Bu kata bölüm ekle</button>
              </div>
            </div>
            <div className="space-y-2">
              {rooms.filter(room => room.kat === kat).map(room => (
                <AlarmRoomRow key={room.id} room={room} update={patch => updateRoom(room.id, patch)} remove={() => setRooms(prev => prev.filter(r => r.id !== room.id))} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AlarmRoomRow({ room, update, remove }: { room: AlarmRoomState; update: (patch: Partial<AlarmRoomState>) => void; remove: () => void }) {
  return (
    <div className="rounded-md border bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
      <input type="hidden" name={`kat_${room.id}`} value={room.kat} />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
        <input name={`bolum_adi_${room.id}`} placeholder="Bölüm adı" value={room.bolum_adi} onChange={e => update({ bolum_adi: e.target.value })} className={inputCls()} />
        <select name={`bolum_tipi_${room.id}`} value={room.bolum_tipi} onChange={e => update({ bolum_tipi: e.target.value })} className={inputCls()}>{sectionTemplates.map(x => <option key={x}>{x}</option>)}</select>
        <input name={`alan_m2_${room.id}`} type="number" placeholder="Alan m²" value={room.alan_m2} onChange={e => update({ alan_m2: e.target.value ? Number(e.target.value) : '' })} className={inputCls()} />
        <select name={`dedektor_tipi_${room.id}`} value={room.dedektor_tipi} onChange={e => update({ dedektor_tipi: e.target.value })} className={inputCls()}>{['Otomatik','Optik Duman Dedektörü','Isı Dedektörü','Kombine Dedektör'].map(x => <option key={x}>{x}</option>)}</select>
        <div className="flex gap-2">
          <button type="button" onClick={() => update({ detailsOpen: !room.detailsOpen })} className="flex-1 rounded border px-2 py-2 text-xs dark:border-gray-600">{room.detailsOpen ? 'Detayları gizle' : 'Detayları göster'}</button>
          <button type="button" onClick={remove} className="rounded border px-2 py-2 text-xs text-red-600 dark:border-gray-600">Sil</button>
        </div>
      </div>
      {room.detailsOpen && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input name={`en_${room.id}`} type="number" placeholder="En" value={room.en} onChange={e => update({ en: e.target.value ? Number(e.target.value) : '' })} className={inputCls()} />
          <input name={`boy_${room.id}`} type="number" placeholder="Boy" value={room.boy} onChange={e => update({ boy: e.target.value ? Number(e.target.value) : '' })} className={inputCls()} />
          <input name={`tavan_${room.id}`} type="number" placeholder="Tavan yüksekliği" value={room.tavan_yuksekligi} onChange={e => update({ tavan_yuksekligi: e.target.value ? Number(e.target.value) : '' })} className={inputCls()} />
          <input name={`ortam_tipi_${room.id}`} placeholder="Ortam tipi" value={room.ortam_tipi} onChange={e => update({ ortam_tipi: e.target.value })} className={inputCls()} />
          <label className="flex items-center gap-2 text-sm"><input name={`asma_tavan_${room.id}`} type="checkbox" checked={room.asma_tavan} onChange={e => update({ asma_tavan: e.target.checked })} /> Asma tavan</label>
          <label className="flex items-center gap-2 text-sm"><input name={`yukseltilmis_doseme_${room.id}`} type="checkbox" checked={room.yukseltilmis_doseme} onChange={e => update({ yukseltilmis_doseme: e.target.checked })} /> Yükseltilmiş döşeme</label>
          <input name={`manuel_not_${room.id}`} placeholder="Manuel düzeltme notu" value={room.manuel_not} onChange={e => update({ manuel_not: e.target.value })} className="rounded-md border px-3 py-2 text-sm md:col-span-2 dark:border-gray-600" />
        </div>
      )}
    </div>
  )
}

function GeneralFields({ inputData }: { inputData: any }) {
  const systems = inputData.mevcut_sistemler ?? {}
  const label = (key: string) => key.replaceAll('_', ' ')
  const initialDevices: ExistingDeviceState[] = Array.isArray(inputData.mevcut_cihazlar) && inputData.mevcut_cihazlar.length > 0
    ? inputData.mevcut_cihazlar.map((device: any) => makeExistingDevice(device))
    : [makeExistingDevice()]
  const [devices, setDevices] = useState<ExistingDeviceState[]>(initialDevices)

  function updateDevice(id: string, patch: Partial<ExistingDeviceState>) {
    setDevices(prev => prev.map(device => device.id === id ? { ...device, ...patch } : device))
  }

  return (
    <section className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-4 text-sm font-semibold">Genel Keşif ve İhtiyaç Raporu</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {['bina_tipi','toplam_alan','kat_sayisi','oda_sayisi','calisan_sayisi','ziyaretci_yogunlugu'].map(key => (
          <label key={key} className="text-sm">{label(key)}<input name={key} type={key.includes('sayisi') || key.includes('alan') ? 'number' : 'text'} defaultValue={inputData[key] ?? ''} className={inputCls()} /></label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {['depo_var','mutfak_var','elektrik_pano_odasi_var','server_odasi_var','otopark_var','uretim_alani_var'].map(key => <label key={key} className="text-sm"><input name={key} type="checkbox" defaultChecked={inputData[key]} /> {label(key)}</label>)}
      </div>
      <h3 className="mt-5 text-sm font-semibold">Mevcut Sistemler</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {['yangin_tupu','yangin_alarm','yangin_dolabi','acil_aydinlatma','yonlendirme_levhasi','davlumbaz_sondurme','gazli_sondurme','pano_sondurme','yangin_kapisi','periyodik_bakim'].map(key => <label key={key} className="text-sm"><input name={key} type="checkbox" defaultChecked={systems[key]} /> {label(key)}</label>)}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Mevcut Cihazlar</h3>
        <button type="button" onClick={() => setDevices(prev => [...prev, makeExistingDevice()])} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600">+ Cihaz Ekle</button>
      </div>
      <input type="hidden" name="existing_device_ids" value={devices.map(device => device.id).join(',')} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            <tr>
              <th className="px-2 py-2 text-left">Cihaz Tipi</th>
              <th className="px-2 py-2 text-left">Kapasite</th>
              <th className="px-2 py-2 text-left">Adet</th>
              <th className="px-2 py-2 text-left">Durum</th>
              <th className="px-2 py-2 text-left">Son Kontrol Tarihi</th>
              <th className="px-2 py-2 text-left">Açıklama</th>
              <th className="px-2 py-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {devices.map(device => (
              <tr key={device.id}>
                <td className="px-2 py-2">
                  <select name={`cihaz_tipi_${device.id}`} value={device.cihaz_tipi} onChange={e => updateDevice(device.id, { cihaz_tipi: e.target.value, kapasite: capacityOptionsFor(e.target.value)[0] })} className={inputCls()}>
                    {['KKT Yangın Söndürme Cihazı', 'CO2 Yangın Söndürme Cihazı', 'Köpüklü Yangın Söndürme Cihazı', 'Arabalı KKT Yangın Söndürme Cihazı', 'Yangın Battaniyesi', 'Davlumbaz Söndürme Sistemi', 'Gazlı Söndürme Sistemi', 'Pano İçi Aerosol Söndürme Sistemi'].map(type => <option key={type}>{type}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <select name={`kapasite_${device.id}`} value={device.kapasite} onChange={e => updateDevice(device.id, { kapasite: e.target.value })} className={inputCls()}>
                    {capacityOptionsFor(device.cihaz_tipi).map(capacity => <option key={capacity}>{capacity}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2"><input name={`cihaz_adet_${device.id}`} type="number" min="0" value={device.adet} onChange={e => updateDevice(device.id, { adet: e.target.value ? Number(e.target.value) : '' })} className="w-24 rounded-md border px-3 py-2 text-sm dark:border-gray-600" /></td>
                <td className="px-2 py-2">
                  <select name={`cihaz_durum_${device.id}`} value={device.durum} onChange={e => updateDevice(device.id, { durum: e.target.value })} className={inputCls()}>
                    {['Geçerli', 'Bakım Gerekli', 'Tarihi Geçmiş', 'Kullanılamaz'].map(status => <option key={status}>{status}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2"><input name={`son_kontrol_tarihi_${device.id}`} type="date" value={device.son_kontrol_tarihi} onChange={e => updateDevice(device.id, { son_kontrol_tarihi: e.target.value })} className={inputCls()} /></td>
                <td className="px-2 py-2"><input name={`cihaz_aciklama_${device.id}`} value={device.aciklama} onChange={e => updateDevice(device.id, { aciklama: e.target.value })} className={inputCls()} /></td>
                <td className="px-2 py-2 text-right"><button type="button" onClick={() => setDevices(prev => prev.filter(row => row.id !== device.id))} className="text-xs font-medium text-red-600 hover:underline">Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WaterSystemFields({ inputData }: { inputData: any }) {
  return (
    <section className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Yangın Dolabı, Hidrant ve Pompa Ön Hesabı</h2>
          <p className="mt-1 text-xs text-gray-500">Sulu yangın söndürme sistemi için ön keşif debi, basınç ve ihtiyaç hesabı.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="text-sm">Bina / Tesis Tipi<input name="bina_tipi" defaultValue={inputData.bina_tipi ?? ''} className={inputCls()} /></label>
        <label className="text-sm">Risk Sınıfı<select name="risk_sinifi" defaultValue={inputData.risk_sinifi ?? 'orta_riskli'} className={inputCls()}>
          <option value="az_riskli">Az Riskli</option>
          <option value="orta_riskli">Orta Riskli</option>
          <option value="riskli">Riskli</option>
          <option value="cok_riskli">Çok Riskli</option>
        </select></label>
        <label className="text-sm">Kat Sayısı<input name="kat_sayisi" type="number" min="1" defaultValue={inputData.kat_sayisi ?? 1} className={inputCls()} /></label>
        <label className="text-sm">Kat Alanı m²<input name="kat_alani_m2" type="number" min="0" defaultValue={inputData.kat_alani_m2 ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Toplam Alan m²<input name="toplam_alan_m2" type="number" min="0" defaultValue={inputData.toplam_alan_m2 ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Bina Yüksekliği m<input name="bina_yuksekligi_m" type="number" min="0" defaultValue={inputData.bina_yuksekligi_m ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Cephe Uzunluğu m<input name="cephe_uzunlugu_m" type="number" min="0" defaultValue={inputData.cephe_uzunlugu_m ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Tesis Çevresi m<input name="tesis_cevre_m" type="number" min="0" defaultValue={inputData.tesis_cevre_m ?? 0} className={inputCls()} /></label>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="flex items-center gap-2 text-sm"><input name="yangin_dolabi_gerekli" type="checkbox" defaultChecked={inputData.yangin_dolabi_gerekli ?? true} /> Yangın dolabı gerekli</label>
        <label className="flex items-center gap-2 text-sm"><input name="hidrant_gerekli" type="checkbox" defaultChecked={inputData.hidrant_gerekli ?? true} /> Hidrant gerekli</label>
        <label className="flex items-center gap-2 text-sm"><input name="elektrik_yedekli" type="checkbox" defaultChecked={inputData.elektrik_yedekli ?? true} /> Elektrik yedekli pompa</label>
        <label className="flex items-center gap-2 text-sm"><input name="dizel_yedekli" type="checkbox" defaultChecked={inputData.dizel_yedekli ?? false} /> Dizel yedek pompa</label>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="text-sm">Ana Hat Uzunluğu m<input name="ana_hat_uzunlugu_m" type="number" min="0" defaultValue={inputData.ana_hat_uzunlugu_m ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Kolon Hattı Uzunluğu m<input name="kolon_hatti_uzunlugu_m" type="number" min="0" defaultValue={inputData.kolon_hatti_uzunlugu_m ?? 0} className={inputCls()} /></label>
        <label className="text-sm">Eşdeğer Parça Oranı %<input name="esdeger_parca_orani" type="number" min="0" defaultValue={inputData.esdeger_parca_orani ?? 20} className={inputCls()} /></label>
        <label className="text-sm">Hedef Çıkış Basıncı kPa<input name="hedef_cikis_basinci_kpa" type="number" min="0" defaultValue={inputData.hedef_cikis_basinci_kpa ?? 700} className={inputCls()} /></label>
      </div>
      <label className="mt-4 block text-sm">Saha Notu<textarea name="aciklama" rows={3} defaultValue={inputData.aciklama ?? ''} className={inputCls()} /></label>
      <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
        {WATER_SYSTEM_WARNING}
      </div>
    </section>
  )
}

function RoomFields({ inputData }: { inputData: any }) {
  return (
    <section className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-4 text-sm font-semibold">Oda Sızdırmazlık Testi</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {['oda_adi','test_tarihi','oda_eni','oda_boyu','oda_yuksekligi','hacim','net_korunan_hacim','kapi_sayisi','menfez_sayisi','hedef_tutma_suresi','tasarim_konsantrasyonu','oda_sicakligi','fan_modeli','manometre_modeli','anemometre_modeli','rpm_olcer_modeli','cihaz_seri_no','kalibrasyon_tarihi','pozitif_basinc','negatif_basinc','test_basinci','test_suresi','baslangic_basinci','bitis_basinci','kacak_debisi','etkin_kacak_alani'].map(key => (
          <label key={key} className="text-sm">{key.replaceAll('_', ' ')}<input name={key} type={key.includes('tarihi') ? 'date' : key.includes('model') || key.includes('seri') || key.includes('oda_adi') ? 'text' : 'number'} defaultValue={inputData[key] ?? ''} className={inputCls()} /></label>
        ))}
        <label className="text-sm">Gaz Tipi<select name="gaz_tipi" defaultValue={inputData.gaz_tipi ?? 'FM-200'} className={inputCls()}>{['HFC-227ea','FM-200','Novec / FK-5-1-12','Aerosol','Diğer'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="text-sm">Sonuç<select name="sonuc" defaultValue={inputData.sonuc ?? 'Uygun'} className={inputCls()}>{['Uygun','Şartlı Uygun','Uygun Değil'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input name="asma_tavan" type="checkbox" defaultChecked={inputData.asma_tavan} /> Asma tavan var</label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input name="yukseltilmis_doseme" type="checkbox" defaultChecked={inputData.yukseltilmis_doseme} /> Yükseltilmiş döşeme var</label>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="text-sm">Kablo geçişi / açıklık notları<textarea name="aciklik_notlari" rows={3} defaultValue={inputData.aciklik_notlari ?? ''} className={inputCls()} /></label>
        <label className="text-sm">Ölçüm notları<textarea name="olcum_notlari" rows={3} defaultValue={inputData.olcum_notlari ?? ''} className={inputCls()} /></label>
      </div>
    </section>
  )
}
