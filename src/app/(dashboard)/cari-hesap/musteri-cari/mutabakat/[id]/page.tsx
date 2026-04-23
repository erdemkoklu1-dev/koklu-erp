import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import PrintActions from '@/app/(dashboard)/service-forms/[id]/PrintActions'

const BIRLER = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz']
const ONLAR  = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan']
const BINLER = ['', 'Bin', 'Milyon', 'Milyar']

function ucHaneYaz(n: number): string {
  if (n === 0) return ''
  let s = ''
  const yuz = Math.floor(n / 100)
  const on  = Math.floor((n % 100) / 10)
  const bir = n % 10
  if (yuz === 1) s += 'Yüz'
  else if (yuz > 1) s += BIRLER[yuz] + 'Yüz'
  s += ONLAR[on]
  s += BIRLER[bir]
  return s
}

function sayiyiYaziyaCevir(sayi: number): string {
  if (sayi === 0) return "Yalnız Sıfır TL'dir"
  const tam   = Math.floor(Math.abs(sayi))
  const kurus = Math.round((Math.abs(sayi) - tam) * 100)
  let sonuc   = ''
  const gruplar: number[] = []
  let kalan = tam
  while (kalan > 0) { gruplar.push(kalan % 1000); kalan = Math.floor(kalan / 1000) }
  if (gruplar.length === 0) gruplar.push(0)
  for (let i = gruplar.length - 1; i >= 0; i--) {
    const g = gruplar[i]
    if (g === 0) continue
    sonuc += (i === 1 && g === 1) ? 'Bin' : ucHaneYaz(g) + BINLER[i]
  }
  let result = 'Yalnız ' + sonuc + ' TL'
  if (kurus > 0) result += ` ${ucHaneYaz(kurus)} Kuruş`
  return result + "'dir"
}

function toTrDate(value: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n) + ' TL'
}

export default async function MutabakatPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: mutabakat } = await supabase
    .from('mutabakat_formlari')
    .select('*, customers(full_name, address, tax_number, phone)')
    .eq('id', id)
    .single()

  if (!mutabakat) notFound()

  const customer = mutabakat.customers as any
  const printDate = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <>
      {/* Print CSS: tek sayfa A4 */}
      <style>{`
        @page { size: A4 portrait; margin: 10mm 12mm; }
        @media print {
          .print-actions { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="print-actions">
        <PrintActions backHref="/cari-hesap/musteri-cari" />
      </div>

      {/* Belge gövdesi */}
      <div style={{
        fontFamily: 'Arial, sans-serif',
        maxWidth: '186mm',
        margin: '0 auto',
        padding: '8mm 0',
        fontSize: '10.5px',
        color: '#111',
        backgroundColor: '#fff',
        lineHeight: '1.4',
      }}>

        {/* Başlık */}
        <div style={{ borderBottom: '3px solid #C8102E', paddingBottom: '7px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#C8102E' }}>
              KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI
            </div>
            <div style={{ fontSize: '10px', color: '#555' }}>SANAYİ VE TİCARET LİMİTED ŞİRKETİ</div>
            <div style={{ fontSize: '9.5px', color: '#777', marginTop: '1px' }}>
              Karaağaç Mah. 774. Sok. No:49 Erzincan · Tel: (0446) 214 45 81 · Ticaret Sicil No: 4213
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '10px', color: '#555' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#111', marginBottom: '3px' }}>MUTABAKAT MEKTUBU</div>
            <div style={{ fontSize: '9.5px' }}>BAKİYE KONFIRMASYONU</div>
            <div style={{ marginTop: '3px', fontSize: '9.5px' }}>Tarih: {printDate}</div>
            <div style={{ fontSize: '9px', color: '#888' }}>Ref: MUT-{id.slice(0, 8).toUpperCase()}</div>
          </div>
        </div>

        {/* Muhatap */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '10.5px' }}>
            SAYIN {(customer?.full_name ?? '').toUpperCase()},
          </div>
          {customer?.address && (
            <div style={{ fontSize: '9.5px', color: '#555', marginTop: '2px' }}>{customer.address}</div>
          )}
          {customer?.tax_number && (
            <div style={{ fontSize: '9.5px', color: '#555' }}>VKN: {customer.tax_number}</div>
          )}
        </div>

        {/* Giriş metni */}
        <div style={{ marginBottom: '10px', textAlign: 'justify' }}>
          <strong>{toTrDate(mutabakat.mutabakat_tarihi)}</strong> tarihi itibarıyla aramızdaki ticari ilişkiye ait
          hesap mutabakatının yapılması amacıyla bilgilerinize sunulmaktadır.
        </div>

        {/* Bakiye kutusu */}
        <div style={{ border: '2px solid #C8102E', borderRadius: '5px', padding: '8px 12px', marginBottom: '10px', backgroundColor: '#fff9f9' }}>
          <div style={{ fontSize: '9.5px', color: '#777', marginBottom: '3px' }}>
            Kayıtlarımıza göre <strong>{toTrDate(mutabakat.mutabakat_tarihi)}</strong> tarihi itibarıyla
            tarafınızın firmamıza olan borcu:
          </div>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#C8102E', marginBottom: '2px' }}>
            {fmtCurrency(mutabakat.bizim_bakiye)}
          </div>
          <div style={{ fontSize: '9.5px', color: '#555', fontStyle: 'italic' }}>
            ({sayiyiYaziyaCevir(mutabakat.bizim_bakiye)})
          </div>
        </div>

        {/* Rica metni */}
        <div style={{ marginBottom: '10px', textAlign: 'justify' }}>
          Söz konusu bakiyeyi <strong>15 (on beş) gün</strong> içinde inceleyerek
          aşağıdaki seçeneklerden birini işaretleyip imzalı ve kaşeli olarak tarafımıza iletmenizi rica ederiz.
          {mutabakat.notlar && (
            <div style={{ marginTop: '6px', padding: '5px 8px', backgroundColor: '#f9fafb', borderLeft: '3px solid #e5e7eb', fontSize: '9.5px', color: '#555' }}>
              <strong>Not:</strong> {mutabakat.notlar}
            </div>
          )}
        </div>

        {/* Onay kutuları */}
        <div style={{ border: '1px solid #d1d5db', borderRadius: '5px', padding: '10px 12px', marginBottom: '14px', backgroundColor: '#f9fafb' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '14px', height: '14px', border: '1.5px solid #555', borderRadius: '2px', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <strong>Bakiyeniz tarafımızca doğru bulunmuştur.</strong>
              <div style={{ fontSize: '9.5px', color: '#777', marginTop: '1px' }}>
                {fmtCurrency(mutabakat.bizim_bakiye)} tutarındaki bakiyeyi kabul ediyoruz.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ width: '14px', height: '14px', border: '1.5px solid #555', borderRadius: '2px', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <strong>Bakiyeniz tarafımızca farklı tespit edilmiştir.</strong>
              <div style={{ fontSize: '9.5px', color: '#777', marginTop: '1px' }}>
                Kayıtlarımıza göre bakiye:{' '}
                <span style={{ borderBottom: '1px solid #555', display: 'inline-block', minWidth: '90px' }}>
                  {mutabakat.musteri_bakiyesi != null ? fmtCurrency(mutabakat.musteri_bakiyesi) : ''}
                </span>{' '}
                olup fark hakkında ayrıca bilgi verilecektir.
              </div>
            </div>
          </div>
        </div>

        {/* İmza alanı */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '10px' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
            <div style={{ fontSize: '9.5px', color: '#555' }}>SANAYİ VE TİCARET LİMİTED ŞİRKETİ</div>
            <div style={{ fontSize: '9.5px', color: '#555', marginBottom: '22px' }}>Ticaret Sicil No: 4213</div>
            <div style={{ borderTop: '1px solid #111', paddingTop: '3px', fontSize: '9.5px', color: '#555' }}>
              Yetkili İmza / Kaşe
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '2px' }}>
              {(customer?.full_name ?? '').toUpperCase()}
            </div>
            {customer?.tax_number && (
              <div style={{ fontSize: '9.5px', color: '#555' }}>VKN: {customer.tax_number}</div>
            )}
            <div style={{ fontSize: '9.5px', color: '#555', marginBottom: '22px' }}>Tarih: ___________</div>
            <div style={{ borderTop: '1px solid #111', paddingTop: '3px', fontSize: '9.5px', color: '#555' }}>
              Yetkili İmza / Kaşe
            </div>
          </div>
        </div>

        {/* Alt bilgi */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '6px', fontSize: '8.5px', color: '#aaa', textAlign: 'center' }}>
          Bu belge {printDate} tarihinde KÖKLÜ ERP sistemi tarafından oluşturulmuştur. · Ref: MUT-{id.slice(0, 8).toUpperCase()}
        </div>
      </div>
    </>
  )
}
