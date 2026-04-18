import { createServiceClient } from '@/lib/supabase/service'
import SablonModal from './SablonModal'

const KANAL_BADGE: Record<string, string> = {
  email:    'bg-blue-50 text-blue-700 border-blue-200',
  sms:      'bg-green-50 text-green-700 border-green-200',
  whatsapp: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default async function SablonlarPage() {
  const supabase = createServiceClient()

  const { data: sablonlar } = await supabase
    .from('hatirlatma_sablonlari')
    .select('*')
    .order('kanal')
    .order('ad')

  return (
    <div className="p-6 space-y-5">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Mesaj Şablonları</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Kullanılabilir değişkenler: {'{musteri_adi}'}, {'{cihaz_adi}'}, {'{kontrol_tarihi}'}, {'{gun_kaldi}'}, {'{firma_adi}'}
          </p>
        </div>
        <SablonModal />
      </div>

      {(sablonlar ?? []).length === 0 ? (
        <div className="bg-white border rounded-xl px-4 py-12 text-center text-sm text-gray-400">
          Henüz şablon yok. <span className="text-[#C8102E]">+ Yeni Şablon ile başlayın.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {(sablonlar ?? []).map(s => (
            <div key={s.id} className="bg-white border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{s.ad}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${KANAL_BADGE[s.kanal] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {s.kanal}
                  </span>
                  {!s.aktif && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-500 border-gray-200">
                      Pasif
                    </span>
                  )}
                </div>
                <SablonModal
                  sablon={s as any}
                  trigger={
                    <button className="text-xs text-gray-500 hover:text-[#C8102E] underline">
                      Düzenle
                    </button>
                  }
                />
              </div>
              <div className="px-5 py-4 space-y-2">
                {s.konu && (
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Konu</div>
                    <div className="text-sm text-gray-700 font-medium">{s.konu}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Mesaj</div>
                  <div className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs leading-relaxed">
                    {s.mesaj_sablonu}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
