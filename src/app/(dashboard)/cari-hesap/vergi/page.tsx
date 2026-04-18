import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, TAX_TYPE_LABELS, DECLARATION_STATUS_CONFIG, MONTHS_TR } from '@/lib/finance/formatters'
import { generateAnnualTaxCalendar } from '@/lib/finance/tax-calendar'
import VergiClient from './VergiClient'

export default async function VergiPage({
  searchParams,
}: {
  searchParams: Promise<{ yil?: string }>
}) {
  const { yil } = await searchParams
  const supabase = createServiceClient()
  const today = new Date()
  const year = parseInt(yil ?? String(today.getFullYear()))

  let { data: declarations } = await supabase
    .from('tax_declarations')
    .select('*')
    .eq('period_year', year)
    .order('due_date', { ascending: true })

  // Eğer bu yıl için kayıt yoksa takvimi oluşturmak için seed göster
  const needsSeed = !declarations || declarations.length === 0
  const calendar = needsSeed ? generateAnnualTaxCalendar(year) : null

  // Aylara göre grupla
  type MonthGroup = { month: number; rows: any[] }
  const monthGroups: MonthGroup[] = []
  const rowsToShow = declarations ?? []

  for (let m = 1; m <= 12; m++) {
    const rows = rowsToShow.filter(d => {
      const dueMonth = new Date(d.due_date).getMonth() + 1
      return dueMonth === m
    })
    if (rows.length > 0) monthGroups.push({ month: m, rows })
  }

  // Sayaçlar
  const toplam = rowsToShow.length
  const odendi = rowsToShow.filter(d => d.status === 'odendi').length
  const bekliyor = rowsToShow.filter(d => d.status === 'hazirlanacak').length
  const gecikmiş = rowsToShow.filter(d =>
    d.status !== 'odendi' && new Date(d.due_date) < today
  ).length
  const toplamVergi = rowsToShow.reduce((s, d) => s + (d.tax_amount ?? 0), 0)
  const toplamOdenen = rowsToShow.reduce((s, d) => s + (d.paid_amount ?? 0), 0)

  const todayStr = today.toISOString().split('T')[0]
  const in7 = new Date(today); in7.setDate(today.getDate() + 7)
  const in7Str = in7.toISOString().split('T')[0]

  return (
    <div className="p-6 space-y-4">

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Vergi Takvimi</h2>
          <p className="text-xs text-gray-400 mt-0.5">{year} yılı beyanname ve ödeme takibi</p>
        </div>
        <div className="flex gap-2">
          <form method="GET" className="flex gap-2">
            <select name="yil" defaultValue={year}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="submit"
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
              Göster
            </button>
          </form>
          {!needsSeed && <VergiClient mode="add" year={year} />}
        </div>
      </div>

      {/* Takvim oluştur uyarısı */}
      {needsSeed && calendar && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-blue-800 mb-1">
            {year} yılı için vergi takvimi henüz oluşturulmamış
          </div>
          <div className="text-xs text-blue-600 mb-3">
            {calendar.length} adet beyanname ve ödeme kaydı oluşturulacak (KDV, Muhtasar, SGK, Gelir Vergisi vb.)
          </div>
          <VergiClient mode="seed" year={year} calendarData={calendar} />
        </div>
      )}

      {/* Özet */}
      {!needsSeed && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border rounded-xl p-4">
            <div className="text-xs text-gray-500">Toplam Beyanname</div>
            <div className="text-2xl font-bold text-gray-900">{toplam}</div>
          </div>
          <div className={`rounded-xl p-4 border ${gecikmiş > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
            <div className={`text-xs ${gecikmiş > 0 ? 'text-red-600' : 'text-gray-500'}`}>Gecikmiş</div>
            <div className={`text-2xl font-bold ${gecikmiş > 0 ? 'text-red-700' : 'text-gray-900'}`}>{gecikmiş}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-xs text-green-600">Ödendi</div>
            <div className="text-2xl font-bold text-green-700">{odendi}</div>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="text-xs text-gray-500">Yıllık Toplam Vergi</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(toplamVergi)}</div>
            <div className="text-xs text-green-600 mt-0.5">Ödenen: {formatCurrency(toplamOdenen)}</div>
          </div>
        </div>
      )}

      {/* Aylık gruplar */}
      {monthGroups.length === 0 && !needsSeed && (
        <div className="bg-white border rounded-xl px-4 py-12 text-center text-gray-400 text-sm">
          Bu yıl için beyanname kaydı bulunamadı.
        </div>
      )}

      {monthGroups.map(({ month, rows }) => (
        <div key={month} className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">{MONTHS_TR[month - 1]}</h3>
          </div>
          <div className="divide-y">
            {rows.map(d => {
              const statusConf = DECLARATION_STATUS_CONFIG[d.status] ?? DECLARATION_STATUS_CONFIG['hazirlanacak']
              const isOverdue = d.status !== 'odendi' && d.due_date < todayStr
              const isUrgent = d.status !== 'odendi' && d.due_date >= todayStr && d.due_date <= in7Str
              return (
                <div key={d.id} className={`px-5 py-3 flex items-center justify-between ${isOverdue ? 'bg-red-50' : isUrgent ? 'bg-yellow-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {TAX_TYPE_LABELS[d.tax_type] ?? d.tax_type}
                        {d.period_month && (
                          <span className="ml-1 text-xs text-gray-400">({MONTHS_TR[(d.period_month - 1)]})</span>
                        )}
                      </div>
                      <div className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                        Vade: {formatTRDate(d.due_date)}
                        {isOverdue && ' — GECİKMİŞ'}
                        {isUrgent && ' — 7 gün içinde!'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {d.tax_amount != null && (
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">{formatCurrency(d.tax_amount)}</div>
                        {d.paid_amount > 0 && d.paid_amount < d.tax_amount && (
                          <div className="text-xs text-orange-600">Kalan: {formatCurrency(d.tax_amount - d.paid_amount)}</div>
                        )}
                      </div>
                    )}
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                      {statusConf.label}
                    </span>
                    <VergiClient mode="edit" declaration={d} year={year} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
