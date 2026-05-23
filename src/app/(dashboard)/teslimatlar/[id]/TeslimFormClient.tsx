'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { HAREKET_TIPI_LABELS, type HareketTipi } from '@/lib/teslimatlar'
import { saveTeslimImzaAction, teslimFormMailGonderAction } from '../actions'

type Props = {
  teslimat: any
  kalemler: any[]
  emanetler: any[]
  bekleyenler: any[]
}

function join<T extends object>(value: unknown): T | null {
  return value && typeof value === 'object' ? value as T : null
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function money(value: unknown) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value ?? 0))
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-gray-100 py-1.5 text-sm last:border-0 dark:border-gray-700">
      <span className="font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-gray-100">{value || '-'}</span>
    </div>
  )
}

function SignaturePad({
  open,
  onClose,
  teslimatId,
  defaultName,
}: {
  open: boolean
  onClose: () => void
  teslimatId: string
  defaultName: string
}) {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [name, setName] = useState(defaultName)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = width * ratio
    canvas.height = height * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [open])

  if (!open) return null

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    setMessage('')
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas) return
    const payload = JSON.stringify({
      imza_data: canvas.toDataURL('image/png'),
      imza_atan_ad_soyad: name,
      imza_atan_unvan: title,
    })
    startTransition(async () => {
      const result = await saveTeslimImzaAction(teslimatId, payload)
      setMessage(result.message)
      if (result.ok) {
        router.refresh()
        onClose()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Müşteri İmzası Al</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Parmak veya stylus ile imza atılabilir.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm dark:border-gray-600">Kapat</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">İmza atan kişi</span>
            <input value={name} onChange={e => setName(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Ünvan</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Yetkili, teslim alan..." className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
          </label>
        </div>
        <canvas
          ref={canvasRef}
          className="mt-4 h-64 w-full touch-none rounded-lg border border-gray-300 bg-white dark:border-gray-600"
          onPointerDown={event => {
            const ctx = canvasRef.current?.getContext('2d')
            if (!ctx) return
            const p = point(event)
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            setDrawing(true)
          }}
          onPointerMove={event => {
            if (!drawing) return
            const ctx = canvasRef.current?.getContext('2d')
            if (!ctx) return
            const p = point(event)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }}
          onPointerUp={() => setDrawing(false)}
          onPointerLeave={() => setDrawing(false)}
        />
        {message && <div className="mt-3 rounded-md border px-3 py-2 text-sm dark:border-gray-700">{message}</div>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={clear} className="rounded-md border px-4 py-2 text-sm dark:border-gray-600">Temizle</button>
          <button type="button" onClick={clear} className="rounded-md border px-4 py-2 text-sm dark:border-gray-600">Tekrar Al</button>
          <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-[#C8102E] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TeslimFormClient({ teslimat, kalemler, emanetler, bekleyenler }: Props) {
  const router = useRouter()
  const customer = join<{ full_name?: string | null; phone?: string | null; email?: string | null; address?: string | null; tax_number?: string | null; authorized_person?: string | null }>(teslimat.customers)
  const sube = join<{ ad?: string | null }>(teslimat.subeler)
  const personel = join<{ ad?: string | null; soyad?: string | null }>(teslimat.personeller)
  const personelAd = personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() : ''
  const toplam = kalemler.reduce((sum, row) => sum + Number(row.toplam_tutar ?? 0), 0)
  const acikEmanet = emanetler.filter(row => ['acik', 'kismi_kapandi'].includes(String(row.durum))).length
  const geriBekleyen = bekleyenler.filter(row => ['bekliyor', 'kismi_teslim'].includes(String(row.durum))).length
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const [mailTo, setMailTo] = useState(customer?.email ?? '')
  const [mailText, setMailText] = useState(`Merhaba,\n\n${teslimat.teslimat_no} numaralı teslim formunuz ektedir. İlgili teslimat bilgileri PDF dosyasında yer almaktadır.\n\nİyi çalışmalar dileriz.\nKöklü Yangın Söndürme`)
  const [mailMessage, setMailMessage] = useState('')
  const [isMailPending, startMailTransition] = useTransition()

  function sendMail() {
    setMailMessage('')
    const payload = JSON.stringify({
      to: mailTo,
      subject: `${teslimat.teslimat_no} Teslim Formu`,
      text: mailText,
    })
    startMailTransition(async () => {
      const result = await teslimFormMailGonderAction(teslimat.id, payload)
      setMailMessage(result.message)
      if (result.ok) {
        router.refresh()
        setMailOpen(false)
      }
    })
  }

  return (
    <section className="teslim-form-panel rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <style>{`
        @media print { .teslim-form-actions, .no-print { display: none !important; } .teslim-form-panel { border: 0; box-shadow: none; } }
      `}</style>

      <div className="teslim-form-actions flex flex-wrap items-center justify-between gap-3 border-b p-4 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Teslim Formu</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Kurumsal teslim formu, imza, PDF ve mail işlemleri.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSignatureOpen(true)} className="rounded-md bg-[#C8102E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#a00d25]">İmzayı Al</button>
          <Link href={`/api/teslimatlar/${teslimat.id}/pdf`} target="_blank" className="action-link rounded-md border px-3 py-2 text-sm font-semibold text-[#C8102E] hover:bg-red-50 dark:border-gray-600 dark:hover:bg-gray-700">PDF Önizle</Link>
          <Link href={`/api/teslimatlar/${teslimat.id}/pdf?download=1`} className="action-link rounded-md border px-3 py-2 text-sm font-semibold text-[#C8102E] hover:bg-red-50 dark:border-gray-600 dark:hover:bg-gray-700">PDF İndir</Link>
          <button type="button" onClick={() => setMailOpen(v => !v)} className="rounded-md border px-3 py-2 text-sm font-semibold text-[#C8102E] hover:bg-red-50 dark:border-gray-600 dark:hover:bg-gray-700">Mail Gönder</button>
        </div>
      </div>

      {mailOpen && (
        <div className="teslim-form-actions border-b bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr_auto]">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Alıcı e-posta</span>
              <input type="email" value={mailTo} onChange={e => setMailTo(e.target.value)} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">Mail metni</span>
              <textarea value={mailText} onChange={e => setMailText(e.target.value)} className="min-h-24 rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={sendMail} disabled={isMailPending} className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {isMailPending ? 'Gönderiliyor...' : 'PDF ile Gönder'}
              </button>
            </div>
          </div>
          {mailMessage && <div className="mt-3 rounded-md border px-3 py-2 text-sm dark:border-gray-700">{mailMessage}</div>}
        </div>
      )}

      <div className="p-5">
        <div className="rounded-lg border border-[#C8102E] bg-[#C8102E] text-white">
          <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
            <div>
              <div className="text-3xl font-black tracking-wide">KÖKLÜ</div>
              <div className="text-sm font-semibold">YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LTD. ŞTİ.</div>
              <div className="mt-3 grid gap-1 text-xs text-red-50 md:grid-cols-2">
                <span>Erzincan Fabrika: Karaağaç Mah. 774. Sok. No:49 · Tel: (0446) 214 45 81</span>
                <span>İstanbul Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular · Tel: (0534) 311 49 05</span>
              </div>
            </div>
            <div className="text-left md:text-right">
              <div className="text-2xl font-black">TESLİM FORMU</div>
              <div className="mt-1 font-mono text-sm">{teslimat.teslim_form_no ?? teslimat.teslimat_no}</div>
              <div className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold text-[#C8102E]">{teslimat.durum}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <h3 className="mb-2 font-semibold text-[#C8102E]">Müşteri Bilgileri</h3>
            <InfoLine label="Müşteri" value={customer?.full_name} />
            <InfoLine label="Yetkili" value={customer?.authorized_person} />
            <InfoLine label="Telefon" value={customer?.phone} />
            <InfoLine label="Vergi No" value={customer?.tax_number} />
            <InfoLine label="Adres" value={customer?.address} />
            <InfoLine label="Teslim Yeri" value={customer?.address} />
          </div>
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <h3 className="mb-2 font-semibold text-[#C8102E]">Teslimat Bilgileri</h3>
            <InfoLine label="Teslim Tarihi" value={formatDate(teslimat.teslimat_tarihi)} />
            <InfoLine label="Hedef Tarih" value={formatDate(teslimat.hedef_tarih)} />
            <InfoLine label="Şube" value={sube?.ad ?? 'Genel'} />
            <InfoLine label="Teslim Eden" value={personelAd || 'Atanmadı'} />
            <InfoLine label="Ön Kayıt" value={teslimat.on_kayit_olusturuldu ? 'Oluşturuldu' : teslimat.on_kayit_secimi} />
            <InfoLine label="Mail" value={teslimat.teslim_form_mail_gonderildi ? `Gönderildi (${formatDateTime(teslimat.teslim_form_mail_tarihi)})` : 'Gönderilmedi'} />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border dark:border-gray-700">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#C8102E] text-xs uppercase text-white">
              <tr>
                {['Sıra No', 'Ürün / Hizmet', 'İşlem Tipi', 'Yön', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam', 'Açıklama'].map(h => (
                  <th key={h} className="px-3 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {kalemler.map((row, index) => {
                const urun = join<{ ad?: string | null }>(row.urunler)
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-3">{index + 1}</td>
                    <td className="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">{urun?.ad ?? row.aciklama}</td>
                    <td className="px-3 py-3">{HAREKET_TIPI_LABELS[row.hareket_tipi as HareketTipi] ?? row.hareket_tipi}</td>
                    <td className="px-3 py-3">{row.hareket_yonu}</td>
                    <td className="px-3 py-3">{row.miktar}</td>
                    <td className="px-3 py-3">{row.birim}</td>
                    <td className="px-3 py-3">{money(row.birim_fiyat)}</td>
                    <td className="px-3 py-3 font-semibold">{money(row.toplam_tutar)}</td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{row.aciklama}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 dark:bg-gray-700">
                <td colSpan={7} className="px-3 py-3 text-right font-bold">Toplam</td>
                <td className="px-3 py-3 font-bold text-[#C8102E]">{money(toplam)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <div className="text-xs font-semibold uppercase text-gray-500">Açık emanet</div>
            <div className={`mt-1 text-2xl font-bold ${acikEmanet > 0 ? 'text-orange-600' : 'text-green-600'}`}>{acikEmanet > 0 ? `${acikEmanet} kayıt` : 'Yok'}</div>
          </div>
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <div className="text-xs font-semibold uppercase text-gray-500">Geri teslim bekleyen</div>
            <div className={`mt-1 text-2xl font-bold ${geriBekleyen > 0 ? 'text-orange-600' : 'text-green-600'}`}>{geriBekleyen > 0 ? `${geriBekleyen} kayıt` : 'Yok'}</div>
          </div>
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <div className="text-xs font-semibold uppercase text-gray-500">Genel notlar</div>
            <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">{teslimat.notlar ?? teslimat.aciklama ?? '-'}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <div className="font-semibold text-gray-900 dark:text-gray-100">Teslim Alan</div>
            <div className="mt-1 text-sm text-gray-500">{teslimat.imza_atan_ad_soyad ?? customer?.authorized_person ?? customer?.full_name ?? '-'}</div>
            {teslimat.musteri_imza_data ? (
              <img src={teslimat.musteri_imza_data} alt="Müşteri imzası" className="mt-3 h-24 max-w-full rounded border bg-white object-contain p-2" />
            ) : (
              <div className="mt-12 border-b border-dashed border-gray-400" />
            )}
            <div className="mt-2 text-xs text-gray-400">İmza tarihi: {formatDateTime(teslimat.imza_tarihi)}</div>
          </div>
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <div className="font-semibold text-gray-900 dark:text-gray-100">Teslim Eden</div>
            <div className="mt-1 text-sm text-gray-500">{personelAd || '-'}</div>
            <div className="mt-20 border-b border-dashed border-gray-400" />
          </div>
          <div className="rounded-lg border p-4 dark:border-gray-700">
            <div className="font-semibold text-gray-900 dark:text-gray-100">Firma Yetkilisi / Onaylayan</div>
            <div className="mt-24 border-b border-dashed border-gray-400" />
          </div>
        </div>
      </div>

      <SignaturePad
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        teslimatId={teslimat.id}
        defaultName={teslimat.imza_atan_ad_soyad ?? customer?.authorized_person ?? customer?.full_name ?? ''}
      />
    </section>
  )
}
