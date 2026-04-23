'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Save } from 'lucide-react'
import Link from 'next/link'

type Sube = { id: string; ad: string }
type Rol  = { id: string; ad: string }

const LABEL  = 'block text-sm font-medium text-gray-700 mb-1'
const INPUT  = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
const SELECT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white'

export default function PersonelDuzenleClient({ personel, subeler, roller }: { personel: any; subeler: Sube[]; roller: Rol[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({
    ad: personel.ad ?? '', soyad: personel.soyad ?? '',
    tc_kimlik_no: personel.tc_kimlik_no ?? '', dogum_tarihi: personel.dogum_tarihi ?? '',
    dogum_yeri: personel.dogum_yeri ?? '', cinsiyet: personel.cinsiyet ?? '',
    medeni_durum: personel.medeni_durum ?? '', kan_grubu: personel.kan_grubu ?? '',
    uyruk: personel.uyruk ?? 'T.C.',
    telefon: personel.telefon ?? '', email: personel.email ?? '',
    adres: personel.adres ?? '', sehir: personel.sehir ?? '', posta_kodu: personel.posta_kodu ?? '',
    acil_iletisim_adi: personel.acil_iletisim_adi ?? '',
    acil_iletisim_telefonu: personel.acil_iletisim_telefonu ?? '',
    acil_iletisim_yakinligi: personel.acil_iletisim_yakinligi ?? '',
    sube_id: personel.sube_id ?? '', pozisyon: personel.pozisyon ?? '',
    departman: personel.departman ?? '', rol_id: personel.rol_id ?? '',
    istihdam_tipi: personel.istihdam_tipi ?? 'tam_zamanli',
    calisma_sekli: personel.calisma_sekli ?? 'ofis',
    ise_baslama_tarihi: personel.ise_baslama_tarihi ?? '',
    isten_cikis_tarihi: personel.isten_cikis_tarihi ?? '',
    sgk_no: personel.sgk_no ?? '', vergi_no: personel.vergi_no ?? '',
    durum: personel.durum ?? 'aktif',
    maas: personel.maas != null ? String(personel.maas) : '',
    maas_turu: personel.maas_turu ?? 'aylik',
    iban: personel.iban ?? '', banka_adi: personel.banka_adi ?? '',
    notlar: personel.notlar ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    setLoading(true); setError('')
    try {
      const payload = {
        ...form,
        maas: form.maas ? parseFloat(form.maas) : null,
        sube_id: form.sube_id || null,
        rol_id: form.rol_id || null,
        ise_baslama_tarihi: form.ise_baslama_tarihi || null,
        isten_cikis_tarihi: form.isten_cikis_tarihi || null,
        dogum_tarihi: form.dogum_tarihi || null,
      }
      const { error: err } = await supabase.from('personeller').update(payload).eq('id', personel.id)
      if (err) throw err
      router.push(`/personel/${personel.id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/personel/${personel.id}`} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-gray-900">Personel Düzenle</h1>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        <Section title="Kişisel Bilgiler">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Ad *</label><input value={form.ad} onChange={e => set('ad', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Soyad *</label><input value={form.soyad} onChange={e => set('soyad', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>TC Kimlik No</label><input value={form.tc_kimlik_no} onChange={e => set('tc_kimlik_no', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Doğum Tarihi</label><input type="date" value={form.dogum_tarihi} onChange={e => set('dogum_tarihi', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Doğum Yeri</label><input value={form.dogum_yeri} onChange={e => set('dogum_yeri', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Uyruk</label><input value={form.uyruk} onChange={e => set('uyruk', e.target.value)} className={INPUT} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={LABEL}>Cinsiyet</label>
              <select value={form.cinsiyet} onChange={e => set('cinsiyet', e.target.value)} className={SELECT}>
                <option value="">Seçin</option><option value="erkek">Erkek</option><option value="kadin">Kadın</option>
              </select>
            </div>
            <div><label className={LABEL}>Medeni Durum</label>
              <select value={form.medeni_durum} onChange={e => set('medeni_durum', e.target.value)} className={SELECT}>
                <option value="">Seçin</option><option value="bekar">Bekar</option><option value="evli">Evli</option><option value="bosanmis">Boşanmış</option>
              </select>
            </div>
            <div><label className={LABEL}>Kan Grubu</label>
              <select value={form.kan_grubu} onChange={e => set('kan_grubu', e.target.value)} className={SELECT}>
                <option value="">Seçin</option>
                {['A+','A-','B+','B-','AB+','AB-','0+','0-'].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>
        </Section>

        <Section title="İletişim">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Telefon</label><input value={form.telefon} onChange={e => set('telefon', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>E-posta</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT} /></div>
          </div>
          <div><label className={LABEL}>Adres</label><textarea value={form.adres} onChange={e => set('adres', e.target.value)} rows={2} className={INPUT} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Şehir</label><input value={form.sehir} onChange={e => set('sehir', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Posta Kodu</label><input value={form.posta_kodu} onChange={e => set('posta_kodu', e.target.value)} className={INPUT} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={LABEL}>Acil İletişim Adı</label><input value={form.acil_iletisim_adi} onChange={e => set('acil_iletisim_adi', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Acil Telefon</label><input value={form.acil_iletisim_telefonu} onChange={e => set('acil_iletisim_telefonu', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Yakınlık</label><input value={form.acil_iletisim_yakinligi} onChange={e => set('acil_iletisim_yakinligi', e.target.value)} className={INPUT} /></div>
          </div>
        </Section>

        <Section title="Özlük Bilgileri">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Şube</label>
              <select value={form.sube_id} onChange={e => set('sube_id', e.target.value)} className={SELECT}>
                <option value="">Şube Seçin</option>
                {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
              </select>
            </div>
            <div><label className={LABEL}>Rol</label>
              <select value={form.rol_id} onChange={e => set('rol_id', e.target.value)} className={SELECT}>
                <option value="">Rol Seçin</option>
                {roller.map(r => <option key={r.id} value={r.id}>{r.ad}</option>)}
              </select>
            </div>
            <div><label className={LABEL}>Pozisyon</label><input value={form.pozisyon} onChange={e => set('pozisyon', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Departman</label><input value={form.departman} onChange={e => set('departman', e.target.value)} className={INPUT} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>İstihdam Tipi</label>
              <select value={form.istihdam_tipi} onChange={e => set('istihdam_tipi', e.target.value)} className={SELECT}>
                <option value="tam_zamanli">Tam Zamanlı</option><option value="yari_zamanli">Yarı Zamanlı</option>
                <option value="sozlesmeli">Sözleşmeli</option><option value="stajyer">Stajyer</option>
              </select>
            </div>
            <div><label className={LABEL}>Çalışma Şekli</label>
              <select value={form.calisma_sekli} onChange={e => set('calisma_sekli', e.target.value)} className={SELECT}>
                <option value="ofis">Ofis</option><option value="saha">Saha</option>
                <option value="uzaktan">Uzaktan</option><option value="hibrit">Hibrit</option>
              </select>
            </div>
            <div><label className={LABEL}>İşe Başlama</label><input type="date" value={form.ise_baslama_tarihi} onChange={e => set('ise_baslama_tarihi', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>İşten Çıkış</label><input type="date" value={form.isten_cikis_tarihi} onChange={e => set('isten_cikis_tarihi', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>SGK No</label><input value={form.sgk_no} onChange={e => set('sgk_no', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Vergi No</label><input value={form.vergi_no} onChange={e => set('vergi_no', e.target.value)} className={INPUT} /></div>
          </div>
          <div><label className={LABEL}>Durum</label>
            <select value={form.durum} onChange={e => set('durum', e.target.value)} className={SELECT}>
              <option value="aktif">Aktif</option><option value="deneme">Deneme</option>
              <option value="izinli">İzinli</option><option value="istifa">İstifa</option><option value="cikis">Çıkış</option>
            </select>
          </div>
        </Section>

        <Section title="Mali Bilgiler">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LABEL}>Maaş (₺)</label><input type="number" value={form.maas} onChange={e => set('maas', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Maaş Türü</label>
              <select value={form.maas_turu} onChange={e => set('maas_turu', e.target.value)} className={SELECT}>
                <option value="aylik">Aylık</option><option value="gunluk">Günlük</option><option value="saatlik">Saatlik</option>
              </select>
            </div>
            <div><label className={LABEL}>IBAN</label><input value={form.iban} onChange={e => set('iban', e.target.value)} className={INPUT} /></div>
            <div><label className={LABEL}>Banka Adı</label><input value={form.banka_adi} onChange={e => set('banka_adi', e.target.value)} className={INPUT} /></div>
          </div>
          <div><label className={LABEL}>Notlar</label><textarea value={form.notlar} onChange={e => set('notlar', e.target.value)} rows={3} className={INPUT} /></div>
        </Section>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Link href={`/personel/${personel.id}`} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">İptal</Link>
        <button onClick={handleSave} disabled={loading || !form.ad || !form.soyad}
          className="flex items-center gap-2 bg-[#C8102E] text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
          <Save size={15} /> {loading ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 border-b pb-2">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}
