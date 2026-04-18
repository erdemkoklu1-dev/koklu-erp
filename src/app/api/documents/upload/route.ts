import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'İstek okunamadı. Dosya çok büyük olabilir (maks. 10 MB).' }, { status: 400 })
    }

    const file = formData.get('file') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'Dosya bulunamadı veya boş.' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Dosya 10 MB sınırını aşıyor.' }, { status: 400 })
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Sadece JPG, PNG, WEBP veya PDF yüklenebilir.' }, { status: 400 })
    }

    const documentType = (formData.get('document_type') as string) || 'diger'
    const customerId   = (formData.get('customer_id') as string) || null
    const invoiceId    = (formData.get('invoice_id') as string) || null
    const amountStr    = formData.get('amount') as string | null
    const amount       = amountStr && amountStr !== '' ? parseFloat(amountStr) : null
    const notes        = (formData.get('notes') as string) || null

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Sunucu yapılandırma hatası: SUPABASE_SERVICE_ROLE_KEY eksik.' }, { status: 500 })
    }

    const supabase = createServiceClient()

    // Dosyayı Supabase Storage'a yükle
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 100)
    const filePath = `documents/${Date.now()}-${safeName}`

    const bytes = await file.arrayBuffer()
    const { error: storageErr } = await supabase.storage
      .from('erp-documents')
      .upload(filePath, bytes, { contentType: file.type, upsert: false })

    if (storageErr) {
      console.error('Storage upload error:', storageErr)
      return NextResponse.json(
        { error: `Dosya yükleme hatası: ${storageErr.message}. "erp-documents" bucket'ının Supabase'de oluşturulduğunu doğrulayın.` },
        { status: 500 }
      )
    }

    // DB'ye kaydet
    const { data, error: dbErr } = await supabase
      .from('documents')
      .insert({
        document_type: documentType,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        amount,
        notes,
        customer_id: customerId || null,
        invoice_id: invoiceId || null,
      })
      .select('id, document_type, file_name, uploaded_at')
      .single()

    if (dbErr || !data) {
      // Storage'ı geri al
      await supabase.storage.from('erp-documents').remove([filePath]).catch(() => {})
      console.error('DB insert error:', dbErr)
      return NextResponse.json(
        { error: `Veritabanı hatası: ${dbErr?.message ?? 'Kayıt oluşturulamadı'}. Migration SQL çalıştırıldı mı?` },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('Upload unexpected error:', err)
    return NextResponse.json({ error: err.message ?? 'Beklenmeyen hata oluştu.' }, { status: 500 })
  }
}
