import { createClient } from '@/lib/supabase/server'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

type RouteParams = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const firmaId = await requireCurrentFirmaId()
    const { data: report, error: readError } = await supabase
      .from('teknik_raporlar')
      .select('id, teklif_id, teslimat_id, talep_id, firma_id')
      .eq('id', id)
      .single()

    if (readError || !report) {
      console.error('[teknik-raporlar][delete] read failed', { id, error: readError })
      return Response.json({ error: 'Teknik rapor bulunamadı.' }, { status: 404 })
    }

    if ((report as { firma_id?: string | null }).firma_id !== firmaId) {
      return Response.json({ error: 'Teknik rapor kullanıcının firmasına ait değil.' }, { status: 403 })
    }

    const hasDependency = Boolean(report.teklif_id || report.teslimat_id || report.talep_id)

    if (hasDependency) {
      const { error } = await supabase
        .from('teknik_raporlar')
        .update({ durum: 'İptal', updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) {
        console.error('[teknik-raporlar][delete] soft delete failed', { id, error })
        return Response.json({ error: 'Teknik rapor silinemedi. Lütfen tekrar deneyin.' }, { status: 500 })
      }

      return Response.json({
        mode: 'cancelled',
        message: 'Bu rapor bağlantılı kayıtlar içerdiği için silinmedi, iptal edildi.',
      })
    }

    const { error } = await supabase.from('teknik_raporlar').delete().eq('id', id)
    if (error) {
      console.error('[teknik-raporlar][delete] hard delete failed', { id, error })
      return Response.json({ error: 'Teknik rapor silinemedi. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return Response.json({ mode: 'deleted', message: 'Teknik rapor silindi.' })
  } catch (error) {
    console.error('[teknik-raporlar][delete] unexpected error', { id, error })
    return Response.json({ error: 'Teknik rapor silinemedi. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
