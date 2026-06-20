import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatTRDate } from '@/lib/finance/formatters'
import { TeklifSilButton } from '../TeklifSilButton'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

const DURUM_CONFIG: Record<string, { label: string; className: string }> = {
  taslak:     { label: 'Taslak',     className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600' },
  gonderildi: { label: 'Gönderildi', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  bekliyor:   { label: 'Bekliyor',   className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  kazanildi:  { label: 'Kazanıldı',  className: 'bg-green-50 text-green-700 border-green-200' },
  kaybedildi: { label: 'Kaybedildi', className: 'bg-red-50 text-red-700 border-red-200' },
  iptal:      { label: 'İptal',      className: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600' },
}

type TeklifCustomer = { full_name?: string | null }

function fmt(n: number, currency: string) {
  const str = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n)
  return currency === 'USD' ? `$${str}` : currency === 'EUR' ? `€${str}` : `${str} ₺`
}

export default async function TeklifDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  const [{ data: teklif }, { data: kalemler }] = await Promise.all([
    applyTenantScope(supabase.from('teklifler')
      .select('*, customers(full_name, phone)')
      .eq('id', id), tenantAccess).maybeSingle(),
    applyTenantScope(supabase.from('teklif_kalemleri').select('*').eq('teklif_id', id).order('sira_no'), tenantAccess),
  ])

  if (!teklif) notFound()

  const conf = DURUM_CONFIG[teklif.durum] ?? DURUM_CONFIG.taslak
  const customer = teklif.customers as TeklifCustomer | null
  const musteriAdi = customer?.full_name ?? teklif.musteri_adi
  const currency   = teklif.para_birimi as string

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/fiyat-teklifleri" className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700">← Fiyat Teklifleri</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">{teklif.teklif_no}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/fiyat-teklifleri/${id}/pdf`} target="_blank"
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            📄 Önizle / PDF
          </Link>
          <Link href={`/fiyat-teklifleri/${id}/durum`}
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#a50d26] transition-colors">
            Durum Güncelle
          </Link>
          <TeklifSilButton
            id={id}
            teklifNo={teklif.teklif_no}
            className="border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
          />
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-4">

        {/* Özet kart */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{musteriAdi}</span>
                {teklif.musteri_sehir && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">— {teklif.musteri_sehir}</span>
                )}
              </div>
              <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300">
                <span>Tarih: <strong>{formatTRDate(teklif.tarih)}</strong></span>
                <span>Geçerlilik: <strong>{formatTRDate(teklif.gecerlilik_bitis)}</strong></span>
                {teklif.musteri_telefon && <span>Tel: {teklif.musteri_telefon}</span>}
                {teklif.musteri_email && <span>E-posta: {teklif.musteri_email}</span>}
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${conf.className}`}>
                {conf.label}
              </span>
              <div className="text-2xl font-bold text-[#C8102E] mt-2">{fmt(teklif.genel_toplam ?? 0, currency)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{teklif.para_birimi} · KDV {
                teklif.kdv_durumu === 'dahil' ? 'Dahil' : teklif.kdv_durumu === 'haric' ? 'Hariç' : 'Yok'
              }</div>
            </div>
          </div>
        </div>

        {/* Kalemler */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Teklif Kalemleri</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">S.NO</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">AÇIKLAMA</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">ADET</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">BİRİM FİYAT</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">TOPLAM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(kalemler ?? []).map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{k.sira_no}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{k.aciklama}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{k.miktar}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{fmt(k.birim_fiyat, currency)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{fmt(k.toplam, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-gray-50 dark:bg-gray-700">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-sm text-right text-gray-600 dark:text-gray-300">KDV Hariç Toplam</td>
                <td className="px-4 py-2 text-sm text-right font-medium">{fmt(teklif.ara_toplam ?? 0, currency)}</td>
              </tr>
              {teklif.kdv_durumu !== 'yok' && (
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-sm text-right text-gray-600 dark:text-gray-300">KDV (%{teklif.kdv_orani})</td>
                  <td className="px-4 py-2 text-sm text-right font-medium">{fmt(teklif.kdv_tutari ?? 0, currency)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right font-bold text-gray-900 dark:text-gray-100">Genel Toplam</td>
                <td className="px-4 py-2 text-right font-bold text-[#C8102E] text-base">{fmt(teklif.genel_toplam ?? 0, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notlar */}
        {teklif.notlar && (
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notlar</h2>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{teklif.notlar}</p>
          </div>
        )}

        {/* Ticari şartname */}
        {teklif.ticari_sartname_ekli && teklif.ticari_sartname_metni && (
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Ticari Şartname</h2>
            <pre className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{teklif.ticari_sartname_metni}</pre>
          </div>
        )}

      </div>
    </div>
  )
}
