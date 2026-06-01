import { materialItem, mergeSameMaterials } from './material-list'
import type { MaterialListItem, TechnicalSetting } from './types'

export const WATER_SYSTEM_WARNING =
  'Bu hesap ön keşif ve teklif destek hesabıdır. Nihai proje, hidrolik hesap, uygulama ve onay süreçleri yürürlükteki yönetmelik, ilgili standartlar ve yetkili mühendis kontrolü ile yapılmalıdır.'

export type WaterRiskClass = 'az_riskli' | 'orta_riskli' | 'riskli' | 'cok_riskli'

export type WaterSystemInput = {
  bina_tipi: string
  risk_sinifi: WaterRiskClass
  kat_sayisi: number
  kat_alani_m2: number
  toplam_alan_m2: number
  bina_yuksekligi_m: number
  cephe_uzunlugu_m: number
  tesis_cevre_m: number
  yangin_dolabi_gerekli: boolean
  hidrant_gerekli: boolean
  ana_hat_uzunlugu_m: number
  kolon_hatti_uzunlugu_m: number
  esdeger_parca_orani: number
  hedef_cikis_basinci_kpa: number
  elektrik_yedekli: boolean
  dizel_yedekli: boolean
  aciklama: string
}

export type WaterSystemSettings = {
  yangin_dolabi_kapsama_yaricapi: number
  kat_basi_minimum_yangin_dolabi: number
  yangin_dolabi_debi: number
  es_zamanli_yangin_dolabi_sayisi: number
  hidrant_minimum_dizayn_debisi: number
  hidrant_cikis_basinci: number
  hidrant_mesafe_az_riskli: number
  hidrant_mesafe_orta_riskli: number
  hidrant_mesafe_riskli: number
  hidrant_mesafe_cok_riskli: number
  pompa_emniyet_katsayisi: number
  pompa_verimi: number
  motor_emniyet_katsayisi: number
  jokey_pompa_debi_orani: number
  jokey_pompa_min_debi: number
  yangin_dolabi_hat_hiz_limit: number
  hidrant_hat_hiz_limit: number
  hazen_williams_c_degeri: number
  yangin_suyu_suresi: number
}

export type WaterSystemCalculationResult = {
  yangin_dolabi_adedi: number
  hidrant_adedi: number
  tasarim_debisi_l_dak: number
  tasarim_debisi_m3_h: number
  boru_cap_mm: number
  boru_hizi_m_s: number
  boru_uzunlugu_m: number
  surtunme_kaybi_mSS: number
  statik_yukseklik_m: number
  hedef_cikis_basinci_kpa: number
  basinc_ihtiyaci_kpa: number
  basinc_ihtiyaci_bar: number
  pompa_gucu_kw: number
  motor_gucu_kw: number
  pompa_tipi: string
  jokey_pompa_debisi_l_dak: number
  jokey_pompa_basinci_kpa: number
  yangin_suyu_deposu_m3: number
  uyarilar: string[]
  hesap_ozeti: Array<{ label: string; value: string }>
}

export const defaultWaterSystemSettings: WaterSystemSettings = {
  yangin_dolabi_kapsama_yaricapi: 30,
  kat_basi_minimum_yangin_dolabi: 1,
  yangin_dolabi_debi: 100,
  es_zamanli_yangin_dolabi_sayisi: 2,
  hidrant_minimum_dizayn_debisi: 1900,
  hidrant_cikis_basinci: 700,
  hidrant_mesafe_az_riskli: 150,
  hidrant_mesafe_orta_riskli: 125,
  hidrant_mesafe_riskli: 100,
  hidrant_mesafe_cok_riskli: 50,
  pompa_emniyet_katsayisi: 1.1,
  pompa_verimi: 0.65,
  motor_emniyet_katsayisi: 1.15,
  jokey_pompa_debi_orani: 0.05,
  jokey_pompa_min_debi: 10,
  yangin_dolabi_hat_hiz_limit: 3,
  hidrant_hat_hiz_limit: 4,
  hazen_williams_c_degeri: 120,
  yangin_suyu_suresi: 60,
}

export const waterSystemDefaultSettingRows = [
  ['yangin_dolabi_kapsama_yaricapi', '30', 'm', 'Yangın dolabı yaklaşık hortum/kapsama yarıçapı'],
  ['kat_basi_minimum_yangin_dolabi', '1', 'adet', 'Kat başına minimum yangın dolabı adedi'],
  ['yangin_dolabi_debi', '100', 'l/dak', 'Bir yangın dolabı için varsayılan keşif debisi'],
  ['es_zamanli_yangin_dolabi_sayisi', '2', 'adet', 'Aynı anda çalışacağı varsayılan yangın dolabı sayısı'],
  ['hidrant_minimum_dizayn_debisi', '1900', 'l/dak', 'Hidrant sistemi minimum dizayn debisi'],
  ['hidrant_cikis_basinci', '700', 'kPa', 'Hidrant çıkışında hedef basınç'],
  ['hidrant_mesafe_az_riskli', '150', 'm', 'Az riskli bölgelerde hidrantlar arası yaklaşık mesafe'],
  ['hidrant_mesafe_orta_riskli', '125', 'm', 'Orta riskli bölgelerde hidrantlar arası yaklaşık mesafe'],
  ['hidrant_mesafe_riskli', '100', 'm', 'Riskli bölgelerde hidrantlar arası yaklaşık mesafe'],
  ['hidrant_mesafe_cok_riskli', '50', 'm', 'Çok riskli bölgelerde hidrantlar arası yaklaşık mesafe'],
  ['pompa_emniyet_katsayisi', '1.1', 'katsayı', 'Debi/basınç için varsayılan emniyet katsayısı'],
  ['pompa_verimi', '0.65', 'oran', 'Pompa güç hesabı için varsayılan verim'],
  ['motor_emniyet_katsayisi', '1.15', 'katsayı', 'Motor gücü seçiminde kullanılan emniyet katsayısı'],
  ['jokey_pompa_debi_orani', '0.05', 'oran', 'Jokey pompa debisi için ana debiye göre oran'],
  ['jokey_pompa_min_debi', '10', 'l/dak', 'Minimum jokey pompa debisi'],
  ['yangin_dolabi_hat_hiz_limit', '3', 'm/s', 'Yangın dolabı hattı için varsayılan maksimum su hızı'],
  ['hidrant_hat_hiz_limit', '4', 'm/s', 'Hidrant ana hattı için varsayılan maksimum su hızı'],
  ['hazen_williams_c_degeri', '120', 'C', 'Çelik boru için varsayılan Hazen-Williams C değeri'],
  ['yangin_suyu_suresi', '60', 'dk', 'Ön keşif için varsayılan yangın suyu süresi'],
] as const

export function parseWaterSystemSettings(settings: TechnicalSetting[]): WaterSystemSettings {
  const parsed = { ...defaultWaterSystemSettings }
  for (const key of Object.keys(parsed) as Array<keyof WaterSystemSettings>) {
    const row = settings.find(s => s.ayar_grubu === 'yangin_sulu_sistem' && s.ayar_adi === key)
    const value = Number(row?.ayar_degeri)
    if (Number.isFinite(value)) parsed[key] = value
  }
  return parsed
}

function positive(value: number, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function riskDistance(input: WaterSystemInput, settings: WaterSystemSettings) {
  const map: Record<WaterRiskClass, number> = {
    az_riskli: settings.hidrant_mesafe_az_riskli,
    orta_riskli: settings.hidrant_mesafe_orta_riskli,
    riskli: settings.hidrant_mesafe_riskli,
    cok_riskli: settings.hidrant_mesafe_cok_riskli,
  }
  return positive(map[input.risk_sinifi], settings.hidrant_mesafe_orta_riskli)
}

function selectNominalDiameter(requiredMm: number) {
  const sizes = [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300]
  return sizes.find(size => size >= requiredMm) ?? 300
}

function selectPumpType(input: WaterSystemInput, flow: number) {
  if (input.hidrant_gerekli || flow >= 1000) {
    if (input.dizel_yedekli) return 'Elektrik + dizel yedekli yangın pompa grubu'
    if (input.elektrik_yedekli) return 'Çift elektrik pompalı yangın pompa grubu'
    return 'Ana elektrik pompalı yangın pompa grubu'
  }
  return 'Yangın hidroforu / kompakt yangın pompa grubu'
}

export function calculateWaterSystem(input: WaterSystemInput, rawSettings: TechnicalSetting[]) {
  const settings = parseWaterSystemSettings(rawSettings)
  const floorCount = Math.max(1, Math.ceil(positive(input.kat_sayisi, 1)))
  const totalArea = positive(input.toplam_alan_m2, positive(input.kat_alani_m2) * floorCount)
  const floorArea = positive(input.kat_alani_m2, totalArea / floorCount)
  const cabinetCoverageArea = Math.PI * settings.yangin_dolabi_kapsama_yaricapi ** 2
  const cabinetsByArea = input.yangin_dolabi_gerekli ? Math.ceil(floorArea / cabinetCoverageArea) * floorCount : 0
  const minCabinets = input.yangin_dolabi_gerekli ? floorCount * settings.kat_basi_minimum_yangin_dolabi : 0
  const cabinetCount = Math.max(cabinetsByArea, minCabinets)

  const hydrantDistance = riskDistance(input, settings)
  const hydrantBaseLength = positive(input.tesis_cevre_m, positive(input.cephe_uzunlugu_m))
  const hydrantCount = input.hidrant_gerekli ? Math.max(1, Math.ceil(hydrantBaseLength / hydrantDistance)) : 0

  const cabinetFlow = input.yangin_dolabi_gerekli
    ? settings.yangin_dolabi_debi * Math.min(cabinetCount || 1, settings.es_zamanli_yangin_dolabi_sayisi)
    : 0
  const hydrantFlow = input.hidrant_gerekli ? settings.hidrant_minimum_dizayn_debisi : 0
  const designFlow = Math.max(cabinetFlow + hydrantFlow, cabinetFlow, hydrantFlow)
  const flowM3S = designFlow / 60000
  const velocityLimit = input.hidrant_gerekli ? settings.hidrant_hat_hiz_limit : settings.yangin_dolabi_hat_hiz_limit
  const requiredDiameterM = Math.sqrt((4 * flowM3S) / (Math.PI * positive(velocityLimit, 3)))
  const pipeDiameterMm = selectNominalDiameter(requiredDiameterM * 1000)
  const pipeDiameterM = pipeDiameterMm / 1000
  const pipeVelocity = flowM3S > 0 ? flowM3S / (Math.PI * pipeDiameterM ** 2 / 4) : 0

  const basePipeLength = positive(input.ana_hat_uzunlugu_m) + positive(input.kolon_hatti_uzunlugu_m)
  const estimatedPipeLength = basePipeLength || Math.max(50, floorCount * 8 + Math.sqrt(totalArea) * 2 + hydrantCount * hydrantDistance * 0.4)
  const equivalentRatio = positive(input.esdeger_parca_orani, 20) / 100
  const pipeLength = estimatedPipeLength * (1 + equivalentRatio)
  const c = positive(settings.hazen_williams_c_degeri, 120)
  const frictionLoss = flowM3S > 0
    ? 10.67 * pipeLength * flowM3S ** 1.852 / (c ** 1.852 * pipeDiameterM ** 4.87)
    : 0

  const outletPressureKpa = positive(input.hedef_cikis_basinci_kpa, input.hidrant_gerekli ? settings.hidrant_cikis_basinci : 400)
  const outletHeadM = outletPressureKpa / 9.80665
  const staticHeight = positive(input.bina_yuksekligi_m, floorCount * 3)
  const totalHead = (outletHeadM + staticHeight + frictionLoss) * settings.pompa_emniyet_katsayisi
  const requiredPressureKpa = totalHead * 9.80665
  const pumpPowerKw = flowM3S > 0 ? 1000 * 9.80665 * flowM3S * totalHead / (settings.pompa_verimi * 1000) : 0
  const motorPowerKw = pumpPowerKw * settings.motor_emniyet_katsayisi
  const jockeyFlow = Math.max(settings.jokey_pompa_min_debi, designFlow * settings.jokey_pompa_debi_orani)
  const waterTankM3 = designFlow * settings.yangin_suyu_suresi / 1000
  const warnings = [
    WATER_SYSTEM_WARNING,
    pipeVelocity > velocityLimit ? 'Seçilen boru çapında hız limiti aşılıyor; daha büyük çap değerlendirilmelidir.' : '',
    hydrantCount === 0 && input.hidrant_gerekli ? 'Hidrant çevre/cephe bilgileri eksik olduğu için minimum hidrant kabulü yapıldı.' : '',
  ].filter(Boolean)

  const calculationResult: WaterSystemCalculationResult = {
    yangin_dolabi_adedi: cabinetCount,
    hidrant_adedi: hydrantCount,
    tasarim_debisi_l_dak: round(designFlow, 0),
    tasarim_debisi_m3_h: round(designFlow * 0.06, 1),
    boru_cap_mm: pipeDiameterMm,
    boru_hizi_m_s: round(pipeVelocity, 2),
    boru_uzunlugu_m: round(pipeLength, 1),
    surtunme_kaybi_mSS: round(frictionLoss, 1),
    statik_yukseklik_m: round(staticHeight, 1),
    hedef_cikis_basinci_kpa: round(outletPressureKpa, 0),
    basinc_ihtiyaci_kpa: round(requiredPressureKpa, 0),
    basinc_ihtiyaci_bar: round(requiredPressureKpa / 100, 2),
    pompa_gucu_kw: round(pumpPowerKw, 1),
    motor_gucu_kw: round(motorPowerKw, 1),
    pompa_tipi: selectPumpType(input, designFlow),
    jokey_pompa_debisi_l_dak: round(jockeyFlow, 0),
    jokey_pompa_basinci_kpa: round(requiredPressureKpa, 0),
    yangin_suyu_deposu_m3: round(waterTankM3, 1),
    uyarilar: warnings,
    hesap_ozeti: [],
  }
  calculationResult.hesap_ozeti = [
    { label: 'Yangın Dolabı', value: `${calculationResult.yangin_dolabi_adedi} adet` },
    { label: 'Hidrant', value: `${calculationResult.hidrant_adedi} adet` },
    { label: 'Tasarım Debisi', value: `${calculationResult.tasarim_debisi_l_dak} l/dak` },
    { label: 'Boru Çapı', value: `DN${calculationResult.boru_cap_mm}` },
    { label: 'Basınç', value: `${calculationResult.basinc_ihtiyaci_bar} bar` },
    { label: 'Motor Gücü', value: `${calculationResult.motor_gucu_kw} kW` },
  ]

  const materials: MaterialListItem[] = [
    ...(cabinetCount > 0 ? [materialItem('yangin_dolabi_hidrant_pompa', 'Yangın dolabı seti', 'Sulu Sistem', cabinetCount, 'adet', 'Dolap, hortum, lans ve vana seti')] : []),
    ...(hydrantCount > 0 ? [materialItem('yangin_dolabi_hidrant_pompa', 'Yangın hidrantı', 'Sulu Sistem', hydrantCount, 'adet', `Yaklaşık ${hydrantDistance} m aralıkla`)] : []),
    materialItem('yangin_dolabi_hidrant_pompa', `Çelik yangın borusu DN${pipeDiameterMm}`, 'Boru Tesisatı', pipeLength, 'm', 'Hazen-Williams ön hesaba göre yaklaşık metraj'),
    materialItem('yangin_dolabi_hidrant_pompa', calculationResult.pompa_tipi, 'Pompa Grubu', 1, 'set', `${calculationResult.tasarim_debisi_l_dak} l/dak, ${calculationResult.basinc_ihtiyaci_bar} bar`),
    materialItem('yangin_dolabi_hidrant_pompa', 'Jokey pompa', 'Pompa Grubu', 1, 'adet', `${calculationResult.jokey_pompa_debisi_l_dak} l/dak`),
    materialItem('yangin_dolabi_hidrant_pompa', 'Yangın suyu deposu', 'Su Deposu', calculationResult.yangin_suyu_deposu_m3, 'm³', `${settings.yangin_suyu_suresi} dakika yangın suyu kabulü`),
    materialItem('yangin_dolabi_hidrant_pompa', 'Vana, çekvalf, kompansatör ve bağlantı ekipmanları', 'Tesisat Ekipmanı', 1, 'lot', 'Ön keşif yaklaşık ekipman paketi'),
  ]

  return {
    calculation_result: calculationResult,
    material_list: mergeSameMaterials(materials),
  }
}
