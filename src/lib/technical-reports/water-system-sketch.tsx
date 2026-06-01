import type { HydraulicSketchPlan, WaterHydraulicCalculationResult, WaterHydraulicInput } from './water-hydraulic-types'

export function buildWaterSystemSketch(input: WaterHydraulicInput, result: Pick<WaterHydraulicCalculationResult, 'designFlowLpm'>): HydraulicSketchPlan {
  const nodes = [
    { id: 'tank', label: 'Yangın Su Deposu', type: 'tank' as const, x: 40, y: 145 },
    { id: 'pump', label: 'Pompa Seti', type: 'pump' as const, x: 190, y: 145 },
    { id: 'collector', label: 'Kolektör', type: 'branch' as const, x: 340, y: 145 },
    ...(input.cabinet.enabled ? [{ id: 'cabinet_line', label: 'Yangın Dolabı Hattı', type: 'cabinet' as const, x: 520, y: 70 }] : []),
    ...(input.hydrant.enabled ? [{ id: 'hydrant_line', label: 'Hidrant Hattı', type: 'hydrant' as const, x: 520, y: 145 }] : []),
    ...(input.sprinkler.enabled ? [{ id: 'sprinkler_line', label: 'Sprinkler Hattı', type: 'sprinkler' as const, x: 520, y: 220 }] : []),
  ]
  const segments = [
    { id: 'sk1', fromNodeId: 'tank', toNodeId: 'pump', flowLpm: result.designFlowLpm, lengthM: 0 },
    { id: 'sk2', fromNodeId: 'pump', toNodeId: 'collector', flowLpm: result.designFlowLpm, lengthM: 0 },
    ...nodes.filter(node => ['cabinet', 'hydrant', 'sprinkler'].includes(node.type)).map(node => ({
      id: `sk_${node.id}`,
      fromNodeId: 'collector',
      toNodeId: node.id,
      flowLpm: result.designFlowLpm,
      lengthM: 0,
    })),
  ]
  const line = (from: string, to: string) => {
    const a = nodes.find(node => node.id === from)
    const b = nodes.find(node => node.id === to)
    if (!a || !b) return ''
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#C8102E" stroke-width="3" />`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 290" role="img" aria-label="Sulu sistem ön şeması">
    <rect width="680" height="290" fill="#fff" />
    ${segments.map(segment => line(segment.fromNodeId, segment.toNodeId)).join('')}
    ${nodes.map(node => `<g><circle cx="${node.x}" cy="${node.y}" r="22" fill="#fee2e2" stroke="#C8102E" stroke-width="2" /><text x="${node.x}" y="${node.y + 42}" text-anchor="middle" font-size="12" fill="#111827">${node.label}</text></g>`).join('')}
    <text x="340" y="24" text-anchor="middle" font-size="14" font-weight="700" fill="#111827">Sulu Sistem Akış Krokisi</text>
  </svg>`
  return {
    nodes,
    segments,
    svg,
    summary: 'Yangın su deposundan pompa setine, pompa setinden kolektöre ve seçilen sistem hatlarına dağılım ön şeması.',
  }
}
