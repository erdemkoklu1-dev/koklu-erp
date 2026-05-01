'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatTRDate } from '@/lib/finance/formatters'

type Rol = { id: string; ad: string; renk: string }
type Kullanici = {
  id: string
  ad_soyad: string
  email: string
  telefon: string | null
  departman: string | null
  aktif: boolean
  roller: Rol | null
  son_giris: string | null
}

const DEPARTMANLAR = ['Erzincan Fabrika', 'İstanbul Şube', 'Saha', 'Diğer']

function RolBadge({ rol }: { rol: Rol | null }) {
  if (!rol) return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: rol.renk }}>
      {rol.ad}
    </span>
  )
}

export default function KullanicilarClient({ roller }: { roller: Rol[] }) {
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([])
  const [yukleniyor, setYukleniyor]     = useState(true)
  const [modal, setModal]               = useState<'yeni' | 'duzenle' | 'sifre' | null>(null)
  const [secili, setSecili]             = useState<Kullanici | null>(null)
  const [resetLink, setResetLink]       = useState('')
  const [hata, setHata]                 = useState('')
  const [basari, setBasari]             = useState('')
  const [sifregoster, setSifregoster]   = useState(false)

  // Form alanları
  const [formAd, setFormAd]           = useState('')
  const [formEmail, setFormEmail]     = useState('')
  const [formSifre, setFormSifre]     = useState('')
  const [formRol, setFormRol]         = useState('')
  const [formDep, setFormDep]         = useState('')
  const [formTel, setFormTel]         = useState('')
  const [formAktif, setFormAktif]     = useState(true)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const fetchKullanicilar = useCallback(async () => {
    setYukleniyor(true)
    const res = await fetch('/api/yonetim/users')
    const data = await res.json()
    setKullanicilar(Array.isArray(data) ? data : [])
    setYukleniyor(false)
  }, [])

  useEffect(() => { fetchKullanicilar() }, [fetchKullanicilar])

  function acYeni() {
    setFormAd(''); setFormEmail(''); setFormSifre(''); setFormRol('')
    setFormDep(''); setFormTel(''); setFormAktif(true)
    setHata(''); setBasari('')
    setModal('yeni')
  }

  function acDuzenle(k: Kullanici) {
    setSecili(k)
    setFormRol(k.roller?.id ?? '')
    setFormDep(k.departman ?? '')
    setFormTel(k.telefon ?? '')
    setFormAktif(k.aktif)
    setHata(''); setBasari('')
    setModal('duzenle')
  }

  async function handleYeniKaydet() {
    if (!formAd || !formEmail || !formSifre) { setHata('Ad, email ve şifre zorunlu'); return }
    setKaydediliyor(true); setHata('')
    const res = await fetch('/api/yonetim/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_soyad: formAd, email: formEmail, password: formSifre, rol_id: formRol || null, departman: formDep || null, telefon: formTel || null, aktif: formAktif }),
    })
    const data = await res.json()
    setKaydediliyor(false)
    if (!res.ok) { setHata(data.error ?? 'Hata'); return }
    setBasari('Kullanıcı oluşturuldu.')
    fetchKullanicilar()
    setTimeout(() => setModal(null), 1200)
  }

  async function handleDuzenleKaydet() {
    if (!secili) return
    setKaydediliyor(true); setHata('')
    const res = await fetch(`/api/yonetim/users/${secili.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol_id: formRol || null, departman: formDep || null, telefon: formTel || null, aktif: formAktif }),
    })
    const data = await res.json()
    setKaydediliyor(false)
    if (!res.ok) { setHata(data.error ?? 'Hata'); return }
    setBasari('Güncellendi.')
    fetchKullanicilar()
    setTimeout(() => setModal(null), 1000)
  }

  async function handleSifreSifirla(k: Kullanici) {
    setSecili(k); setResetLink(''); setModal('sifre')
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
      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Kullanıcılar ({kullanicilar.length})</h2>
        <button onClick={acYeni}
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
          + Yeni Kullanıcı
        </button>
      </div>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">AD SOYAD</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">EMAIL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ROL</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">DEPARTMAN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">SON GİRİŞ</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">DURUM</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">İŞLEMLER</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {yukleniyor ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Yükleniyor...</td></tr>
            ) : kullanicilar.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Kullanıcı bulunamadı.</td></tr>
            ) : kullanicilar.map(k => (
              <tr key={k.id} className={`hover:bg-gray-50 ${!k.aktif ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{k.ad_soyad || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{k.email}</td>
                <td className="px-4 py-3"><RolBadge rol={k.roller} /></td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{k.departman || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {k.son_giris ? formatTRDate(k.son_giris.slice(0, 10)) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${k.aktif ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600'}`}>
                    {k.aktif ? 'Aktif' : 'Pasif'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => acDuzenle(k)} className="text-blue-600 text-xs hover:underline">Düzenle</button>
                    <button onClick={() => handleSifreSifirla(k)} className="text-orange-600 text-xs hover:underline">Şifre Sıfırla</button>
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

      {/* ── Yeni Kullanıcı Modal ── */}
      {modal === 'yeni' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Yeni Kullanıcı</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {hata && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{hata}</div>}
              {basari && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{basari}</div>}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ad Soyad *</label>
                <input value={formAd} onChange={e => setFormAd(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Email *</label>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Geçici Şifre *</label>
                <div className="relative mt-1">
                  <input type={sifregoster ? 'text' : 'password'} value={formSifre} onChange={e => setFormSifre(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] pr-16" />
                  <button type="button" onClick={() => setSifregoster(p => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700">
                    {sifregoster ? 'Gizle' : 'Göster'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Rol</label>
                <select value={formRol} onChange={e => setFormRol(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="">Seçiniz</option>
                  {roller.map(r => (
                    <option key={r.id} value={r.id}>{r.ad}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Departman</label>
                <select value={formDep} onChange={e => setFormDep(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="">Seçiniz</option>
                  {DEPARTMANLAR.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Telefon</label>
                <input value={formTel} onChange={e => setFormTel(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Aktif</label>
                <div onClick={() => setFormAktif(p => !p)}
                  className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${formAktif ? 'bg-[#C8102E]' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow transition-all ${formAktif ? 'left-5' : 'left-0.5'}`} />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={handleYeniKaydet} disabled={kaydediliyor}
                className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
                {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setModal(null)} className="flex-1 border py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Düzenle Modal ── */}
      {modal === 'duzenle' && secili && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Kullanıcı Düzenle</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {hata && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{hata}</div>}
              {basari && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{basari}</div>}
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">{secili.ad_soyad}</span> — <span className="text-gray-500 dark:text-gray-400">{secili.email}</span>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Rol</label>
                <select value={formRol} onChange={e => setFormRol(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="">Seçiniz</option>
                  {roller.map(r => <option key={r.id} value={r.id}>{r.ad}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Departman</label>
                <select value={formDep} onChange={e => setFormDep(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                  <option value="">Seçiniz</option>
                  {DEPARTMANLAR.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Telefon</label>
                <input value={formTel} onChange={e => setFormTel(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Aktif</label>
                <div onClick={() => setFormAktif(p => !p)}
                  className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${formAktif ? 'bg-[#C8102E]' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow transition-all ${formAktif ? 'left-5' : 'left-0.5'}`} />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={handleDuzenleKaydet} disabled={kaydediliyor}
                className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
                {kaydediliyor ? 'Kaydediliyor...' : 'Güncelle'}
              </button>
              <button onClick={() => setModal(null)} className="flex-1 border py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Şifre Sıfırla Modal ── */}
      {modal === 'sifre' && secili && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Şifre Sıfırlama Linki</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">{secili.email}</span> için şifre sıfırlama linki:</p>
              {!resetLink ? (
                <div className="text-sm text-gray-400 dark:text-gray-500">Oluşturuluyor...</div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700 border rounded-lg p-3 break-all text-xs font-mono text-gray-700 dark:text-gray-300">{resetLink}</div>
              )}
              {resetLink && (
                <button onClick={() => { navigator.clipboard.writeText(resetLink) }}
                  className="w-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Kopyala
                </button>
              )}
            </div>
            <div className="px-5 py-4 border-t">
              <button onClick={() => setModal(null)} className="w-full py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Kapat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
