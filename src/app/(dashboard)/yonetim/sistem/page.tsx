import { createServiceClient } from '@/lib/supabase/service'

export default async function SistemPage() {
  const supabase = createServiceClient()

  const [{ data: profiller }, { data: roller }, { data: islemler }] = await Promise.all([
    supabase.from('kullanici_profiller').select('id, aktif, rol_id, roller(ad, renk)'),
    supabase.from('roller').select('id, ad, renk'),
    supabase.from('giris_kayitlari').select('islem_tipi, created_at')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ])

  const toplamKullanici = profiller?.length ?? 0
  const aktifKullanici  = profiller?.filter(p => p.aktif).length ?? 0

  // Role göre dağılım
  const rolDagilim: Record<string, { ad: string; renk: string; sayi: number }> = {}
  for (const r of roller ?? []) {
    rolDagilim[r.id] = { ad: r.ad, renk: r.renk, sayi: 0 }
  }
  for (const p of profiller ?? []) {
    if (p.rol_id && rolDagilim[p.rol_id]) rolDagilim[p.rol_id].sayi++
  }

  const ayIslemler = {
    giris: islemler?.filter(i => i.islem_tipi === 'giris').length ?? 0,
    cikis: islemler?.filter(i => i.islem_tipi === 'cikis').length ?? 0,
    basarisiz: islemler?.filter(i => i.islem_tipi === 'basarisiz_giris').length ?? 0,
  }

  const rolSirali = Object.values(rolDagilim).sort((a, b) => b.sayi - a.sayi)
  const maxSayi = Math.max(...rolSirali.map(r => r.sayi), 1)

  return (
    <div className="space-y-5">
      {/* Üst kartlar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Toplam Kullanıcı</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{toplamKullanici}</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-xs text-green-600">Aktif Kullanıcı</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{aktifKullanici}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-xs text-blue-600">Bu Ay Giriş</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{ayIslemler.giris}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-xs text-red-600">Bu Ay Başarısız</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{ayIslemler.basarisiz}</div>
        </div>
      </div>

      {/* Role göre dağılım */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Role Göre Kullanıcı Dağılımı</h3>
        <div className="space-y-3">
          {rolSirali.map(r => (
            <div key={r.ad} className="flex items-center gap-3">
              <div className="w-28 text-sm text-gray-700 dark:text-gray-300 truncate">{r.ad}</div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                <div
                  className="h-5 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max((r.sayi / maxSayi) * 100, r.sayi > 0 ? 8 : 0)}%`,
                    backgroundColor: r.renk,
                  }}>
                </div>
              </div>
              <div className="w-8 text-sm font-bold text-gray-700 dark:text-gray-300 text-right">{r.sayi}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bu ay özet */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Bu Ay İşlem Özeti</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-700">{ayIslemler.giris}</div>
            <div className="text-xs text-green-600 mt-1">Başarılı Giriş</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-700">{ayIslemler.cikis}</div>
            <div className="text-xs text-blue-600 mt-1">Çıkış</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-700">{ayIslemler.basarisiz}</div>
            <div className="text-xs text-red-600 mt-1">Başarısız Giriş</div>
          </div>
        </div>
      </div>
    </div>
  )
}
