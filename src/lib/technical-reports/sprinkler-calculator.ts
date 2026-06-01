import type { SprinklerCalculationResult, SprinklerInput } from './water-hydraulic-types'

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function calculateSprinkler(input: SprinklerInput): SprinklerCalculationResult {
  const designAreaM2 = Math.max(0, Number(input.designAreaM2) || 0)
  const sprinklerCoverageAreaM2 = Math.max(1, Number(input.sprinklerCoverageAreaM2) || 12)
  const calculatedSprinklerCount = Math.ceil(designAreaM2 / sprinklerCoverageAreaM2)
  const manual = Number(input.manualSprinklerCount || input.sprinklerCount || 0)
  const selectedSprinklerCount = Math.max(calculatedSprinklerCount, Number.isFinite(manual) ? manual : 0, 1)
  const designDensityLpmM2 = Math.max(0, Number(input.designDensityLpmM2) || 0)
  const requiredFlowLpm = designAreaM2 * designDensityLpmM2
  const flowPerSprinklerLpm = requiredFlowLpm / selectedSprinklerCount
  const kFactorMetric = Math.max(1, Number(input.kFactorMetric) || 80)
  const calculatedPressureBar = (flowPerSprinklerLpm / kFactorMetric) ** 2
  const minimumPressureBar = Math.max(
    Number(input.minimumSprinklerPressureBar) || 0.56,
    input.wallTypeSprinkler ? Number(input.wallTypeMinimumPressureBar || 1) : 0
  )
  const selectedPressureBar = Math.max(calculatedPressureBar, minimumPressureBar)
  return {
    designAreaM2,
    sprinklerCoverageAreaM2,
    calculatedSprinklerCount,
    selectedSprinklerCount,
    designDensityLpmM2,
    requiredFlowLpm: round(requiredFlowLpm, 0),
    kFactorMetric,
    minimumPressureBar,
    flowPerSprinklerLpm: round(flowPerSprinklerLpm, 1),
    calculatedPressureBar: round(calculatedPressureBar, 2),
    selectedPressureBar: round(selectedPressureBar, 2),
    interventionDurationMin: Math.max(1, Number(input.interventionDurationMin) || 60),
    note: input.wallTypeSprinkler ? 'Duvar tipi sprinkler seçildiği için atış mesafesi ve minimum akma basıncı ayrıca değerlendirilmiştir.' : undefined,
  }
}
