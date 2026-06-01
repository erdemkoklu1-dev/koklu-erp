'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatTRDate } from '@/lib/finance/formatters'

type Rol = { id: string; ad: string; renk: string }
type Sube = { id: string; ad: string }
type Kullanici = {
  id: string
  ad_soyad: string
  email: string
  telefon: string | null
  departman: string | null
  aktif: boolean
  roller: Rol | null
  subeler: Sube[]
  son_giris: string | null
}

const DEPARTMANLAR = ['Erzincan Fabrika', 'İstanbul Şube', 'Saha', 'Diğer']

function RolBadge({ rol }: { rol: Rol | null }) {
  if (!rol) return <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: rol.renk }}>
      {rol.ad}
    </span>
  )
}

export default function KullanicilarClient({ roller, subeler }: { roller: Rol[]; subeler: Sube[] }) {
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [modal, setModal] = useState<'yeni' | 'duzenle' | 'sifre' | null>(null)
  const [secili, setSecili] = useState<Kullanici | null>(null)
  const [resetLink, setResetLink] = useState('')
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')
  const [sifregoster, setSifregoster] = useState(false)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const [formAd, setFormAd] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formSifre, setFormSifre] = useState('')
  const [formRol, setFormRol] = useState('')
  const [formDep, setFormDep] = useState('')
  const [formTel, setFormTel] = useState('')
  const [formAktif, setFormAktif] = useState(true)
  const [formSubeIds, setFormSubeIds] = useState<string[]>([])

  const fetchKullanicilar = useCallback(async () => {
    setYukleniyor(true)
    const res = await fetch('/api/yonetim/users')
    const data = await res.json()
    setKullanicilar(Array.isArray(data) ? data : [])
    setYukleniyor(false)
  }, [])

  useEffect(() => { fetchKullanicilar() }, [fetchKullanicilar])

  function resetForm() {
    setFormAd('')
    setFormEmail('')
    setFormSifre('')
    setFormRol('')
    setFormDep('')
    setFormTel('')
    setFormAktif(true)
    setFormSubeIds([])
    setHata('')
    setBasari('')
  }

  function acYeni() {
    setSecili(null)
    resetForm()
    setModal('yeni')
  }

  function acDuzenle(k: Kullanici) {
    setSecili(k)
    setFormRol(k.roller?.id ?? '')
    setFormDep(k.departman ?? '')
    setFormTel(k.telefon ?? '')
    setFormAktif(k.aktif)
    setFormSubeIds((k.subeler ?? []).map(s => s.id))
    setHata('')
    setBasari('')
    setModal('duzenle')
  }

  function toggleSube(subeId: string) {
    setFormSubeIds(prev => prev.includes(subeId) ? prev.filter(id => id !== subeId) : [...prev, subeId])
  }

  async function handleYeniKaydet() {
    if (!formAd || !formEmail || !formSifre) {
      setHata('Ad, email ve şifre zorunlu')
      return
    }
    setKaydediliyor(true)
    setHata('')
    const res = await fetch('/api/yonetim/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_soyad: formAd,
        email: formEmail,
        password: formSifre,
        rol_id: formRol || null,
        departman: formDep || null,
        telefon: formTel || null,
        aktif: formAktif,
        sube_ids: formSubeIds,
      }),
    })
    const data = await res.json()
    setKaydediliyor(false)
    if (!res.ok) {
      setHata(data.error ?? 'Hata')
      return
    }
    setBasari('Kullanıcı oluşturuldu.')
    fetchKullanicilar()
    setTimeout(() => setModal(null), 900)
  }

  async function handleDuzenleKaydet() {
    if (!secili) return
    setKaydediliyor(true)
    setHata('')
    const res = await fetch(`/api/yonetim/users/${secili.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rol_id: formRol || null,
        departman: formDep || null,
        telefon: formTel || null,
        aktif: formAktif,
        sube_ids: formSubeIds,
      }),
    })
    const data = await res.json()
    setKaydediliyor(false)
    if (!res.ok) {
      setHata(data.error ?? 'Hata')
      return
    }
    setBasari('Güncellendi.')
    fetchKullanicilar()
    setTimeout(() => setModal(null), 900)
  }

  async function handleSifreSifirla(k: Kullanici) {
    setSecili(k)
    setResetLink('')
    setModal('sifre')
    const res = await fetch(`/api/yonetim/users/${k.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', email: k.email }),
    })
    const data = await res.json()
    setResetLink(data.link ?? data.error ?? 'Hata')
  }

  async function handleToggleAktif(k: Kullanici) {
    await fetch(`/api/yonetim/users/${k.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle_ban', aktif: !k.aktif }),
    })
    fetchKullanicilar()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Kullanıcılar ({kullanicilar.length})</h2>
        <button onClick={acYeni} className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#a50d26]">
          + Yeni Kullanıcı
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white dark:bg-gray-800">
        <table className="w-full">
          <thead className="border-b bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">AD SOYAD</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">EMAIL</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">ROL</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">ŞUBE YETKİLERİ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">DEPARTMAN</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">SON GİRİŞ</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">DURUM</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">İŞLEMLER</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {yukleniyor ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Yükleniyor...</td></tr>
            ) : kullanicilar.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Kullanıcı bulunamadı.</td></tr>
            ) : kullanicilar.map(k => (
              <tr key={k.id} className={`hover:bg-gray-50 ${!k.aktif ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{k.ad_soyad || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{k.email}</td>
                <td className="px-4 py-3"><RolBadge rol={k.roller} /></td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{(k.subeler ?? []).map(s => s.ad).join(', ') || 'Tüm şubeler / şubesiz'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{k.departman || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{k.son_giris ? formatTRDate(k.son_giris.slice(0, 10)) : '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${k.aktif ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                    {k.aktif ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => acDuzenle(k)} className="text-xs text-blue-600 hover:underline">Düzenle</button>
                    <button onClick={() => handleSifreSifirla(k)} className="text-xs text-orange-600 hover:underline">Şifre Sıfırla</button>
                    <button onClick={() => handleToggleAktif(k)} className={`text-xs hover:underline ${k.aktif ? 'text-red-500' : 'text-green-600'}`}>
                      {k.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modal === 'yeni' || (modal === 'duzenle' && secili)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{modal === 'yeni' ? 'Yeni Kullanıcı' : 'Kullanıcı Düzenle'}</h3>
              <button onClick={() => setModal(null)} className="text-xl text-gray-400 hover:text-gray-600">x</button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
              {hata && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{hata}</div>}
              {basari && <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{basari}</div>}
              {modal === 'duzenle' && secili && <div className="text-sm text-gray-700 dark:text-gray-300"><span className="font-medium">{secili.ad_soyad}</span> - <span className="text-gray-500">{secili.email}</span></div>}
              {modal === 'yeni' && (
                <>
                  <Field label="Ad Soyad *" value={formAd} onChange={setFormAd} />
                  <Field label="Email *" value={formEmail} onChange={setFormEmail} type="email" />
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Geçici Şifre *</label>
                    <div className="relative mt-1">
                      <input type={sifregoster ? 'text' : 'password'} value={formSifre} onChange={e => setFormSifre(e.target.value)} className="w-full rounded-lg border px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                      <button type="button" onClick={() => setSifregoster(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700">
                        {sifregoster ? 'Gizle' : 'Göster'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              <Select label="Rol" value={formRol} onChange={setFormRol} options={roller.map(r => ({ value: r.id, label: r.ad }))} />
              <Select label="Departman" value={formDep} onChange={setFormDep} options={DEPARTMANLAR.map(d => ({ value: d, label: d }))} />
              <SubeChecklist subeler={subeler} selected={formSubeIds} onToggle={toggleSube} />
              <Field label="Telefon" value={formTel} onChange={setFormTel} />
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={formAktif} onChange={e => setFormAktif(e.target.checked)} className="accent-[#C8102E]" />
                Aktif
              </label>
            </div>
            <div className="flex gap-3 border-t px-5 py-4">
              <button onClick={modal === 'yeni' ? handleYeniKaydet : handleDuzenleKaydet} disabled={kaydediliyor} className="flex-1 rounded-lg bg-[#C8102E] py-2 text-sm font-medium text-white transition-colors hover:bg-[#a50d26] disabled:opacity-50">
                {kaydediliyor ? 'Kaydediliyor...' : modal === 'yeni' ? 'Kaydet' : 'Güncelle'}
              </button>
              <button onClick={() => setModal(null)} className="flex-1 rounded-lg border py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300">İptal</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'sifre' && secili && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Şifre Sıfırlama Linki</h3>
              <button onClick={() => setModal(null)} className="text-xl text-gray-400 hover:text-gray-600">x</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">{secili.email}</span> için şifre sıfırlama linki:</p>
              {!resetLink ? <div className="text-sm text-gray-400">Oluşturuluyor...</div> : <div className="break-all rounded-lg border bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">{resetLink}</div>}
              {resetLink && <button onClick={() => navigator.clipboard.writeText(resetLink)} className="w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">Kopyala</button>}
            </div>
            <div className="border-t px-5 py-4">
              <button onClick={() => setModal(null)} className="w-full rounded-lg border py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
        <option value="">Seçiniz</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

function SubeChecklist({ subeler, selected, onToggle }: { subeler: Sube[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Şube Yetkileri</label>
      <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">
        {subeler.map(sube => (
          <label key={sube.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={selected.includes(sube.id)} onChange={() => onToggle(sube.id)} className="accent-[#C8102E]" />
            {sube.ad}
          </label>
        ))}
        {subeler.length === 0 && <div className="text-xs text-gray-400">Şube bulunamadı.</div>}
      </div>
    </div>
  )
}
