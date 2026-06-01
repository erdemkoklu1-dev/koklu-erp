import { materialItem, mergeSameMaterials } from './material-list'
import { calculateFirePump } from './fire-pump-calculator'
import { calculatePipeSegments } from './hydraulic-pipe-calculator'
import { calculateRingLine } from './ring-line-calculator'
import { calculateSprinkler } from './sprinkler-calculator'
import { buildWaterSystemSketch } from './water-system-sketch'
import { calculateWaterTank } from './water-tank-calculator'
import type { MaterialListItem, TechnicalSetting } from './types'
import type {
  CabinetCalculationResult,
  HydrantCalculationResult,
  WaterCalculationMode,
  WaterHydraulicCalculationResult,
  WaterHydraulicInput,
  WaterHydraulicSettings,
  WaterSystemMaterialItem,
} from './water-hydraulic-types'

export const WATER_HYDRAULIC_WARNING =
  'Bu hesap ön keşif, teklif ve yaklaşık teknik değerlendirme amacıyla hazırlanmıştır. Nihai proje, hidrolik hesap, uygulama ve onay süreçleri yürürlükteki yönetmelik, ilgili standartlar, üretici pompa eğrileri ve yetkili mühendis kontrolü ile yapılmalıdır.'

export const defaultHydraulicSettings = [
  { group: 'yangin_hidrolik', key: 'sprinkler_varsayilan_k_faktoru', value: '80', unit: 'K', type: 'number', description: 'Sprinkler varsayılan K faktörü metrik' },
  { group: 'yangin_hidrolik', key: 'sprinkler_min_akma_basinci', value: '0.56', unit: 'bar', type: 'number', description: 'Sprinkler minimum akma basıncı' },
  { group: 'yangin_hidrolik', key: 'duvar_tipi_sprinkler_min_basinci', value: '1', unit: 'bar', type: 'number', description: 'Duvar tipi sprinkler için minimum basınç' },
  { group: 'yangin_hidrolik', key: 'sprinkler_koruma_alani', value: '12', unit: 'm²', type: 'number', description: 'Bir sprinkler için varsayılan koruma alanı' },
  { group: 'yangin_hidrolik', key: 'sprinkler_mudahale_suresi', value: '60', unit: 'dk', type: 'number', description: 'Sprinkler sistemi yangın suyu süresi' },
  { group: 'yangin_hidrolik', key: 'su_deposu_emniyet_katsayisi', value: '1.1', unit: 'katsayı', type: 'number', description: 'Yangın su deposu için emniyet katsayısı' },
  { group: 'yangin_hidrolik', key: 'varsayilan_hazen_williams_c', value: '120', unit: 'C', type: 'number', description: 'Siyah çelik boru için varsayılan C katsayısı' },
  { group: 'yangin_hidrolik', key: 'hidrostatik_basinc_katsayisi', value: '0.098', unit: 'bar/m', type: 'number', description: 'Yükseklik kaynaklı basınç kaybı katsayısı' },
] as const

export function parseWaterHydraulicSettings(settings: TechnicalSetting[]): WaterHydraulicSettings {
  const parsed: WaterHydraulicSettings = {}
  for (const row of defaultHydraulicSettings) {
    const setting = settings.find(s => s.ayar_grubu === row.group && s.ayar_adi === row.key)
    const value = Number(setting?.ayar_degeri ?? row.value)
    parsed[row.key] = Number.isFinite(value) ? value : Number(row.value)
  }
  return parsed
}

export function modeFlags(mode: WaterCalculationMode) {
  return {
    cabinet: mode.includes('dolap'),
    hydrant: mode.includes('hidrant'),
    sprinkler: mode.includes('sprinkler'),
  }
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function calculateCabinet(input: WaterHydraulicInput): CabinetCalculationResult | undefined {
  if (!input.cabinet.enabled) return undefined
  const floorCount = Math.max(1, input.floorCount ?? 1)
  const calculatedCount = Math.max(1, floorCount)
  const manualCount = Number(input.cabinet.manualFireCabinetCount || input.cabinet.fireCabinetCount || 0)
  const cabinetCount = Math.max(calculatedCount, Number.isFinite(manualCount) ? manualCount : 0)
  const simultaneousCabinetCount = Math.min(cabinetCount, Math.max(1, input.cabinet.simultaneousCabinetCount || 2))
  return {
    cabinetCount,
    simultaneousCabinetCount,
    flowPerCabinetLpm: input.cabinet.flowPerCabinetLpm,
    totalCabinetFlowLpm: simultaneousCabinetCount * input.cabinet.flowPerCabinetLpm,
    endpointPressureBar: input.cabinet.endpointPressureBar,
  }
}

function calculateHydrant(input: WaterHydraulicInput): HydrantCalculationResult | undefined {
  if (!input.hydrant.enabled) return undefined
  const spacing = Math.max(1, input.hydrant.hydrantSpacingM || 100)
  const calculatedCount = Math.max(1, Math.ceil((input.hydrant.sitePerimeterM || 0) / spacing))
  const manualCount = Number(input.hydrant.manualHydrantCount || input.hydrant.hydrantCount || 0)
  const hydrantCount = Math.max(calculatedCount, Number.isFinite(manualCount) ? manualCount : 0)
  const ring = input.hydrant.ringLineEnabled
    ? calculateRingLine(input.hydrant.minimumDesignFlowLpm, input.hydrant.rightRingLengthM, input.hydrant.leftRingLengthM)
    : undefined
  return {
    hydrantCount,
    hydrantSpacingM: spacing,
    totalHydrantFlowLpm: input.hydrant.minimumDesignFlowLpm,
    endpointPressureBar: input.hydrant.endpointPressureBar,
    ringLineEnabled: Boolean(input.hydrant.ringLineEnabled),
    rightRingFlowLpm: ring?.rightFlowLpm,
    leftRingFlowLpm: ring?.leftFlowLpm,
    ringWarning: ring?.warning,
  }
}

function combinedDesignFlow(input: {
  mode: WaterCalculationMode
  cabinet?: CabinetCalculationResult
  hydrant?: HydrantCalculationResult
  sprinklerFlowLpm?: number
  designFlowMode?: 'en_buyuk_senaryo' | 'es_zamanli_toplam'
}) {
  const flows = [
    input.cabinet?.totalCabinetFlowLpm ?? 0,
    input.hydrant?.totalHydrantFlowLpm ?? 0,
    input.sprinklerFlowLpm ?? 0,
  ]
  const designFlowLpm = input.designFlowMode === 'es_zamanli_toplam' ? flows.reduce((a, b) => a + b, 0) : Math.max(...flows)
  return {
    designFlowLpm,
    designFlowM3h: designFlowLpm * 0.06,
  }
}

function endpointPressureBar(input: WaterHydraulicInput, result: { cabinet?: CabinetCalculationResult; hydrant?: HydrantCalculationResult; sprinklerPressure?: number }) {
  return Math.max(
    input.cabinet.enabled ? result.cabinet?.endpointPressureBar ?? 0 : 0,
    input.hydrant.enabled ? result.hydrant?.endpointPressureBar ?? 0 : 0,
    input.sprinkler.enabled ? result.sprinklerPressure ?? 0 : 0,
    4
  )
}

function buildMaterials(input: WaterHydraulicInput, result: WaterHydraulicCalculationResult): WaterSystemMaterialItem[] {
  const items: WaterSystemMaterialItem[] = []
  if (result.cabinet) {
    items.push(
      { name: 'Yangın Dolabı', category: 'Dolap', quantity: result.cabinet.cabinetCount, unit: 'adet', explanation: 'Dolap gövdesi', source: 'dolap' },
      { name: 'Yangın Dolabı Hortum/Lans Seti', category: 'Dolap', quantity: result.cabinet.cabinetCount, unit: 'set', explanation: 'Hortum ve lans seti', source: 'dolap' },
      { name: 'Dolap Vanası', category: 'Dolap', quantity: result.cabinet.cabinetCount, unit: 'adet', explanation: 'Dolap bağlantı vanası', source: 'dolap' }
    )
  }
  if (result.hydrant) {
    items.push(
      { name: 'Yerüstü Yangın Hidrantı', category: 'Hidrant', quantity: result.hydrant.hydrantCount, unit: 'adet', explanation: 'Dış saha hidrantı', source: 'hidrant' },
      { name: 'Hidrant Ring Hattı Borusu', category: 'Hidrant', quantity: result.pipeSummary.totalPipeLengthM, unit: 'm', explanation: 'Yaklaşık ring/ana hat borusu', source: 'hidrant' },
      { name: 'İtfaiye Bağlantı Ağzı', category: 'Hidrant', quantity: 1, unit: 'adet', explanation: 'Sistem besleme bağlantısı', source: 'hidrant' }
    )
  }
  if (result.sprinkler) {
    items.push(
      { name: 'Sprinkler Başlığı', category: 'Sprinkler', quantity: result.sprinkler.selectedSprinklerCount, unit: 'adet', explanation: `${input.sprinkler.kFactorMetric} K faktörü`, source: 'sprinkler' },
      { name: 'Alarm Vanası', category: 'Sprinkler', quantity: 1, unit: 'set', explanation: 'Sprinkler alarm vana seti', source: 'sprinkler' },
      { name: 'Test ve Drenaj Hattı', category: 'Sprinkler', quantity: 1, unit: 'set', explanation: 'Test drenaj ekipmanı', source: 'sprinkler' },
      { name: 'Sprinkler Borusu', category: 'Sprinkler', quantity: result.pipeSummary.totalPipeLengthM, unit: 'm', explanation: 'Yaklaşık sprinkler boru metrajı', source: 'sprinkler' }
    )
  }
  items.push(
    { name: 'Yangın Pompa Seti', category: 'Pompa', quantity: 1, unit: 'set', explanation: result.pump.pumpSetDescription, source: 'pompa' },
    { name: 'Jokey Pompa', category: 'Pompa', quantity: input.pump.includeJockeyPump ? 1 : 0, unit: 'adet', explanation: `${result.pump.jockeyPumpFlowLpm} l/dak`, source: 'pompa' },
    { name: 'Pompa Kontrol Panosu', category: 'Pompa', quantity: 1, unit: 'adet', explanation: 'Pompa otomasyon/kontrol panosu', source: 'pompa' },
    { name: 'Yangın Su Deposu', category: 'Depo', quantity: result.waterTank.requiredVolumeWithSafetyM3, unit: 'm³', explanation: `${result.waterTank.requiredVolumeWithSafetyTon} ton yaklaşık su hacmi`, source: 'depo' },
    { name: 'Seviye Flatörü / Sensörü', category: 'Depo', quantity: 1, unit: 'set', explanation: 'Depo seviye kontrolü', source: 'depo' }
  )
  return items.filter(item => item.quantity > 0)
}

export function waterHydraulicMaterialsToTechnicalItems(items: WaterSystemMaterialItem[]): MaterialListItem[] {
  return mergeSameMaterials(items.map(item => materialItem(
    'sulu_sistem_hidrolik_hesap',
    item.name,
    item.category,
    item.quantity,
    item.unit,
    item.explanation
  )))
}

export function calculateWaterHydraulicSystem(input: WaterHydraulicInput, settings: WaterHydraulicSettings): WaterHydraulicCalculationResult {
  const sprinkler = input.sprinkler.enabled ? calculateSprinkler(input.sprinkler) : undefined
  const cabinet = calculateCabinet(input)
  const hydrant = calculateHydrant(input)
  const designFlow = combinedDesignFlow({
    mode: input.calculationMode,
    cabinet,
    hydrant,
    sprinklerFlowLpm: sprinkler?.requiredFlowLpm,
    designFlowMode: input.pump.designFlowMode ?? 'en_buyuk_senaryo',
  })
  const pipeSummary = calculatePipeSegments({
    segments: input.pipeSegments,
    designFlowLpm: designFlow.designFlowLpm,
    pipeType: input.pipeType,
    cValue: input.hazenWilliamsC || settings.varsayilan_hazen_williams_c || 120,
    endpointPressureBar: endpointPressureBar(input, { cabinet, hydrant, sprinklerPressure: sprinkler?.selectedPressureBar }),
  })
  const pump = calculateFirePump({
    designFlowLpm: designFlow.designFlowLpm,
    requiredPressureBar: pipeSummary.totalFinalPressureBar,
    pump: input.pump,
    sprinklerEnabled: input.sprinkler.enabled,
    hydrantEnabled: input.hydrant.enabled,
  })
  const waterTank = calculateWaterTank({
    designFlowLpm: pump.designFlowLpm,
    durationMin: input.waterTank.durationMin,
    safetyFactor: input.waterTank.safetyFactor || settings.su_deposu_emniyet_katsayisi || 1.1,
    existingTankVolumeM3: input.waterTank.existingTankVolumeM3 ?? 0,
  })
  const partial = {
    cabinet,
    hydrant,
    sprinkler,
    designFlowLpm: round(designFlow.designFlowLpm, 0),
    designFlowM3h: round(designFlow.designFlowM3h, 1),
    pipeSummary,
    pump,
    waterTank,
    sketchPlan: { nodes: [], segments: [], summary: '' },
    materialList: [],
    warnings: [],
  } satisfies WaterHydraulicCalculationResult
  const sketchPlan = buildWaterSystemSketch(input, partial)
  const warnings = [
    WATER_HYDRAULIC_WARNING,
    hydrant?.ringWarning,
    sprinkler?.note,
    pipeSummary.maxVelocityMs > 6 ? 'Seçilen boru çapında hız yüksek görünüyor. Bir üst çap değerlendirilmelidir.' : '',
    waterTank.missingVolumeM3 > 0 ? `Mevcut yangın suyu deposunda yaklaşık ${waterTank.missingVolumeM3} m³ / ${waterTank.missingVolumeTon} ton eksik hacim görünüyor.` : '',
    'Su için yaklaşık yoğunluk 1 ton/m³ kabul edilerek ton karşılığı verilmiştir.',
  ].filter(Boolean) as string[]
  const result: WaterHydraulicCalculationResult = {
    ...partial,
    sketchPlan,
    warnings,
    materialList: [],
  }
  result.materialList = buildMaterials(input, result)
  return result
}

export function calculateWaterHydraulicReport(input: WaterHydraulicInput, rawSettings: TechnicalSetting[]) {
  const settings = parseWaterHydraulicSettings(rawSettings)
  const calculationResult = calculateWaterHydraulicSystem(input, settings)
  return {
    calculation_result: calculationResult,
    material_list: waterHydraulicMaterialsToTechnicalItems(calculationResult.materialList),
  }
}
