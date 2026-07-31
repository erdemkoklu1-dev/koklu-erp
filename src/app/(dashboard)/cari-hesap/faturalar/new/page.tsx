'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calculateInvoiceTotals } from '@/lib/finance/calculations'
import { formatCurrency } from '@/lib/finance/formatters'
import { inferCityFromAddress, suggestBranchByCity } from '@/lib/branches/branch-inference'
import { requestApi } from '@/lib/api/envelope'

/** `/api/parse-fatura` çıktısının istemcide kullanılan şekli. */
type ParseFaturaData = {
  customer?: {
    full_name?: string | null
    tax_number?: string | null
    phone?: string | null
    email?: string | null
    address?: string | null
    city?: string | null
  } | null
  supplier?: {
    name?: string | null
    tax_no?: string | null
    address?: string | null
    city?: string | null
  } | null
  invoice?: {
    invoice_date?: string | null
    due_date?: string | null
    kdv_rate?: number | null
    stopaj_rate?: number | null
  } | null
  items?: Array<{
    description?: string | null
    quantity?: number | null
    unit?: string | null
    unit_price?: number | null
    kdv_rate?: number | null
  }> | null
}

type LineItem = { description: string; quantity: string; unit: string; unit_price: string; kdv_rate: string }
const emptyLine = (): LineItem => ({ description: '', quantity: '1', unit: 'adet', unit_price: '', kdv_rate: '20' })

type BrokerLine = { broker_id: string; broker_name: string; commission_rate: string; commission_amount: string }
type Sube = { id: string; ad: string; sehir?: string | null }

const KDV_RATES = ['0', '10', '20']
const UNITS = ['adet', 'saat', 'kg', 'm', 'set', 'paket']

export default function NewFaturaPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [subeler, setSubeler] = useState<Sube[]>([])
  const [availableSubeler, setAvailableSubeler] = useState<Sube[]>([])
  const [branchLocked, setBranchLocked] = useState(false)
  const [branchInfo, setBranchInfo] = useState('')

  // PDF parse state
  const [parseLoading, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [showParseSection, setShowParseSection] = useState(false)
  const [customerNotFound, setCustomerNotFound] = useState(false)
  // Yüklenen faturanın sistemde zaten kayıtlı olup olmadığı (dosyadan yükleme dedup)
  const [duplicateInvoice, setDuplicateInvoice] = useState<{ invoice_number: string; total_amount: number } | null>(null)

  // Aracı state
  const [allBrokers, setAllBrokers] = useState<any[]>([])
  const [brokerLines, setBrokerLines] = useState<BrokerLine[]>([])
  const [brokerSearch, setBrokerSearch] = useState('')
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false)

  // Ön Kayıt state
  const [onKayitlar, setOnKayitlar] = useState<any[]>([])
  const [selectedOnKayitIds, setSelectedOnKayitIds] = useState<Set<string>>(new Set())
  const [onKayitEklendi, setOnKayitEklendi] = useState<Set<string>>(new Set())

  const [form, setForm] = useState({
    invoice_type: 'satis',
    customer_id: '',
    supplier_name: '',
    supplier_tax_no: '',
    customer_name: '',
    tax_number: '',
    customer_phone: '',
    customer_email: '',
    customer_address: '',
    customer_city: '',
    customer_district: '',
    sube_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    kdv_rate: '20',
    stopaj_rate: '0',
    description: '',
    notes: '',
  })
  const [items, setItems] = useState<LineItem[]>([emptyLine()])

  useEffect(() => {
    supabase.from('customers').select('id, full_name, tax_number, phone, email, address, il, sube_id').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any }) => setCustomers(data ?? []))
    supabase.from('brokers').select('id, full_name, company_name').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any }) => setAllBrokers(data ?? []))
    supabase.from('subeler').select('id, ad, sehir').eq('aktif', true).order('ad')
      .then(async ({ data }: { data: any }) => {
        const all = (data ?? []) as Sube[]
        setSubeler(all)

        const { data: userData } = await supabase.auth.getUser()
        const userId = userData.user?.id
        if (!userId) {
          setAvailableSubeler(all)
          return
        }

        const [{ data: profile }, { data: branchRows }] = await Promise.all([
          supabase.from('kullanici_profiller').select('sube_id, roller(ad)').eq('id', userId).single(),
          supabase.from('kullanici_sube_yetkileri').select('sube_id').eq('kullanici_id', userId),
        ])
        const roleName = (profile?.roller as any)?.ad ?? ''
        const isAdmin = roleName === 'Admin' || roleName === 'Super Admin' || roleName === 'Genel Admin'
        const allowedIds = Array.from(new Set([
          ...((branchRows ?? []).map((row: any) => row.sube_id).filter(Boolean) as string[]),
          ...(profile?.sube_id ? [profile.sube_id as string] : []),
        ]))
        const visible = isAdmin ? all : all.filter(s => allowedIds.includes(s.id))
        setAvailableSubeler(visible)
        if (!isAdmin && visible.length === 1) {
          setBranchLocked(true)
          setForm(p => ({ ...p, sube_id: visible[0].id }))
          setBranchInfo(`Tek şube yetkiniz olduğu için ${visible[0].ad} seçildi.`)
        }
      })
  }, [])

  function applyBranchSuggestion(source: 'manual' | 'customer' | 'pdf', address?: string | null, city?: string | null, customerBranchId?: string | null) {
    const branches = availableSubeler.length > 0 ? availableSubeler : subeler
    if (branchLocked) return

    if (source === 'customer' && customerBranchId && branches.some(s => s.id === customerBranchId)) {
      const branch = branches.find(s => s.id === customerBranchId)
      setForm(p => ({ ...p, sube_id: customerBranchId }))
      setBranchInfo(`Kayıtlı müşteri şubesine göre ${branch?.ad ?? 'şube'} seçildi.`)
      return
    }

    const inferredCity = city || inferCityFromAddress(address)
    const suggestion = suggestBranchByCity(inferredCity, branches)
    setForm(p => ({
      ...p,
      customer_city: inferredCity || p.customer_city,
      sube_id: suggestion.suggestedBranchId || p.sube_id,
    }))
    setBranchInfo(suggestion.suggestedBranchName
      ? `Adres bilgisinden ${suggestion.city} tespit edildi. Şube ${suggestion.suggestedBranchName} olarak önerildi.`
      : suggestion.reason)
  }

  function pickCustomer(customer: any) {
    setSelectedCustomer(customer)
    setForm(p => ({
      ...p,
      customer_id: customer.id,
      customer_name: customer.full_name ?? '',
      tax_number: customer.tax_number ?? '',
      customer_phone: customer.phone ?? '',
      customer_email: customer.email ?? '',
      customer_address: customer.address ?? '',
      customer_city: customer.il ?? inferCityFromAddress(customer.address) ?? '',
      sube_id: branchLocked ? p.sube_id : (customer.sube_id ?? p.sube_id),
    }))
    setCustomerSearch('')
    setShowDropdown(false)
    applyBranchSuggestion('customer', customer.address, customer.il, customer.sube_id)
  }

  useEffect(() => {
    if (!selectedCustomer) { setOnKayitlar([]); setSelectedOnKayitIds(new Set()); setOnKayitEklendi(new Set()); return }
    supabase
      .from('on_kayitlar')
      .select('id, kayit_tarihi, aciklama, miktar, birim, birim_fiyat, toplam_tutar, kalemler')
      .eq('customer_id', selectedCustomer.id)
      .eq('durum', 'beklemede')
      .order('kayit_tarihi', { ascending: false })
      .then(({ data }: { data: any }) => {
        setOnKayitlar(data ?? [])
        setSelectedOnKayitIds(new Set())
        setOnKayitEklendi(new Set())
      })
  }, [selectedCustomer])

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.tax_number ?? '').includes(customerSearch)
  )

  const filteredBrokers = allBrokers.filter(b =>
    !brokerLines.some(l => l.broker_id === b.id) &&
    (b.full_name.toLowerCase().includes(brokerSearch.toLowerCase()) ||
     (b.company_name ?? '').toLowerCase().includes(brokerSearch.toLowerCase()))
  )

  function addBroker(broker: any) {
    setBrokerLines(prev => [...prev, {
      broker_id: broker.id,
      broker_name: broker.company_name ? `${broker.full_name} (${broker.company_name})` : broker.full_name,
      commission_rate: '',
      commission_amount: '',
    }])
    setBrokerSearch('')
    setShowBrokerDropdown(false)
  }

  function updateBrokerLine(idx: number, field: 'commission_rate' | 'commission_amount', value: string) {
    setBrokerLines(prev => prev.map((line, i) => {
      if (i !== idx) return line
      const updated = { ...line, [field]: value }
      if (field === 'commission_rate') {
        const rate = parseFloat(value) || 0
        updated.commission_amount = rate > 0
          ? String(parseFloat((totals.total_amount * rate / 100).toFixed(2)))
          : ''
      }
      return updated
    }))
  }

  function removeBrokerLine(idx: number) {
    setBrokerLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof LineItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function importOnKayitlar() {
    const selected = onKayitlar.filter(k => selectedOnKayitIds.has(k.id))
    if (selected.length === 0) return
    const newItems: LineItem[] = selected.flatMap(k => {
      const kArr = Array.isArray(k.kalemler) && k.kalemler.length > 0 ? k.kalemler : null
      if (kArr) {
        return kArr.map((kalem: any) => ({
          description: kalem.aciklama,
          quantity: String(kalem.miktar),
          unit: kalem.birim === 'is' ? 'adet' : (UNITS.includes(kalem.birim) ? kalem.birim : 'adet'),
          unit_price: String(kalem.birim_fiyat),
          kdv_rate: '20',
        }))
      }
      return [{
        description: k.aciklama,
        quantity: String(k.miktar),
        unit: k.birim === 'is' ? 'adet' : (UNITS.includes(k.birim) ? k.birim : 'adet'),
        unit_price: String(k.birim_fiyat),
        kdv_rate: '20',
      }]
    })
    setItems(prev => {
      // Boş tek satır varsa kaldır
      const filtered = prev.filter(i => i.description.trim() || i.unit_price.trim())
      return filtered.length > 0 ? [...filtered, ...newItems] : newItems
    })
    setOnKayitEklendi(prev => { const n = new Set(prev); selectedOnKayitIds.forEach(id => n.add(id)); return n })
    setSelectedOnKayitIds(new Set())
  }

  function incrementQty(idx: number, delta: number) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const cur = parseFloat(item.quantity) || 0
      const next = Math.max(0.001, cur + delta)
      // Tam sayıysa tam sayı olarak göster
      return { ...item, quantity: Number.isInteger(next) ? String(next) : String(parseFloat(next.toFixed(3))) }
    }))
  }

  const parsedItems = items.map(i => ({
    quantity: parseFloat(i.quantity) || 0,
    unit_price: parseFloat(i.unit_price) || 0,
    kdv_rate: parseFloat(i.kdv_rate) || 0,
  }))
  const totals = calculateInvoiceTotals(parsedItems, parseFloat(form.stopaj_rate) || 0)

  // PDF'den fatura oku
  async function pdfToImageFile(f: File): Promise<File> {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf')
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    const bytes = await f.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    return new File([blob], f.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' })
  }

  // Yüklenen faturanın aynısı sistemde var mı? Sunucuda (firma-scope) tutar + VKN ile eşleştir.
  // Satışta müşteri VKN, alışta tedarikçi VKN kullanılır.
  async function checkDuplicateInvoice(data: any) {
    const isAlis = form.invoice_type === 'alis'
    const taxNo = String((isAlis ? data.supplier?.tax_no : data.customer?.tax_number) ?? '').replace(/\D/g, '')
    const parsedTotal = (data.items ?? []).reduce((sum: number, it: any) => {
      const q = Number(it.quantity) || 0
      const up = Number(it.unit_price) || 0
      const kdv = Number(it.kdv_rate) || 0
      return sum + q * up * (1 + kdv / 100)
    }, 0)
    if (parsedTotal <= 0) return

    try {
      const res = await fetch('/api/check-duplicate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_amount: parsedTotal, tax_no: taxNo, invoice_type: form.invoice_type }),
      })
      if (!res.ok) return
      const { duplicate } = await res.json()
      if (duplicate?.invoice_number) {
        setDuplicateInvoice({ invoice_number: duplicate.invoice_number, total_amount: Number(duplicate.total_amount) || 0 })
      }
    } catch {
      // Dedup başarısız olursa kaydı engelleme — sadece uyarı gösteremeyiz.
    }
  }

  async function handleParseFatura(f: File) {
    setParsing(true)
    setParseError('')
    setDuplicateInvoice(null)
    try {
      const uploadFile = f.type === 'application/pdf' ? await pdfToImageFile(f) : f
      const fd = new FormData()
      fd.append('file', uploadFile)

      // Yanıt ASLA koşulsuz res.json() ile okunmaz: eski build/kaldırılmış route
      // durumunda gelen HTML 404 sayfası "Unexpected token '<' … is not valid JSON"
      // hatasına yol açıyordu. readApiResponse önce status ve content-type bakar.
      const envelope = await requestApi<ParseFaturaData>('/api/parse-fatura', {
        method: 'POST',
        body: fd,
        timeoutMs: 120_000,
      })

      if (!envelope.ok) {
        setParseError(envelope.error.message)
        return
      }

      const data = envelope.data

      // Müşteri bilgilerini doldur
      setCustomerNotFound(false)
      if (data.customer?.full_name) {
        const parsedName = data.customer.full_name.toLowerCase().trim()
        const parsedTax  = (data.customer.tax_number ?? '').trim()
        // Önce vergi no ile, sonra tam ad, sonra kısmi içerme ile eşleştir
        const found = customers.find(c =>
          (parsedTax && c.tax_number === parsedTax) ||
          c.full_name.toLowerCase().trim() === parsedName ||
          c.full_name.toLowerCase().includes(parsedName) ||
          parsedName.includes(c.full_name.toLowerCase().trim())
        )
        if (found) {
          pickCustomer(found)
        } else {
          const parsedCustomer = data.customer
          setCustomerSearch(parsedCustomer.full_name ?? '')
          setShowDropdown(true)
          setCustomerNotFound(true)
          const pdfAddress = parsedCustomer.address ?? ''
          const pdfCity = parsedCustomer.city ?? inferCityFromAddress(pdfAddress) ?? ''
          setForm(p => ({
            ...p,
            customer_name: parsedCustomer.full_name ?? p.customer_name,
            tax_number: parsedCustomer.tax_number ?? p.tax_number,
            customer_phone: parsedCustomer.phone ?? p.customer_phone,
            customer_email: parsedCustomer.email ?? p.customer_email,
            customer_address: pdfAddress,
            customer_city: pdfCity,
          }))
          applyBranchSuggestion('pdf', pdfAddress, pdfCity)
        }
      }

      // Fatura tarihleri
      const parsedInvoice = data.invoice
      if (parsedInvoice?.invoice_date) {
        const invoiceDate = parsedInvoice.invoice_date
        setForm(p => ({ ...p, invoice_date: invoiceDate }))
      }
      if (parsedInvoice?.due_date) {
        const dueDate = parsedInvoice.due_date
        setForm(p => ({ ...p, due_date: dueDate }))
      }
      if (parsedInvoice?.kdv_rate != null) {
        const kdvRate = String(parsedInvoice.kdv_rate)
        setForm(p => ({ ...p, kdv_rate: kdvRate }))
      }
      if (parsedInvoice?.stopaj_rate) {
        const stopajRate = String(parsedInvoice.stopaj_rate)
        setForm(p => ({ ...p, stopaj_rate: stopajRate }))
      }

      // Tedarikçi (alış faturası için)
      const parsedSupplier = data.supplier
      if (parsedSupplier?.name) {
        const supplierName = parsedSupplier.name
        const supplierAddress = parsedSupplier.address ?? form.customer_address
        const supplierCity = parsedSupplier.city ?? inferCityFromAddress(supplierAddress) ?? form.customer_city
        setForm(p => ({
          ...p,
          supplier_name: supplierName,
          supplier_tax_no: parsedSupplier.tax_no ?? '',
          customer_address: supplierAddress,
          customer_city: supplierCity,
        }))
        applyBranchSuggestion('pdf', supplierAddress, supplierCity)
      }

      // Kalemler
      if (data.items && data.items.length > 0) {
        const parsedLines: LineItem[] = data.items.map(item => ({
          description: item.description ?? '',
          quantity: String(item.quantity ?? 1),
          unit: item.unit ?? 'adet',
          unit_price: String(item.unit_price ?? ''),
          kdv_rate: String(item.kdv_rate ?? 20),
        }))
        setItems(parsedLines)
      }

      // ── Aynı fatura sistemde zaten kayıtlı mı? (tarih + tutar + VKN ile) ──
      await checkDuplicateInvoice(data)

      setShowParseSection(false)
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Beklenmeyen hata')
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.invoice_type === 'satis' && !form.customer_id && !(form.customer_name || customerSearch).trim()) {
      setError('Satış faturası için müşteri seçimi zorunludur.'); return
    }
    if (!form.sube_id) { setError('Şube seçilmelidir.'); return }
    if (!branchLocked && availableSubeler.length > 0 && !availableSubeler.some(s => s.id === form.sube_id)) {
      setError('Bu şubeye kayıt oluşturma yetkiniz yok.'); return
    }
    if (!form.invoice_date) { setError('Fatura tarihi zorunludur.'); return }
    if (items.every(i => !i.description.trim())) { setError('En az bir kalem ekleyin.'); return }
    if (duplicateInvoice) {
      const onay = window.confirm(
        `Bu fatura sistemde zaten kayıtlı görünüyor (Fatura No: ${duplicateInvoice.invoice_number}, Tutar: ${formatCurrency(duplicateInvoice.total_amount)}).\n\nYine de kaydetmek istiyor musunuz?`
      )
      if (!onay) { setError('Kayıt iptal edildi: fatura sistemde zaten mevcut.'); return }
    }
    setLoading(true); setError('')

    try {
      const validItems = items
        .filter(i => i.description.trim() && parseFloat(i.quantity) > 0)
        .map((item, idx) => ({
          line_order: idx + 1,
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit,
          unit_price: parseFloat(item.unit_price) || 0,
          kdv_rate: parseFloat(item.kdv_rate) || 20,
        }))

      const year = new Date(form.invoice_date).getFullYear()

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice: {
            prefix: 'KE',
            year,
            invoice_type: form.invoice_type,
            customer_id: form.customer_id || null,
            musteri_unvan: form.customer_name || customerSearch || null,
            musteri_vergi_no: form.tax_number || null,
            musteri_telefon: form.customer_phone || null,
            musteri_email: form.customer_email || null,
            musteri_adres: form.customer_address || null,
            musteri_il: form.customer_city || null,
            musteri_ilce: form.customer_district || null,
            supplier_name: form.supplier_name || null,
            supplier_tax_no: form.supplier_tax_no || null,
            tedarikci_adres: form.customer_address || null,
            tedarikci_il: form.customer_city || null,
            tedarikci_ilce: form.customer_district || null,
            sube_id: form.sube_id,
            invoice_date: form.invoice_date,
            due_date: form.due_date || null,
            subtotal: totals.subtotal,
            kdv_rate: parseFloat(form.kdv_rate) || 20,
            kdv_amount: totals.kdv_amount,
            stopaj_rate: parseFloat(form.stopaj_rate) || 0,
            stopaj_amount: totals.stopaj_amount,
            total_amount: totals.total_amount,
            description: form.description || null,
            notes: form.notes || null,
          },
          items: validItems,
          brokers: brokerLines
            .filter(b => b.broker_id)
            .map(b => ({
              broker_id: b.broker_id,
              commission_rate: parseFloat(b.commission_rate) || 0,
              commission_amount: parseFloat(b.commission_amount) || 0,
            })),
        }),
      })

      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error(`Sunucu cevabı okunamadı (HTTP ${res.status})`)
      }

      if (!res.ok) throw new Error(data?.error ?? `Fatura kaydedilemedi (HTTP ${res.status})`)
      if (!data?.id) throw new Error('Fatura oluşturuldu ancak ID alınamadı. Faturalar listesini kontrol edin.')

      // Eklenen ön kayıtları faturalandı olarak işaretle
      if (onKayitEklendi.size > 0) {
        await supabase
          .from('on_kayitlar')
          .update({ durum: 'faturalanmadi', invoice_id: data.id, updated_at: new Date().toISOString() })
          .in('id', Array.from(onKayitEklendi))
      }

      router.push(`/cari-hesap/faturalar/${data.id}`)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/faturalar" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Faturalar</Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Yeni Fatura</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowParseSection(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
            showParseSection
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-gray-800 text-blue-600 border-blue-200 hover:bg-blue-50'
          }`}
        >
          <span>📄</span>
          PDF'den Oku
        </button>
      </div>

      {/* PDF Parse Bölümü */}
      {showParseSection && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-blue-800 mb-1">Fatura PDF / Görselden Otomatik Doldur</h3>
            <p className="text-xs text-blue-600">
              Fatura görselini yükleyin — AI müşteri, kalemler ve tutarları otomatik dolduracak. Elle düzenleyebilirsiniz.
            </p>
          </div>

          {parseLoading ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-700">Fatura analiz ediliyor...</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleParseFatura(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Dosya Seç ve Analiz Et
              </button>
              <button
                type="button"
                onClick={() => setShowParseSection(false)}
                className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-100"
              >
                İptal
              </button>
            </div>
          )}

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {parseError}
            </div>
          )}
        </div>
      )}

      {duplicateInvoice && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <span className="text-base leading-none">⚠️</span>
          <span>
            Bu fatura sistemde zaten kayıtlı görünüyor (Fatura No: <strong>{duplicateInvoice.invoice_number}</strong>,
            Tutar: <strong>{formatCurrency(duplicateInvoice.total_amount)}</strong>). Kaydetmeden önce kontrol edin;
            yine de devam ederseniz onay istenecek.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Genel Bilgiler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Fatura Bilgileri</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fatura Tipi</label>
              <select value={form.invoice_type}
                onChange={e => setForm(p => ({ ...p, invoice_type: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                <option value="satis">Satış Faturası</option>
                <option value="alis">Alış Faturası</option>
                <option value="iade_satis">İade (Satış)</option>
                <option value="iade_alis">İade (Alış)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fatura Tarihi <span className="text-red-500">*</span></label>
              <input type="date" value={form.invoice_date}
                onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vade Tarihi</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
              <input value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Yangın söndürücü bakım hizmeti..." />
            </div>
          </div>

          {/* Müşteri / Tedarikçi */}
          {(form.invoice_type === 'satis' || form.invoice_type === 'iade_satis') ? (
            <div className="relative">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Müşteri <span className="text-red-500">*</span>
              </label>
              {customerNotFound && !selectedCustomer && (
                <div className="mt-1 mb-1 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                  Müşteri sistemde bulunamadı. Lütfen aşağıdaki listeden seçin veya önce{' '}
                  <a href="/customers/new" target="_blank" className="underline font-medium">yeni müşteri ekleyin</a>.
                </div>
              )}
              {selectedCustomer ? (
                <div className="mt-1 flex items-center justify-between border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCustomer.full_name}</span>
                  <button type="button"
                    onClick={() => { setSelectedCustomer(null); setForm(p => ({ ...p, customer_id: '' })); setCustomerSearch(''); setCustomerNotFound(false) }}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">Değiştir</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <input
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowDropdown(true); setCustomerNotFound(false) }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setShowDropdown(false)}
                    placeholder="Müşteri adı veya vergi no..."
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] ${customerNotFound ? 'border-orange-400' : ''}`}
                  />
                  {showDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.slice(0, 15).map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          onMouseDown={e => {
                            e.preventDefault()
                            pickCustomer(c)
                          }}>
                          <span className="font-medium">{c.full_name}</span>
                          {c.tax_number && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{c.tax_number}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tedarikçi Adı</label>
                <input value={form.supplier_name}
                  onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  placeholder="Tedarikçi firma adı" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi No</label>
                <input value={form.supplier_tax_no}
                  onChange={e => setForm(p => ({ ...p, supplier_tax_no: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            </div>
          )}

          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Müşteri Bilgileri</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri Adı / Ünvan</label>
                <input
                  value={form.customer_name || customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value)
                    setForm(p => ({ ...p, customer_name: e.target.value, customer_id: '' }))
                    setSelectedCustomer(null)
                  }}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi / TC No</label>
                <input
                  value={form.tax_number}
                  onChange={e => setForm(p => ({ ...p, tax_number: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefon</label>
                <input
                  value={form.customer_phone}
                  onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">E-posta</label>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={e => setForm(p => ({ ...p, customer_email: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Adres</label>
                <textarea
                  value={form.customer_address}
                  onChange={e => {
                    const address = e.target.value
                    const city = inferCityFromAddress(address)
                    setForm(p => ({ ...p, customer_address: address, customer_city: city || p.customer_city }))
                    applyBranchSuggestion('manual', address, city)
                  }}
                  rows={2}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İl</label>
                <input
                  value={form.customer_city}
                  onChange={e => {
                    const city = e.target.value
                    setForm(p => ({ ...p, customer_city: city }))
                    applyBranchSuggestion('manual', form.customer_address, city)
                  }}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İlçe</label>
                <input
                  value={form.customer_district}
                  onChange={e => setForm(p => ({ ...p, customer_district: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Şube <span className="text-red-500">*</span></label>
                <select
                  value={form.sube_id}
                  disabled={branchLocked}
                  onChange={e => {
                    setForm(p => ({ ...p, sube_id: e.target.value }))
                    setBranchInfo('Şube manuel olarak değiştirildi.')
                  }}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">— Şube seçin</option>
                  {availableSubeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                </select>
                {branchInfo && <p className="mt-1 text-xs text-blue-700">{branchInfo}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Ön Kayıtlar — müşteri seçilince göster */}
        {selectedCustomer && form.invoice_type === 'satis' && onKayitlar.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-orange-200 bg-orange-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-orange-900">Faturalanmamış Ön Kayıtlar</h3>
                <p className="text-xs text-orange-700 mt-0.5">
                  {selectedCustomer.full_name} adlı müşterinin {onKayitlar.length} adet faturalanmamış kaydı var.
                  Seçtiklerinizi fatura kalemine ekleyebilirsiniz.
                </p>
              </div>
              {selectedOnKayitIds.size > 0 && (
                <button type="button" onClick={importOnKayitlar}
                  className="bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-800 whitespace-nowrap">
                  {selectedOnKayitIds.size} Kalemi Ekle
                </button>
              )}
            </div>
            <div className="divide-y divide-orange-100">
              {onKayitlar.map(k => {
                const isSelected = selectedOnKayitIds.has(k.id)
                const isAdded = onKayitEklendi.has(k.id)
                return (
                  <label key={k.id}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                      isAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-100'
                    }`}>
                    <input
                      type="checkbox"
                      disabled={isAdded}
                      checked={isSelected}
                      onChange={e => {
                        setSelectedOnKayitIds(prev => {
                          const n = new Set(prev)
                          if (e.target.checked) n.add(k.id)
                          else n.delete(k.id)
                          return n
                        })
                      }}
                      className="w-4 h-4 accent-orange-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{k.aciklama}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {k.kayit_tarihi} · {k.miktar} {k.birim}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-orange-800 whitespace-nowrap">
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(k.toplam_tutar)}
                    </div>
                    {isAdded && <span className="text-xs text-green-700 font-medium whitespace-nowrap">Eklendi ✓</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Kalemler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fatura Kalemleri</h3>
            <button type="button" onClick={() => setItems(p => [...p, emptyLine()])}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
              + Kalem Ekle
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-32">Miktar</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Birim</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Birim Fiyat</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">KDV %</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Satır Top.</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => {
                  const qty = parseFloat(item.quantity) || 0
                  const price = parseFloat(item.unit_price) || 0
                  const lineTotal = qty * price
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          placeholder="Hizmet / ürün açıklaması" />
                      </td>
                      <td className="px-3 py-2">
                        {/* +/- butonlarıyla miktar — browser native spinner'ı kullanmıyoruz */}
                        <div className="flex items-center border rounded overflow-hidden">
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); incrementQty(idx, -1) }}
                            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 text-sm font-bold select-none"
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            className="w-14 text-center py-1.5 text-sm focus:outline-none border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); incrementQty(idx, 1) }}
                            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 text-sm font-bold select-none"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          placeholder="0,00" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.kdv_rate} onChange={e => updateItem(idx, 'kdv_rate', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                          {KDV_RATES.map(r => <option key={r} value={r}>%{r}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-right text-gray-900 dark:text-gray-100">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-2 py-2">
                        {items.length > 1 && (
                          <button type="button" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Özet */}
          <div className="border-t bg-gray-50 dark:bg-gray-700 px-5 py-4">
            <div className="flex justify-end">
              <div className="w-72 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Ara Toplam (KDV Hariç)</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">KDV</span>
                  <span className="font-medium">{formatCurrency(totals.kdv_amount)}</span>
                </div>
                {totals.stopaj_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Stopaj ({form.stopaj_rate}%)</span>
                    <span className="font-medium text-red-600">-{formatCurrency(totals.stopaj_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t pt-1.5">
                  <span>Genel Toplam</span>
                  <span className="text-[#C8102E]">{formatCurrency(totals.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ek Ayarlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Ek Ayarlar</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Stopaj Oranı (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.stopaj_rate}
                onChange={e => setForm(p => ({ ...p, stopaj_rate: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
              <textarea value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Özel notlar..." />
            </div>
          </div>
        </div>

        {/* Aracı / Komisyon Bölümü */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aracılar</h3>
          </div>
          <div className="p-5 space-y-3">
            {brokerLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{line.broker_name}</div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Oran %</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={line.commission_rate}
                    onChange={e => updateBrokerLine(idx, 'commission_rate', e.target.value)}
                    className="w-20 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                    placeholder="0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Tutar ₺</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={line.commission_amount}
                    onChange={e => updateBrokerLine(idx, 'commission_amount', e.target.value)}
                    className="w-28 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                    placeholder="0,00" />
                </div>
                <button type="button" onClick={() => removeBrokerLine(idx)}
                  className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
              </div>
            ))}

            {/* Aracı ekle */}
            <div className="relative">
              <input
                value={brokerSearch}
                onChange={e => { setBrokerSearch(e.target.value); setShowBrokerDropdown(true) }}
                onFocus={() => setShowBrokerDropdown(true)}
                onBlur={() => setTimeout(() => setShowBrokerDropdown(false), 150)}
                placeholder="+ Aracı ekle..."
                className="w-full border border-dashed rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] text-gray-500 dark:text-gray-400"
              />
              {showBrokerDropdown && filteredBrokers.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredBrokers.slice(0, 15).map(b => (
                    <button key={b.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onMouseDown={e => { e.preventDefault(); addBroker(b) }}>
                      <span className="font-medium">{b.full_name}</span>
                      {b.company_name && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{b.company_name}</span>}
                    </button>
                  ))}
                </div>
              )}
              {showBrokerDropdown && filteredBrokers.length === 0 && brokerSearch && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                  Aracı bulunamadı.{' '}
                  <Link href="/araclar/new" className="text-[#C8102E] hover:underline" target="_blank">Yeni aracı ekle →</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : 'Faturayı Kaydet'}
          </button>
          <Link href="/cari-hesap/faturalar"
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
