import { materialItem } from './material-list'

export type RoomIntegrityInput = {
  oda_adi?: string
  test_tarihi?: string
  oda_eni?: number
  oda_boyu?: number
  oda_yuksekligi?: number
  hacim?: number
  asma_tavan?: boolean
  yukseltilmis_doseme?: boolean
  net_korunan_hacim?: number
  kapi_sayisi?: number
  menfez_sayisi?: number
  aciklik_notlari?: string
  gaz_tipi?: string
  hedef_tutma_suresi?: number
  tasarim_konsantrasyonu?: number
  oda_sicakligi?: number
  sistem_basinci_notu?: string
  fan_modeli?: string
  manometre_modeli?: string
  anemometre_modeli?: string
  rpm_olcer_modeli?: string
  cihaz_seri_no?: string
  kalibrasyon_tarihi?: string
  pozitif_basinç?: number
  negatif_basinç?: number
  test_basinci?: number
  test_suresi?: number
  baslangic_basinci?: number
  bitis_basinci?: number
  kacak_debisi?: number
  etkin_kacak_alani?: number
  sonuc?: 'Uygun' | 'Şartlı Uygun' | 'Uygun Değil'
  olcum_notlari?: string
}

export function calculateRoomIntegrity(input: RoomIntegrityInput) {
  const grossVolume = Number(input.hacim || ((input.oda_eni ?? 0) * (input.oda_boyu ?? 0) * (input.oda_yuksekligi ?? 0)) || 0)
  const netVolume = Number(input.net_korunan_hacim || grossVolume)
  const result = input.sonuc || (Number(input.hedef_tutma_suresi || 0) >= 10 ? 'Uygun' : 'Şartlı Uygun')
  const needsImprovement = result !== 'Uygun'

  return {
    calculation_result: {
      brut_hacim: Number(grossVolume.toFixed(2)),
      net_korunan_hacim: Number(netVolume.toFixed(2)),
      degerlendirme: result,
      iyilestirme_onerileri: needsImprovement
        ? ['Kapı fitilleri, menfezler, kablo geçişleri ve asma tavan/döşeme açıklıkları sızdırmazlık açısından iyileştirilmelidir.']
        : ['Temel kayıt sonucuna göre oda sızdırmazlığı uygun olarak işaretlenmiştir.'],
      uyari: 'Bu MVP kaydı temel test raporu altyapısıdır; nihai mühendislik değerlendirmesi ve sertifikalı test raporu yerine geçmez.',
    },
    material_list: needsImprovement
      ? [materialItem('oda_sizdirmazlik_testi', 'Sızdırmazlık İyileştirme Keşif Kalemi', 'Oda Sızdırmazlık', 1, 'set')]
      : [],
  }
}
