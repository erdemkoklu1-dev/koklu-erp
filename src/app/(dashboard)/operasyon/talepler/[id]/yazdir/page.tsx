import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess, type CurrentAccess } from '@/lib/auth/authorization'
import { formatTRDate } from '@/lib/finance/formatters'
import { talepStatusLabel } from '../../status'
import PrintButton from '@/components/PrintButton'

function canAccessTalep(access: CurrentAccess | null, subeId: string | null) {
  if (!access) return false
  if (access.isAdmin) return true
  return !!subeId && access.branchIds.includes(subeId)
}

export default async function TalepYazdirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const access = await getCurrentAccess()

  const { data: talep, error } = await supabase
    .from('musteri_talepleri')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`Talep yazdırma bilgisi alınamadı: ${error.message}`)
  if (!talep || !canAccessTalep(access, talep.sube_id)) notFound()

  const [{ data: customer }, { data: sube }, { data: personel }] = await Promise.all([
    talep.customer_id
      ? supabase.from('customers').select('full_name, phone, email, address').eq('id', talep.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    talep.sube_id
      ? supabase.from('subeler').select('ad').eq('id', talep.sube_id).maybeSingle()
      : Promise.resolve({ data: null }),
    talep.sorumlu_personel_id
      ? supabase.from('personeller').select('ad, soyad').eq('id', talep.sorumlu_personel_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const customerName = talep.customer_name_snapshot ?? customer?.full_name ?? '-'
  const personelName = personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() : '-'
  const rows = [
    ['Talep No', talep.talep_no],
    ['Müşteri', customerName],
    ['Telefon', customer?.phone ?? '-'],
    ['E-posta', customer?.email ?? '-'],
    ['Adres', customer?.address ?? '-'],
    ['Şube', sube?.ad ?? '-'],
    ['Cihaz', talep.cihaz_name_snapshot ?? '-'],
    ['Kategori', talep.kategori],
    ['Öncelik', talep.oncelik],
    ['Durum', talepStatusLabel(talep.durum)],
    ['Talep Tarihi', formatTRDate(talep.talep_tarihi)],
    ['Hedef Tarih', formatTRDate(talep.hedef_tarih)],
    ['Sorumlu', personelName],
    ['Kaynak', talep.kaynak],
  ]

  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-gray-900 print:p-0">
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link href={`/operasyon/talepler/${talep.id}`} className="text-sm text-[#C8102E] hover:underline">← Talep Detayı</Link>
        <PrintButton label="Yazdır" />
      </div>

      <header className="border-b pb-4">
        <h1 className="text-2xl font-bold">Müşteri Talep Formu</h1>
        <p className="mt-1 font-mono text-sm text-[#C8102E]">{talep.talep_no}</p>
      </header>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">{talep.baslik}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="border-b pb-2">
              <dt className="text-xs text-gray-500">{label}</dt>
              <dd className="mt-1 font-medium">{value ?? '-'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Açıklama</h2>
        <p className="mt-2 whitespace-pre-wrap rounded-md border p-3 text-sm">{talep.aciklama}</p>
      </section>

      {talep.notlar && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Notlar</h2>
          <p className="mt-2 whitespace-pre-wrap rounded-md border p-3 text-sm">{talep.notlar}</p>
        </section>
      )}
    </main>
  )
}
