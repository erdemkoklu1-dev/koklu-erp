import type { PumpCalculationResult, PumpInput } from './water-hydraulic-types'

const STANDARD_MOTOR_KW = [1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315]

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function selectMotor(value: number) {
  return STANDARD_MOTOR_KW.find(power => power >= value) ?? Math.ceil(value)
}

function selectPumpType(designFlowM3h: number, requiredPressureBar: number, sprinklerEnabled: boolean, hydrantEnabled: boolean, includeDieselBackup: boolean) {
  if (sprinklerEnabled && hydrantEnabled) return 'Elektrikli + Dizel Yedek + Jokey Yangın Pompa Seti'
  if (hydrantEnabled) return includeDieselBackup ? 'Elektrikli Yangın Pompası + Dizel Yedek + Jokey Pompa' : 'Elektrikli Yangın Pompası + Jokey Pompa'
  if (designFlowM3h < 30) return 'Yangın Hidrofor Seti'
  if (designFlowM3h >= 160 || requiredPressureBar >= 10) return 'Split Case Yangın Pompası + Dizel Yedek + Jokey Pompa'
  return 'Elektrikli Yangın Pompası + Jokey Pompa'
}

export function calculateFirePump(input: {
  designFlowLpm: number
  requiredPressureBar: number
  pump: PumpInput
  sprinklerEnabled: boolean
  hydrantEnabled: boolean
}): PumpCalculationResult {
  const designFlowLpm = Math.max(0, Number(input.designFlowLpm) || 0) * Math.max(1, input.pump.flowSafetyFactor || 1)
  const designFlowM3h = designFlowLpm * 0.06
  const requiredPressureBar = Math.max(0, Number(input.requiredPressureBar) || 0) * Math.max(1, input.pump.pressureSafetyFactor || 1)
  const requiredPressureMSS = requiredPressureBar * 10.2
  const pumpEfficiency = Math.max(0.1, Math.min(1, Number(input.pump.pumpEfficiency) || 0.75))
  const hydraulicPowerKw = designFlowM3h * requiredPressureBar / (367 * pumpEfficiency) * 100
  const calculatedMotorPowerKw = hydraulicPowerKw * Math.max(1, input.pump.motorSafetyFactor || 1.15)
  const selectedMotorPowerKw = selectMotor(calculatedMotorPowerKw)
  const pumpType = input.pump.pumpSelectionMode === 'manual' && input.pump.preferredPumpType
    ? input.pump.preferredPumpType
    : selectPumpType(designFlowM3h, requiredPressureBar, input.sprinklerEnabled, input.hydrantEnabled, input.pump.includeDieselBackup)
  const jockeyPumpFlowLpm = input.pump.includeJockeyPump ? Math.max(10, designFlowLpm * 0.05) : 0
  return {
    designFlowLpm: round(designFlowLpm, 0),
    designFlowM3h: round(designFlowM3h, 1),
    requiredPressureBar: round(requiredPressureBar, 2),
    requiredPressureMSS: round(requiredPressureMSS, 1),
    hydraulicPowerKw: round(hydraulicPowerKw, 1),
    calculatedMotorPowerKw: round(calculatedMotorPowerKw, 1),
    selectedMotorPowerKw,
    pumpType,
    pumpSetDescription: `${pumpType} - ${round(designFlowM3h, 1)} m³/h, ${round(requiredPressureBar, 2)} bar`,
    jockeyPumpFlowLpm: round(jockeyPumpFlowLpm, 0),
    jockeyPumpPressureBar: round(requiredPressureBar, 2),
    dieselBackupRecommended: input.pump.includeDieselBackup || input.hydrantEnabled || designFlowM3h >= 160,
    electricalPowerKw: selectedMotorPowerKw,
  }
}
