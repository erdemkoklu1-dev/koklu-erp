export type TaxDeclarationSeed = {
  tax_type: string
  period_year: number
  period_month: number | null
  period_quarter: number | null
  due_date: string
  status: 'hazirlanacak'
}

export function generateAnnualTaxCalendar(year: number): TaxDeclarationSeed[] {
  const rows: TaxDeclarationSeed[] = []

  for (let month = 1; month <= 12; month++) {
    // KDV: takip eden ayın 26'sı
    rows.push({
      tax_type: 'kdv',
      period_year: year,
      period_month: month,
      period_quarter: null,
      due_date: dueDate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 26),
      status: 'hazirlanacak',
    })
    // Muhtasar (stopaj): takip eden ayın 26'sı
    rows.push({
      tax_type: 'muhtasar',
      period_year: year,
      period_month: month,
      period_quarter: null,
      due_date: dueDate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 26),
      status: 'hazirlanacak',
    })
    // SGK bildirimi: takip eden ayın 23'ü
    rows.push({
      tax_type: 'sgk_bildirimi',
      period_year: year,
      period_month: month,
      period_quarter: null,
      due_date: dueDate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 23),
      status: 'hazirlanacak',
    })
  }

  // Damga vergisi: aylık muhtasar ile birleşik, ayrı satır ekle mart'ta 1 yıllık özet
  rows.push({
    tax_type: 'damga_vergisi',
    period_year: year,
    period_month: null,
    period_quarter: null,
    due_date: `${year}-03-31`,
    status: 'hazirlanacak',
  })

  // Gelir vergisi: 2 taksit
  rows.push({
    tax_type: 'gelir_vergisi',
    period_year: year,
    period_month: null,
    period_quarter: 1,
    due_date: `${year}-03-31`,
    status: 'hazirlanacak',
  })
  rows.push({
    tax_type: 'gelir_vergisi',
    period_year: year,
    period_month: null,
    period_quarter: 2,
    due_date: `${year}-07-31`,
    status: 'hazirlanacak',
  })

  return rows
}

function dueDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
