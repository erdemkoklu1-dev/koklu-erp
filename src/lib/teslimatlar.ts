import { createServiceClient } from '@/lib/supabase/service'

export const HAREKET_TIPLERI = [
  'yeni_cihaz_teslim',
  'dolumlu_teslim',
  'yenilenmis_teslim',
  'yedek_parca_teslim',
  'emanet_teslim',
  'dolum_icin_alindi',
  'bakim_icin_alindi',
  'yenileme_icin_alindi',
  'emanet_geri_alindi',
  'hurda_icin_alindi',
  'diger',
] as const

export type HareketTipi = typeof HAREKET_TIPLERI[number]
export type HareketYonu = 'giden' | 'gelen'

export const HAREKET_TIPI_LABELS: Record<HareketTipi, string> = {
  yeni_cihaz_teslim: 'Yeni cihaz teslim',
  dolumlu_teslim: 'Dolumlu teslim',
  yenilenmis_teslim: 'Yenilenmiş teslim',
  yedek_parca_teslim: 'Yedek parça teslim',
  emanet_teslim: 'Emanet teslim',
  dolum_icin_alindi: 'Dolum için alındı',
  bakim_icin_alindi: 'Bakım için alındı',
  yenileme_icin_alindi: 'Yenileme için alındı',
  emanet_geri_alindi: 'Emanet geri alındı',
  hurda_icin_alindi: 'Hurda için alındı',
  diger: 'Diğer',
}

export const STOKTAN_DUSEN_TIPLER = new Set<HareketTipi>([
  'yeni_cihaz_teslim',
  'yenilenmis_teslim',
  'yedek_parca_teslim',
  'emanet_teslim',
])

export const MUSTERI_ENVANTER_TIPLERI = new Set<HareketTipi>([
  'yeni_cihaz_teslim',
  'dolumlu_teslim',
  'yenilenmis_teslim',
  'yedek_parca_teslim',
])

export const GERI_TESLIM_GEREKTIREN_TIPLER = new Set<HareketTipi>([
  'dolum_icin_alindi',
  'bakim_icin_alindi',
  'yenileme_icin_alindi',
])

export type TeslimatKalemInput = {
  urun_id: string | null
  aciklama: string
  hareket_yonu: HareketYonu
  hareket_tipi: HareketTipi
  miktar: number
  birim: string
  birim_fiyat: number
  stoktan_duser_mi: boolean
  musteri_envanterine_isler_mi: boolean
  emanet_mi: boolean
  geri_alinmasi_gerekir_mi: boolean
  hedef_tarih: string | null
  faturalanir_mi: boolean
  onceki_kalem_id?: string | null
  notlar?: string | null
}

export type TeslimatInput = {
  customer_id: string
  sube_id: string | null
  personel_id: string | null
  teslimat_tarihi: string
  hedef_tarih: string | null
  durum: 'taslak' | 'sevkte' | 'tamamlandi'
  on_kayit_secimi: 'olusturulsun' | 'mevcut_kayda_eklensin' | 'olusturulmasin'
  aciklama: string | null
  notlar: string | null
  kalemler: TeslimatKalemInput[]
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function daysSince(date: string | null | undefined) {
  if (!date) return 0
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

export function gecikmeDurumu(date: string | null | undefined) {
  const days = daysSince(date)
  if (days > 15) return 'kritik'
  if (days > 10) return 'gecikmiş'
  return 'normal'
}

function dbErrorMessage(step: string, error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || 'Bilinmeyen veritabanı hatası')
    return `${step}: ${message}`
  }
  if (error instanceof Error) return `${step}: ${error.message}`
  return `${step}: Bilinmeyen hata`
}

export async function nextTeslimatNo() {
  const supabase = createServiceClient()
  const year = new Date().getFullYear()
  const prefix = `TS-${year}-`
  const { data } = await supabase
    .from('teslimatlar')
    .select('teslimat_no')
    .like('teslimat_no', `${prefix}%`)
    .order('created_at', { ascending: false })
    .limit(1)

  const last = data?.[0]?.teslimat_no as string | undefined
  const next = last ? (Number(last.replace(prefix, '')) || 0) + 1 : 1
  return `${prefix}${String(next).padStart(5, '0')}`
}

export async function adjustUrunStok(urunId: string, miktar: number, referansNo: string, aciklama: string) {
  const supabase = createServiceClient()
  const { data: current } = await supabase
    .from('urun_stok')
    .select('id, stok_adedi')
    .eq('urun_id', urunId)
    .maybeSingle()

  const mevcut = Number(current?.stok_adedi ?? 0)
  const yeniStok = mevcut - miktar

  if (current?.id) {
    const { error } = await supabase
      .from('urun_stok')
      .update({ stok_adedi: yeniStok, updated_at: new Date().toISOString() })
      .eq('id', current.id)
    if (error) throw new Error(dbErrorMessage('Ürün stoku güncellenemedi', error))
  } else {
    const { error } = await supabase
      .from('urun_stok')
      .insert({ urun_id: urunId, stok_adedi: yeniStok })
    if (error) throw new Error(dbErrorMessage('Ürün stoku oluşturulamadı', error))
  }

  const { error: hareketError } = await supabase.from('depo_hareketleri').insert({
    hareket_tipi: 'cikis',
    kaynak: 'urun',
    kaynak_id: urunId,
    miktar,
    tarih: todayISO(),
    referans_no: referansNo,
    aciklama,
  })
  if (hareketError) throw new Error(dbErrorMessage('Depo hareketi oluşturulamadı', hareketError))
}

export async function reverseUrunStok(urunId: string, miktar: number, referansNo: string, aciklama: string) {
  const supabase = createServiceClient()
  const { data: current } = await supabase
    .from('urun_stok')
    .select('id, stok_adedi')
    .eq('urun_id', urunId)
    .maybeSingle()

  const mevcut = Number(current?.stok_adedi ?? 0)
  const yeniStok = mevcut + miktar

  if (current?.id) {
    const { error } = await supabase
      .from('urun_stok')
      .update({ stok_adedi: yeniStok, updated_at: new Date().toISOString() })
      .eq('id', current.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('urun_stok')
      .insert({ urun_id: urunId, stok_adedi: yeniStok })
    if (error) throw error
  }

  await supabase.from('depo_hareketleri').insert({
    hareket_tipi: 'giris',
    kaynak: 'urun',
    kaynak_id: urunId,
    miktar,
    tarih: todayISO(),
    referans_no: referansNo,
    aciklama,
  })
}

function toKalemRows(teslimatId: string, input: TeslimatInput, kalemler: TeslimatKalemInput[]) {
  return kalemler.map(k => ({
    teslimat_id: teslimatId,
    urun_id: k.urun_id,
    aciklama: k.aciklama.trim(),
    hareket_yonu: k.hareket_yonu,
    hareket_tipi: k.hareket_tipi,
    miktar: k.miktar,
    birim: k.birim || 'adet',
    birim_fiyat: k.birim_fiyat || 0,
    toplam_tutar: k.miktar * (k.birim_fiyat || 0),
    stoktan_duser_mi: k.stoktan_duser_mi,
    musteri_envanterine_isler_mi: k.musteri_envanterine_isler_mi,
    emanet_mi: k.emanet_mi,
    geri_alinmasi_gerekir_mi: k.geri_alinmasi_gerekir_mi,
    hedef_tarih: k.hedef_tarih || input.hedef_tarih,
    faturalanir_mi: k.faturalanir_mi,
    onceki_kalem_id: k.onceki_kalem_id ?? null,
    notlar: k.notlar ?? null,
  }))
}

type PersistedKalem = {
  id: string
  urun_id: string | null
  aciklama: string
  hareket_tipi: HareketTipi
  miktar: number
  stoktan_duser_mi: boolean
  emanet_mi: boolean
  geri_alinmasi_gerekir_mi: boolean
  hedef_tarih: string | null
  faturalanir_mi: boolean
  birim: string
  birim_fiyat: number
  toplam_tutar: number
  notlar?: string | null
}

type TakipRow = {
  id: string
  miktar: number
  geri_alinan_miktar?: number | null
  teslim_edilen_miktar?: number | null
}

type NullableFilterQuery<T> = {
  eq: (column: string, value: string) => T
  is: (column: string, value: null) => T
}

function applyNullableFilter<T extends NullableFilterQuery<T>>(query: T, column: string, value: string | null) {
  return value ? query.eq(column, value) : query.is(column, null)
}

async function createEmanetTakipIfNeeded(teslimat: { id: string }, input: TeslimatInput, kalem: PersistedKalem) {
  const miktar = Number(kalem.miktar ?? 0)
  if (miktar <= 0) return

  const supabase = createServiceClient()
  const { data: mevcut, error: mevcutError } = await supabase
    .from('emanet_takipleri')
    .select('id')
    .eq('kalem_id', kalem.id)
    .limit(1)
  if (mevcutError) throw mevcutError
  if ((mevcut ?? []).length > 0) return

  const { error } = await supabase.from('emanet_takipleri').insert({
    teslimat_id: teslimat.id,
    kalem_id: kalem.id,
    customer_id: input.customer_id,
    sube_id: input.sube_id,
    urun_id: kalem.urun_id,
    miktar,
    geri_alinan_miktar: 0,
    hedef_tarih: kalem.hedef_tarih ?? input.hedef_tarih,
    durum: 'acik',
  })
  if (error) throw new Error(dbErrorMessage('Emanet takip kaydı oluşturulamadı', error))
}

async function createGeriTeslimTakipIfNeeded(teslimat: { id: string }, input: TeslimatInput, kalem: PersistedKalem) {
  const supabase = createServiceClient()
  const { data: mevcut, error: mevcutError } = await supabase
    .from('geri_teslim_takipleri')
    .select('id')
    .eq('kalem_id', kalem.id)
    .limit(1)
  if (mevcutError) throw mevcutError
  if ((mevcut ?? []).length > 0) return

  const { error } = await supabase.from('geri_teslim_takipleri').insert({
    teslimat_id: teslimat.id,
    kalem_id: kalem.id,
    customer_id: input.customer_id,
    sube_id: input.sube_id,
    urun_id: kalem.urun_id,
    miktar: Number(kalem.miktar ?? 0),
    hedef_tarih: kalem.hedef_tarih ?? input.hedef_tarih,
  })
  if (error) throw new Error(dbErrorMessage('Geri teslim takip kaydı oluşturulamadı', error))
}

async function reduceGeriTeslimTakipleri(input: TeslimatInput, kalem: PersistedKalem) {
  const supabase = createServiceClient()
  let query = supabase
    .from('geri_teslim_takipleri')
    .select('id, miktar, teslim_edilen_miktar')
    .eq('customer_id', input.customer_id)
    .in('durum', ['bekliyor', 'kismi_teslim'])
    .order('created_at', { ascending: true })

  query = applyNullableFilter(query, 'sube_id', input.sube_id)
  query = applyNullableFilter(query, 'urun_id', kalem.urun_id)

  const { data, error } = await query
  if (error) throw error

  let kalan = Number(kalem.miktar ?? 0)
  for (const takip of (data ?? []) as TakipRow[]) {
    if (kalan <= 0) break
    const toplam = Number(takip.miktar ?? 0)
    const mevcut = Number(takip.teslim_edilen_miktar ?? 0)
    const acik = Math.max(toplam - mevcut, 0)
    if (acik <= 0) continue

    const kapanan = Math.min(acik, kalan)
    const yeniMiktar = mevcut + kapanan
    kalan -= kapanan
    const durum = yeniMiktar >= toplam ? 'teslim_edildi' : 'kismi_teslim'
    const { error: updateError } = await supabase
      .from('geri_teslim_takipleri')
      .update({
        teslim_edilen_miktar: yeniMiktar,
        durum,
        kapandi_at: durum === 'teslim_edildi' ? new Date().toISOString() : null,
      })
      .eq('id', takip.id)
    if (updateError) throw updateError
  }
}

async function reduceEmanetTakipleri(input: TeslimatInput, kalem: PersistedKalem) {
  const supabase = createServiceClient()
  let query = supabase
    .from('emanet_takipleri')
    .select('id, miktar, geri_alinan_miktar')
    .eq('customer_id', input.customer_id)
    .in('durum', ['acik', 'kismi_kapandi'])
    .order('created_at', { ascending: true })

  query = applyNullableFilter(query, 'sube_id', input.sube_id)
  query = applyNullableFilter(query, 'urun_id', kalem.urun_id)

  const { data, error } = await query
  if (error) throw error

  let kalan = Number(kalem.miktar ?? 0)
  for (const takip of (data ?? []) as TakipRow[]) {
    if (kalan <= 0) break
    const toplam = Number(takip.miktar ?? 0)
    const mevcut = Number(takip.geri_alinan_miktar ?? 0)
    const acik = Math.max(toplam - mevcut, 0)
    if (acik <= 0) continue

    const kapanan = Math.min(acik, kalan)
    const yeniMiktar = mevcut + kapanan
    kalan -= kapanan
    const durum = yeniMiktar >= toplam ? 'kapandi' : 'kismi_kapandi'
    const { error: updateError } = await supabase
      .from('emanet_takipleri')
      .update({
        geri_alinan_miktar: yeniMiktar,
        durum,
        kapandi_at: durum === 'kapandi' ? new Date().toISOString() : null,
      })
      .eq('id', takip.id)
    if (updateError) throw updateError
  }
}

async function applyKalemSideEffects(teslimat: { id: string; teslimat_no: string }, input: TeslimatInput, kalemler: PersistedKalem[]) {
  if (input.durum !== 'tamamlandi') return

  for (const kalem of kalemler ?? []) {
    const urunId = kalem.urun_id
    const miktar = Number(kalem.miktar ?? 0)
    if (urunId && kalem.stoktan_duser_mi && miktar > 0) {
      await adjustUrunStok(urunId, miktar, teslimat.teslimat_no, `${teslimat.teslimat_no} - ${kalem.aciklama}`)
    }
    if (kalem.hareket_tipi === 'emanet_teslim' || kalem.emanet_mi) {
      await createEmanetTakipIfNeeded(teslimat, input, kalem)
    }
    if (GERI_TESLIM_GEREKTIREN_TIPLER.has(kalem.hareket_tipi) || (kalem.geri_alinmasi_gerekir_mi && kalem.hareket_tipi !== 'emanet_teslim')) {
      await createGeriTeslimTakipIfNeeded(teslimat, input, kalem)
    }
    if (kalem.hareket_tipi === 'dolumlu_teslim') {
      await reduceGeriTeslimTakipleri(input, kalem)
    }
    if (kalem.hareket_tipi === 'emanet_geri_alindi') {
      await reduceEmanetTakipleri(input, kalem)
    }
  }
}

export async function syncTeslimatSideEffects(teslimatId: string) {
  const supabase = createServiceClient()
  const [{ data: teslimat, error: teslimatError }, { data: kalemler, error: kalemError }] = await Promise.all([
    supabase
      .from('teslimatlar')
      .select('id, teslimat_no, customer_id, sube_id, personel_id, teslimat_tarihi, hedef_tarih, durum, on_kayit_secimi, aciklama, notlar')
      .eq('id', teslimatId)
      .single(),
    supabase
      .from('teslimat_kalemleri')
      .select('id, urun_id, aciklama, hareket_tipi, miktar, stoktan_duser_mi, emanet_mi, geri_alinmasi_gerekir_mi, hedef_tarih, faturalanir_mi, birim, birim_fiyat, toplam_tutar, notlar')
      .eq('teslimat_id', teslimatId)
      .order('created_at'),
  ])
  if (teslimatError) throw new Error(dbErrorMessage('Teslimat üst kaydı oluşturulamadı', teslimatError))
  if (kalemError) throw new Error(dbErrorMessage('Teslimat kalemleri oluşturulamadı', kalemError))

  const input: TeslimatInput = {
    customer_id: teslimat.customer_id,
    sube_id: teslimat.sube_id,
    personel_id: teslimat.personel_id,
    teslimat_tarihi: teslimat.teslimat_tarihi,
    hedef_tarih: teslimat.hedef_tarih,
    durum: teslimat.durum,
    on_kayit_secimi: teslimat.on_kayit_secimi,
    aciklama: teslimat.aciklama,
    notlar: teslimat.notlar,
    kalemler: [],
  }

  await applyKalemSideEffects(
    { id: teslimat.id, teslimat_no: teslimat.teslimat_no },
    input,
    (kalemler ?? []) as PersistedKalem[]
  )
}

async function createOnKayitlarForTeslimat(teslimat: { id: string; teslimat_no: string }, input: TeslimatInput, kalemler: PersistedKalem[]) {
  if (input.durum !== 'tamamlandi') return false

  const adaylar = (kalemler ?? []).filter(k => k.faturalanir_mi && Number(k.toplam_tutar ?? 0) > 0)
  if (adaylar.length === 0) return false

  const supabase = createServiceClient()
  const aciklamalar = adaylar.map(k => `${teslimat.teslimat_no} - ${k.aciklama}`)
  const { data: mevcutlar, error: mevcutError } = await supabase
    .from('on_kayitlar')
    .select('id, aciklama, notlar')
    .eq('customer_id', input.customer_id)
    .in('aciklama', aciklamalar)
  if (mevcutError) throw mevcutError

  const mevcutAciklamalar = new Set((mevcutlar ?? []).map(k => k.aciklama))
  const mevcutKalemler = new Set(
    (mevcutlar ?? [])
      .map(k => String(k.notlar ?? '').match(/Teslimat kalemi: ([0-9a-f-]+)/i)?.[1])
      .filter(Boolean)
  )

  const rows = adaylar
    .filter(k => !mevcutKalemler.has(k.id) && !mevcutAciklamalar.has(`${teslimat.teslimat_no} - ${k.aciklama}`))
    .map(k => ({
      customer_id: input.customer_id,
      kayit_tarihi: input.teslimat_tarihi,
      aciklama: `${teslimat.teslimat_no} - ${k.aciklama}`,
      miktar: Number(k.miktar ?? 1),
      birim: k.birim ?? 'adet',
      birim_fiyat: Number(k.birim_fiyat ?? 0),
      toplam_tutar: Number(k.toplam_tutar ?? 0),
      notlar: `Teslimat modülünden oluşturuldu. Teslimat: ${teslimat.teslimat_no}. Teslimat kalemi: ${k.id}`,
      durum: 'beklemede',
    }))

  if (rows.length === 0) return (mevcutlar ?? []).length > 0

  const { error } = await supabase.from('on_kayitlar').insert(rows)
  if (error) throw error

  return true
}

export async function createOnKayitFromTeslimatKalem(kalemId: string, input: {
  aciklama: string
  miktar: number
  birim_fiyat: number
  toplam_tutar: number
  notlar?: string | null
}) {
  const supabase = createServiceClient()
  const { data: kalem, error: kalemError } = await supabase
    .from('teslimat_kalemleri')
    .select('id, aciklama, miktar, birim, birim_fiyat, toplam_tutar, faturalanir_mi, teslimatlar(id, teslimat_no, teslimat_tarihi, durum, customer_id)')
    .eq('id', kalemId)
    .single()
  if (kalemError) throw kalemError

  const teslimat = kalem.teslimatlar as {
    id?: string | null
    teslimat_no?: string | null
    teslimat_tarihi?: string | null
    durum?: string | null
    customer_id?: string | null
  } | null
  if (!teslimat?.customer_id) throw new Error('Müşteri eşleşmesi bulunamadı.')
  if (teslimat.durum !== 'tamamlandi') throw new Error('Yalnızca tamamlanmış teslimat kalemleri ön kayda aktarılabilir.')
  if (!kalem.faturalanir_mi) throw new Error('Bu kalem ön kayda dahil edilmiyor.')

  const marker = `Teslimat kalemi: ${kalem.id}`
  const { data: mevcutMarker, error: mevcutMarkerError } = await supabase
    .from('on_kayitlar')
    .select('id')
    .ilike('notlar', `%${marker}%`)
    .limit(1)
  if (mevcutMarkerError) throw mevcutMarkerError
  if ((mevcutMarker ?? []).length > 0) {
    return { id: mevcutMarker![0].id as string, created: false }
  }

  const onKayitAciklama = `${teslimat.teslimat_no} - ${input.aciklama.trim() || kalem.aciklama}`
  const { data: mevcutAciklama, error: mevcutAciklamaError } = await supabase
    .from('on_kayitlar')
    .select('id')
    .eq('customer_id', teslimat.customer_id)
    .eq('aciklama', onKayitAciklama)
    .limit(1)
  if (mevcutAciklamaError) throw mevcutAciklamaError
  if ((mevcutAciklama ?? []).length > 0) {
    return { id: mevcutAciklama![0].id as string, created: false }
  }

  const miktar = Number(input.miktar || kalem.miktar || 1)
  const birimFiyat = Number(input.birim_fiyat || 0)
  const toplamTutar = Number(input.toplam_tutar || miktar * birimFiyat)
  if (toplamTutar <= 0) throw new Error('Ön kayıt için tutar sıfırdan büyük olmalı.')

  const { data: onKayit, error } = await supabase
    .from('on_kayitlar')
    .insert({
      customer_id: teslimat.customer_id,
      kayit_tarihi: teslimat.teslimat_tarihi,
      aciklama: onKayitAciklama,
      miktar,
      birim: kalem.birim ?? 'adet',
      birim_fiyat: birimFiyat,
      toplam_tutar: toplamTutar,
      notlar: `${input.notlar?.trim() || 'Teslimat modülünden manuel aktarıldı.'} Teslimat: ${teslimat.teslimat_no}. ${marker}`,
      durum: 'beklemede',
    })
    .select('id')
    .single()
  if (error) throw error

  await supabase.from('teslimatlar').update({ on_kayit_olusturuldu: true }).eq('id', teslimat.id)

  return { id: onKayit.id as string, created: true }
}

async function reverseExistingStock(teslimatId: string, teslimatNo: string) {
  const supabase = createServiceClient()
  const { data: oldKalemler, error } = await supabase
    .from('teslimat_kalemleri')
    .select('urun_id, aciklama, miktar, stoktan_duser_mi')
    .eq('teslimat_id', teslimatId)
  if (error) throw error

  for (const kalem of oldKalemler ?? []) {
    const urunId = kalem.urun_id as string | null
    const miktar = Number(kalem.miktar ?? 0)
    if (urunId && kalem.stoktan_duser_mi && miktar > 0) {
      await reverseUrunStok(urunId, miktar, teslimatNo, `${teslimatNo} iptal - ${kalem.aciklama}`)
    }
  }
}

export async function createTeslimat(input: TeslimatInput, userId?: string | null) {
  if (!input.customer_id) throw new Error('Müşteri seçimi zorunlu.')
  const validKalemler = input.kalemler.filter(k => k.aciklama.trim() && k.miktar > 0)
  if (validKalemler.length === 0) throw new Error('En az bir teslimat kalemi girilmeli.')

  const supabase = createServiceClient()
  const teslimatNo = await nextTeslimatNo()
  const { data: teslimat, error: teslimatError } = await supabase
    .from('teslimatlar')
    .insert({
      teslimat_no: teslimatNo,
      customer_id: input.customer_id,
      sube_id: input.sube_id,
      personel_id: input.personel_id,
      teslimat_tarihi: input.teslimat_tarihi,
      hedef_tarih: input.hedef_tarih,
      durum: input.durum,
      on_kayit_secimi: input.on_kayit_secimi,
      aciklama: input.aciklama,
      notlar: input.notlar,
      created_by: userId ?? null,
    })
    .select('id, teslimat_no')
    .single()

  if (teslimatError) throw teslimatError

  const { data: kalemler, error: kalemError } = await supabase
    .from('teslimat_kalemleri')
    .insert(toKalemRows(teslimat.id, input, validKalemler))
    .select('id, urun_id, aciklama, hareket_tipi, miktar, stoktan_duser_mi, emanet_mi, geri_alinmasi_gerekir_mi, hedef_tarih, faturalanir_mi, birim, birim_fiyat, toplam_tutar, notlar')

  if (kalemError) throw kalemError

  await supabase.from('teslimat_durum_gecmisi').insert({
    teslimat_id: teslimat.id,
    yeni_durum: input.durum,
    aciklama: 'Teslimat oluşturuldu',
    created_by: userId ?? null,
  })

  await applyKalemSideEffects(teslimat, input, kalemler ?? [])

  const onKayitOlustu = await createOnKayitlarForTeslimat(teslimat, input, kalemler ?? [])
  if (onKayitOlustu) {
    await supabase.from('teslimatlar').update({ on_kayit_olusturuldu: true }).eq('id', teslimat.id)
  }

  return teslimat
}

export async function updateTeslimat(id: string, input: TeslimatInput, userId?: string | null) {
  if (!input.customer_id) throw new Error('Müşteri seçimi zorunlu.')
  const validKalemler = input.kalemler.filter(k => k.aciklama.trim() && k.miktar > 0)
  if (validKalemler.length === 0) throw new Error('En az bir teslimat kalemi girilmeli.')

  const supabase = createServiceClient()
  const { data: mevcut, error: mevcutError } = await supabase
    .from('teslimatlar')
    .select('id, teslimat_no, durum')
    .eq('id', id)
    .single()
  if (mevcutError) throw mevcutError

  await reverseExistingStock(id, mevcut.teslimat_no)

  const { error: emanetError } = await supabase.from('emanet_takipleri').delete().eq('teslimat_id', id)
  if (emanetError) throw emanetError
  const { error: geriError } = await supabase.from('geri_teslim_takipleri').delete().eq('teslimat_id', id)
  if (geriError) throw geriError
  const { error: kalemDeleteError } = await supabase.from('teslimat_kalemleri').delete().eq('teslimat_id', id)
  if (kalemDeleteError) throw kalemDeleteError

  const { data: teslimat, error: teslimatError } = await supabase
    .from('teslimatlar')
    .update({
      customer_id: input.customer_id,
      sube_id: input.sube_id,
      personel_id: input.personel_id,
      teslimat_tarihi: input.teslimat_tarihi,
      hedef_tarih: input.hedef_tarih,
      durum: input.durum,
      on_kayit_secimi: input.on_kayit_secimi,
      aciklama: input.aciklama,
      notlar: input.notlar,
      on_kayit_olusturuldu: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, teslimat_no')
    .single()
  if (teslimatError) throw teslimatError

  const { data: kalemler, error: kalemError } = await supabase
    .from('teslimat_kalemleri')
    .insert(toKalemRows(id, input, validKalemler))
    .select('id, urun_id, aciklama, hareket_tipi, miktar, stoktan_duser_mi, emanet_mi, geri_alinmasi_gerekir_mi, hedef_tarih, faturalanir_mi, birim, birim_fiyat, toplam_tutar, notlar')
  if (kalemError) throw kalemError

  if (mevcut.durum !== input.durum) {
    await supabase.from('teslimat_durum_gecmisi').insert({
      teslimat_id: id,
      eski_durum: mevcut.durum,
      yeni_durum: input.durum,
      aciklama: 'Teslimat düzenlendi',
      created_by: userId ?? null,
    })
  }

  await applyKalemSideEffects(teslimat, input, kalemler ?? [])

  const onKayitOlustu = await createOnKayitlarForTeslimat(teslimat, input, kalemler ?? [])
  if (onKayitOlustu) {
    await supabase.from('teslimatlar').update({ on_kayit_olusturuldu: true }).eq('id', id)
  }

  return teslimat
}

export async function deleteTeslimat(id: string) {
  const supabase = createServiceClient()
  const { data: teslimat, error: teslimatError } = await supabase
    .from('teslimatlar')
    .select('id, teslimat_no')
    .eq('id', id)
    .single()
  if (teslimatError) throw teslimatError

  await reverseExistingStock(id, teslimat.teslimat_no)

  const { error } = await supabase.from('teslimatlar').delete().eq('id', id)
  if (error) throw error
}

export function normalizeTeslimatInput(raw: unknown): TeslimatInput {
  if (!raw || typeof raw !== 'object') throw new Error('Form verisi geçersiz.')
  const data = raw as Record<string, unknown>
  const kalemler = Array.isArray(data.kalemler) ? data.kalemler : []
  return {
    customer_id: String(data.customer_id ?? ''),
    sube_id: data.sube_id ? String(data.sube_id) : null,
    personel_id: data.personel_id ? String(data.personel_id) : null,
    teslimat_tarihi: data.teslimat_tarihi ? String(data.teslimat_tarihi) : todayISO(),
    hedef_tarih: data.hedef_tarih ? String(data.hedef_tarih) : null,
    durum: data.durum === 'sevkte' || data.durum === 'tamamlandi' ? data.durum : 'taslak',
    on_kayit_secimi: data.on_kayit_secimi === 'olusturulsun' || data.on_kayit_secimi === 'mevcut_kayda_eklensin' ? data.on_kayit_secimi : 'olusturulmasin',
    aciklama: data.aciklama ? String(data.aciklama) : null,
    notlar: data.notlar ? String(data.notlar) : null,
    kalemler: kalemler.map((item: unknown) => {
      const k = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      const hareketTipi = typeof k.hareket_tipi === 'string' && HAREKET_TIPLERI.includes(k.hareket_tipi as HareketTipi)
        ? k.hareket_tipi as HareketTipi
        : 'diger'
      return {
      urun_id: k.urun_id ? String(k.urun_id) : null,
      aciklama: String(k.aciklama ?? ''),
      hareket_yonu: k.hareket_yonu === 'gelen' ? 'gelen' : 'giden',
      hareket_tipi: hareketTipi,
      miktar: Number(k.miktar ?? 1),
      birim: String(k.birim ?? 'adet'),
      birim_fiyat: Number(k.birim_fiyat ?? 0),
      stoktan_duser_mi: Boolean(k.stoktan_duser_mi),
      musteri_envanterine_isler_mi: Boolean(k.musteri_envanterine_isler_mi),
      emanet_mi: Boolean(k.emanet_mi),
      geri_alinmasi_gerekir_mi: Boolean(k.geri_alinmasi_gerekir_mi),
      hedef_tarih: k.hedef_tarih ? String(k.hedef_tarih) : null,
      faturalanir_mi: Boolean(k.faturalanir_mi),
      onceki_kalem_id: k.onceki_kalem_id ? String(k.onceki_kalem_id) : null,
      notlar: k.notlar ? String(k.notlar) : null,
      }
    }),
  }
}
