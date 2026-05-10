'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'
import OdemeModal from './OdemeModal'

type Invoice = {
  id: string
  invoice_number: string | null
  supplier_name: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  paid_amount: number | null
  status: string | null
  subeler?: { ad: string | null } | null
}

type Props = {
  invoices: Invoice[]
  today: string
}

export default function GelenFaturaTable({ invoices, today }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [modalInvoice, setModalInvoice] = useState<Invoice | null>(null)

  function handlePaymentSuccess() {
    setModalInvoice(null)
    startTransition(() => router.refresh())
  }

  const in7Str = (() => {
    const d = new Date(today)
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })()

  if (invoices.length === 0) {
    return (
      <tr>
        <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
          Fatura bulunamadı
        </td>
      </tr>
    )
  }

  return (
    <>
      {modalInvoice && (() => {
        const kalan = Math.max(0, (modalInvoice.total_amount ?? 0) - (modalInvoice.paid_amount ?? 0))
        return (
          <OdemeModal
            invoiceId={modalInvoice.id}
            invoiceNumber={modalInvoice.invoice_number ?? '—'}
            supplierName={modalInvoice.supplier_name}
            kalan={kalan}
            onSuccess={handlePaymentSuccess}
            onClose={() => setModalInvoice(null)}
          />
        )
      })()}

      {invoices.map(inv => {
        const kalan = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
        const isOverdue = !!(inv.due_date && inv.due_date < today && kalan > 0)
        const isToday   = inv.due_date === today && kalan > 0
        const daysLeft  = inv.due_date && inv.due_date > today
          ? Math.ceil((new Date(inv.due_date).getTime() - Date.now()) / 86400000)
          : null

        const rowBg = isOverdue ? 'bg-red-50/60' : isToday ? 'bg-orange-50/60' : ''
        const statusCfg = INVOICE_STATUS_CONFIG[inv.status as keyof typeof INVOICE_STATUS_CONFIG]
        const sube = inv.subeler as any

        return (
          <tr key={inv.id} className={`${rowBg} hover:bg-gray-50 transition-colors`}>
            <td className="px-4 py-3">
              <Link
                href={`/cari-hesap/tedarikciler/${encodeURIComponent(inv.supplier_name ?? '')}`}
                className="font-medium text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline"
              >
                {inv.supplier_name ?? '—'}
              </Link>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{inv.invoice_number}</td>
            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{sube?.ad ?? '—'}</td>
            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatTRDate(inv.invoice_date)}</td>
            <td className="px-4 py-3 whitespace-nowrap">
              {inv.due_date ? (
                <div className="flex items-center gap-1.5">
                  <span className={isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-orange-600 font-medium' : 'text-gray-600 dark:text-gray-300'}>
                    {formatTRDate(inv.due_date)}
                  </span>
                  {isOverdue && (
                    <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-medium">
                      Gecikmiş
                    </span>
                  )}
                  {isToday && (
                    <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium">
                      Bugün
                    </span>
                  )}
                  {daysLeft !== null && daysLeft <= 7 && kalan > 0 && !isToday && (
                    <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-full">
                      {daysLeft} gün kaldı
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">—</span>
              )}
            </td>
            <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">
              {formatCurrency(inv.total_amount)}
            </td>
            <td className={`px-4 py-3 text-right font-semibold ${kalan > 0 ? (isOverdue ? 'text-red-600' : 'text-orange-600') : 'text-gray-400 dark:text-gray-500'}`}>
              {kalan > 0 ? formatCurrency(kalan) : '—'}
            </td>
            <td className="px-4 py-3">
              {statusCfg && (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.className}`}>
                  {statusCfg.label}
                </span>
              )}
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex gap-2 justify-end">
                <Link
                  href={`/cari-hesap/faturalar/${inv.id}?kaynak=gelen`}
                  className="text-xs text-[#C8102E] hover:underline font-medium"
                >
                  Detay
                </Link>
                <Link
                  href={`/cari-hesap/faturalar/${inv.id}/edit?kaynak=gelen`}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline font-medium"
                >
                  Düzenle
                </Link>
                {kalan > 0 && (
                  <button
                    onClick={() => setModalInvoice(inv)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium hover:underline"
                  >
                    Öde →
                  </button>
                )}
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
