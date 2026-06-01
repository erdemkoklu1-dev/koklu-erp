import { createClient } from '@/lib/supabase/server'
import type { MaterialListItem, TechnicalReportRow } from '@/lib/technical-reports/types'

type RouteParams = { params: Promise<{ id: string }> }

type QuoteRequest = {
  customerId?: string | null
  subeId?: string | null
  title?: string
  validityDate?: string
  description?: string
}

function createTeklifNo() {
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  const time = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`.padStart(6, '0')
  return `TEK-${date}-${time}`
}

function daysUntil(dateValue?: string) {
  if (!dateValue) return 7
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dateValue)
  date.setHours(0, 0, 0, 0)
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000)
  return Number.isFinite(diff) && diff > 0 ? diff : 7
}

function itemDescription(item: MaterialListItem) {
  return [item.urun_adi, item.kategori ? `Kategori: ${item.kategori}` : '', item.aciklama]
    .filter(Boolean)
    .join('\n')
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const body = (await request.json()) as QuoteRequest
    const { data: report, error: readError } = await supabase
      .from('teknik_raporlar')
      .select('*')
      .eq('id', id)
      .single()

    if (readError || !report) {
      console.error('[teknik-raporlar][quote] report read failed', { id, error: readError })
      return Response.json({ error: 'Teknik rapor bulunamadı.' }, { status: 404 })
    }

    const source = report as TechnicalReportRow
    const materialList = Array.isArray(source.material_list) ? source.material_list : []
    if (materialList.length === 0) {
      return Response.json({ error: 'Bu raporda teklife aktarılabilecek ihtiyaç kalemi bulunmuyor.' }, { status: 400 })
    }

    const customerId = body.customerId || source.customer_id
    let customer: { full_name?: string | null; phone?: string | null; email?: string | null; il?: string | null } | null = null
    if (customerId) {
      const { data, error } = await supabase
        .from('customers')
        .select('full_name, phone, email, il')
        .eq('id', customerId)
        .single()
      if (error) console.error('[teknik-raporlar][quote] customer read failed', { id, customerId, error })
      customer = data
    }

    const teklifNo = createTeklifNo()
    const validityDate = body.validityDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const title = body.title?.trim() || `${source.rapor_no} Teknik Rapor Teklifi`
    const noteParts = [
      title,
      `Teknik rapor no: ${source.rapor_no}`,
      body.description?.trim(),
    ].filter(Boolean)

    const { data: teklif, error: teklifError } = await supabase
      .from('teklifler')
      .insert({
        teklif_no: teklifNo,
        tarih: new Date().toISOString().slice(0, 10),
        gecerlilik_suresi: daysUntil(validityDate),
        gecerlilik_bitis: validityDate,
        sehir: customer?.il ?? null,
        durum: 'taslak',
        sube_id: body.subeId || source.sube_id || null,
        musteri_id: customerId ?? null,
        musteri_adi: customer?.full_name || source.customer_name_snapshot || '',
        musteri_sehir: customer?.il ?? null,
        musteri_telefon: customer?.phone ?? null,
        musteri_email: customer?.email ?? null,
        para_birimi: 'TL',
        doviz_kuru: 1,
        kdv_durumu: 'haric',
        kdv_orani: 20,
        ara_toplam: 0,
        kdv_tutari: 0,
        genel_toplam: 0,
        notlar: noteParts.join('\n'),
      })
      .select('id')
      .single()

    if (teklifError || !teklif) {
      console.error('[teknik-raporlar][quote] teklif insert failed', { id, body, error: teklifError })
      return Response.json({ error: 'Teklif oluşturulamadı. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    const { error: itemsError } = await supabase.from('teklif_kalemleri').insert(
      materialList.map((item, index) => ({
        teklif_id: teklif.id,
        sira_no: index + 1,
        aciklama: itemDescription(item),
        miktar: Number(item.miktar) || 1,
        birim_fiyat: 0,
        toplam: 0,
      }))
    )

    if (itemsError) {
      console.error('[teknik-raporlar][quote] item insert failed', { id, teklifId: teklif.id, error: itemsError })
      return Response.json({ error: 'Teklif kalemleri oluşturulamadı. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('teknik_raporlar')
      .update({ teklif_id: teklif.id, durum: 'Teklife Aktarıldı', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      console.error('[teknik-raporlar][quote] report update failed', { id, teklifId: teklif.id, error: updateError })
      return Response.json({ error: 'Teklif oluşturuldu ancak rapor güncellenemedi.' }, { status: 500 })
    }

    return Response.json({
      message: 'Teknik rapor teklife aktarıldı.',
      teklifId: teklif.id,
    })
  } catch (error) {
    console.error('[teknik-raporlar][quote] unexpected error', { id, error })
    return Response.json({ error: 'Teklif oluşturulamadı. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
