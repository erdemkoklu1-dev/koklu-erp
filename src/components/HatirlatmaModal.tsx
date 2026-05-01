'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Kanal = 'email' | 'sms' | 'whatsapp'

type Props = {
  open: boolean
  onClose: () => void
  customerId: string
  customerName: string
  phone: string | null
  email: string | null
}

function defaultMesaj(customerName: string) {
  return `Sayın ${customerName},\n\nBünyenizde bulunan yangın söndürme cihazlarının bakım/kontrol/dolum tarihi yaklaşmaktadır.\n\nBakım ve kontrol işlemleri için bizimle iletişime geçmenizi rica ederiz.\n\nKöklü Yangın Söndürme Cihazları\nTel: (0446) 214 45 81`
}

export default function HatirlatmaModal({ open, onClose, customerId, customerName, phone, email }: Props) {
  const supabase = createClient()
  const [kanal, setKanal] = useState<Kanal>('email')
  const [mesaj, setMesaj] = useState(() => defaultMesaj(customerName))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  if (!open) return null

  async function handleGonder() {
    setLoading(true)
    setResult(null)

    let apiOk = false
    let errMsg = ''

    try {
      if (kanal === 'email') {
        if (!email) { setResult({ ok: false, msg: 'Müşterinin e-posta adresi yok.' }); setLoading(false); return }
        const res = await fetch('/api/hatirlatma/gonder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: email, subject: 'Bakım Hatırlatması — Köklü Yangın', text: mesaj, musteri_id: customerId }),
        })
        apiOk = res.ok
        if (!res.ok) errMsg = (await res.json().catch(() => ({}))).error ?? 'E-posta gönderilemedi.'
      } else if (kanal === 'sms') {
        if (!phone) { setResult({ ok: false, msg: 'Müşterinin telefon numarası yok.' }); setLoading(false); return }
        const res = await fetch('/api/hatirlatma/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: phone, message: mesaj, musteri_id: customerId }),
        })
        apiOk = res.ok
        if (!res.ok) errMsg = (await res.json().catch(() => ({}))).error ?? 'SMS gönderilemedi.'
      } else {
        if (!phone) { setResult({ ok: false, msg: 'Müşterinin telefon numarası yok.' }); setLoading(false); return }
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: phone, message: mesaj, musteri_id: customerId }),
        })
        apiOk = res.ok
        if (!res.ok) errMsg = (await res.json().catch(() => ({}))).error ?? 'WhatsApp mesajı gönderilemedi.'
      }
    } catch (e: any) {
      errMsg = e?.message ?? 'Bilinmeyen hata'
    }

    await supabase.from('hatirlatma_kayitlari').insert({
      musteri_id: customerId,
      kanal,
      alici_email: kanal === 'email' ? email : null,
      alici_telefon: kanal !== 'email' ? phone : null,
      durum: apiOk ? 'gonderildi' : 'basarisiz',
    })

    setLoading(false)
    setResult(apiOk ? { ok: true, msg: 'Hatırlatma başarıyla gönderildi.' } : { ok: false, msg: errMsg })
  }

  const kanallar: { val: Kanal; label: string; disabled: boolean }[] = [
    { val: 'email',    label: '✉ E-posta',  disabled: !email },
    { val: 'sms',      label: '📱 SMS',      disabled: !phone },
    { val: 'whatsapp', label: '💬 WhatsApp', disabled: !phone },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Hatırlatma Gönder</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Müşteri */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2.5 text-sm">
            <div className="font-semibold text-gray-900 dark:text-gray-100">{customerName}</div>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
              {phone  && <span>📱 {phone}</span>}
              {email  && <span>✉ {email}</span>}
              {!phone && !email && <span className="text-red-500">İletişim bilgisi yok</span>}
            </div>
          </div>

          {/* Kanal */}
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2">Gönderim Kanalı</div>
            <div className="flex gap-2">
              {kanallar.map(ch => (
                <button
                  key={ch.val}
                  disabled={ch.disabled}
                  onClick={() => setKanal(ch.val)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    kanal === ch.val
                      ? 'bg-[#C8102E] text-white border-[#C8102E]'
                      : ch.disabled
                      ? 'bg-gray-50 dark:bg-gray-700 text-gray-300 border-gray-200 dark:border-gray-600 cursor-not-allowed'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#C8102E] hover:text-[#C8102E]'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mesaj */}
          <div>
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-2">Mesaj</div>
            <textarea
              value={mesaj}
              onChange={e => setMesaj(e.target.value)}
              rows={6}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none"
            />
          </div>

          {result && (
            <div className={`text-sm rounded-lg px-3 py-2 border ${result.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {result.ok ? '✓ ' : '✗ '}{result.msg}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
            {result?.ok ? 'Kapat' : 'İptal'}
          </button>
          {!result?.ok && (
            <button
              onClick={handleGonder}
              disabled={loading}
              className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50"
            >
              {loading ? 'Gönderiliyor...' : 'Onayla ve Gönder'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
