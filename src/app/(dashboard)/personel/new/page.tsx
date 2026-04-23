'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight, Check, User, Phone, Briefcase, Wallet, FileText } from 'lucide-react'

type Sube = { id: string; ad: string }
type Rol  = { id: string; ad: string }

const ADIMLAR = [
  { no: 1, label: 'Kişisel Bilgiler', icon: User },
  { no: 2, label: 'İletişim',         icon: Phone },
  { no: 3, label: 'Özlük Bilgileri',  icon: Briefcase },
  { no: 4, label: 'Mali Bilgiler',    icon: Wallet },
  { no: 5, label: 'Belgeler',         icon: FileText },
]

type Belge = { belge_tipi: string; belge_adi: string; belge_no: string; verilis_tarihi: string; gecerlilik_tarihi: string; veren_kurum: string }

const emptyForm = {
  // Adım 1
  ad: '', soyad: '', tc_kimlik_no: '', dogum_tarihi: '', dogum_yeri: '',
  cinsiyet: '', medeni_durum: '', kan_grubu: '', uyruk: 'T.C.',
  // Adım 2
  telefon: '', email: '', adres: '', sehir: '', posta_kodu: '',
  acil_iletisim_adi: '', acil_iletisim_telefonu: '', acil_iletisim_yakinligi: '',
  // Adım 3
  sube_id: '', pozisyon: '', departman: '', rol_id: '',
  istihdam_tipi: 'tam_zamanli', calisma_sekli: 'ofis',
  ise_baslama_tarihi: new Date().toISOString().split('T')[0], sgk_no: '', vergi_no: '', durum: 'aktif',
  // Adım 4
  maas: '', maas_turu: 'aylik', iban: '', banka_adi: '',
  notlar: '',
}

const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const INPUT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
const SELECT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white'

export default function YeniPersonelPage() {
  const router = useRouter()
  const supabase = createClient()
  const [adim, setAdim] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [belgeler, setBelgeler] = useState<Belge[]>([])
  const [subeler, setSubeler] = useState<Sube[]>([])
  const [roller, setRoller] = useState<Rol[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('subeler').select('id, ad').order('ad').then(({ data }: { data: Sube[] | null }) => setSubeler(data ?? []))
    supabase.from('roller').select('id, ad').order('ad').then(({ data }: { data: Rol[] | null }) => setRoller(data ?? []))
  }, [])

  function set(key: keyof typeof emptyForm, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function addBelge() {
    setBelgeler(b => [...b, { belge_tipi: 'diploma', belge_adi: '', belge_no: '', verilis_tarihi: '', gecerlilik_tarihi: '', veren_kurum: '' }])
  }

  function setBelge(idx: number, key: keyof Belge, val: string) {
    setBelgeler(prev => prev.map((b, i) => i === idx ? { ...b, [key]: val } : b))
  }

  function removeBelge(idx: number) {
    setBelgeler(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      const payload = {
        ...form,
        maas: form.maas ? parseFloat(form.maas) : null,
        sube_id: form.sube_id || null,
        rol_id: form.rol_id || null,
        ise_baslama_tarihi: form.ise_baslama_tarihi || null,
        dogum_tarihi: form.dogum_tarihi || null,
      }
      const { data: personel, error: err } = await supabase
        .from('personeller')
        .insert([payload])
        .select('id')
        .single()
      if (err) throw err

      if (belgeler.length > 0 && personel) {
        const belgelerPayload = belgeler
          .filter(b => b.belge_adi)
          .map(b => ({ ...b, personel_id: personel.id }))
        if (belgelerPayload.length > 0)
          await supabase.from('personel_belgeler').insert(belgelerPayload)
      }

      router.push(`/personel/${personel?.id ?? ''}`)
    } catch (e: any) {
      setError(e?.message ?? 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/personel')} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Yeni Personel Ekle</h1>
      </div>

      {/* Adım göstergesi */}
      <div className="flex items-center gap-0 mb-8">
        {ADIMLAR.map((a, i) => {
          const Icon = a.icon
          const done = adim > a.no
          const active = adim === a.no
          return (
            <div key={a.no} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${done ? 'bg-green-500 text-white' : active ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {done ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <span className={`text-xs hidden sm:block ${active ? 'text-[#C8102E] font-semibold' : 'text-gray-400'}`}>{a.label}</span>
              </div>
              {i < ADIMLAR.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${adim > a.no ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          )
        })}
      </div>

      {/* Form alanları */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        {adim === 1 && (
          <>
            <h2 className="font-semibold text-gray-800 mb-4">Kişisel Bilgiler</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Ad *</label><input value={form.ad} onChange={e => set('ad', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Soyad *</label><input value={form.soyad} onChange={e => set('soyad', e.target.value)} className={INPUT} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>TC Kimlik No</label><input value={form.tc_kimlik_no} onChange={e => set('tc_kimlik_no', e.target.value)} className={INPUT} maxLength={11} /></div>
              <div><label className={LABEL}>Doğum Tarihi</label><input type="date" value={form.dogum_tarihi} onChange={e => set('dogum_tarihi', e.target.value)} className={INPUT} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Doğum Yeri</label><input value={form.dogum_yeri} onChange={e => set('dogum_yeri', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Uyruk</label><input value={form.uyruk} onChange={e => set('uyruk', e.target.value)} className={INPUT} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Cinsiyet</label>
                <select value={form.cinsiyet} onChange={e => set('cinsiyet', e.target.value)} className={SELECT}>
                  <option value="">Seçin</option>
                  <option value="erkek">Erkek</option>
                  <option value="kadin">Kadın</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Medeni Durum</label>
                <select value={form.medeni_durum} onChange={e => set('medeni_durum', e.target.value)} className={SELECT}>
                  <option value="">Seçin</option>
                  <option value="bekar">Bekar</option>
                  <option value="evli">Evli</option>
                  <option value="bosanmis">Boşanmış</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Kan Grubu</label>
                <select value={form.kan_grubu} onChange={e => set('kan_grubu', e.target.value)} className={SELECT}>
                  <option value="">Seçin</option>
                  {['A+','A-','B+','B-','AB+','AB-','0+','0-'].map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {adim === 2 && (
          <>
            <h2 className="font-semibold text-gray-800 mb-4">İletişim Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Telefon</label><input value={form.telefon} onChange={e => set('telefon', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>E-posta</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT} /></div>
            </div>
            <div><label className={LABEL}>Adres</label><textarea value={form.adres} onChange={e => set('adres', e.target.value)} rows={2} className={INPUT} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Şehir</label><input value={form.sehir} onChange={e => set('sehir', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Posta Kodu</label><input value={form.posta_kodu} onChange={e => set('posta_kodu', e.target.value)} className={INPUT} /></div>
            </div>
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-semibold text-gray-700 mb-3">Acil İletişim</p>
              <div className="grid grid-cols-3 gap-4">
                <div><label className={LABEL}>Ad Soyad</label><input value={form.acil_iletisim_adi} onChange={e => set('acil_iletisim_adi', e.target.value)} className={INPUT} /></div>
                <div><label className={LABEL}>Telefon</label><input value={form.acil_iletisim_telefonu} onChange={e => set('acil_iletisim_telefonu', e.target.value)} className={INPUT} /></div>
                <div><label className={LABEL}>Yakınlığı</label><input value={form.acil_iletisim_yakinligi} onChange={e => set('acil_iletisim_yakinligi', e.target.value)} placeholder="Eş, anne, kardeş..." className={INPUT} /></div>
              </div>
            </div>
          </>
        )}

        {adim === 3 && (
          <>
            <h2 className="font-semibold text-gray-800 mb-4">Özlük Bilgileri</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Şube</label>
                <select value={form.sube_id} onChange={e => set('sube_id', e.target.value)} className={SELECT}>
                  <option value="">Şube Seçin</option>
                  {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Rol</label>
                <select value={form.rol_id} onChange={e => set('rol_id', e.target.value)} className={SELECT}>
                  <option value="">Rol Seçin</option>
                  {roller.map(r => <option key={r.id} value={r.id}>{r.ad}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Pozisyon</label><input value={form.pozisyon} onChange={e => set('pozisyon', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Departman</label><input value={form.departman} onChange={e => set('departman', e.target.value)} className={INPUT} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>İstihdam Tipi</label>
                <select value={form.istihdam_tipi} onChange={e => set('istihdam_tipi', e.target.value)} className={SELECT}>
                  <option value="tam_zamanli">Tam Zamanlı</option>
                  <option value="yari_zamanli">Yarı Zamanlı</option>
                  <option value="sozlesmeli">Sözleşmeli</option>
                  <option value="stajyer">Stajyer</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Çalışma Şekli</label>
                <select value={form.calisma_sekli} onChange={e => set('calisma_sekli', e.target.value)} className={SELECT}>
                  <option value="ofis">Ofis</option>
                  <option value="saha">Saha</option>
                  <option value="uzaktan">Uzaktan</option>
                  <option value="hibrit">Hibrit</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={LABEL}>İşe Başlama Tarihi</label><input type="date" value={form.ise_baslama_tarihi} onChange={e => set('ise_baslama_tarihi', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>SGK No</label><input value={form.sgk_no} onChange={e => set('sgk_no', e.target.value)} className={INPUT} /></div>
              <div><label className={LABEL}>Vergi No</label><input value={form.vergi_no} onChange={e => set('vergi_no', e.target.value)} className={INPUT} /></div>
            </div>
            <div>
              <label className={LABEL}>Durum</label>
              <select value={form.durum} onChange={e => set('durum', e.target.value)} className={SELECT}>
                <option value="aktif">Aktif</option>
                <option value="deneme">Deneme Sürecinde</option>
                <option value="izinli">İzinli</option>
                <option value="istifa">İstifa</option>
                <option value="cikis">Çıkış</option>
              </select>
            </div>
          </>
        )}

        {adim === 4 && (
          <>
            <h2 className="font-semibold text-gray-800 mb-4">Mali Bilgiler</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Maaş (₺)</label><input type="number" value={form.maas} onChange={e => set('maas', e.target.value)} className={INPUT} /></div>
              <div>
                <label className={LABEL}>Maaş Türü</label>
                <select value={form.maas_turu} onChange={e => set('maas_turu', e.target.value)} className={SELECT}>
                  <option value="aylik">Aylık</option>
                  <option value="gunluk">Günlük</option>
                  <option value="saatlik">Saatlik</option>
                </select>
              </div>
            </div>
            <div><label className={LABEL}>IBAN</label><input value={form.iban} onChange={e => set('iban', e.target.value)} placeholder="TR..." className={INPUT} /></div>
            <div><label className={LABEL}>Banka Adı</label><input value={form.banka_adi} onChange={e => set('banka_adi', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Notlar</label><textarea value={form.notlar} onChange={e => set('notlar', e.target.value)} rows={3} className={INPUT} /></div>
          </>
        )}

        {adim === 5 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Belgeler ve Sertifikalar</h2>
              <button onClick={addBelge} className="text-sm text-[#C8102E] hover:underline font-medium">+ Belge Ekle</button>
            </div>
            {belgeler.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Henüz belge eklenmedi. İsteğe bağlıdır.</p>
            )}
            <div className="space-y-4">
              {belgeler.map((b, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">Belge #{i + 1}</p>
                    <button onClick={() => removeBelge(i)} className="text-xs text-red-500 hover:underline">Sil</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Belge Tipi</label>
                      <select value={b.belge_tipi} onChange={e => setBelge(i, 'belge_tipi', e.target.value)} className={SELECT}>
                        <option value="diploma">Diploma</option>
                        <option value="sertifika">Sertifika</option>
                        <option value="ehliyet">Ehliyet</option>
                        <option value="kimlik">Kimlik</option>
                        <option value="sgk">SGK</option>
                        <option value="vergi">Vergi</option>
                        <option value="diger">Diğer</option>
                      </select>
                    </div>
                    <div><label className={LABEL}>Belge Adı *</label><input value={b.belge_adi} onChange={e => setBelge(i, 'belge_adi', e.target.value)} className={INPUT} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={LABEL}>Belge No</label><input value={b.belge_no} onChange={e => setBelge(i, 'belge_no', e.target.value)} className={INPUT} /></div>
                    <div><label className={LABEL}>Veriliş Tarihi</label><input type="date" value={b.verilis_tarihi} onChange={e => setBelge(i, 'verilis_tarihi', e.target.value)} className={INPUT} /></div>
                    <div><label className={LABEL}>Geçerlilik Tarihi</label><input type="date" value={b.gecerlilik_tarihi} onChange={e => setBelge(i, 'gecerlilik_tarihi', e.target.value)} className={INPUT} /></div>
                  </div>
                  <div><label className={LABEL}>Veren Kurum</label><input value={b.veren_kurum} onChange={e => setBelge(i, 'veren_kurum', e.target.value)} className={INPUT} /></div>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {/* Navigasyon */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => adim > 1 ? setAdim(a => a - 1) : router.push('/personel')}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft size={16} /> {adim === 1 ? 'İptal' : 'Geri'}
        </button>
        {adim < 5 ? (
          <button
            onClick={() => setAdim(a => a + 1)}
            disabled={adim === 1 && (!form.ad || !form.soyad)}
            className="flex items-center gap-2 px-6 py-2 bg-[#C8102E] text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            İleri <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Kaydediliyor...' : <><Check size={16} /> Personel Kaydet</>}
          </button>
        )}
      </div>
    </div>
  )
}
