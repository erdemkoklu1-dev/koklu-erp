import { createClient } from '@/lib/supabase/server'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const firmaId = await requireCurrentFirmaId()
    const { data: report, error: readError } = await supabase
      .from('teknik_raporlar')
      .select('id, firma_id')
      .eq('id', id)
      .single()

    if (readError || !report) {
      console.error('[teknik-raporlar][cancel] read failed', { id, error: readError })
      return Response.json({ error: 'Teknik rapor bulunamadı.' }, { status: 404 })
    }

    if ((report as { firma_id?: string | null }).firma_id !== firmaId) {
      return Response.json({ error: 'Teknik rapor kullanıcının firmasına ait değil.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('teknik_raporlar')
      .update({ durum: 'İptal', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('[teknik-raporlar][cancel] update failed', { id, error })
      return Response.json({ error: 'Teknik rapor iptal edilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return Response.json({ message: 'Teknik rapor iptal edildi.' })
  } catch (error) {
    console.error('[teknik-raporlar][cancel] unexpected error', { id, error })
    return Response.json({ error: 'Teknik rapor iptal edilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
