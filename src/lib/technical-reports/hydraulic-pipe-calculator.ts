import type { HydraulicPipeSegment, PipeCalculationSummary, PipeType } from './water-hydraulic-types'

export const STANDARD_PIPES = [
  { dn: 'DN25', innerMm: 26.9 },
  { dn: 'DN32', innerMm: 35.0 },
  { dn: 'DN40', innerMm: 40.9 },
  { dn: 'DN50', innerMm: 52.5 },
  { dn: 'DN65', innerMm: 68.0 },
  { dn: 'DN80', innerMm: 80.0 },
  { dn: 'DN100', innerMm: 102.3 },
  { dn: 'DN125', innerMm: 127.0 },
  { dn: 'DN150', innerMm: 154.1 },
  { dn: 'DN200', innerMm: 202.7 },
  { dn: 'DN250', innerMm: 254.5 },
]

type EquivalentLengthSet = {
  screwElbow90: number
  weldedElbow90: number
  teeReducer: number
  gateValve: number
  swingCheckValve: number
  liftCheckValve: number
  butterflyValve: number
  ballValve: number
  flexHose: number
}

export const DEFAULT_EQUIVALENT_LENGTHS_M: Record<string, EquivalentLengthSet> = {
  DN25: { screwElbow90: 0.77, weldedElbow90: 0.36, teeReducer: 1.5, gateValve: 0, swingCheckValve: 0, liftCheckValve: 0, butterflyValve: 0, ballValve: 0, flexHose: 0 },
  DN50: { screwElbow90: 1.5, weldedElbow90: 0.69, teeReducer: 2.9, gateValve: 0.38, swingCheckValve: 2.4, liftCheckValve: 12, butterflyValve: 2.2, ballValve: 16, flexHose: 0 },
  DN100: { screwElbow90: 3, weldedElbow90: 1.4, teeReducer: 6.1, gateValve: 0.81, swingCheckValve: 5.1, liftCheckValve: 25, butterflyValve: 4.6, ballValve: 34, flexHose: 0 },
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function nearestEquivalentSet(dn: string) {
  if (DEFAULT_EQUIVALENT_LENGTHS_M[dn]) return DEFAULT_EQUIVALENT_LENGTHS_M[dn]
  const dnNo = Number(dn.replace('DN', ''))
  const nearest = Object.keys(DEFAULT_EQUIVALENT_LENGTHS_M)
    .map(key => ({ key, diff: Math.abs(Number(key.replace('DN', '')) - dnNo) }))
    .sort((a, b) => a.diff - b.diff)[0]?.key ?? 'DN50'
  return DEFAULT_EQUIVALENT_LENGTHS_M[nearest]
}

export function selectPipeByFlow(flowLpm: number, velocityLimitMs: number) {
  const flowM3s = Math.max(0, flowLpm) / 1000 / 60
  const requiredDiameterM = flowM3s > 0 ? Math.sqrt((4 * flowM3s) / (Math.PI * Math.max(0.1, velocityLimitMs))) : 0
  return STANDARD_PIPES.find(pipe => pipe.innerMm >= requiredDiameterM * 1000) ?? STANDARD_PIPES[STANDARD_PIPES.length - 1]
}

function equivalentLength(segment: HydraulicPipeSegment, dn: string) {
  const eq = nearestEquivalentSet(dn)
  return (
    (segment.screwElbow90Count ?? 0) * eq.screwElbow90 +
    (segment.weldedElbow90Count ?? 0) * eq.weldedElbow90 +
    (segment.teeReducerCount ?? 0) * eq.teeReducer +
    (segment.gateValveCount ?? 0) * eq.gateValve +
    (segment.checkValveSwingCount ?? 0) * eq.swingCheckValve +
    (segment.checkValveLiftCount ?? 0) * eq.liftCheckValve +
    (segment.butterflyValveCount ?? 0) * eq.butterflyValve +
    (segment.ballValveCount ?? 0) * eq.ballValve +
    (segment.flexHoseCount ?? 0) * eq.flexHose
  )
}

export function calculatePipeSegments(input: {
  segments: HydraulicPipeSegment[]
  designFlowLpm: number
  pipeType: PipeType
  cValue: number
  defaultVelocityLimitMs?: number
  endpointPressureBar?: number
}): PipeCalculationSummary {
  const sourceSegments = input.segments.length > 0
    ? input.segments
    : [{
        id: 'S1',
        fromNodeId: 'pompa',
        toNodeId: 'kollektor',
        label: 'Ana besleme hattı',
        pipeType: input.pipeType,
        flowLpm: input.designFlowLpm,
        lengthM: 30,
        heightDifferenceM: 0,
      }]

  let previousPressureLossBar = 0
  const cValue = Math.max(1, input.cValue || 120)
  const velocityLimit = input.defaultVelocityLimitMs ?? 5
  const segments = sourceSegments.map(segment => {
    const selectedPipe = segment.selectedDN
      ? STANDARD_PIPES.find(pipe => pipe.dn === segment.selectedDN) ?? selectPipeByFlow(segment.flowLpm, velocityLimit)
      : selectPipeByFlow(segment.flowLpm, velocityLimit)
    const innerDiameterMm = segment.innerDiameterMm || selectedPipe.innerMm
    const flowM3s = Math.max(0, segment.flowLpm) / 1000 / 60
    const diameterM = innerDiameterMm / 1000
    const areaM2 = Math.PI * diameterM ** 2 / 4
    const velocityMs = areaM2 > 0 ? flowM3s / areaM2 : 0
    const eqLength = equivalentLength(segment, selectedPipe.dn)
    const totalEquivalentLengthM = Math.max(0, segment.lengthM) + eqLength
    const hfM = flowM3s > 0
      ? 10.67 * totalEquivalentLengthM * flowM3s ** 1.852 / (cValue ** 1.852 * diameterM ** 4.871)
      : 0
    const pipeLossBar = hfM * 0.098
    const frictionLossBarPerM = totalEquivalentLengthM > 0 ? pipeLossBar / totalEquivalentLengthM : 0
    const heightLossBar = Math.max(0, segment.heightDifferenceM ?? 0) * 0.098
    const finalPressureLossBar = previousPressureLossBar + pipeLossBar + heightLossBar
    const calculated: HydraulicPipeSegment = {
      ...segment,
      pipeType: segment.pipeType ?? input.pipeType,
      selectedDN: selectedPipe.dn,
      innerDiameterMm: round(innerDiameterMm, 1),
      equivalentLengthM: round(eqLength, 2),
      totalEquivalentLengthM: round(totalEquivalentLengthM, 2),
      velocityMs: round(velocityMs, 2),
      frictionLossBarPerM: round(frictionLossBarPerM, 5),
      pipeLossBar: round(pipeLossBar, 3),
      heightLossBar: round(heightLossBar, 3),
      previousPressureLossBar: round(previousPressureLossBar, 3),
      finalPressureLossBar: round(finalPressureLossBar, 3),
    }
    previousPressureLossBar = finalPressureLossBar
    return calculated
  })

  const totalFrictionLossBar = segments.reduce((sum, segment) => sum + (segment.pipeLossBar ?? 0), 0)
  const totalHeightLossBar = segments.reduce((sum, segment) => sum + (segment.heightLossBar ?? 0), 0)
  const totalFinalPressureLossBar = Math.max(0, ...segments.map(segment => segment.finalPressureLossBar ?? 0))
  const critical = [...segments].sort((a, b) => (b.finalPressureLossBar ?? 0) - (a.finalPressureLossBar ?? 0))[0]
  return {
    totalPipeLengthM: round(segments.reduce((sum, segment) => sum + Math.max(0, segment.lengthM), 0), 1),
    totalEquivalentLengthM: round(segments.reduce((sum, segment) => sum + (segment.totalEquivalentLengthM ?? 0), 0), 1),
    maxVelocityMs: round(Math.max(0, ...segments.map(segment => segment.velocityMs ?? 0)), 2),
    totalFrictionLossBar: round(totalFrictionLossBar, 3),
    totalHeightLossBar: round(totalHeightLossBar, 3),
    totalFinalPressureLossBar: round(totalFinalPressureLossBar, 3),
    totalFinalPressureBar: round(totalFinalPressureLossBar + (input.endpointPressureBar ?? 4), 3),
    criticalSegmentId: critical?.id,
    segments,
  }
}
