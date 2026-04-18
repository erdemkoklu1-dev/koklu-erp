import { createServiceClient } from '@/lib/supabase/service'
import KuralModal from './KuralModal'

const TETIKLEYICI_LABEL: Record<string, string> = {
  kontrol_yaklasiyor: 'Kontrol Yaklaşıyor',
  skt_yaklasiyor:     'SKT Yaklaşıyor',
  kontrol_gecti:      'Kontrol Geçti',
  skt_gecti:          'SKT Geçti',
}

const KANAL_BADGE: Record<string, string> = {
  email:    'bg-blue-50 text-blue-700 border-blue-200',
  sms:      'bg-green-50 text-green-700 border-green-200',
  whatsapp: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default async function KurallarPage() {
  const supabase = createServiceClient()

  const [{ data: kurallar }, { data: sablonlar }] = await Promise.all([
    supabase
      .from('hatirlatma_kurallari')
      .select('*, hatirlatma_sablonlari(id, ad, kanal)')
      .order('gun_oncesi', { ascending: false }),
    supabase
      .from('hatirlatma_sablonlari')
      .select('id, ad, kanal')
      .eq('aktif', true)
      .order('kanal'),
  ])

  return (
    <div className="p-6 space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Hatırlatma Kuralları</h2>
          <p className="text-xs text-gray-400 mt-0.5">Otomatik hatırlatma için tetikleyici kurallar tanımlayın</p>
        </div>
        <KuralModal sablonlar={sablonlar ?? []} />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
        Bu kurallar şu an <strong>manüel gönderim</strong> için referans görevi görür.
        Otomatik gönderim için Supabase Edge Functions veya harici bir cron servisi gereklidir.
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {(kurallar ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            Henüz kural tanımlanmamış.{' '}
            <span className="text-[#C8102E]">+ Yeni Kural ile başlayın.</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Tetikleyici</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Zamanlama</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Şablon</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Kanal</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Durum</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {(kurallar ?? []).map(k => {
                const sablon = k.hatirlatma_sablonlari as { id: string; ad: string; kanal: string } | null
                return (
                  <tr key={k.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                      {TETIKLEYICI_LABEL[k.tetikleyici_tip] ?? k.tetikleyici_tip}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {k.gun_oncesi === 0
                        ? 'Tarih geçince'
                        : `${k.gun_oncesi} gün önce`}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {sablon?.ad ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {sablon?.kanal ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${KANAL_BADGE[sablon.kanal] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          {sablon.kanal}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        k.aktif
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}>
                        {k.aktif ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <KuralModal
                        kural={k}
                        sablonlar={sablonlar ?? []}
                        trigger={
                          <button className="text-xs text-gray-500 hover:text-[#C8102E] underline">
                            Düzenle
                          </button>
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
