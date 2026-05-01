'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Rol = { id: string; ad: string; renk: string }
type Profil = { ad_soyad: string | null; telefon: string | null; roller: Rol | null } | null
type SonGiris = { created_at: string; ip_adresi: string | null } | null

function fmt(dt: string) {
  return new Date(dt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ProfilClient({
  userId, email, profil, sonGiris,
}: {
  userId: string
  email: string
  profil: Profil
  sonGiris: SonGiris
}) {
  const supabase = createClient()

  const [adSoyad, setAdSoyad]   = useState(profil?.ad_soyad ?? '')
  const [telefon, setTelefon]   = useState(profil?.telefon ?? '')
  const [eskiSifre, setEskiSifre] = useState('')
  const [yeniSifre, setYeniSifre] = useState('')
  const [sifre2, setSifre2]     = useState('')

  const [profilKaydediliyor, setProfilKaydediliyor] = useState(false)
  const [sifreKaydediliyor, setSifreKaydediliyor]   = useState(false)
  const [profilMesaj, setProfilMesaj] = useState('')
  const [sifreMesaj, setSifreMesaj]   = useState('')
  const [profilHata, setProfilHata]   = useState('')
  const [sifreHata, setSifreHata]     = useState('')

  async function handleProfilKaydet(e: React.FormEvent) {
    e.preventDefault()
    setProfilKaydediliyor(true); setProfilHata(''); setProfilMesaj('')
    const { error } = await supabase.from('kullanici_profiller').update({
      ad_soyad: adSoyad || null,
      telefon: telefon || null,
    }).eq('id', userId)
    setProfilKaydediliyor(false)
    if (error) { setProfilHata(error.message); return }
    setProfilMesaj('Profil güncellendi.')
  }

  async function handleSifreDegistir(e: React.FormEvent) {
    e.preventDefault()
    setSifreHata(''); setSifreMesaj('')
    if (yeniSifre !== sifre2) { setSifreHata('Yeni şifreler eşleşmiyor.'); return }
    if (yeniSifre.length < 6) { setSifreHata('Şifre en az 6 karakter olmalı.'); return }
    setSifreKaydediliyor(true)

    // Önce mevcut şifreyi doğrula
    const { error: girisHata } = await supabase.auth.signInWithPassword({ email, password: eskiSifre })
    if (girisHata) { setSifreHata('Mevcut şifre hatalı.'); setSifreKaydediliyor(false); return }

    const { error } = await supabase.auth.updateUser({ password: yeniSifre })
    setSifreKaydediliyor(false)
    if (error) { setSifreHata(error.message); return }
    setSifreMesaj('Şifre değiştirildi.')
    setEskiSifre(''); setYeniSifre(''); setSifre2('')
  }

  const rol = profil?.roller

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Profilim</h1>
      </div>

      <div className="p-6 max-w-xl mx-auto space-y-4">

        {/* Rol & Son Giriş */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Rol</div>
            {rol ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: rol.renk }}>
                {rol.ad}
              </span>
            ) : <span className="text-sm text-gray-400 dark:text-gray-500">Atanmamış</span>}
          </div>
          {sonGiris && (
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Önceki Giriş</div>
              <div className="text-sm text-gray-700 dark:text-gray-300">{fmt(sonGiris.created_at)}</div>
              {sonGiris.ip_adresi && <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{sonGiris.ip_adresi}</div>}
            </div>
          )}
        </div>

        {/* Profil Bilgileri */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b">Profil Bilgileri</h2>
          <form onSubmit={handleProfilKaydet} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Email</label>
              <input value={email} readOnly className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ad Soyad</label>
              <input value={adSoyad} onChange={e => setAdSoyad(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Telefon</label>
              <input value={telefon} onChange={e => setTelefon(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            {profilHata  && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{profilHata}</div>}
            {profilMesaj && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{profilMesaj}</div>}
            <button type="submit" disabled={profilKaydediliyor}
              className="w-full bg-[#C8102E] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
              {profilKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </form>
        </div>

        {/* Şifre Değiştir */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b">Şifre Değiştir</h2>
          <form onSubmit={handleSifreDegistir} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Mevcut Şifre</label>
              <input type="password" value={eskiSifre} onChange={e => setEskiSifre(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Yeni Şifre</label>
              <input type="password" value={yeniSifre} onChange={e => setYeniSifre(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Yeni Şifre (Tekrar)</label>
              <input type="password" value={sifre2} onChange={e => setSifre2(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            {sifreHata  && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{sifreHata}</div>}
            {sifreMesaj && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{sifreMesaj}</div>}
            <button type="submit" disabled={sifreKaydediliyor}
              className="w-full bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {sifreKaydediliyor ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
