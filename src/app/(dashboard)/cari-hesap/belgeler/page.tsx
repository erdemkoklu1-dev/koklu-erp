import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'

const DOC_LABELS: Record<string, string> = {
  dekont: 'Dekont',
  fatura_pdf: 'Fatura PDF',
  diger: 'Diğer',
}

export default async function BelgelerPage({
  searchParams,
}: {
  searchParams: Promise<{ processed?: string; customer_id?: string }>
}) {
  const { processed, customer_id } = await searchParams
  const supabase = createServiceClient()

  let query = supabase
    .from('documents')
    .select('id, document_type, file_name, file_size, amount, notes, processed, processed_at, uploaded_at, customer_id, invoice_id, customers(full_name), invoices(invoice_number)')
    .order('uploaded_at', { ascending: false })

  if (processed === 'true') query = query.eq('processed', true)
  if (processed === 'false') query = query.eq('processed', false)
  if (customer_id) query = query.eq('customer_id', customer_id)

  const { data: documents } = await query

  const bekleyenCount = (documents ?? []).filter(d => !d.processed).length
  const islenenCount  = (documents ?? []).filter(d => d.processed).length

  return (
    <div className="p-6 space-y-4">

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Belgeler</h2>
        <Link href="/cari-hesap/belgeler/new"
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
          + Belge Yükle
        </Link>
      </div>

      {/* Filtreler */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: `Tümü (${(documents ?? []).length})` },
          { key: 'false', label: `İşlem Bekliyor (${bekleyenCount})` },
          { key: 'true', label: `İşlendi (${islenenCount})` },
        ].map(f => {
          const active = (processed ?? 'all') === f.key || (f.key === 'all' && !processed)
          return (
            <Link key={f.key}
              href={`/cari-hesap/belgeler${f.key !== 'all' ? `?processed=${f.key}` : ''}${customer_id ? `${f.key !== 'all' ? '&' : '?'}customer_id=${customer_id}` : ''}`}
              className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#C8102E] text-white border-[#C8102E]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#C8102E] hover:text-[#C8102E]'
              }`}>
              {f.label}
            </Link>
          )
        })}
      </div>

      {/* Liste */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {(documents ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center space-y-2">
            <div className="text-sm text-gray-400">Henüz belge yüklenmemiş.</div>
            <Link href="/cari-hesap/belgeler/new"
              className="inline-block text-sm text-[#C8102E] font-medium hover:underline">
              İlk belgeyi yükle →
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {(documents ?? []).map(doc => {
              const customer = doc.customers as any
              const invoice  = doc.invoices as any
              const sizeKb = doc.file_size ? Math.round(doc.file_size / 1024) : null

              return (
                <div key={doc.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
                  {/* İkon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    doc.document_type === 'dekont' ? 'bg-blue-100 text-blue-700' :
                    doc.document_type === 'fatura_pdf' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {doc.document_type === 'dekont' ? 'DK' : doc.document_type === 'fatura_pdf' ? 'FT' : 'BL'}
                  </div>

                  {/* Bilgi */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</span>
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                        {DOC_LABELS[doc.document_type] ?? doc.document_type}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 flex gap-2 mt-0.5 flex-wrap">
                      <span>{formatTRDate(doc.uploaded_at)}</span>
                      {sizeKb && <span>{sizeKb} KB</span>}
                      {customer && (
                        <Link href={`/cari-hesap/musteri-cari/${doc.customer_id}`}
                          className="text-[#C8102E] hover:underline">
                          {customer.full_name}
                        </Link>
                      )}
                      {invoice && (
                        <Link href={`/cari-hesap/faturalar/${doc.invoice_id}`}
                          className="text-gray-600 hover:underline">
                          {invoice.invoice_number}
                        </Link>
                      )}
                      {doc.amount && <span className="font-medium text-gray-600">{formatCurrency(doc.amount)}</span>}
                      {doc.notes && <span className="italic">{doc.notes}</span>}
                    </div>
                  </div>

                  {/* Durum + İşlem */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc.processed ? (
                      <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                        İşlendi
                      </span>
                    ) : (
                      <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                        Bekliyor
                      </span>
                    )}
                    <Link href={`/cari-hesap/belgeler/${doc.id}`}
                      className="text-xs text-[#C8102E] font-medium hover:underline">
                      {doc.processed ? 'Detay' : 'İşle →'}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
