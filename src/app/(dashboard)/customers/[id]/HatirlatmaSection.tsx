'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import HatirlatmaModal from '@/components/HatirlatmaModal'
import { formatTRDate } from '@/lib/finance/formatters'

type Props = {
  customerId: string
  customerName: string
  phone: string | null
  email: string | null
}

type Kayit = {
  id: string
  created_at: string
  kanal: string
  durum: string
  alici_email: string | null
  alici_telefon: string | null
}

function kanalLabel(k: string) {
  if (k === 'email')    return '✉ E-posta'
  if (k === 'sms')      return '📱 SMS'
  if (k === 'whatsapp') return '💬 WhatsApp'
  return k
}

function durumStyle(d: string) {
  if (d === 'gonderildi') return 'bg-green-50 text-green-700 border-green-200'
  if (d === 'basarisiz')  return 'bg-red-50 text-red-700 border-red-200'
  if (d === 'planlandı')  return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
}

function durumText(d: string) {
  if (d === 'gonderildi') return 'Gönderildi'
  if (d === 'basarisiz')  return 'Başarısız'
  if (d === 'planlandı')  return 'Planlandı'
  return d
}

export default function HatirlatmaSection({ customerId, customerName, phone, email }: Props) {
  const supabase = createClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [kayitlar, setKayitlar] = useState<Kayit[]>([])
  const [loading, setLoading] = useState(true)

  const fetchKayitlar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('hatirlatma_kayitlari')
      .select('id, created_at, kanal, durum, alici_email, alici_telefon')
      .eq('musteri_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20)
    setKayitlar(data ?? [])
    setLoading(false)
  }, [customerId])

  useEffect(() => { fetchKayitlar() }, [fetchKayitlar])

  return (
    <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden" id="hatirlatmalar">
      <div className="px-5 py-3 border-b flex items-center justify-between bg-gray-50 dark:bg-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Hatırlatmalar</h2>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#a50d26] transition-colors"
        >
          + Hatırlatma Gönder
        </button>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">Yükleniyor...</div>
      ) : kayitlar.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
          Bu müşteriye henüz hatırlatma gönderilmemiş.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Tarih</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Kanal</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Alıcı</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {kayitlar.map(k => (
                <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {formatTRDate(k.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{kanalLabel(k.kanal)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                    {k.alici_email ?? k.alici_telefon ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${durumStyle(k.durum)}`}>
                      {durumText(k.durum)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HatirlatmaModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); fetchKayitlar() }}
        customerId={customerId}
        customerName={customerName}
        phone={phone}
        email={email}
      />
    </div>
  )
}
