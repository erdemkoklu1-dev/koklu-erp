export type InvoiceItem = {
  quantity: number
  unit_price: number
  kdv_rate: number
}

export function calculateInvoiceTotals(items: InvoiceItem[], stopaj_rate: number = 0) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  // KDV: use weighted average — sum each line's kdv separately
  const kdv_amount = items.reduce((s, i) => s + i.quantity * i.unit_price * (i.kdv_rate / 100), 0)
  const stopaj_amount = subtotal * (stopaj_rate / 100)
  const total_amount = subtotal + kdv_amount - stopaj_amount
  return {
    subtotal: round2(subtotal),
    kdv_amount: round2(kdv_amount),
    stopaj_amount: round2(stopaj_amount),
    total_amount: round2(total_amount),
  }
}

export function applyKdv(netAmount: number, kdvRate: number) {
  const kdv_amount = round2(netAmount * (kdvRate / 100))
  return { kdv_amount, gross_amount: round2(netAmount + kdv_amount) }
}

// 2025 SGK ve vergi dilim hesabı
export function calculateSalaryDeductions(gross: number) {
  // SGK işçi: %14 (emeklilik) + %1 (işsizlik) = %15
  const sgk_employee = round2(gross * 0.15)
  // SGK işveren: %20.5 + %2 (işsizlik) = %22.5
  const sgk_employer = round2(gross * 0.225)
  // Damga vergisi: %0.759
  const stamp_tax = round2(gross * 0.00759)
  // Gelir vergisi matrahı = brüt - sgk işçi
  const tax_base = gross - sgk_employee
  const income_tax = round2(calculateIncomeTax(tax_base))

  const net = round2(gross - sgk_employee - income_tax - stamp_tax)
  const employer_total_cost = round2(gross + sgk_employer)

  return { sgk_employee, sgk_employer, income_tax, stamp_tax, net, employer_total_cost }
}

// 2025 Gelir Vergisi Dilimleri (aylık)
function calculateIncomeTax(monthlyBase: number): number {
  // Yıllık dilimlere çevir, hesapla, aya böl
  const annual = monthlyBase * 12
  let tax = 0
  if (annual <= 110_000)       tax = annual * 0.15
  else if (annual <= 230_000)  tax = 16_500 + (annual - 110_000) * 0.20
  else if (annual <= 580_000)  tax = 40_500 + (annual - 230_000) * 0.27
  else if (annual <= 3_000_000) tax = 135_000 + (annual - 580_000) * 0.35
  else                          tax = 982_000 + (annual - 3_000_000) * 0.40
  return tax / 12
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
