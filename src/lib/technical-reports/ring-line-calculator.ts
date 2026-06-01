export function calculateRingLine(totalRingFlowLpm: number, rightLengthM = 0, leftLengthM = 0) {
  const totalLength = rightLengthM + leftLengthM
  if (!totalLength || !totalRingFlowLpm) {
    return { rightFlowLpm: 0, leftFlowLpm: 0, warning: '' }
  }
  const rightFlowLpm = totalRingFlowLpm * (leftLengthM / totalLength)
  const leftFlowLpm = totalRingFlowLpm * (rightLengthM / totalLength)
  return {
    rightFlowLpm: Math.round(rightFlowLpm),
    leftFlowLpm: Math.round(leftFlowLpm),
    warning: 'Ring hat debi dağılımı sağ ve sol kol uzunluklarına göre yaklaşık olarak hesaplanmıştır. Nihai hidrolik dengeleme proje hesabında yapılmalıdır.',
  }
}
