'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { calculateAlarmNeeds, type AlarmInput } from '@/lib/technical-reports/alarm-calculator'
import { calculateGeneralNeeds, type ExistingDeviceInput, type GeneralNeedsInput } from '@/lib/technical-reports/general-needs-calculator'
import { calculateRoomIntegrity, type RoomIntegrityInput } from '@/lib/technical-reports/room-integrity-calculator'
import { calculateVentilationTest, type VentilationEvaluationMode, type VentilationSectionInput, type VentilationSectionType, type VentilationTestInput } from '@/lib/technical-reports/ventilation-test-calculator'
import { calculateWaterSystem, WATER_SYSTEM_WARNING, type WaterSystemInput, type WaterRiskClass } from '@/lib/technical-reports/water-system-calculator'
import { calculateWaterHydraulicReport, WATER_HYDRAULIC_WARNING } from '@/lib/technical-reports/water-hydraulic-calculator'
import type { HydraulicPipeSegment, WaterCalculationMode, WaterHydraulicInput } from '@/lib/technical-reports/water-hydraulic-types'
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
  defaultReportDate?: string
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
  { type: 'havalandirma_test_raporu', text: 'Havalandırma giriş/çıkış hız ölçümleri, kesit alanı, debi ve kayıp oranı raporu oluşturur.' },
  { type: 'sulu_sistem_hidrolik_hesap', text: 'Dolap, hidrant, sprinkler, hidrolik boru, pompa, depo ve kroki hesabını birlikte üretir.' },
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

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
    } catch {
      return { message: String(error) }
    }
  }

  return { message: String(error) }
}

function sanitizeJsonForDb<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (typeof val === 'number' && !Number.isFinite(val)) return null
      if (typeof val === 'undefined') return null
      if (typeof val === 'function') return null
      return val
    })
  ) as T
}

function supabaseErrorMessage(action: 'insert' | 'update', error: any) {
  return `[teknik_raporlar_${action}_failed] ${error?.message || 'Bilinmeyen Supabase hatası'} | code=${error?.code || '-'} | details=${error?.details || '-'} | hint=${error?.hint || '-'}`
}

function ventilationSectionForDb(section: VentilationSectionInput) {
  return {
    sectionType: section.tip,
    unit: 'mm',
    diameter: section.dairesel_cap_mm,
    width: section.dikdortgen_en_mm,
    height: section.dikdortgen_boy_mm || section.kare_kenar_mm,
    manualArea: section.manuel_kesit_alani_m2,
    calculatedArea: undefined,
  }
}

function ventilationMeasurementsForDb(values: VentilationTestInput['giris_olcumleri']) {
  return {
    top: values.ust,
    bottom: values.alt,
    left: values.sol,
    right: values.sag,
    center: values.orta,
  }
}

function enrichVentilationInputForDb(data: VentilationTestInput, customer: { customerId: string | null; customerName: string; address: string }) {
  return {
    ...data,
    reportType: 'ventilation_test',
    customer: {
      id: customer.customerId,
      name: customer.customerName || data.firma_kurum,
      address: customer.address,
    },
    technician: {
      name: data.tekniker_ad_soyad,
      ekipnetNo: data.ekipnet_no,
    },
    testInfo: {
      date: data.test_tarihi,
      location: data.test_yapilan_mahal,
      systemType: data.sistem_tipi,
      deviceBrand: data.cihaz_marka,
      deviceModel: data.cihaz_model,
      deviceSerialNo: data.cihaz_seri_no,
    },
    inletSection: ventilationSectionForDb(data.giris_kesit),
    outletSection: ventilationSectionForDb(data.cikis_kesit),
    ductInfo: {
      ductLength: data.havalandirma_uzunlugu_m,
      elbowCount: data.dirsek_sayisi,
    },
    inletMeasurements: ventilationMeasurementsForDb(data.giris_olcumleri),
    outletMeasurements: ventilationMeasurementsForDb(data.cikis_olcumleri),
    outletMeasurementUnavailable: data.cikis_olcumu_yapilamadi,
    useVirtualOutlet: data.sanal_cikis_hesabi,
    notes: data.olcum_notlari,
  }
}

function enrichVentilationResultForDb(result: any) {
  return {
    ...result,
    inletAverageVelocity: result.giris_ortalama_hiz_ms,
    outletAverageVelocity: result.cikis_ortalama_hiz_ms,
    inletArea: result.giris_kesit_alani_m2,
    outletArea: result.cikis_kesit_alani_m2,
    inletFlowM3s: result.giris_debi_m3_s,
    inletFlowM3h: result.giris_debi_m3_h,
    outletFlowM3s: result.cikis_debi_m3_s,
    outletFlowM3h: result.cikis_debi_m3_h,
    flowComparison: result.debi_artisi_var ? 'flow_increase' : 'loss_ratio',
    suitability: result.degerlendirme,
    warnings: result.uyari ? [result.uyari] : [],
    recommendations: result.oneriler ?? [],
    evaluationText: result.otomatik_degerlendirme,
  }
}

function nextIndexedId(prefix: string, existingIds: string[] = []) {
  const used = new Set(existingIds)
  let index = existingIds.length + 1
  while (used.has(`${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

function makeRoom(kat = 1, patch: Partial<AlarmRoomState> = {}, fallbackId = 'room-1'): AlarmRoomState {
  return {
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
    id: patch.id ?? fallbackId,
  }
}

function makeExistingDevice(patch: Partial<ExistingDeviceState> = {}, fallbackId = 'device-1'): ExistingDeviceState {
  return {
    cihaz_tipi: 'KKT Yangın Söndürme Cihazı',
    kapasite: '6 Kg',
    adet: '',
    durum: 'Geçerli',
    son_kontrol_tarihi: '',
    aciklama: '',
    ...patch,
    id: patch.id ?? fallbackId,
  }
}

export default function TechnicalReportForm({ customers, subeler, personeller, settings, initialType, report, defaultReportDate }: Props) {
  const router = useRouter()
  const defaultSubeId = subeler.find(s => s.ad === 'Erzincan Merkez')?.id ?? subeler[0]?.id ?? ''
  const stableReportDate = report?.rapor_tarihi ?? defaultReportDate ?? ''
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

    if (reportType === 'sulu_sistem_hidrolik_hesap') {
      const mode = String(form.get('calculation_mode') || 'dolap_sprinkler_hidrant') as WaterCalculationMode
      const segmentIds = String(form.get('hydraulic_segment_ids') || '').split(',').filter(Boolean)
      const pipeSegments: HydraulicPipeSegment[] = segmentIds.map((id, index) => ({
        id,
        fromNodeId: String(form.get(`segment_from_${id}`) || `N${index + 1}`),
        toNodeId: String(form.get(`segment_to_${id}`) || `N${index + 2}`),
        label: String(form.get(`segment_label_${id}`) || `Hat ${index + 1}`),
        pipeType: String(form.get('pipe_type') || 'siyah_celik') as any,
        flowLpm: num(form, `segment_flow_${id}`),
        lengthM: num(form, `segment_length_${id}`),
        heightDifferenceM: num(form, `segment_height_${id}`),
        selectedDN: String(form.get(`segment_dn_${id}`) || '') || undefined,
        screwElbow90Count: num(form, `segment_screw_elbow_${id}`),
        weldedElbow90Count: num(form, `segment_welded_elbow_${id}`),
        teeReducerCount: num(form, `segment_tee_${id}`),
        gateValveCount: num(form, `segment_gate_${id}`),
        checkValveSwingCount: num(form, `segment_swing_check_${id}`),
        checkValveLiftCount: num(form, `segment_lift_check_${id}`),
        butterflyValveCount: num(form, `segment_butterfly_${id}`),
        ballValveCount: num(form, `segment_ball_${id}`),
        flexHoseCount: num(form, `segment_flex_${id}`),
      })).filter(segment => segment.flowLpm || segment.lengthM || segment.label)
      const flags = {
        cabinet: mode.includes('dolap'),
        hydrant: mode.includes('hidrant'),
        sprinkler: mode.includes('sprinkler'),
      }
      return {
        calculationMode: mode,
        projectName: String(form.get('project_name') || ''),
        buildingType: String(form.get('building_type') || ''),
        riskClass: String(form.get('risk_class') || ''),
        totalClosedAreaM2: num(form, 'total_closed_area_m2'),
        floorCount: num(form, 'floor_count'),
        buildingHeightM: num(form, 'building_height_m'),
        elevationDifferenceM: num(form, 'elevation_difference_m'),
        farthestHorizontalDistanceM: num(form, 'farthest_horizontal_distance_m'),
        pipeType: String(form.get('pipe_type') || 'siyah_celik') as any,
        hazenWilliamsC: num(form, 'hazen_williams_c') || 120,
        cabinet: {
          enabled: flags.cabinet,
          fireCabinetCount: num(form, 'fire_cabinet_count'),
          manualFireCabinetCount: num(form, 'manual_fire_cabinet_count'),
          flowPerCabinetLpm: num(form, 'flow_per_cabinet_lpm') || 100,
          simultaneousCabinetCount: num(form, 'simultaneous_cabinet_count') || 2,
          endpointPressureBar: num(form, 'cabinet_endpoint_pressure_bar') || 4,
          hoseLengthM: num(form, 'hose_length_m'),
          cabinetCoverageRadiusM: num(form, 'cabinet_coverage_radius_m') || 30,
        },
        hydrant: {
          enabled: flags.hydrant,
          hydrantCount: num(form, 'hydrant_count'),
          manualHydrantCount: num(form, 'manual_hydrant_count'),
          sitePerimeterM: num(form, 'site_perimeter_m'),
          hydrantSpacingM: num(form, 'hydrant_spacing_m') || 100,
          minimumDesignFlowLpm: num(form, 'hydrant_minimum_design_flow_lpm') || 1900,
          endpointPressureBar: num(form, 'hydrant_endpoint_pressure_bar') || 7,
          ringLineEnabled: boolValue(form.get('ring_line_enabled')),
          rightRingLengthM: num(form, 'right_ring_length_m'),
          leftRingLengthM: num(form, 'left_ring_length_m'),
        },
        sprinkler: {
          enabled: flags.sprinkler,
          hazardClass: String(form.get('sprinkler_hazard_class') || 'OH3') as any,
          systemType: String(form.get('sprinkler_system_type') || 'islak') as any,
          designAreaM2: num(form, 'sprinkler_design_area_m2') || 216,
          sprinklerCoverageAreaM2: num(form, 'sprinkler_coverage_area_m2') || 12,
          kFactorMetric: num(form, 'sprinkler_k_factor') || 80,
          designDensityLpmM2: num(form, 'sprinkler_design_density') || 5,
          minimumSprinklerPressureBar: num(form, 'sprinkler_min_pressure_bar') || 0.56,
          manualSprinklerCount: num(form, 'manual_sprinkler_count'),
          interventionDurationMin: num(form, 'sprinkler_duration_min') || 60,
          wallTypeSprinkler: boolValue(form.get('wall_type_sprinkler')),
          wallTypeThrowDistanceM: num(form, 'wall_type_throw_distance_m'),
          wallTypeMinimumPressureBar: num(form, 'wall_type_min_pressure_bar') || 1,
        },
        pump: {
          pumpSelectionMode: String(form.get('pump_selection_mode') || 'auto') as any,
          designFlowMode: String(form.get('design_flow_mode') || 'en_buyuk_senaryo') as any,
          preferredPumpType: String(form.get('preferred_pump_type') || '') as any,
          pumpEfficiency: num(form, 'pump_efficiency') || 0.75,
          motorSafetyFactor: num(form, 'motor_safety_factor') || 1.15,
          pressureSafetyFactor: num(form, 'pressure_safety_factor') || 1.1,
          flowSafetyFactor: num(form, 'flow_safety_factor') || 1.1,
          includeJockeyPump: boolValue(form.get('include_jockey_pump')),
          includeDieselBackup: boolValue(form.get('include_diesel_backup')),
        },
        waterTank: {
          existingTankAvailable: boolValue(form.get('existing_tank_available')),
          existingTankVolumeM3: num(form, 'existing_tank_volume_m3'),
          durationMin: num(form, 'tank_duration_min') || 60,
          safetyFactor: num(form, 'tank_safety_factor') || 1.1,
        },
        pipeSegments,
        nodes: [],
        notes: String(form.get('hydraulic_notes') || ''),
      } satisfies WaterHydraulicInput
    }

    if (reportType === 'havalandirma_test_raporu') {
      const measurement = (prefix: 'giris' | 'cikis') => ({
        ust: num(form, `${prefix}_ust`),
        alt: num(form, `${prefix}_alt`),
        sag: num(form, `${prefix}_sag`),
        sol: num(form, `${prefix}_sol`),
        orta: num(form, `${prefix}_orta`),
      })
      const section = (prefix: 'giris' | 'cikis') => ({
        tip: String(form.get(`${prefix}_kesit_tipi`) || 'dikdortgen') as VentilationSectionType,
        manuel_kesit_adi: String(form.get(`${prefix}_manuel_kesit_adi`) || ''),
        dairesel_cap_mm: num(form, `${prefix}_dairesel_cap_mm`),
        dikdortgen_en_mm: num(form, `${prefix}_dikdortgen_en_mm`),
        dikdortgen_boy_mm: num(form, `${prefix}_dikdortgen_boy_mm`),
        kare_kenar_mm: num(form, `${prefix}_kare_kenar_mm`),
        manuel_kesit_alani_m2: num(form, `${prefix}_manuel_kesit_alani_m2`),
      } satisfies VentilationSectionInput)
      return {
        firma_kurum: String(form.get('firma_kurum') || ''),
        test_tarihi: String(form.get('test_tarihi') || ''),
        test_yapilan_mahal: String(form.get('test_yapilan_mahal') || ''),
        sistem_tipi: String(form.get('havalandirma_sistem_tipi') || ''),
        tekniker_ad_soyad: String(form.get('tekniker_ad_soyad') || ''),
        ekipnet_no: String(form.get('ekipnet_no') || ''),
        cihaz_marka: String(form.get('cihaz_marka') || ''),
        cihaz_model: String(form.get('cihaz_model') || ''),
        cihaz_seri_no: String(form.get('cihaz_seri_no') || ''),
        giris_kesit: section('giris'),
        cikis_kesit: section('cikis'),
        havalandirma_uzunlugu_m: num(form, 'havalandirma_uzunlugu_m'),
        dirsek_sayisi: num(form, 'dirsek_sayisi'),
        giris_olcumleri: measurement('giris'),
        cikis_olcumleri: measurement('cikis'),
        cikis_olcumu_yapilamadi: boolValue(form.get('cikis_olcumu_yapilamadi')),
        sanal_cikis_hesabi: boolValue(form.get('sanal_cikis_hesabi')),
        degerlendirme_modu: String(form.get('degerlendirme_modu') || 'otomatik') as VentilationEvaluationMode,
        manuel_sonuc: String(form.get('manuel_sonuc') || 'Manuel Değerlendirme Gerekli') as VentilationTestInput['manuel_sonuc'],
        manuel_degerlendirme: String(form.get('manuel_degerlendirme') || ''),
        debi_artisi_aciklama: String(form.get('debi_artisi_aciklama') || ''),
        olcum_notlari: String(form.get('olcum_notlari') || ''),
      } satisfies VentilationTestInput
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
          : reportType === 'sulu_sistem_hidrolik_hesap'
            ? calculateWaterHydraulicReport(data as WaterHydraulicInput, settings)
            : reportType === 'havalandirma_test_raporu'
              ? calculateVentilationTest(data as VentilationTestInput, settings)
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
      const res = await fetch('/api/tenant-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'customers', payload: manualCustomer }),
      })
      const data = await res.json()
      if (!res.ok || !data?.id) throw new Error(`Müşteri listesine eklenemedi: ${data?.error ?? `HTTP ${res.status}`}`)
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
    let payloadForLog: Record<string, any> | null = null
    let inputDataForLog: any = null
    let resultDataForLog: any = null
    const submitIntent = String((event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') || 'detail')
    const subeId = String(formData.get('sube_id') || '')
    if (!subeId) {
      setMessage('Kayıt tamamlanamadı: Şube seçilmeden teknik rapor kaydedilemez.')
      setSaving(false)
      return
    }

    const supabase = createClient()
    try {
      const customer = await resolveCustomer(formData, supabase)
      const { data, calculated } = calculate(form)
      const { data: auth } = await supabase.auth.getUser()
      const title = String(formData.get('baslik') || REPORT_TYPE_LABELS[reportType]).trim()
      const reportDate = String(formData.get('rapor_tarihi') || stableReportDate || new Date().toISOString().slice(0, 10))
      if (!title) throw new Error('Başlık girilmeden teknik rapor kaydedilemez.')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error('Geçerli bir rapor tarihi girilmeden teknik rapor kaydedilemez.')
      if (!customer.customerId && !customer.customerName.trim()) throw new Error('Firma / kurum adı girilmeden rapor kaydedilemez.')

      const reportInputData = reportType === 'havalandirma_test_raporu'
        ? enrichVentilationInputForDb(data as VentilationTestInput, customer)
        : data
      const reportResultData = reportType === 'havalandirma_test_raporu'
        ? enrichVentilationResultForDb(calculated.calculation_result)
        : calculated.calculation_result
      const input_data = sanitizeJsonForDb({
        ...reportInputData,
        musteri_giris_tipi: customerMode === 'manual' ? 'Manuel Müşteri' : 'Kayıtlı Müşteri',
        manuel_musteri: customer.manualCustomer,
      })
      const calculation_result = sanitizeJsonForDb(reportResultData)
      const safeMaterialList = sanitizeJsonForDb(materialList.length ? materialList : calculated.material_list)
      inputDataForLog = input_data
      resultDataForLog = calculation_result
      const payload = {
        rapor_no: report?.rapor_no ?? createReportNo(reportType),
        rapor_turu: reportType,
        baslik: title,
        customer_id: customer.customerId,
        customer_name_snapshot: customer.customerName,
        sube_id: subeId,
        lokasyon: String(formData.get(customerMode === 'manual' ? 'manual_lokasyon' : 'lokasyon') || ''),
        adres: customer.address,
        rapor_tarihi: reportDate,
        hazirlayan_personel_id: String(formData.get('hazirlayan_personel_id') || '') || null,
        durum: 'Hesaplandı',
        standart_profili: String(formData.get('standart_profili') || 'MVP keşif destek hesabı'),
        input_data,
        calculation_result,
        material_list: safeMaterialList,
        notes: String(formData.get('notes') || '') || null,
        updated_by: auth.user?.id ?? null,
        ...(report ? {} : { created_by: auth.user?.id ?? null }),
      }
      payloadForLog = payload
      const savedResult = report
        ? await supabase.from('teknik_raporlar').update(payload).eq('id', report.id).select('id').single()
        : await fetch('/api/tenant-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'teknik_raporlar', payload }),
          }).then(async res => {
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
            return { data, error: null }
          })
      const { data: saved, error } = savedResult
      if (error) throw new Error(supabaseErrorMessage(report ? 'update' : 'insert', error))
      if (!saved?.id) throw new Error('Teknik rapor kaydedildi ancak kayıt ID bilgisi alınamadı.')
      router.push(submitIntent === 'print' ? `/teknik-raporlar/${saved.id}/yazdir` : `/teknik-raporlar/${saved.id}`)
    } catch (error) {
      const serialized = serializeError(error)
      if (process.env.NODE_ENV === 'development') {
        console.error('[teknik-raporlar][save] kayıt başarısız', {
          error: serialized,
          reportType,
          submitIntent,
          values: {
            sube_id: subeId,
            customerMode,
            reportType,
            baslik: String(formData.get('baslik') || ''),
            rapor_tarihi: String(formData.get('rapor_tarihi') || ''),
          },
          inputData: inputDataForLog,
          resultData: resultDataForLog,
          payload: payloadForLog,
        })
      } else {
        console.error('[teknik-raporlar][save] kayıt başarısız', { error: serialized, reportType, submitIntent })
      }
      const message = error instanceof Error ? error.message : 'Teknik rapor kaydedilemedi. Konsol detaylarını kontrol edin.'
      setMessage(`Kayıt tamamlanamadı: ${message}`)
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
          <label className="text-sm">Rapor Tarihi<input name="rapor_tarihi" type="date" defaultValue={stableReportDate} className={inputCls()} /></label>
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
      {reportType === 'havalandirma_test_raporu' && <VentilationFields inputData={inputData} report={report} />}
      {reportType === 'yangin_dolabi_hidrant_pompa' && <WaterSystemFields inputData={inputData} />}
      {reportType === 'sulu_sistem_hidrolik_hesap' && <WaterHydraulicFields inputData={inputData} />}

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
          {reportType === 'havalandirma_test_raporu' && <VentilationResultCards result={calculationResult} />}
          {reportType === 'yangin_dolabi_hidrant_pompa' && <WaterResultCards result={calculationResult} />}
          {reportType === 'sulu_sistem_hidrolik_hesap' && <WaterHydraulicResult result={calculationResult} />}
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

function WaterHydraulicResult({ result }: { result: any }) {
  const cards = [
    ['Tasarım Debisi', `${result.designFlowLpm ?? 0} l/dak / ${result.designFlowM3h ?? 0} m³/h`],
    ['Sprinkler Adedi', result.sprinkler ? `${result.sprinkler.selectedSprinklerCount ?? 0} adet` : '-'],
    ['Sprinkler Debisi', result.sprinkler ? `${result.sprinkler.requiredFlowLpm ?? 0} l/dak` : '-'],
    ['Pompa Basıncı', `${result.pump?.requiredPressureBar ?? 0} bar / ${result.pump?.requiredPressureMSS ?? 0} mSS`],
    ['Pompa Gücü', `${result.pump?.selectedMotorPowerKw ?? 0} kW`],
    ['Su Deposu', `${result.waterTank?.requiredVolumeWithSafetyM3 ?? 0} m³ / ${result.waterTank?.requiredVolumeWithSafetyTon ?? 0} ton`],
    ['Ana Boru Çapı', result.pipeSummary?.segments?.[0]?.selectedDN ?? '-'],
    ['Toplam Boru', `${result.pipeSummary?.totalPipeLengthM ?? 0} m`],
  ]
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md bg-gray-50 p-3 dark:bg-gray-900">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-base font-bold">{value}</div>
          </div>
        ))}
      </div>
      {result.sprinkler && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm md:grid-cols-4 dark:border-gray-700">
          <div><div className="text-xs text-gray-500">Tasarım Alanı</div><div className="font-bold">{result.sprinkler.designAreaM2 ?? 0} m²</div></div>
          <div><div className="text-xs text-gray-500">Koruma Alanı</div><div className="font-bold">{result.sprinkler.sprinklerCoverageAreaM2 ?? 0} m²/adet</div></div>
          <div><div className="text-xs text-gray-500">K Faktörü</div><div className="font-bold">K{result.sprinkler.kFactorMetric ?? 0}</div></div>
          <div><div className="text-xs text-gray-500">Akma Basıncı</div><div className="font-bold">{result.sprinkler.selectedPressureBar ?? 0} bar</div></div>
        </div>
      )}
      {result.waterTank && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm md:grid-cols-4 dark:border-gray-700">
          <div><div className="text-xs text-gray-500">Depo Süresi</div><div className="font-bold">{result.waterTank.durationMin ?? 0} dk</div></div>
          <div><div className="text-xs text-gray-500">Net Hacim</div><div className="font-bold">{result.waterTank.requiredVolumeM3 ?? 0} m³ / {result.waterTank.requiredVolumeTon ?? 0} ton</div></div>
          <div><div className="text-xs text-gray-500">Emniyetli Hacim</div><div className="font-bold">{result.waterTank.requiredVolumeWithSafetyM3 ?? 0} m³ / {result.waterTank.requiredVolumeWithSafetyTon ?? 0} ton</div></div>
          <div><div className="text-xs text-gray-500">Eksik Hacim</div><div className="font-bold">{result.waterTank.missingVolumeM3 ?? 0} m³ / {result.waterTank.missingVolumeTon ?? 0} ton</div></div>
        </div>
      )}
      {result.sketchPlan?.svg && (
        <div className="rounded-lg border bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold">Kroki / Ön Şema</h3>
          <div dangerouslySetInnerHTML={{ __html: result.sketchPlan.svg }} />
          <p className="mt-2 text-xs text-gray-600">{result.sketchPlan.summary}</p>
        </div>
      )}
      {Array.isArray(result.pipeSummary?.segments) && result.pipeSummary.segments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-gray-50"><tr><th>No</th><th>Hat</th><th>Debi</th><th>DN</th><th>İç Çap</th><th>Hız</th><th>Uzunluk</th><th>Eşdeğer</th><th>Boru Kaybı</th><th>Son Kayıp</th></tr></thead>
            <tbody>{result.pipeSummary.segments.map((s: any, i: number) => <tr key={s.id}><td>{i + 1}</td><td>{s.label}</td><td>{s.flowLpm} l/dak</td><td>{s.selectedDN}</td><td>{s.innerDiameterMm} mm</td><td>{s.velocityMs} m/s</td><td>{s.lengthM} m</td><td>{s.totalEquivalentLengthM} m</td><td>{s.pipeLossBar} bar</td><td>{s.finalPressureLossBar} bar</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">
        {WATER_HYDRAULIC_WARNING}
      </div>
      {Array.isArray(result.warnings) && result.warnings.length > 0 && (
        <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-6 text-xs text-amber-800">
          {result.warnings.map((warning: string) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  )
}

function AlarmFields({ inputData }: { inputData: any }) {
  const initialRooms: AlarmRoomState[] = Array.isArray(inputData.bolumler) && inputData.bolumler.length > 0
    ? inputData.bolumler.map((room: any, index: number) => makeRoom(Number(room.kat || 1), { ...room, kat: Number(room.kat || 1) }, `room-${index + 1}`))
    : [makeRoom(1, { bolum_adi: 'Genel Alan' }, 'room-1')]
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
          .map((kat, index) => makeRoom(kat, { bolum_adi: `Kat ${kat} Genel Alan` }, `room-${index + 1}`))
        return [...prev, ...additions]
      })
    }
    setFloorCount(safeNext)
  }

  function updateRoom(id: string, patch: Partial<AlarmRoomState>) {
    setRooms(prev => prev.map(room => room.id === id ? { ...room, ...patch } : room))
  }

  function addRoom(kat: number, bolumTipi = 'Ofis') {
    setRooms(prev => [...prev, makeRoom(kat, { bolum_tipi: bolumTipi, bolum_adi: bolumTipi, id: nextIndexedId('room', prev.map(row => row.id)) })])
  }

  function addFloor() {
    const next = floorCount + 1
    setFloorCount(next)
    setRooms(prev => [...prev, makeRoom(next, { bolum_adi: `Kat ${next} Genel Alan`, id: nextIndexedId('room', prev.map(row => row.id)) })])
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
    ? inputData.mevcut_cihazlar.map((device: any, index: number) => makeExistingDevice(device, `device-${index + 1}`))
    : [makeExistingDevice({}, 'device-1')]
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
        <button type="button" onClick={() => setDevices(prev => [...prev, makeExistingDevice({ id: nextIndexedId('device', prev.map(row => row.id)) })])} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600">+ Cihaz Ekle</button>
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

function makeHydraulicSegment(patch: Partial<HydraulicPipeSegment> = {}, fallbackId = 'segment-1'): HydraulicPipeSegment {
  return {
    fromNodeId: 'Pompa',
    toNodeId: 'Kolektör',
    label: 'Ana hat',
    flowLpm: 1900,
    lengthM: 30,
    heightDifferenceM: 0,
    ...patch,
    id: patch.id ?? fallbackId,
  }
}

function WaterHydraulicFields({ inputData }: { inputData: any }) {
  const initialSegments: HydraulicPipeSegment[] = Array.isArray(inputData.pipeSegments) && inputData.pipeSegments.length > 0
    ? inputData.pipeSegments.map((segment: any, index: number) => makeHydraulicSegment(segment, `segment-${index + 1}`))
    : [makeHydraulicSegment({}, 'segment-1')]
  const [segments, setSegments] = useState<HydraulicPipeSegment[]>(initialSegments)
  const [mode, setMode] = useState<WaterCalculationMode>(inputData.calculationMode ?? 'dolap_sprinkler_hidrant')
  const hasCabinet = mode.includes('dolap')
  const hasHydrant = mode.includes('hidrant')
  const hasSprinkler = mode.includes('sprinkler')
  const modeCards: Array<{ value: WaterCalculationMode; label: string }> = [
    { value: 'dolap', label: 'Yangın Dolabı' },
    { value: 'hidrant', label: 'Hidrant' },
    { value: 'sprinkler', label: 'Sprinkler' },
    { value: 'dolap_hidrant', label: 'Dolap + Hidrant' },
    { value: 'dolap_sprinkler', label: 'Dolap + Sprinkler' },
    { value: 'sprinkler_hidrant', label: 'Sprinkler + Hidrant' },
    { value: 'dolap_sprinkler_hidrant', label: 'Dolap + Sprinkler + Hidrant' },
  ]
  function updateSegment(id: string, patch: Partial<HydraulicPipeSegment>) {
    setSegments(prev => prev.map(segment => segment.id === id ? { ...segment, ...patch } : segment))
  }
  return (
    <section className="space-y-4 rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h2 className="text-sm font-semibold">Sulu Sistem Hidrolik Hesap</h2>
        <p className="mt-1 text-xs text-gray-500">Yangın dolabı, hidrant, sprinkler, boru segmenti, pompa, depo ve kroki ön hesabı.</p>
      </div>
      <input type="hidden" name="calculation_mode" value={mode} />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        {modeCards.map(card => (
          <button key={card.value} type="button" onClick={() => setMode(card.value)} className={`rounded-lg border px-3 py-2 text-left text-sm ${mode === card.value ? 'border-[#C8102E] bg-red-50 text-[#C8102E]' : 'dark:border-gray-600'}`}>
            {card.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="text-sm">Proje Adı<input name="project_name" defaultValue={inputData.projectName ?? ''} className={inputCls()} /></label>
        <label className="text-sm">Bina Tipi<input name="building_type" defaultValue={inputData.buildingType ?? ''} className={inputCls()} /></label>
        <label className="text-sm">Yangın Sınıfı<input name="risk_class" defaultValue={inputData.riskClass ?? 'OH3'} className={inputCls()} /></label>
        <label className="text-sm">Boru Türü<select name="pipe_type" defaultValue={inputData.pipeType ?? 'siyah_celik'} className={inputCls()}><option value="siyah_celik">Siyah Çelik</option><option value="galvaniz">Galvaniz</option><option value="paslanmaz">Paslanmaz</option><option value="pe100">PE100</option><option value="diger">Diğer</option></select></label>
        <label className="text-sm">Kapalı Alan m²<input name="total_closed_area_m2" type="number" defaultValue={inputData.totalClosedAreaM2 ?? 1000} className={inputCls()} /></label>
        <label className="text-sm">Kat Sayısı<input name="floor_count" type="number" defaultValue={inputData.floorCount ?? 2} className={inputCls()} /></label>
        <label className="text-sm">Bina Yüksekliği m<input name="building_height_m" type="number" defaultValue={inputData.buildingHeightM ?? 8} className={inputCls()} /></label>
        <label className="text-sm">C Katsayısı<input name="hazen_williams_c" type="number" defaultValue={inputData.hazenWilliamsC ?? 120} className={inputCls()} /></label>
      </div>
      {hasCabinet && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border p-3 md:grid-cols-4 dark:border-gray-700">
          <h3 className="font-semibold md:col-span-4">Yangın Dolabı</h3>
          <label className="text-sm">Manuel Dolap Adedi<input name="manual_fire_cabinet_count" type="number" defaultValue={inputData.cabinet?.manualFireCabinetCount ?? 0} className={inputCls()} /></label>
          <label className="text-sm">Dolap Debisi l/dak<input name="flow_per_cabinet_lpm" type="number" defaultValue={inputData.cabinet?.flowPerCabinetLpm ?? 100} className={inputCls()} /></label>
          <label className="text-sm">Eş Zamanlı Dolap<input name="simultaneous_cabinet_count" type="number" defaultValue={inputData.cabinet?.simultaneousCabinetCount ?? 2} className={inputCls()} /></label>
          <label className="text-sm">Uç Basınç bar<input name="cabinet_endpoint_pressure_bar" type="number" step="0.1" defaultValue={inputData.cabinet?.endpointPressureBar ?? 4} className={inputCls()} /></label>
        </div>
      )}
      {hasHydrant && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border p-3 md:grid-cols-4 dark:border-gray-700">
          <h3 className="font-semibold md:col-span-4">Hidrant ve Ring Hat</h3>
          <label className="text-sm">Manuel Hidrant Adedi<input name="manual_hydrant_count" type="number" defaultValue={inputData.hydrant?.manualHydrantCount ?? 0} className={inputCls()} /></label>
          <label className="text-sm">Tesis Çevresi m<input name="site_perimeter_m" type="number" defaultValue={inputData.hydrant?.sitePerimeterM ?? 450} className={inputCls()} /></label>
          <label className="text-sm">Hidrant Aralığı m<input name="hydrant_spacing_m" type="number" defaultValue={inputData.hydrant?.hydrantSpacingM ?? 100} className={inputCls()} /></label>
          <label className="text-sm">Minimum Debi l/dak<input name="hydrant_minimum_design_flow_lpm" type="number" defaultValue={inputData.hydrant?.minimumDesignFlowLpm ?? 1900} className={inputCls()} /></label>
          <label className="text-sm">Uç Basınç bar<input name="hydrant_endpoint_pressure_bar" type="number" step="0.1" defaultValue={inputData.hydrant?.endpointPressureBar ?? 7} className={inputCls()} /></label>
          <label className="flex items-center gap-2 pt-6 text-sm"><input name="ring_line_enabled" type="checkbox" defaultChecked={inputData.hydrant?.ringLineEnabled ?? true} /> Ring hattı var</label>
          <label className="text-sm">Sağ Ring m<input name="right_ring_length_m" type="number" defaultValue={inputData.hydrant?.rightRingLengthM ?? 120} className={inputCls()} /></label>
          <label className="text-sm">Sol Ring m<input name="left_ring_length_m" type="number" defaultValue={inputData.hydrant?.leftRingLengthM ?? 180} className={inputCls()} /></label>
        </div>
      )}
      {hasSprinkler && (
        <div className="grid grid-cols-1 gap-4 rounded-lg border p-3 md:grid-cols-4 dark:border-gray-700">
          <h3 className="font-semibold md:col-span-4">Sprinkler</h3>
          <label className="text-sm">Tehlike Sınıfı<select name="sprinkler_hazard_class" defaultValue={inputData.sprinkler?.hazardClass ?? 'OH3'} className={inputCls()}>{['LH','OH1','OH2','OH3','OH4','HH'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label className="text-sm">Sistem Tipi<select name="sprinkler_system_type" defaultValue={inputData.sprinkler?.systemType ?? 'islak'} className={inputCls()}><option value="islak">Islak</option><option value="kuru">Kuru</option><option value="preaction">Preaction</option><option value="deluge">Deluge</option></select></label>
          <label className="text-sm">Tasarım Alanı m²<input name="sprinkler_design_area_m2" type="number" defaultValue={inputData.sprinkler?.designAreaM2 ?? 216} className={inputCls()} /></label>
          <label className="text-sm">Koruma Alanı m²<input name="sprinkler_coverage_area_m2" type="number" defaultValue={inputData.sprinkler?.sprinklerCoverageAreaM2 ?? 12} className={inputCls()} /></label>
          <label className="text-sm">K Faktörü<input name="sprinkler_k_factor" type="number" defaultValue={inputData.sprinkler?.kFactorMetric ?? 80} className={inputCls()} /></label>
          <label className="text-sm">Yoğunluk l/dak/m²<input name="sprinkler_design_density" type="number" step="0.1" defaultValue={inputData.sprinkler?.designDensityLpmM2 ?? 5} className={inputCls()} /></label>
          <label className="text-sm">Min. Akma Basıncı bar<input name="sprinkler_min_pressure_bar" type="number" step="0.01" defaultValue={inputData.sprinkler?.minimumSprinklerPressureBar ?? 0.56} className={inputCls()} /></label>
          <label className="text-sm">Manuel Sprinkler Adedi<input name="manual_sprinkler_count" type="number" defaultValue={inputData.sprinkler?.manualSprinklerCount ?? 0} className={inputCls()} /></label>
          <label className="text-sm">Müdahale Süresi dk<input name="sprinkler_duration_min" type="number" defaultValue={inputData.sprinkler?.interventionDurationMin ?? 60} className={inputCls()} /></label>
          <label className="flex items-center gap-2 pt-6 text-sm"><input name="wall_type_sprinkler" type="checkbox" defaultChecked={inputData.sprinkler?.wallTypeSprinkler ?? false} /> Duvar tipi sprinkler</label>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 rounded-lg border p-3 md:grid-cols-4 dark:border-gray-700">
        <h3 className="font-semibold md:col-span-4">Pompa ve Depo</h3>
        <label className="text-sm">Debi Senaryosu<select name="design_flow_mode" defaultValue={inputData.pump?.designFlowMode ?? 'en_buyuk_senaryo'} className={inputCls()}><option value="en_buyuk_senaryo">En büyük senaryo</option><option value="es_zamanli_toplam">Eş zamanlı toplam</option></select></label>
        <label className="text-sm">Pompa Verimi<input name="pump_efficiency" type="number" step="0.01" defaultValue={inputData.pump?.pumpEfficiency ?? 0.75} className={inputCls()} /></label>
        <label className="text-sm">Motor Emniyet<input name="motor_safety_factor" type="number" step="0.01" defaultValue={inputData.pump?.motorSafetyFactor ?? 1.15} className={inputCls()} /></label>
        <label className="text-sm">Basınç Emniyet<input name="pressure_safety_factor" type="number" step="0.01" defaultValue={inputData.pump?.pressureSafetyFactor ?? 1.1} className={inputCls()} /></label>
        <label className="text-sm">Debi Emniyet<input name="flow_safety_factor" type="number" step="0.01" defaultValue={inputData.pump?.flowSafetyFactor ?? 1.1} className={inputCls()} /></label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input name="include_jockey_pump" type="checkbox" defaultChecked={inputData.pump?.includeJockeyPump ?? true} /> Jokey pompa</label>
        <label className="flex items-center gap-2 pt-6 text-sm"><input name="include_diesel_backup" type="checkbox" defaultChecked={inputData.pump?.includeDieselBackup ?? hasHydrant} /> Dizel yedek</label>
        <label className="text-sm">Depo Süresi dk<input name="tank_duration_min" type="number" defaultValue={inputData.waterTank?.durationMin ?? 60} className={inputCls()} /></label>
        <label className="text-sm">Depo Emniyet<input name="tank_safety_factor" type="number" step="0.01" defaultValue={inputData.waterTank?.safetyFactor ?? 1.1} className={inputCls()} /></label>
        <label className="text-sm">Mevcut Depo m³<input name="existing_tank_volume_m3" type="number" defaultValue={inputData.waterTank?.existingTankVolumeM3 ?? 0} className={inputCls()} /></label>
      </div>
      <div className="rounded-lg border p-3 dark:border-gray-700">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold">Boru Segmentleri ve Fittings</h3>
          <button type="button" onClick={() => setSegments(prev => [...prev, makeHydraulicSegment({ id: nextIndexedId('segment', prev.map(row => row.id)), label: `Hat ${prev.length + 1}` })])} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600">Segment Ekle</button>
        </div>
        <input type="hidden" name="hydraulic_segment_ids" value={segments.map(s => s.id).join(',')} />
        <div className="space-y-3">
          {segments.map(segment => (
            <div key={segment.id} className="grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-3 md:grid-cols-10 dark:bg-gray-900">
              <input name={`segment_label_${segment.id}`} value={segment.label ?? ''} onChange={e => updateSegment(segment.id, { label: e.target.value })} placeholder="Hat" className={inputCls()} />
              <input name={`segment_from_${segment.id}`} value={segment.fromNodeId} onChange={e => updateSegment(segment.id, { fromNodeId: e.target.value })} placeholder="Başlangıç" className={inputCls()} />
              <input name={`segment_to_${segment.id}`} value={segment.toNodeId} onChange={e => updateSegment(segment.id, { toNodeId: e.target.value })} placeholder="Bitiş" className={inputCls()} />
              <input name={`segment_flow_${segment.id}`} type="number" value={segment.flowLpm} onChange={e => updateSegment(segment.id, { flowLpm: Number(e.target.value) })} placeholder="Debi" className={inputCls()} />
              <input name={`segment_dn_${segment.id}`} value={segment.selectedDN ?? ''} onChange={e => updateSegment(segment.id, { selectedDN: e.target.value })} placeholder="DN" className={inputCls()} />
              <input name={`segment_length_${segment.id}`} type="number" value={segment.lengthM} onChange={e => updateSegment(segment.id, { lengthM: Number(e.target.value) })} placeholder="Uzunluk" className={inputCls()} />
              <input name={`segment_height_${segment.id}`} type="number" value={segment.heightDifferenceM ?? 0} onChange={e => updateSegment(segment.id, { heightDifferenceM: Number(e.target.value) })} placeholder="Yükseklik" className={inputCls()} />
              <input name={`segment_screw_elbow_${segment.id}`} type="number" defaultValue={segment.screwElbow90Count ?? 0} placeholder="Vidalı dirsek" className={inputCls()} />
              <input name={`segment_welded_elbow_${segment.id}`} type="number" defaultValue={segment.weldedElbow90Count ?? 0} placeholder="Kaynak dirsek" className={inputCls()} />
              <input name={`segment_tee_${segment.id}`} type="number" defaultValue={segment.teeReducerCount ?? 0} placeholder="Tee" className={inputCls()} />
              <input name={`segment_gate_${segment.id}`} type="number" defaultValue={segment.gateValveCount ?? 0} placeholder="Sürgülü vana" className={inputCls()} />
              <input name={`segment_swing_check_${segment.id}`} type="number" defaultValue={segment.checkValveSwingCount ?? 0} placeholder="Çekvalf döner" className={inputCls()} />
              <input name={`segment_lift_check_${segment.id}`} type="number" defaultValue={segment.checkValveLiftCount ?? 0} placeholder="Çekvalf mantar" className={inputCls()} />
              <input name={`segment_butterfly_${segment.id}`} type="number" defaultValue={segment.butterflyValveCount ?? 0} placeholder="Kelebek" className={inputCls()} />
              <input name={`segment_ball_${segment.id}`} type="number" defaultValue={segment.ballValveCount ?? 0} placeholder="Küresel" className={inputCls()} />
              <input name={`segment_flex_${segment.id}`} type="number" defaultValue={segment.flexHoseCount ?? 0} placeholder="Flex" className={inputCls()} />
              <button type="button" onClick={() => setSegments(prev => prev.filter(row => row.id !== segment.id))} className="rounded-md border px-2 py-2 text-xs text-red-600 dark:border-gray-600">Sil</button>
            </div>
          ))}
        </div>
      </div>
      <label className="block text-sm">Hidrolik Notlar<textarea name="hydraulic_notes" rows={3} defaultValue={inputData.notes ?? ''} className={inputCls()} /></label>
      <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-900">{WATER_HYDRAULIC_WARNING}</div>
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

function largeInputCls() {
  return 'w-full rounded-lg border px-4 py-3 text-base dark:border-gray-600'
}

function VentilationFields({ inputData, report }: { inputData: any; report?: TechnicalReportRow }) {
  const [virtualExit, setVirtualExit] = useState(Boolean(inputData.cikis_olcumu_yapilamadi ?? false))
  const [mode, setMode] = useState<VentilationEvaluationMode>(inputData.degerlendirme_modu ?? 'otomatik')
  const legacySection = inputData.kesit_tipi
    ? {
        tip: inputData.kesit_tipi,
        manuel_kesit_adi: inputData.manuel_kesit_adi,
        dairesel_cap_mm: inputData.dairesel_cap_mm,
        dikdortgen_en_mm: inputData.dikdortgen_en_mm,
        dikdortgen_boy_mm: inputData.dikdortgen_boy_mm,
        kare_kenar_mm: inputData.kare_kenar_mm,
        manuel_kesit_alani_m2: inputData.manuel_kesit_alani_m2,
      }
    : undefined
  return (
    <section className="space-y-5 rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div>
        <h2 className="text-base font-semibold">Havalandırma Test Raporu</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="text-sm font-medium">Firma / Kurum<input name="firma_kurum" defaultValue={inputData.firma_kurum ?? report?.customer_name_snapshot ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Test Tarihi<input name="test_tarihi" type="date" defaultValue={inputData.test_tarihi ?? report?.rapor_tarihi ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Test Yapılan Mahal<input name="test_yapilan_mahal" defaultValue={inputData.test_yapilan_mahal ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Sistem Tipi<input name="havalandirma_sistem_tipi" defaultValue={inputData.sistem_tipi ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Tekniker Adı Soyadı<input name="tekniker_ad_soyad" defaultValue={inputData.tekniker_ad_soyad ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Ekipnet Numarası<input name="ekipnet_no" defaultValue={inputData.ekipnet_no ?? ''} className={largeInputCls()} /></label>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 md:grid-cols-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold md:col-span-3">Ölçüm Cihazı</h3>
        <label className="text-sm font-medium">Marka<input name="cihaz_marka" defaultValue={inputData.cihaz_marka ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Model<input name="cihaz_model" defaultValue={inputData.cihaz_model ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium">Seri No<input name="cihaz_seri_no" defaultValue={inputData.cihaz_seri_no ?? ''} className={largeInputCls()} /></label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VentilationSectionCard title="Giriş Kesiti" prefix="giris" values={inputData.giris_kesit ?? legacySection} fallbackType="dikdortgen" />
        <VentilationSectionCard title="Çıkış Kesiti" prefix="cikis" values={inputData.cikis_kesit ?? legacySection} fallbackType="dairesel" />
      </div>

      <div className="rounded-lg border p-4 dark:border-gray-700">
        <h3 className="mb-3 text-sm font-semibold">Kanal Bilgileri</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Havalandırma Uzunluğu m<input name="havalandirma_uzunlugu_m" type="number" min="0" step="0.1" defaultValue={inputData.havalandirma_uzunlugu_m ?? 0} className={largeInputCls()} /></label>
          <label className="text-sm font-medium">Dirsek Sayısı<input name="dirsek_sayisi" type="number" min="0" defaultValue={inputData.dirsek_sayisi ?? 0} className={largeInputCls()} /></label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <FivePointMeasurement title="Giriş" prefix="giris" values={inputData.giris_olcumleri} disabled={false} />
        <FivePointMeasurement title="Çıkış" prefix="cikis" values={inputData.cikis_olcumleri} disabled={virtualExit} />
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 md:grid-cols-3 dark:border-gray-700">
        <label className="flex items-center gap-3 text-sm font-medium">
          <input name="cikis_olcumu_yapilamadi" type="checkbox" checked={virtualExit} onChange={e => setVirtualExit(e.target.checked)} />
          Çıkış ölçümü yapılamadı
        </label>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input name="sanal_cikis_hesabi" type="checkbox" defaultChecked={inputData.sanal_cikis_hesabi ?? true} />
          Sanal çıkış hesabı
        </label>
        <label className="text-sm font-medium">Sonuç Modu<select name="degerlendirme_modu" value={mode} onChange={e => setMode(e.target.value as VentilationEvaluationMode)} className={largeInputCls()}><option value="otomatik">Otomatik</option><option value="manuel">Manuel Değerlendirme</option></select></label>
        {mode === 'manuel' && (
          <>
            <label className="text-sm font-medium">Manuel Sonuç<select name="manuel_sonuc" defaultValue={inputData.manuel_sonuc ?? 'Manuel Değerlendirme Gerekli'} className={largeInputCls()}>{['Manuel Değerlendirme Gerekli','Şartlı Uygun','Uygun','Uygun Değil'].map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-sm font-medium md:col-span-3">Manuel Değerlendirme<textarea name="manuel_degerlendirme" rows={3} defaultValue={inputData.manuel_degerlendirme ?? ''} className={largeInputCls()} /></label>
          </>
        )}
        <label className="text-sm font-medium md:col-span-3">Debi Artışı Açıklaması<textarea name="debi_artisi_aciklama" rows={3} defaultValue={inputData.debi_artisi_aciklama ?? ''} className={largeInputCls()} /></label>
        <label className="text-sm font-medium md:col-span-3">Ölçüm Notları<textarea name="olcum_notlari" rows={3} defaultValue={inputData.olcum_notlari ?? ''} className={largeInputCls()} /></label>
      </div>
    </section>
  )
}

function VentilationSectionCard({ title, prefix, values, fallbackType }: { title: string; prefix: 'giris' | 'cikis'; values?: Partial<VentilationSectionInput>; fallbackType: VentilationSectionType }) {
  const [sectionType, setSectionType] = useState<VentilationSectionType>(values?.tip ?? fallbackType)
  return (
    <div className="rounded-lg border p-4 dark:border-gray-700">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <input type="hidden" name={`${prefix}_kesit_tipi`} value={sectionType} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['dairesel', 'Dairesel'],
          ['dikdortgen', 'Dikdörtgen'],
          ['kare', 'Kare'],
          ['manuel', 'Manuel Alan'],
        ].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setSectionType(value as VentilationSectionType)} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${sectionType === value ? 'border-[#C8102E] bg-red-50 text-[#C8102E]' : 'dark:border-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {sectionType === 'dairesel' && <label className="text-sm font-medium">Çap mm<input name={`${prefix}_dairesel_cap_mm`} type="number" min="0" defaultValue={values?.dairesel_cap_mm ?? 250} className={largeInputCls()} /></label>}
        {sectionType === 'dikdortgen' && (
          <>
            <label className="text-sm font-medium">En mm<input name={`${prefix}_dikdortgen_en_mm`} type="number" min="0" defaultValue={values?.dikdortgen_en_mm ?? 400} className={largeInputCls()} /></label>
            <label className="text-sm font-medium">Boy mm<input name={`${prefix}_dikdortgen_boy_mm`} type="number" min="0" defaultValue={values?.dikdortgen_boy_mm ?? 200} className={largeInputCls()} /></label>
          </>
        )}
        {sectionType === 'kare' && <label className="text-sm font-medium">Kenar mm<input name={`${prefix}_kare_kenar_mm`} type="number" min="0" defaultValue={values?.kare_kenar_mm ?? 300} className={largeInputCls()} /></label>}
        {sectionType === 'manuel' && (
          <>
            <label className="text-sm font-medium">Manuel Kesit Adı<input name={`${prefix}_manuel_kesit_adi`} defaultValue={values?.manuel_kesit_adi ?? ''} className={largeInputCls()} /></label>
            <label className="text-sm font-medium">Kesit Alanı m²<input name={`${prefix}_manuel_kesit_alani_m2`} type="number" min="0" step="0.0001" defaultValue={values?.manuel_kesit_alani_m2 ?? 0} className={largeInputCls()} /></label>
          </>
        )}
      </div>
    </div>
  )
}

function FivePointMeasurement({ title, prefix, values, disabled }: { title: string; prefix: 'giris' | 'cikis'; values?: any; disabled: boolean }) {
  const point = (key: 'ust' | 'alt' | 'sag' | 'sol' | 'orta', label: string, className = '') => (
    <label className={`text-xs font-semibold text-gray-600 ${className}`}>
      {label}
      <input name={`${prefix}_${key}`} type="number" step="0.01" min="0" disabled={disabled} defaultValue={values?.[key] ?? ''} className={`${largeInputCls()} mt-1 text-center disabled:bg-gray-100`} />
    </label>
  )
  return (
    <div className="rounded-lg border p-4 dark:border-gray-700">
      <h3 className="mb-3 text-sm font-semibold">{title} 5 Nokta Ölçüm Şablonu</h3>
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-3">
        <div />
        {point('ust', 'Üst')}
        <div />
        {point('sol', 'Sol')}
        {point('orta', 'Orta')}
        {point('sag', 'Sağ')}
        <div />
        {point('alt', 'Alt')}
        <div />
      </div>
    </div>
  )
}

function VentilationResultCards({ result }: { result: any }) {
  const cards = [
    ['Ortalama Hız', `${result.ortalama_hiz_ms ?? 0} m/s`],
    ['Min / Max Hız', `${result.minimum_hiz_ms ?? 0} / ${result.maksimum_hiz_ms ?? 0} m/s`],
    ['Giriş Kesit Alanı', `${result.giris_kesit_alani_m2 ?? 0} m²`],
    ['Çıkış Kesit Alanı', `${result.cikis_kesit_alani_m2 ?? 0} m²`],
    ['Giriş Debisi', `${result.giris_debi_m3_s ?? 0} m³/s · ${result.giris_debi_m3_h ?? 0} m³/h`],
    ['Çıkış Debisi', `${result.cikis_debi_m3_s ?? 0} m³/s · ${result.cikis_debi_m3_h ?? 0} m³/h`],
    ['Kayıp Oranı', result.debi_artisi_var ? 'Debi artışı' : `%${result.kayip_orani_yuzde ?? 0}`],
    ['Sonuç', result.degerlendirme ?? '-'],
  ]
  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md bg-gray-50 p-3 dark:bg-gray-900">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-base font-bold">{value}</div>
          </div>
        ))}
      </div>
      <div className={`rounded-lg border p-3 text-xs ${result.sanal_cikis_kullanildi || result.debi_artisi_var ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-green-200 bg-green-50 text-green-900'}`}>
        {result.otomatik_degerlendirme}
        {result.debi_artisi_var && <div className="mt-1 font-semibold">Önerilen sonuç: Manuel Değerlendirme Gerekli veya {result.alternatif_sonuc_onerisi}.</div>}
      </div>
      {Array.isArray(result.oneriler) && result.oneriler.length > 0 && (
        <ul className="list-disc space-y-1 rounded-lg border border-gray-200 bg-white p-3 pl-6 text-xs dark:border-gray-700 dark:bg-gray-900">
          {result.oneriler.map((item: string) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
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
