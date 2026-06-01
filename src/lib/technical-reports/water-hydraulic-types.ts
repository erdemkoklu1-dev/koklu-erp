export type WaterCalculationMode =
  | 'dolap'
  | 'hidrant'
  | 'sprinkler'
  | 'dolap_hidrant'
  | 'dolap_sprinkler'
  | 'sprinkler_hidrant'
  | 'dolap_sprinkler_hidrant'

export type SprinklerHazardClass = 'LH' | 'OH1' | 'OH2' | 'OH3' | 'OH4' | 'HH'
export type SprinklerSystemType = 'islak' | 'kuru' | 'preaction' | 'deluge'
export type PipeType = 'siyah_celik' | 'galvaniz' | 'paslanmaz' | 'pe100' | 'diger'
export type PumpSetType = 'hidrofor_seti' | 'elektrikli_yangin_pompasi' | 'elektrikli_dizel_jokey_set' | 'split_case' | 'dik_turbin' | 'manuel_secim'

export interface HydraulicNode {
  id: string
  label: string
  type: 'pump' | 'tank' | 'cabinet' | 'hydrant' | 'sprinkler' | 'branch' | 'riser' | 'ring' | 'test_drain' | 'fire_department_connection'
  x?: number
  y?: number
  floor?: number
  flowLpm?: number
  pressureBar?: number
  kFactor?: number
  elevationM?: number
}

export interface HydraulicPipeSegment {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string
  pipeType?: PipeType
  flowLpm: number
  lengthM: number
  heightDifferenceM?: number
  selectedDN?: string
  innerDiameterMm?: number
  screwElbow90Count?: number
  weldedElbow90Count?: number
  teeReducerCount?: number
  gateValveCount?: number
  checkValveSwingCount?: number
  checkValveLiftCount?: number
  butterflyValveCount?: number
  ballValveCount?: number
  flexHoseCount?: number
  equivalentLengthM?: number
  totalEquivalentLengthM?: number
  velocityMs?: number
  frictionLossBarPerM?: number
  pipeLossBar?: number
  heightLossBar?: number
  previousPressureLossBar?: number
  finalPressureLossBar?: number
}

export interface SprinklerInput {
  enabled: boolean
  hazardClass: SprinklerHazardClass
  systemType: SprinklerSystemType
  roomLengthM?: number
  roomWidthM?: number
  roomHeightM?: number
  designAreaM2: number
  sprinklerCoverageAreaM2: number
  kFactorMetric: number
  designDensityLpmM2: number
  minimumSprinklerPressureBar: number
  sprinklerCount?: number
  manualSprinklerCount?: number
  interventionDurationMin: number
  wallTypeSprinkler?: boolean
  wallTypeThrowDistanceM?: number
  wallTypeMinimumPressureBar?: number
}

export interface CabinetInput {
  enabled: boolean
  fireCabinetCount?: number
  manualFireCabinetCount?: number
  flowPerCabinetLpm: number
  simultaneousCabinetCount: number
  endpointPressureBar: number
  hoseLengthM?: number
  cabinetCoverageRadiusM?: number
}

export interface HydrantInput {
  enabled: boolean
  hydrantCount?: number
  manualHydrantCount?: number
  sitePerimeterM?: number
  hydrantSpacingM?: number
  minimumDesignFlowLpm: number
  endpointPressureBar: number
  ringLineEnabled?: boolean
  rightRingLengthM?: number
  leftRingLengthM?: number
}

export interface PumpInput {
  pumpSelectionMode: 'auto' | 'manual'
  designFlowMode?: 'en_buyuk_senaryo' | 'es_zamanli_toplam'
  existingPumpAvailable?: boolean
  existingPumpFlowLpm?: number
  existingPumpPressureBar?: number
  existingPumpPowerKw?: number
  preferredPumpType?: PumpSetType
  pumpEfficiency: number
  motorSafetyFactor: number
  pressureSafetyFactor: number
  flowSafetyFactor: number
  includeJockeyPump: boolean
  includeDieselBackup: boolean
}

export interface WaterTankInput {
  existingTankAvailable?: boolean
  existingTankVolumeM3?: number
  durationMin: number
  safetyFactor: number
}

export interface WaterHydraulicInput {
  calculationMode: WaterCalculationMode
  projectName?: string
  buildingType?: string
  riskClass?: string
  totalClosedAreaM2?: number
  floorCount?: number
  buildingHeightM?: number
  elevationDifferenceM?: number
  farthestHorizontalDistanceM?: number
  pipeType: PipeType
  hazenWilliamsC: number
  cabinet: CabinetInput
  hydrant: HydrantInput
  sprinkler: SprinklerInput
  pump: PumpInput
  waterTank: WaterTankInput
  pipeSegments: HydraulicPipeSegment[]
  nodes: HydraulicNode[]
  notes?: string
}

export interface SprinklerCalculationResult {
  designAreaM2: number
  sprinklerCoverageAreaM2: number
  calculatedSprinklerCount: number
  selectedSprinklerCount: number
  designDensityLpmM2: number
  requiredFlowLpm: number
  kFactorMetric: number
  minimumPressureBar: number
  flowPerSprinklerLpm: number
  calculatedPressureBar: number
  selectedPressureBar: number
  interventionDurationMin: number
  note?: string
}

export interface CabinetCalculationResult {
  cabinetCount: number
  simultaneousCabinetCount: number
  flowPerCabinetLpm: number
  totalCabinetFlowLpm: number
  endpointPressureBar: number
}

export interface HydrantCalculationResult {
  hydrantCount: number
  hydrantSpacingM: number
  totalHydrantFlowLpm: number
  endpointPressureBar: number
  ringLineEnabled: boolean
  rightRingFlowLpm?: number
  leftRingFlowLpm?: number
  ringWarning?: string
}

export interface PipeCalculationSummary {
  totalPipeLengthM: number
  totalEquivalentLengthM: number
  maxVelocityMs: number
  totalFrictionLossBar: number
  totalHeightLossBar: number
  totalFinalPressureLossBar: number
  totalFinalPressureBar: number
  criticalSegmentId?: string
  segments: HydraulicPipeSegment[]
}

export interface PumpCalculationResult {
  designFlowLpm: number
  designFlowM3h: number
  requiredPressureBar: number
  requiredPressureMSS: number
  hydraulicPowerKw: number
  calculatedMotorPowerKw: number
  selectedMotorPowerKw: number
  pumpType: string
  pumpSetDescription: string
  jockeyPumpFlowLpm: number
  jockeyPumpPressureBar: number
  dieselBackupRecommended: boolean
  electricalPowerKw: number
}

export interface WaterTankCalculationResult {
  durationMin: number
  designFlowLpm: number
  requiredVolumeM3: number
  requiredVolumeTon: number
  requiredVolumeWithSafetyM3: number
  requiredVolumeWithSafetyTon: number
  existingVolumeM3: number
  existingVolumeTon: number
  missingVolumeM3: number
  missingVolumeTon: number
  isExistingTankEnough: boolean
}

export interface HydraulicSketchPlan {
  nodes: HydraulicNode[]
  segments: HydraulicPipeSegment[]
  svg?: string
  summary: string
}

export interface WaterSystemMaterialItem {
  name: string
  category: string
  quantity: number
  unit: string
  explanation: string
  source: string
}

export interface WaterHydraulicCalculationResult {
  cabinet?: CabinetCalculationResult
  hydrant?: HydrantCalculationResult
  sprinkler?: SprinklerCalculationResult
  designFlowLpm: number
  designFlowM3h: number
  pipeSummary: PipeCalculationSummary
  pump: PumpCalculationResult
  waterTank: WaterTankCalculationResult
  sketchPlan: HydraulicSketchPlan
  materialList: WaterSystemMaterialItem[]
  warnings: string[]
}

export type WaterHydraulicSettings = Record<string, number>
