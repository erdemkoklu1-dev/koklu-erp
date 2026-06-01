import type { WaterTankCalculationResult } from './water-hydraulic-types'

function round(value: number, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function calculateWaterTank(input: {
  designFlowLpm: number
  durationMin: number
  safetyFactor: number
  existingTankVolumeM3?: number
}): WaterTankCalculationResult {
  const durationMin = Math.max(1, Number(input.durationMin) || 60)
  const safetyFactor = Math.max(1, Number(input.safetyFactor) || 1.1)
  const designFlowLpm = Math.max(0, Number(input.designFlowLpm) || 0)
  const requiredVolumeM3 = designFlowLpm * durationMin / 1000
  const requiredVolumeWithSafetyM3 = requiredVolumeM3 * safetyFactor
  const existingVolumeM3 = Math.max(0, Number(input.existingTankVolumeM3) || 0)
  const missingVolumeM3 = Math.max(0, requiredVolumeWithSafetyM3 - existingVolumeM3)
  return {
    durationMin,
    designFlowLpm,
    requiredVolumeM3: round(requiredVolumeM3),
    requiredVolumeTon: round(requiredVolumeM3),
    requiredVolumeWithSafetyM3: round(requiredVolumeWithSafetyM3),
    requiredVolumeWithSafetyTon: round(requiredVolumeWithSafetyM3),
    existingVolumeM3: round(existingVolumeM3),
    existingVolumeTon: round(existingVolumeM3),
    missingVolumeM3: round(missingVolumeM3),
    missingVolumeTon: round(missingVolumeM3),
    isExistingTankEnough: existingVolumeM3 >= requiredVolumeWithSafetyM3,
  }
}
