import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency, formatTRDate, MONTHS_TR, PAYMENT_METHOD_LABELS } from '@/lib/finance/formatters'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  aktif:   { label: 'Aktif',   className: 'bg-green-50 text-green-700 border-green-200' },
  izinli:  { label: 'İzinli',  className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  ayrildi: { label: 'Ayrıldı', className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: employee }, { data: payments }] = await Promise.all([
    supabase.from('employees').select('*').eq('id', id).single(),
    supabase.from('salary_payments')
      .select('*')
      .eq('employee_id', id)
      .order('payment_year', { ascending: false })
      .order('payment_month', { ascending: false }),
  ])

  if (!employee) notFound()

  const currentYear = new Date().getFullYear()
  const ytdPayments = (payments ?? []).filter(p => p.payment_year === currentYear)
  const ytdNet = ytdPayments.reduce((s, p) => s + (p.net_amount ?? 0), 0)
  const ytdGross = ytdPayments.reduce((s, p) => s + (p.gross_amount ?? 0), 0)
  const ytdSGK = ytdPayments.reduce((s, p) => s + (p.sgk_employer ?? 0), 0)
  const statusConf = STATUS_LABELS[employee.status] ?? STATUS_LABELS['aktif']

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/maaslar" className="text-sm text-gray-500 hover:text-gray-700">← Maaşlar</Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900">{employee.full_name}</h2>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
            {statusConf.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">

        {/* Çalışan Bilgileri */}
        <div className="bg-white border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b">Çalışan Bilgileri</h3>
          <div className="space-y-2 text-sm">
            {[
              ['Ünvan', employee.title],
              ['TC Kimlik No', employee.tc_no],
              ['SGK No', employee.sgk_no],
              ['Telefon', employee.phone],
              ['IBAN', employee.iban],
              ['İşe Başlama', formatTRDate(employee.start_date)],
              ['İşten Çıkış', employee.end_date ? formatTRDate(employee.end_date) : null],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900 text-right max-w-48">{value}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-500">Brüt Maaş</span>
              <span className="font-bold text-gray-900">{formatCurrency(employee.gross_salary)}</span>
            </div>
          </div>
        </div>

        {/* YTD Özeti */}
        <div className="space-y-3">
          <div className="bg-white border rounded-xl p-4">
            <div className="text-xs text-gray-500">{currentYear} Yılı — Toplam Net Ödeme</div>
            <div className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(ytdNet)}</div>
            <div className="text-xs text-gray-400 mt-1">{ytdPayments.length} aylık ödeme</div>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="text-xs text-gray-500">{currentYear} Yılı — Toplam Brüt</div>
            <div className="text-xl font-bold text-gray-700 mt-0.5">{formatCurrency(ytdGross)}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-xs text-red-600">{currentYear} Yılı — SGK İşveren (Toplam Maliyet)</div>
            <div className="text-xl font-bold text-red-700 mt-0.5">{formatCurrency(ytdNet + ytdSGK)}</div>
            <div className="text-xs text-red-400 mt-0.5">SGK işveren payı: {formatCurrency(ytdSGK)}</div>
          </div>
        </div>
      </div>

      {/* Maaş Geçmişi */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-900">Maaş Ödeme Geçmişi</h3>
        </div>
        {(payments ?? []).length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">Henüz maaş ödemesi kaydedilmemiş.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Dönem</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Brüt</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">SGK İşçi</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Gelir Verg.</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Damga</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Net</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">SGK İşveren</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Ödeme</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Yöntem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(payments ?? []).map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {MONTHS_TR[p.payment_month - 1]} {p.payment_year}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatCurrency(p.gross_amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatCurrency(p.sgk_employee)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatCurrency(p.income_tax)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 text-right">{formatCurrency(p.stamp_tax)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(p.net_amount)}</td>
                    <td className="px-4 py-3 text-sm text-red-600 font-medium text-right">{formatCurrency(p.sgk_employer)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.payment_date ? formatTRDate(p.payment_date) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                  </tr>
                ))}
              </tbody>
              {payments && payments.length > 1 && (
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-500">TOPLAM ({currentYear})</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">{formatCurrency(ytdGross)}</td>
                    <td colSpan={3} />
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(ytdNet)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-700 text-right">{formatCurrency(ytdSGK)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {employee.notes && (
        <div className="bg-white border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Notlar</h3>
          <p className="text-sm text-gray-600">{employee.notes}</p>
        </div>
      )}
    </div>
  )
}
