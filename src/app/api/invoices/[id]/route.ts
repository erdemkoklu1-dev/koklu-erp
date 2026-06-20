import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createServiceClient()
    const firmaId = await requireCurrentFirmaId()

    const { data: invoice, error: readError } = await supabase
      .from('invoices')
      .select('id, firma_id')
      .eq('id', id)
      .maybeSingle()
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    if (!invoice) return NextResponse.json({ error: 'Fatura bulunamadı' }, { status: 404 })
    if (invoice.firma_id !== firmaId) {
      return NextResponse.json({ error: 'Bu kayıt kullanıcının firmasına ait değil.' }, { status: 403 })
    }

    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
