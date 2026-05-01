'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatTRDate } from '@/lib/finance/formatters'

// ── Tipler ───────────────────────────────────────────────
export type DeviceItem = {
  deviceId:   string
  deviceName: string
  tarih:      string
  tarihTipi:  'kontrol' | 'skt'
  gunKaldi:   number
  sonBakim:   string | null
}

export type CustomerGroup = {
  customerId:    string
  customerName:  string
  customerEmail: string | null
  customerPhone: string | null
  devices:       DeviceItem[]
  enYakinGunKaldi: number
  sentEmail:  boolean
  sentSms:    boolean
  susturuldu: boolean
}

type Sablon = {
  id: string; ad: string
  kanal: 'email' | 'sms' | 'whatsapp'
  konu: string | null; mesaj_sablonu: string
}

type Props = {
  aktifGruplar:       CustomerGroup[]
  susturulmusGruplar: CustomerGroup[]
  buAyGonderilen:     number
  buHaftaGonderilecek: number
  kontrolYaklasan:    number
  sktYaklasan:        number
  toplamMusteri:      number
  sablonlar:          Sablon[]
  hasResend:          boolean
  hasNetgsm:          boolean
}

// ── Yardımcılar ──────────────────────────────────────────
function fillTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

function makeVars(g: CustomerGroup, d?: DeviceItem): Record<string, string> {
  const dev = d ?? g.devices[0]
  return {
    musteri_adi:    g.customerName,
    cihaz_adi:      dev?.deviceName ?? 'Cihaz',
    kontrol_tarihi: dev ? formatTRDate(dev.tarih) : '',
    gun_kaldi:      dev
      ? dev.gunKaldi >= 0
        ? String(dev.gunKaldi)
        : `${Math.abs(dev.gunKaldi)} gün gecikti`
      : '',
    firma_adi: 'Köklü Yangın Söndürme Cihazları',
  }
}

function GunBadge({ gun }: { gun: number }) {
  if (gun < 0)   return <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-red-50 text-red-700 border-red-200">{Math.abs(gun)}g gecikti</span>
  if (gun === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-orange-50 text-orange-700 border-orange-200">Bugün!</span>
  if (gun <= 7)  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-orange-50 text-orange-700 border-orange-200">{gun} gün</span>
  if (gun <= 30) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-yellow-50 text-yellow-700 border-yellow-200">{gun} gün</span>
  return               <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">{gun} gün</span>
}

// ── Ana bileşen ───────────────────────────────────────────
export default function OzetClient({
  aktifGruplar, susturulmusGruplar,
  buAyGonderilen, buHaftaGonderilecek,
  kontrolYaklasan, sktYaklasan, toplamMusteri,
  sablonlar, hasResend, hasNetgsm,
}: Props) {
  const router  = useRouter()
  const supabase = createClient()

  // Accordion genişleme durumu
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Susturulanları göster/gizle
  const [susturulanGoster, setSusturulanGoster] = useState(false)
  // Kaldır onay modali
  const [kaldirModal, setKaldirModal]   = useState<CustomerGroup | null>(null)
  const [kaldirLoading, setKaldirLoading] = useState(false)
  // Planla modali
  const [planlaModal, setPlanlaModal]   = useState<CustomerGroup | null>(null)
  const [planlaForm, setPlanlaForm]     = useState({ tarih: '', saat: '09:00', email: true, sms: false, whatsapp: false })
  const [planlaLoading, setPlanlaLoading] = useState(false)
  const [planlaResult, setPlanlaResult] = useState<{ ok: boolean; msg: string } | null>(null)
  // Gönder modali
  const [gonderModal, setGonderModal]   = useState<CustomerGroup | null>(null)
  const [channels, setChannels]         = useState({ email: true, sms: false, whatsapp: false })
  const [gonderLoading, setGonderLoading] = useState(false)
  const [gonderResult, setGonderResult] = useState<{ ok: boolean; msg: string } | null>(null)
  // Toplu gönder
  const [topluModal, setTopluModal]     = useState(false)
  const [topluChannels, setTopluChannels] = useState({ email: true, sms: false })
  const [topluLoading, setTopluLoading] = useState(false)
  const [topluProgress, setTopluProgress] = useState(0)
  const [topluResult, setTopluResult]   = useState<{ ok: number; err: number } | null>(null)
  // Session'da gönderildi işareti
  const [sessionSent, setSessionSent]   = useState<Set<string>>(new Set())

  // Filtreler
  const [aramaMetni,   setAramaMetni]   = useState('')
  const [durumFiltre,  setDurumFiltre]  = useState('')
  const [urunFiltre,   setUrunFiltre]   = useState('')

  const emailSablon = sablonlar.find(s => s.kanal === 'email')
  const smsSablon   = sablonlar.find(s => s.kanal === 'sms')

  // Filtre hesaplamaları
  const gecikmisSayisi  = aktifGruplar.filter(g => g.enYakinGunKaldi < 0).length
  const buHaftaSayisi   = aktifGruplar.filter(g => g.enYakinGunKaldi >= 0 && g.enYakinGunKaldi <= 7).length
  const buAySayisi      = aktifGruplar.filter(g => g.enYakinGunKaldi >= 0 && g.enYakinGunKaldi <= 30).length

  // Ürün listesi (distinct)
  const urunListesi = Array.from(new Set(
    aktifGruplar.flatMap(g => g.devices.map(d => d.deviceName))
  )).sort()

  const filtrelenmisGruplar = aktifGruplar.filter(g => {
    if (aramaMetni && !g.customerName.toLowerCase().includes(aramaMetni.toLowerCase())) return false
    if (durumFiltre === 'gecikmiş'  && g.enYakinGunKaldi >= 0) return false
    if (durumFiltre === 'bu_hafta'  && (g.enYakinGunKaldi < 0 || g.enYakinGunKaldi > 7)) return false
    if (durumFiltre === 'bu_ay'     && (g.enYakinGunKaldi < 0 || g.enYakinGunKaldi > 30)) return false
    if (durumFiltre === 'gecerli'   && g.enYakinGunKaldi < 0) return false
    if (urunFiltre && !g.devices.some(d => d.deviceName.toLowerCase().includes(urunFiltre.toLowerCase()))) return false
    return true
  })

  // ── Accordion ─────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // ── Kaldır ────────────────────────────────────────────
  async function handleKaldir() {
    if (!kaldirModal) return
    setKaldirLoading(true)
    await supabase.from('hatirlatma_susturmalar').upsert(
      { musteri_id: kaldirModal.customerId },
      { onConflict: 'musteri_id' }
    )
    setKaldirLoading(false)
    setKaldirModal(null)
    router.refresh()
  }

  async function handleYenidenEkle(customerId: string) {
    await supabase.from('hatirlatma_susturmalar').delete().eq('musteri_id', customerId)
    router.refresh()
  }

  // ── Planla ────────────────────────────────────────────
  function openPlanla(g: CustomerGroup) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    setPlanlaModal(g)
    setPlanlaForm({
      tarih: tomorrow.toISOString().split('T')[0],
      saat:  '09:00',
      email: !!g.customerEmail,
      sms:   !!g.customerPhone,
      whatsapp: false,
    })
    setPlanlaResult(null)
  }

  async function handlePlanla() {
    if (!planlaModal) return
    if (!planlaForm.tarih) { setPlanlaResult({ ok: false, msg: 'Lütfen bir tarih seçin.' }); return }
    if (!planlaForm.email && !planlaForm.sms && !planlaForm.whatsapp) {
      setPlanlaResult({ ok: false, msg: 'En az bir kanal seçin.' }); return
    }

    setPlanlaLoading(true)
    setPlanlaResult(null)

    const planliZaman = `${planlaForm.tarih}T${planlaForm.saat}:00+03:00`
    const kanaller: ('email' | 'sms' | 'whatsapp')[] = []
    if (planlaForm.email)    kanaller.push('email')
    if (planlaForm.sms)      kanaller.push('sms')
    if (planlaForm.whatsapp) kanaller.push('whatsapp')

    const rows = kanaller.map(kanal => ({
      musteri_id: planlaModal.customerId,
      kanal,
      alici_email:   kanal === 'email' ? (planlaModal.customerEmail ?? null) : null,
      alici_telefon: kanal !== 'email' ? (planlaModal.customerPhone ?? null) : null,
      durum: 'planlandı',
      planli_gonderim_zamani: planliZaman,
    }))

    const { error } = await supabase.from('hatirlatma_kayitlari').insert(rows)

    setPlanlaLoading(false)
    if (error) {
      setPlanlaResult({ ok: false, msg: 'Kayıt hatası: ' + error.message })
    } else {
      setPlanlaResult({ ok: true, msg: `${kanaller.length} kanal için hatırlatma planlandı.` })
    }
  }

  // ── Gönder ────────────────────────────────────────────
  function openGonder(g: CustomerGroup) {
    setGonderModal(g)
    setChannels({ email: !!g.customerEmail, sms: false, whatsapp: false })
    setGonderResult(null)
  }

  async function handleGonder() {
    if (!gonderModal) return
    setGonderLoading(true)
    setGonderResult(null)
    const vars = makeVars(gonderModal)
    const errors: string[] = []
    const ok: string[] = []

    if (channels.email && gonderModal.customerEmail && emailSablon) {
      const res = await fetch('/api/hatirlatma/gonder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: gonderModal.customerEmail,
          subject: fillTemplate(emailSablon.konu ?? 'Bakım Hatırlatması', vars),
          text: fillTemplate(emailSablon.mesaj_sablonu, vars),
          musteri_id: gonderModal.customerId,
        }),
      })
      res.ok ? ok.push('E-posta') : errors.push('E-posta: ' + (await res.json().catch(() => ({}))).error)
    }

    if (channels.sms && gonderModal.customerPhone && smsSablon) {
      const res = await fetch('/api/hatirlatma/sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: gonderModal.customerPhone,
          message: fillTemplate(smsSablon.mesaj_sablonu, vars),
          musteri_id: gonderModal.customerId,
        }),
      })
      res.ok ? ok.push('SMS') : errors.push('SMS: ' + (await res.json().catch(() => ({}))).error)
    }

    if (channels.whatsapp && gonderModal.customerPhone) {
      const waSablon = sablonlar.find(s => s.kanal === 'whatsapp') ?? smsSablon
      if (waSablon) {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: gonderModal.customerPhone,
            message: fillTemplate(waSablon.mesaj_sablonu, vars),
            musteri_id: gonderModal.customerId,
          }),
        })
        res.ok ? ok.push('WhatsApp') : errors.push('WhatsApp: ' + (await res.json().catch(() => ({}))).error)
      }
    }

    setGonderLoading(false)
    if (ok.length > 0 && errors.length === 0) {
      setGonderResult({ ok: true, msg: ok.join(' + ') + ' gönderildi.' })
      setSessionSent(prev => new Set([...prev, gonderModal.customerId]))
    } else if (errors.length > 0) {
      setGonderResult({ ok: false, msg: errors.join('\n') })
    } else {
      setGonderResult({ ok: false, msg: 'Kanal seçimi yapılmadı.' })
    }
  }

  // ── Toplu Gönder ──────────────────────────────────────
  async function handleTopluGonder() {
    setTopluLoading(true); setTopluResult(null); setTopluProgress(0)
    let ok = 0; let err = 0

    for (let i = 0; i < aktifGruplar.length; i++) {
      const g = aktifGruplar[i]
      setTopluProgress(i + 1)
      const vars = makeVars(g)

      if (topluChannels.email && g.customerEmail && emailSablon) {
        const res = await fetch('/api/hatirlatma/gonder', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: g.customerEmail,
            subject: fillTemplate(emailSablon.konu ?? 'Bakım Hatırlatması', vars),
            text: fillTemplate(emailSablon.mesaj_sablonu, vars),
            musteri_id: g.customerId,
          }),
        })
        res.ok ? ok++ : err++
      }
      if (topluChannels.sms && g.customerPhone && smsSablon) {
        const res = await fetch('/api/hatirlatma/sms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: g.customerPhone,
            message: fillTemplate(smsSablon.mesaj_sablonu, vars),
            musteri_id: g.customerId,
          }),
        })
        res.ok ? ok++ : err++
      }
    }

    setTopluLoading(false)
    setTopluResult({ ok, err })
    if (ok > 0) {
      setSessionSent(prev => new Set([...prev, ...aktifGruplar.map(g => g.customerId)]))
    }
  }

  // ── Satır render ─────────────────────────────────────
  function renderGrupSatir(g: CustomerGroup, muted = false) {
    const isExpanded = expanded.has(g.customerId)
    const isSent = sessionSent.has(g.customerId) || g.sentEmail || g.sentSms

    return (
      <React.Fragment key={g.customerId}>
        <tr
          className={`${
            muted ? 'opacity-50' :
            g.enYakinGunKaldi < 0 ? 'bg-red-50/40' :
            g.enYakinGunKaldi <= 7 ? 'bg-orange-50/40' : ''
          } hover:bg-gray-50/60 transition-colors cursor-pointer`}
          onClick={() => toggleExpand(g.customerId)}
        >
          {/* Müşteri + durum noktası */}
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 dark:text-gray-500 text-xs select-none">{isExpanded ? '▼' : '▶'}</span>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                g.enYakinGunKaldi < 0   ? 'bg-red-500' :
                g.enYakinGunKaldi <= 7  ? 'bg-orange-500' :
                g.enYakinGunKaldi <= 30 ? 'bg-yellow-400' : 'bg-green-500'
              }`} />
              <Link
                href={`/customers/${g.customerId}`}
                onClick={e => e.stopPropagation()}
                className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline"
              >
                {g.customerName}
              </Link>
              {isSent && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200">✓</span>
              )}
            </div>
          </td>

          {/* Cihaz */}
          <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
            {g.devices[0] ? (
              <div>
                <div className="font-medium">{g.devices[0].deviceName}</div>
                {g.devices.length > 1 && (
                  <div className="text-xs text-gray-400 dark:text-gray-500">+{g.devices.length - 1} cihaz daha</div>
                )}
              </div>
            ) : '—'}
          </td>

          {/* Son Bakım */}
          <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300">
            {g.devices[0]?.sonBakim ? formatTRDate(g.devices[0].sonBakim) : '—'}
          </td>

          {/* Sıradaki Bakım */}
          <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
            {g.devices[0] && (
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${
                  g.devices[0].tarihTipi === 'skt'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>{g.devices[0].tarihTipi === 'skt' ? 'SKT' : 'Knt'}</span>
                {formatTRDate(g.devices[0].tarih)}
              </div>
            )}
          </td>

          {/* Kalan Gün */}
          <td className="px-4 py-2.5"><GunBadge gun={g.enYakinGunKaldi} /></td>

          {/* Aksiyonlar */}
          <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
            {muted ? (
              <button
                onClick={() => handleYenidenEkle(g.customerId)}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Yeniden Ekle
              </button>
            ) : (
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => openPlanla(g)}
                  className="text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Planla
                </button>
                {(g.customerEmail || g.customerPhone) && (
                  <button
                    onClick={() => openGonder(g)}
                    className="text-xs bg-[#C8102E] text-white px-2.5 py-1 rounded-lg hover:bg-[#a50d26] transition-colors"
                  >
                    Gönder
                  </button>
                )}
                <button
                  onClick={() => setKaldirModal(g)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-600 px-1.5 py-1 rounded hover:bg-red-50 transition-colors font-bold"
                  title="Listeden kaldır"
                >
                  ✕
                </button>
              </div>
            )}
          </td>
        </tr>

        {/* Accordion — cihaz alt satırları */}
        {isExpanded && g.devices.map((dev, i) => (
          <tr key={dev.deviceId + dev.tarihTipi + i}
            className="bg-gray-50 dark:bg-gray-700/80 border-t border-dashed border-gray-200 dark:border-gray-600">
            <td className="pl-10 pr-4 py-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="text-gray-400 dark:text-gray-500 mr-1">└</span>
              {dev.deviceName}
            </td>
            <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
              {dev.sonBakim ? formatTRDate(dev.sonBakim) : '—'}
            </td>
            <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
              <span className={`px-1.5 py-0.5 rounded text-xs border mr-1 ${
                dev.tarihTipi === 'skt'
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}>{dev.tarihTipi === 'skt' ? 'SKT' : 'Knt'}</span>
              {formatTRDate(dev.tarih)}
            </td>
            <td className="px-4 py-2"><GunBadge gun={dev.gunKaldi} /></td>
            <td colSpan={2} />
          </tr>
        ))}
      </React.Fragment>
    )
  }

  // ── JSX ──────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">

      {/* Entegrasyon uyarısı */}
      {(!hasResend || !hasNetgsm) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-4">
          <span>
            <span className="font-semibold">Entegrasyon Ayarları Eksik:</span>{' '}
            {!hasResend && 'Resend API Key '}
            {!hasResend && !hasNetgsm && 've '}
            {!hasNetgsm && 'Netgsm bilgileri '}
            tanımlanmamış.
          </span>
          <Link href="/hatirlatmalar/ayarlar" className="text-amber-700 underline text-xs font-semibold whitespace-nowrap">
            Ayarları Yapılandır →
          </Link>
        </div>
      )}

      {/* KPI Kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`bg-white dark:bg-gray-800 border rounded-xl p-4 ${gecikmisSayisi > 0 ? 'bg-red-50 border-red-200' : ''}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Gecikmiş Servisler</div>
          <div className={`text-2xl font-bold ${gecikmisSayisi > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{gecikmisSayisi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">kontrol tarihi geçmiş</div>
        </div>
        <div className={`bg-white dark:bg-gray-800 border rounded-xl p-4 ${buHaftaSayisi > 0 ? 'bg-orange-50 border-orange-200' : ''}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Bu Hafta Yaklaşan</div>
          <div className={`text-2xl font-bold ${buHaftaSayisi > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{buHaftaSayisi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">0–7 gün içinde</div>
        </div>
        <div className={`bg-white dark:bg-gray-800 border rounded-xl p-4 ${buAySayisi > 0 ? 'bg-yellow-50 border-yellow-200' : ''}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Bu Ay Yaklaşan</div>
          <div className={`text-2xl font-bold ${buAySayisi > 0 ? 'text-yellow-700' : 'text-gray-900 dark:text-gray-100'}`}>{buAySayisi}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">0–30 gün içinde</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Toplam Müşteri</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{toplamMusteri}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">aktif kayıt</div>
        </div>
      </div>

      {/* Filtre Barı */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Müşteri ara..."
          value={aramaMetni}
          onChange={e => setAramaMetni(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] w-44"
        />
        <select
          value={durumFiltre}
          onChange={e => setDurumFiltre(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
        >
          <option value="">Tüm Durumlar</option>
          <option value="gecikmiş">Gecikmiş</option>
          <option value="bu_hafta">Bu Hafta (0–7 gün)</option>
          <option value="bu_ay">Bu Ay (0–30 gün)</option>
          <option value="gecerli">Geçerli</option>
        </select>
        <select
          value={urunFiltre}
          onChange={e => setUrunFiltre(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] max-w-[200px]"
        >
          <option value="">Tüm Ürünler</option>
          {urunListesi.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {(aramaMetni || durumFiltre || urunFiltre) && (
          <button
            onClick={() => { setAramaMetni(''); setDurumFiltre(''); setUrunFiltre('') }}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 border rounded-lg px-2.5 py-1.5"
          >
            Temizle
          </button>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{filtrelenmisGruplar.length} sonuç</span>
      </div>

      {/* Ana Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Yaklaşan Bakımlar ({filtrelenmisGruplar.length} müşteri)
          </h2>
          {aktifGruplar.length > 0 && (
            <button
              onClick={() => { setTopluModal(true); setTopluResult(null); setTopluProgress(0) }}
              className="bg-[#C8102E] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-[#a50d26]"
            >
              Tümünü Gönder
            </button>
          )}
        </div>

        {filtrelenmisGruplar.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            {aktifGruplar.length === 0
              ? '30 gün içinde yaklaşan kontrol veya SKT tarihi bulunamadı.'
              : 'Filtreye uyan müşteri bulunamadı.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Müşteri</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Cihaz</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Son Bakım</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Sıradaki Bakım</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Kalan Gün</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrelenmisGruplar.map(g => renderGrupSatir(g))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Susturulan Müşteriler Toggle */}
      {susturulmusGruplar.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <button
            onClick={() => setSusturulanGoster(v => !v)}
            className="w-full px-5 py-3 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 transition-colors"
          >
            <span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">Susturulan Müşteriler</span>{' '}
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full text-xs ml-1">{susturulmusGruplar.length}</span>
            </span>
            <span className="text-gray-400 dark:text-gray-500">{susturulanGoster ? '▲' : '▼'}</span>
          </button>

          {susturulanGoster && (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {susturulmusGruplar.map(g => renderGrupSatir(g, true))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Kaldır Onay Modali ─────────────────────────── */}
      {kaldirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Listeden Kaldır</h2>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-semibold">{kaldirModal.customerName}</span> müşterisini hatırlatma listesinden kaldırmak istediğinize emin misiniz?
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Kaldırılan müşteri listeye geri eklenebilir.</p>
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => setKaldirModal(null)}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                İptal
              </button>
              <button
                onClick={handleKaldir}
                disabled={kaldirLoading}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {kaldirLoading ? 'Kaldırılıyor...' : 'Evet, Kaldır'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Planla Modali ──────────────────────────────── */}
      {planlaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Hatırlatma Planla</h2>
              <button onClick={() => setPlanlaModal(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Müşteri */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold">{planlaModal.customerName}</span>
                {planlaModal.devices[0] && (
                  <span className="text-gray-500 dark:text-gray-400 ml-2">— {planlaModal.devices[0].deviceName}</span>
                )}
              </div>

              {/* Tarih + Saat */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Gönderim Tarihi</label>
                  <input
                    type="date"
                    value={planlaForm.tarih}
                    onChange={e => setPlanlaForm(f => ({ ...f, tarih: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Gönderim Saati</label>
                  <input
                    type="time"
                    value={planlaForm.saat}
                    onChange={e => setPlanlaForm(f => ({ ...f, saat: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
              </div>

              {/* Kanallar */}
              <div>
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2">Kanallar</div>
                <div className="space-y-2">
                  <label className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer ${!planlaModal.customerEmail ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50'}`}>
                    <input type="checkbox" checked={planlaForm.email} disabled={!planlaModal.customerEmail}
                      onChange={e => setPlanlaForm(f => ({ ...f, email: e.target.checked }))}
                      className="w-4 h-4 text-[#C8102E]" />
                    <span className="text-sm font-medium">E-posta</span>
                    {planlaModal.customerEmail && <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{planlaModal.customerEmail}</span>}
                  </label>
                  <label className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer ${!planlaModal.customerPhone ? 'opacity-40 cursor-not-allowed' : 'hover:bg-green-50'}`}>
                    <input type="checkbox" checked={planlaForm.sms} disabled={!planlaModal.customerPhone}
                      onChange={e => setPlanlaForm(f => ({ ...f, sms: e.target.checked }))}
                      className="w-4 h-4 text-[#C8102E]" />
                    <span className="text-sm font-medium">SMS</span>
                    {planlaModal.customerPhone && <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{planlaModal.customerPhone}</span>}
                  </label>
                  <label className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer ${!planlaModal.customerPhone ? 'opacity-40 cursor-not-allowed' : 'hover:bg-purple-50'}`}>
                    <input type="checkbox" checked={planlaForm.whatsapp} disabled={!planlaModal.customerPhone}
                      onChange={e => setPlanlaForm(f => ({ ...f, whatsapp: e.target.checked }))}
                      className="w-4 h-4 text-[#C8102E]" />
                    <span className="text-sm font-medium">WhatsApp</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">Gateway bağlı olmalı</span>
                  </label>
                </div>
              </div>

              {/* Mesaj önizlemesi */}
              {emailSablon && planlaForm.email && (
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mesaj Önizlemesi</div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-xs text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                    {fillTemplate(emailSablon.mesaj_sablonu, makeVars(planlaModal))}
                  </div>
                </div>
              )}

              {planlaResult && (
                <div className={`text-sm rounded-lg px-3 py-2 border ${planlaResult.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {planlaResult.ok ? '✓ ' : '✗ '}{planlaResult.msg}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => setPlanlaModal(null)}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                {planlaResult?.ok ? 'Kapat' : 'İptal'}
              </button>
              {!planlaResult?.ok && (
                <button
                  onClick={handlePlanla}
                  disabled={planlaLoading}
                  className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50"
                >
                  {planlaLoading ? 'Planlanıyor...' : 'Planla'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Gönder Modali ─────────────────────────────── */}
      {gonderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Hatırlatma Gönder</h2>
              <button onClick={() => { setGonderModal(null); setGonderResult(null) }} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-sm space-y-1">
                <div className="font-semibold">{gonderModal.customerName}</div>
                <div className="text-gray-500 dark:text-gray-400">{gonderModal.devices.length} cihaz — En yakın: {gonderModal.devices[0] && formatTRDate(gonderModal.devices[0].tarih)}</div>
                {gonderModal.customerEmail && <div className="text-gray-500 dark:text-gray-400">✉ {gonderModal.customerEmail}</div>}
                {gonderModal.customerPhone && <div className="text-gray-500 dark:text-gray-400">📞 {gonderModal.customerPhone}</div>}
              </div>
              <div className="space-y-2">
                {[
                  { key: 'email' as const,    label: 'E-posta',   disabled: !gonderModal.customerEmail,  warn: !hasResend   ? '⚠ Resend API Key eksik' : '' },
                  { key: 'sms' as const,      label: 'SMS',       disabled: !gonderModal.customerPhone,  warn: !hasNetgsm   ? '⚠ Netgsm eksik' : '' },
                  { key: 'whatsapp' as const, label: 'WhatsApp',  disabled: !gonderModal.customerPhone,  warn: 'Gateway bağlantısı gerekli' },
                ].map(ch => (
                  <label key={ch.key} className={`flex items-start gap-3 p-2.5 border rounded-lg cursor-pointer ${ch.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={channels[ch.key]} disabled={ch.disabled}
                      onChange={e => setChannels(c => ({ ...c, [ch.key]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 text-[#C8102E]" />
                    <div>
                      <div className="text-sm font-medium">{ch.label}</div>
                      {ch.warn && <div className="text-xs text-amber-600">{ch.warn}</div>}
                    </div>
                  </label>
                ))}
              </div>
              {gonderResult && (
                <div className={`text-sm rounded-lg px-3 py-2 border ${gonderResult.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {gonderResult.ok ? '✓ ' : '✗ '}{gonderResult.msg}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => { setGonderModal(null); setGonderResult(null) }}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                {gonderResult?.ok ? 'Kapat' : 'İptal'}
              </button>
              {!gonderResult?.ok && (
                <button onClick={handleGonder} disabled={gonderLoading || (!channels.email && !channels.sms && !channels.whatsapp)}
                  className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50">
                  {gonderLoading ? 'Gönderiliyor...' : 'Onayla ve Gönder'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toplu Gönder Modali ───────────────────────── */}
      {topluModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Tümünü Gönder</h2>
              <button onClick={() => setTopluModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300"><strong>{aktifGruplar.length}</strong> müşteriye gönderilecek.</p>
              {[
                { key: 'email' as const, label: 'E-posta', count: aktifGruplar.filter(g => g.customerEmail).length, warn: !hasResend ? '⚠ Resend eksik' : '' },
                { key: 'sms'   as const, label: 'SMS',     count: aktifGruplar.filter(g => g.customerPhone).length, warn: !hasNetgsm ? '⚠ Netgsm eksik' : '' },
              ].map(ch => (
                <label key={ch.key} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={topluChannels[ch.key]}
                    onChange={e => setTopluChannels(c => ({ ...c, [ch.key]: e.target.checked }))}
                    className="w-4 h-4 text-[#C8102E]" />
                  <div>
                    <div className="text-sm font-medium">{ch.label}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{ch.count} müşteri</div>
                    {ch.warn && <div className="text-xs text-amber-600">{ch.warn}</div>}
                  </div>
                </label>
              ))}
              {topluLoading && (
                <div className="space-y-1.5">
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center">{topluProgress} / {aktifGruplar.length} işleniyor...</div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-[#C8102E] h-1.5 rounded-full transition-all" style={{ width: `${(topluProgress / aktifGruplar.length) * 100}%` }} />
                  </div>
                </div>
              )}
              {topluResult && (
                <div className={`text-sm rounded-lg px-3 py-2 border ${topluResult.err === 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {topluResult.ok} başarılı, {topluResult.err} hatalı gönderim.
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button onClick={() => setTopluModal(false)} className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                {topluResult ? 'Kapat' : 'İptal'}
              </button>
              {!topluResult && (
                <button onClick={handleTopluGonder}
                  disabled={topluLoading || (!topluChannels.email && !topluChannels.sms)}
                  className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50">
                  {topluLoading ? 'Gönderiliyor...' : `${aktifGruplar.length} Müşteriye Gönder`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
