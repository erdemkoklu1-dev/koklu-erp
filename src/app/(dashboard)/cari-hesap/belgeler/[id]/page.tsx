import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import BelgeIsleClient from './BelgeIsleClient'

const DOC_LABELS: Record<string, string> = {
  dekont: 'Dekont / EFT Makbuzu',
  fatura_pdf: 'Fatura PDF',
  diger: 'Diğer Belge',
}

export default async function BelgeDetayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // documents tablosu için service client kullan (RLS bypass, tablo erişim sorunu yok)
  const service = createServiceClient()
  const supabase = await createClient()

  const { data: doc, error: docErr } = await service
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (!doc || docErr) notFound()

  // İlişkili kayıtları ayrı sorgula (FK join sorunlarını önler)
  const [customerRes, invoiceRes, paymentRes] = await Promise.all([
    doc.customer_id
      ? supabase.from('customers').select('id, full_name').eq('id', doc.customer_id).single()
      : Promise.resolve({ data: null }),
    doc.invoice_id
      ? supabase.from('invoices').select('id, invoice_number').eq('id', doc.invoice_id).single()
      : Promise.resolve({ data: null }),
    doc.payment_id
      ? supabase.from('payments').select('id, amount, payment_date').eq('id', doc.payment_id).single()
      : Promise.resolve({ data: null }),
  ])

  const customer    = customerRes.data
  const linkedInv   = invoiceRes.data
  const linkedPay   = paymentRes.data

  // Signed URL oluştur
  let fileUrl: string | null = null
  if (doc.file_path) {
    const { data: signedData } = await service.storage
      .from('erp-documents')
      .createSignedUrl(doc.file_path, 3600)
    fileUrl = signedData?.signedUrl ?? null
  }

  // Açık faturalar (dekont işleme için)
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_amount, paid_amount')
    .eq('invoice_type', 'satis')
    .in('status', ['kesildi', 'gonderildi', 'kismi_odendi'])
    .order('invoice_date', { ascending: false })

  const sizeKb = doc.file_size ? Math.round(doc.file_size / 1024) : null
  const isPdf  = doc.mime_type === 'application/pdf'
  const canProcess = !doc.processed && (doc.document_type === 'dekont' || doc.document_type === 'fatura_pdf')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Link href="/cari-hesap/belgeler" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Belgeler</Link>
        <span className="text-gray-300">/</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate max-w-xs">{doc.file_name}</h2>
        {doc.processed ? (
          <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full flex-shrink-0">İşlendi</span>
        ) : (
          <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full flex-shrink-0">İşlem Bekliyor</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Sol: Dosya önizleme + bilgiler */}
        <div className="space-y-4">

          {/* Dosya önizleme */}
          <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dosya</h3>
              {fileUrl && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[#C8102E] font-medium hover:underline">
                  Tam Ekranda Aç ↗
                </a>
              )}
            </div>
            <div className="p-4">
              {fileUrl ? (
                isPdf ? (
                  <iframe src={fileUrl} className="w-full h-64 border rounded" title={doc.file_name} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl} alt={doc.file_name} className="w-full rounded object-contain max-h-64" />
                )
              ) : (
                <div className="h-32 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 text-sm gap-1">
                  <span className="text-2xl">📄</span>
                  <span>Önizleme yüklenemedi</span>
                  <span className="text-xs">Storage bucket ayarlarını kontrol edin</span>
                </div>
              )}
            </div>
          </div>

          {/* Belge bilgileri */}
          <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 pb-2 border-b">Belge Bilgileri</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Tür</span>
                <span className="text-gray-800 dark:text-gray-200">{DOC_LABELS[doc.document_type] ?? doc.document_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Yüklendi</span>
                <span className="text-gray-800 dark:text-gray-200">{formatTRDate(doc.uploaded_at)}</span>
              </div>
              {sizeKb && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Boyut</span>
                  <span className="text-gray-800 dark:text-gray-200">{sizeKb} KB</span>
                </div>
              )}
              {doc.amount && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Tutar</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(doc.amount)}</span>
                </div>
              )}
              {customer && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Müşteri</span>
                  <Link href={`/cari-hesap/musteri-cari/${customer.id}`}
                    className="text-[#C8102E] font-medium hover:underline">
                    {customer.full_name}
                  </Link>
                </div>
              )}
              {doc.notes && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">Not</span>
                  <span className="text-gray-700 dark:text-gray-300 text-right">{doc.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* İşlendi ise — bağlantılı kayıtlar */}
          {doc.processed && (linkedInv || linkedPay) && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-green-800 mb-2">İşlem Sonucu</h3>
              <div className="space-y-1.5 text-sm">
                {linkedInv && (
                  <div className="flex justify-between">
                    <span className="text-green-700">Fatura</span>
                    <Link href={`/cari-hesap/faturalar/${linkedInv.id}`}
                      className="font-medium text-green-800 hover:underline">
                      {linkedInv.invoice_number}
                    </Link>
                  </div>
                )}
                {linkedPay && (
                  <div className="flex justify-between">
                    <span className="text-green-700">Ödeme Kaydı</span>
                    <span className="font-semibold text-green-800">{formatCurrency(linkedPay.amount)}</span>
                  </div>
                )}
                {doc.processed_at && (
                  <div className="flex justify-between">
                    <span className="text-green-700">İşlem Tarihi</span>
                    <span className="text-green-800">{formatTRDate(doc.processed_at)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sağ: İşlem formu */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          {doc.processed ? (
            <div className="text-center py-8 space-y-2">
              <div className="text-3xl">✅</div>
              <div className="text-sm font-semibold text-green-700">Bu belge işlendi</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">Ödeme kaydı oluşturuldu</div>
              {linkedInv && (
                <Link href={`/cari-hesap/faturalar/${linkedInv.id}`}
                  className="mt-3 inline-block text-sm text-[#C8102E] font-medium hover:underline">
                  Faturayı Görüntüle →
                </Link>
              )}
            </div>
          ) : canProcess ? (
            <>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 pb-2 border-b">
                Ödeme Kaydı Oluştur
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Bu belgeyi ilgili faturaya bağlayın. Onaylandığında otomatik ödeme kaydı oluşturulur ve fatura bakiyesi güncellenir.
              </p>
              <BelgeIsleClient
                documentId={id}
                defaultInvoiceId={doc.invoice_id ?? null}
                defaultAmount={doc.amount ?? null}
                invoices={openInvoices ?? []}
              />
            </>
          ) : (
            <div className="text-center py-8 space-y-2">
              <div className="text-2xl text-gray-300">📁</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Bu belge arşiv olarak saklandı.
              </div>
              {customer && (
                <Link href={`/cari-hesap/musteri-cari/${customer.id}`}
                  className="inline-block text-sm text-[#C8102E] font-medium hover:underline">
                  Müşteri Cari →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
