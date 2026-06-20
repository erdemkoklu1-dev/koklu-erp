import { createClient } from '@/lib/supabase/server'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'
import { createReportNo } from '@/lib/technical-reports/report-utils'
import type { TechnicalReportRow } from '@/lib/technical-reports/types'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const firmaId = await requireCurrentFirmaId()
    const { data: report, error: readError } = await supabase
      .from('teknik_raporlar')
      .select('*')
      .eq('id', id)
      .single()

    if (readError || !report) {
      console.error('[teknik-raporlar][copy] read failed', { id, error: readError })
      return Response.json({ error: 'Kopyalanacak teknik rapor bulunamadı.' }, { status: 404 })
    }

    const { data: auth } = await supabase.auth.getUser()
    const source = report as TechnicalReportRow
    if ((report as { firma_id?: string | null }).firma_id !== firmaId) {
      return Response.json({ error: 'Teknik rapor kullanıcının firmasına ait değil.' }, { status: 403 })
    }
    const payload = {
      rapor_no: createReportNo(source.rapor_turu),
      rapor_turu: source.rapor_turu,
      baslik: source.baslik,
      customer_id: source.customer_id,
      customer_name_snapshot: source.customer_name_snapshot,
      sube_id: source.sube_id,
      lokasyon: source.lokasyon,
      adres: source.adres,
      rapor_tarihi: new Date().toISOString().slice(0, 10),
      hazirlayan_personel_id: source.hazirlayan_personel_id,
      durum: 'Taslak',
      standart_profili: source.standart_profili,
      input_data: source.input_data ?? {},
      calculation_result: source.calculation_result ?? {},
      material_list: source.material_list ?? [],
      notes: source.notes,
      created_by: auth.user?.id ?? null,
      updated_by: auth.user?.id ?? null,
      firma_id: firmaId,
    }

    const { data: copied, error } = await supabase
      .from('teknik_raporlar')
      .insert(payload)
      .select('id')
      .single()

    if (error) {
      console.error('[teknik-raporlar][copy] insert failed', { id, payload, error })
      return Response.json({ error: 'Teknik rapor kopyalanamadı. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return Response.json({ message: 'Teknik rapor kopyalandı.', id: copied.id })
  } catch (error) {
    console.error('[teknik-raporlar][copy] unexpected error', { id, error })
    return Response.json({ error: 'Teknik rapor kopyalanamadı. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
