'use client'

import { useState, useEffect, useCallback } from 'react'

type SettingKey = 'resend_api_key' | 'netgsm_usercode' | 'netgsm_password' | 'netgsm_msgheader' | 'whatsapp_phone'

type WhatsAppStatus = 'disconnected' | 'qr_ready' | 'connecting' | 'connected'

type Settings = Record<SettingKey, string | null>
type HasFull  = Record<SettingKey, boolean>

type AyarSatiri = {
  key: SettingKey
  label: string
  aciklama: string
  placeholder: string
  type?: 'password' | 'text' | 'tel'
  group: 'resend' | 'netgsm' | 'whatsapp'
}

const SATIRLAR: AyarSatiri[] = [
  {
    key: 'resend_api_key',
    label: 'Resend API Key',
    aciklama: 'resend.com üzerinden alınan API anahtarı',
    placeholder: 're_xxxxxxxxxxxxxxxxxxxx',
    type: 'password',
    group: 'resend',
  },
  {
    key: 'netgsm_usercode',
    label: 'Netgsm Kullanıcı Kodu',
    aciklama: 'Netgsm panelindeki kullanıcı adı / müşteri kodu',
    placeholder: '8501234567',
    group: 'netgsm',
  },
  {
    key: 'netgsm_password',
    label: 'Netgsm Şifre',
    aciklama: 'Netgsm panel şifresi',
    placeholder: '••••••',
    type: 'password',
    group: 'netgsm',
  },
  {
    key: 'netgsm_msgheader',
    label: 'SMS Başlığı (Msg Header)',
    aciklama: 'Netgsm\'de onaylı gönderici başlığı (maks 11 karakter)',
    placeholder: 'KOKLU',
    group: 'netgsm',
  },
  {
    key: 'whatsapp_phone',
    label: 'WhatsApp Telefon Numarası',
    aciklama: 'Kaydedilir ancak gönderim henüz aktif değil (yakında)',
    placeholder: '+90 5XX XXX XX XX',
    type: 'tel',
    group: 'whatsapp',
  },
]

export default function AyarlarClient() {
  const [settings, setSettings] = useState<Settings>({
    resend_api_key: null, netgsm_usercode: null, netgsm_password: null,
    netgsm_msgheader: null, whatsapp_phone: null,
  })
  const [hasFull, setHasFull] = useState<HasFull>({
    resend_api_key: false, netgsm_usercode: false, netgsm_password: false,
    netgsm_msgheader: false, whatsapp_phone: false,
  })
  const [edits, setEdits] = useState<Partial<Record<SettingKey, string>>>({})
  const [saving, setSaving] = useState<Partial<Record<SettingKey, boolean>>>({})
  const [saved, setSaved] = useState<Partial<Record<SettingKey, boolean>>>({})
  const [errors, setErrors] = useState<Partial<Record<SettingKey, string>>>({})
  const [testing, setTesting] = useState<'resend' | 'netgsm' | null>(null)
  const [testResult, setTestResult] = useState<{ target: 'resend' | 'netgsm'; ok: boolean; msg: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [wpStatus, setWpStatus] = useState<WhatsAppStatus>('disconnected')
  const [wpQr, setWpQr] = useState<string | null>(null)
  const [wpLoading, setWpLoading] = useState(false)

  useEffect(() => {
    fetch('/api/ayarlar')
      .then(r => r.json())
      .then(d => {
        if (d.settings) setSettings(d.settings)
        if (d.hasFull) setHasFull(d.hasFull)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const fetchWpStatus = useCallback(async () => {
    setWpLoading(true)
    try {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' })
      const data = await res.json()
      setWpStatus(data.status ?? 'disconnected')
      setWpQr(data.qrImage ?? null)
    } catch {
      setWpStatus('disconnected')
      setWpQr(null)
    } finally {
      setWpLoading(false)
    }
  }, [])

  // Initial WhatsApp status fetch + auto-refresh when QR is pending
  useEffect(() => {
    fetchWpStatus()
  }, [fetchWpStatus])

  useEffect(() => {
    if (wpStatus !== 'qr_ready' && wpStatus !== 'connecting') return
    const id = setInterval(fetchWpStatus, 5000)
    return () => clearInterval(id)
  }, [wpStatus, fetchWpStatus])

  async function handleSave(key: SettingKey) {
    const value = edits[key]
    if (value === undefined) return
    setSaving(s => ({ ...s, [key]: true }))
    setErrors(e => ({ ...e, [key]: undefined }))

    const res = await fetch('/api/ayarlar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })

    if (res.ok) {
      setSaved(s => ({ ...s, [key]: true }))
      setEdits(e => { const n = { ...e }; delete n[key]; return n })
      setHasFull(h => ({ ...h, [key]: !!value }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 3000)
    } else {
      const err = await res.json().catch(() => ({}))
      setErrors(e => ({ ...e, [key]: err.error ?? 'Kayıt hatası' }))
    }
    setSaving(s => ({ ...s, [key]: false }))
  }

  async function handleTestResend() {
    setTesting('resend')
    setTestResult(null)
    const res = await fetch('/api/hatirlatma/gonder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'test@koklu.com.tr',
        subject: 'Köklü ERP — Resend Test',
        text: 'Bu bir test e-postasıdır. Gönderim başarılı.',
      }),
    })
    const data = await res.json().catch(() => ({}))
    setTesting(null)
    setTestResult({
      target: 'resend',
      ok: res.ok,
      msg: res.ok
        ? 'E-posta gönderimi başarılı! (test@koklu.com.tr adresine gönderildi)'
        : (data.error ?? 'Bağlantı hatası'),
    })
  }

  async function handleTestNetgsm() {
    const phone = settings.whatsapp_phone ?? edits.netgsm_usercode
    if (!phone) {
      setTestResult({ target: 'netgsm', ok: false, msg: 'Test için WhatsApp/telefon alanına bir numara girin.' })
      return
    }
    setTesting('netgsm')
    setTestResult(null)
    const res = await fetch('/api/hatirlatma/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        message: 'Köklü ERP — SMS entegrasyon testi başarılı.',
      }),
    })
    const data = await res.json().catch(() => ({}))
    setTesting(null)
    setTestResult({
      target: 'netgsm',
      ok: res.ok,
      msg: res.ok ? 'SMS gönderildi!' : (data.error ?? 'SMS hatası'),
    })
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Yükleniyor...</div>
  }

  const groups = [
    {
      id: 'resend',
      title: 'E-posta (Resend)',
      badge: hasFull.resend_api_key ? '✓ Bağlı' : '⚠ Eksik',
      badgeClass: hasFull.resend_api_key ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200',
      desc: 'Müşterilere e-posta göndermek için Resend kullanılmaktadır.',
      link: 'https://resend.com/api-keys',
      linkLabel: 'resend.com → API Keys',
      testBtn: (
        <button
          onClick={handleTestResend}
          disabled={!hasFull.resend_api_key || testing === 'resend'}
          className="text-xs border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-colors"
        >
          {testing === 'resend' ? 'Test ediliyor...' : '▶ Test E-postası Gönder'}
        </button>
      ),
      rows: SATIRLAR.filter(r => r.group === 'resend'),
    },
    {
      id: 'netgsm',
      title: 'SMS (Netgsm)',
      badge: hasFull.netgsm_usercode && hasFull.netgsm_password ? '✓ Bağlı' : '⚠ Eksik',
      badgeClass: hasFull.netgsm_usercode && hasFull.netgsm_password ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200',
      desc: 'SMS göndermek için Netgsm XML API kullanılmaktadır.',
      link: 'https://www.netgsm.com.tr',
      linkLabel: 'netgsm.com.tr',
      testBtn: (
        <button
          onClick={handleTestNetgsm}
          disabled={!hasFull.netgsm_usercode || !hasFull.netgsm_password || testing === 'netgsm'}
          className="text-xs border border-green-200 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40 transition-colors"
        >
          {testing === 'netgsm' ? 'Test ediliyor...' : '▶ Test SMS Gönder'}
        </button>
      ),
      rows: SATIRLAR.filter(r => r.group === 'netgsm'),
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Gateway',
      badge: wpStatus === 'connected'   ? '🟢 Bağlı'
           : wpStatus === 'qr_ready'    ? '🟡 QR Bekleniyor'
           : wpStatus === 'connecting'  ? '🟡 Bağlanıyor...'
           :                             '🔴 Bağlı Değil',
      badgeClass: wpStatus === 'connected'
           ? 'bg-green-50 text-green-700 border-green-200'
           : wpStatus === 'qr_ready' || wpStatus === 'connecting'
           ? 'bg-amber-50 text-amber-700 border-amber-200'
           : 'bg-red-50 text-red-700 border-red-200',
      desc: 'WhatsApp mesajları lokal olarak çalışan whatsapp-gateway servisi üzerinden iletilir.',
      link: null,
      linkLabel: null,
      testBtn: (
        <button
          onClick={fetchWpStatus}
          disabled={wpLoading}
          className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          {wpLoading ? 'Yükleniyor...' : '↺ Yenile'}
        </button>
      ),
      rows: SATIRLAR.filter(r => r.group === 'whatsapp'),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Entegrasyon Ayarları</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Ayarlar şifreli olarak veritabanında saklanır. Ortam değişkenleri (.env.local) varsa önceliklidir.
        </p>
      </div>

      {groups.map(group => (
        <div key={group.id} className="bg-white border rounded-xl overflow-hidden">
          {/* Grup başlığı */}
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{group.title}</h3>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${group.badgeClass}`}>
                {group.badge}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {group.testBtn}
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">
              {group.desc}
              {group.link && (
                <> Hesap oluşturmak için: <a href={group.link} target="_blank" rel="noopener noreferrer"
                  className="text-[#C8102E] underline">{group.linkLabel}</a></>
              )}
            </p>

            {/* Test sonucu */}
            {testResult?.target === group.id && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${
                testResult.ok
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
              </div>
            )}

            {/* WhatsApp gateway durum paneli */}
            {group.id === 'whatsapp' && (
              <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
                {wpStatus === 'connected' && (
                  <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    WhatsApp bağlı ve mesaj gönderimine hazır.
                  </div>
                )}
                {wpStatus === 'disconnected' && (
                  <div className="text-sm text-gray-500">
                    <p className="font-medium text-gray-700 mb-1">Gateway çalışmıyor</p>
                    <p className="text-xs">
                      Servisi başlatmak için terminalde:{' '}
                      <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono text-xs">
                        cd whatsapp-gateway && npm install && node index.js
                      </code>
                    </p>
                  </div>
                )}
                {(wpStatus === 'qr_ready' || wpStatus === 'connecting') && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-amber-700">
                      {wpStatus === 'qr_ready'
                        ? 'WhatsApp uygulamanızla QR kodu okutun:'
                        : 'Bağlantı kuruluyor, lütfen bekleyin...'}
                    </p>
                    {wpQr && (
                      <div className="flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={wpQr}
                          alt="WhatsApp QR Kodu"
                          className="w-52 h-52 border rounded-lg shadow-sm"
                        />
                      </div>
                    )}
                    <p className="text-xs text-gray-500 text-center">
                      WhatsApp → Bağlı cihazlar → Cihaz bağla
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Ayar satırları */}
            <div className="space-y-3">
              {group.rows.map(satir => {
                const currentVal = settings[satir.key]
                const editVal = edits[satir.key]
                const isEditing = editVal !== undefined
                const isSaved = saved[satir.key]
                const isSaving = saving[satir.key]
                const errMsg = errors[satir.key]
                const has = hasFull[satir.key]

                return (
                  <div key={satir.key} className="grid grid-cols-3 gap-4 items-start">
                    <div>
                      <div className="text-sm font-medium text-gray-700">{satir.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{satir.aciklama}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex gap-2">
                        <input
                          type={isEditing ? (satir.type === 'password' ? 'text' : satir.type ?? 'text') : 'text'}
                          value={isEditing ? editVal : (currentVal ?? '')}
                          onChange={e => setEdits(prev => ({ ...prev, [satir.key]: e.target.value }))}
                          placeholder={has && !isEditing ? '(kayıtlı)' : satir.placeholder}
                          className={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] ${
                            has && !isEditing ? 'text-gray-400 bg-gray-50' : ''
                          }`}
                        />
                        <button
                          onClick={() => {
                            if (isEditing) handleSave(satir.key)
                            else setEdits(prev => ({ ...prev, [satir.key]: '' }))
                          }}
                          disabled={isSaving}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            isEditing
                              ? 'bg-[#C8102E] text-white hover:bg-[#a50d26] disabled:opacity-50'
                              : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {isSaving ? '...' : isSaved ? '✓ Kaydedildi' : isEditing ? 'Kaydet' : 'Değiştir'}
                        </button>
                        {isEditing && (
                          <button
                            onClick={() => setEdits(prev => { const n = { ...prev }; delete n[satir.key]; return n })}
                            className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-700 border"
                          >
                            İptal
                          </button>
                        )}
                      </div>
                      {errMsg && (
                        <div className="text-xs text-red-600 mt-1">{errMsg}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}

    </div>
  )
}
