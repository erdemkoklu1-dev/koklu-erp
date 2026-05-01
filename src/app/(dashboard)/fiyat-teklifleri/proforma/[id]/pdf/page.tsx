import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import PrintActions from '@/app/(dashboard)/service-forms/[id]/PrintActions'

// ─── Şirket bilgileri (PDF'de sabit) ─────────────────────────────
const SIRKET = {
  unvan:         'KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
  adres:         'KARAAĞAÇ MAH.774.SOK.NO:49',
  ilce_il:       'ERZİNCAN MERKEZ / Erzincan',
  telefon:       '(0446) 214 45 81',
  email:         'kokluyanginsondurme@hotmail.com',
  vergi_dairesi: 'FEVZİPAŞA VERGİ DAİRESİ',
  vkn:           '5830028164',
}

// ─── Türkçe tutar yazıya çevirme ─────────────────────────────────
const BIRLER = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz']
const ONLAR  = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan']
const BINLER = ['', 'Bin', 'Milyon', 'Milyar']

function ucHaneYaz(n: number): string {
  if (n === 0) return ''
  const yuz = Math.floor(n / 100), on = Math.floor((n % 100) / 10), bir = n % 10
  let s = ''
  if (yuz === 1) s += 'Yüz'; else if (yuz > 1) s += BIRLER[yuz] + 'Yüz'
  return s + ONLAR[on] + BIRLER[bir]
}

function tutarYaziya(tutar: number): string {
  if (tutar === 0) return 'Sıfır TL'
  const tam   = Math.floor(tutar)
  const kurus = Math.round((tutar - tam) * 100)
  let sonuc   = ''
  const gruplar: number[] = []
  let kalan = tam
  while (kalan > 0) { gruplar.push(kalan % 1000); kalan = Math.floor(kalan / 1000) }
  if (!gruplar.length) gruplar.push(0)
  for (let i = gruplar.length - 1; i >= 0; i--) {
    const g = gruplar[i]; if (!g) continue
    sonuc += (i === 1 && g === 1) ? 'Bin' : ucHaneYaz(g) + BINLER[i]
  }
  let result = 'Yalnız ' + sonuc + ' TL'
  if (kurus > 0) result += ` ${ucHaneYaz(kurus)} Kuruş`
  return result + "'dir"
}

function toTrDate(value: string | null | undefined, sep = '.') {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const dd = String(d.getDate()).padStart(2, '0')
  const mm  = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}${sep}${mm}${sep}${yyyy}`
}

function fmtN(n: number, para: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n)
  if (para === 'USD') return `$ ${s}`
  if (para === 'EUR') return `€ ${s}`
  return `${s} TL`
}

export default async function ProformaPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: proforma }, { data: kalemler }] = await Promise.all([
    supabase.from('proforma_faturalar').select('*').eq('id', id).single(),
    supabase.from('proforma_fatura_kalemleri').select('*').eq('proforma_id', id).order('sira_no'),
  ])

  if (!proforma) notFound()

  const rows       = kalemler ?? []
  const para       = proforma.para_birimi as string
  const araToplam  = proforma.ara_toplam  ?? 0
  const iskonto    = proforma.toplam_iskonto ?? 0
  const kdvMatrahi = proforma.kdv_matrahi ?? 0
  const kdvTutari  = proforma.kdv_tutari  ?? 0
  const toplam     = proforma.toplam_tutar ?? 0

  const tutar_yaziyla = para === 'TRY' ? tutarYaziya(toplam) : null

  // KDV oranlarını grupla (birden fazla oran olabilir)
  const kdvGruplari = rows.reduce<Record<number, { matrahi: number; tutari: number }>>((acc, k: any) => {
    const oran = k.kdv_orani ?? 20
    if (!acc[oran]) acc[oran] = { matrahi: 0, tutari: 0 }
    acc[oran].matrahi += k.toplam_tutar ?? 0
    acc[oran].tutari  += k.kdv_tutari   ?? 0
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-700">
      <PrintActions backHref={`/fiyat-teklifleri/proforma/${id}`} />

      {/* A4 kağıt */}
      <div
        className="bg-white dark:bg-gray-800 mx-auto my-6 shadow-lg print:shadow-none print:my-0"
        style={{
          width: '210mm', minHeight: '297mm', padding: '12mm 15mm',
          fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px',
          color: '#1a1a1a', boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact' as any,
          printColorAdjust: 'exact' as any,
        }}
      >

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #C8102E' }}>

          {/* Sol: Şirket */}
          <div style={{ lineHeight: '1.6' }}>
            <div style={{ fontSize: '13px', fontWeight: '900', color: '#C8102E', letterSpacing: '0.5px' }}>KÖKLÜ</div>
            <div style={{ fontSize: '9px', fontWeight: '700', color: '#333' }}>
              YANGIN SÖNDÜRME CİHAZLARI<br />SANAYİ VE TİCARET LTD. ŞTİ.
            </div>
            <div style={{ fontSize: '8.5px', color: '#555', marginTop: '4px' }}>
              <div>{SIRKET.adres}</div>
              <div>{SIRKET.ilce_il}</div>
              <div>Tel: {SIRKET.telefon}</div>
              <div>E-Posta: {SIRKET.email}</div>
              <div>Vergi Dairesi: {SIRKET.vergi_dairesi} &nbsp;|&nbsp; VKN: {SIRKET.vkn}</div>
            </div>
          </div>

          {/* Sağ: Belge başlığı */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#C8102E', letterSpacing: '1px' }}>PROFORMA FATURA</div>
          </div>
        </div>

        {/* ── MÜŞTERİ + FATURA BİLGİ ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>

          {/* Müşteri kutusu */}
          <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '8px 10px', backgroundColor: '#fafafa' }}>
            <div style={{ fontSize: '8px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>SAYIN</div>
            <div style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}>{proforma.musteri_unvan}</div>
            {proforma.musteri_adres && (
              <div style={{ fontSize: '8.5px', color: '#444', marginTop: '3px', whiteSpace: 'pre-line' }}>{proforma.musteri_adres}</div>
            )}
            {proforma.musteri_vergi_dairesi && (
              <div style={{ fontSize: '8.5px', color: '#555', marginTop: '2px' }}>Vergi Dairesi: {proforma.musteri_vergi_dairesi}</div>
            )}
            {proforma.musteri_vkn && (
              <div style={{ fontSize: '8.5px', color: '#555' }}>VKN: {proforma.musteri_vkn}</div>
            )}
            {proforma.musteri_telefon && (
              <div style={{ fontSize: '8.5px', color: '#555' }}>Tel: {proforma.musteri_telefon}</div>
            )}
            {proforma.musteri_email && (
              <div style={{ fontSize: '8.5px', color: '#555' }}>{proforma.musteri_email}</div>
            )}
          </div>

          {/* Fatura bilgi kutusu */}
          <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '8px 10px', backgroundColor: '#fafafa' }}>
            <table style={{ width: '100%', fontSize: '9px' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#888', paddingBottom: '4px', width: '50%' }}>Proforma No:</td>
                  <td style={{ fontWeight: '700', color: '#C8102E', paddingBottom: '4px' }}>{proforma.proforma_no}</td>
                </tr>
                <tr>
                  <td style={{ color: '#888', paddingBottom: '4px' }}>Tarih:</td>
                  <td style={{ fontWeight: '600', paddingBottom: '4px' }}>{toTrDate(proforma.tarih, '-')}</td>
                </tr>
                {proforma.vade_tarihi && (
                  <tr>
                    <td style={{ color: '#888', paddingBottom: '4px' }}>Vade Tarihi:</td>
                    <td style={{ fontWeight: '600', paddingBottom: '4px' }}>{toTrDate(proforma.vade_tarihi, '-')}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ color: '#888' }}>Para Birimi:</td>
                  <td style={{ fontWeight: '600' }}>{proforma.para_birimi}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── KALEM TABLOSU ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px', fontSize: '9px' }}>
          <thead>
            <tr style={{ backgroundColor: '#C8102E', color: '#ffffff', WebkitPrintColorAdjust: 'exact' as any, printColorAdjust: 'exact' as any }}>
              <th style={{ padding: '5px 6px', textAlign: 'center', width: '4%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>S.No</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', width: '28%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>Mal / Hizmet</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', width: '16%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>Açıklama</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', width: '6%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>Miktar</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', width: '6%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>Birim</th>
              <th style={{ padding: '5px 6px', textAlign: 'right', width: '10%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>Birim Fiyat</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', width: '6%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>İsk.%</th>
              <th style={{ padding: '5px 6px', textAlign: 'right', width: '8%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>İsk.Tutarı</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', width: '6%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>KDV%</th>
              <th style={{ padding: '5px 6px', textAlign: 'right', width: '8%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>KDV Tutarı</th>
              <th style={{ padding: '5px 6px', textAlign: 'right', width: '12%', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>Mal Hizmet Tutarı</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k: any, idx: number) => (
              <tr key={k.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9f9f9' }}>
                <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{k.sira_no}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee', fontWeight: '600' }}>{k.mal_hizmet}</td>
                <td style={{ padding: '4px 6px', borderBottom: '1px solid #eee', color: '#555' }}>{k.aciklama || ''}</td>
                <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{k.miktar}</td>
                <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #eee' }}>{k.birim}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                  {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(k.birim_fiyat)}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                  {k.iskonto_orani > 0 ? `%${k.iskonto_orani}` : '-'}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #eee', color: k.iskonto_tutari > 0 ? '#c00' : '#999' }}>
                  {k.iskonto_tutari > 0 ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(k.iskonto_tutari) : '-'}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #eee' }}>%{k.kdv_orani}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                  {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(k.kdv_tutari)}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #eee', fontWeight: '600' }}>
                  {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(k.toplam_tutar)}
                </td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 5 - rows.length) }).map((_, i) => (
              <tr key={`e${i}`} style={{ backgroundColor: (rows.length + i) % 2 === 0 ? '#ffffff' : '#f9f9f9' }}>
                {Array.from({ length: 11 }).map((_, j) => (
                  <td key={j} style={{ padding: '4px 6px', borderBottom: '1px solid #eee' }}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── ALT TOPLAMLAR ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <table style={{ borderCollapse: 'collapse', width: '260px', fontSize: '9px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '3px 10px', color: '#555', borderBottom: '1px solid #eee' }}>Mal Hizmet Toplam Tutarı</td>
                <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee' }}>{fmtN(araToplam, para)}</td>
              </tr>
              <tr>
                <td style={{ padding: '3px 10px', color: '#555', borderBottom: '1px solid #eee' }}>Toplam İskonto</td>
                <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee', color: iskonto > 0 ? '#c00' : '#555' }}>
                  {fmtN(iskonto, para)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '3px 10px', color: '#555', borderBottom: '1px solid #eee' }}>KDV Matrahı</td>
                <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee' }}>{fmtN(kdvMatrahi, para)}</td>
              </tr>
              {Object.entries(kdvGruplari).map(([oran, { tutari }]) => (
                <tr key={oran}>
                  <td style={{ padding: '3px 10px', color: '#555', borderBottom: '1px solid #eee' }}>Hesaplanan KDV (%{oran})</td>
                  <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee' }}>{fmtN(tutari, para)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f0f0f0', WebkitPrintColorAdjust: 'exact' as any, printColorAdjust: 'exact' as any }}>
                <td style={{ padding: '5px 10px', fontWeight: '800', fontSize: '10px', color: '#111827', backgroundColor: '#f0f0f0', border: 'none' }}>Vergiler Dahil Toplam Tutar</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: '800', fontSize: '11px', color: '#C8102E', backgroundColor: '#f0f0f0', border: 'none' }}>{fmtN(toplam, para)}</td>
              </tr>
              <tr style={{ backgroundColor: '#f0f0f0', WebkitPrintColorAdjust: 'exact' as any, printColorAdjust: 'exact' as any }}>
                <td style={{ padding: '3px 10px 5px', fontWeight: '800', color: '#111827', backgroundColor: '#f0f0f0', border: 'none' }}>Ödenecek Tutar</td>
                <td style={{ padding: '3px 10px 5px', textAlign: 'right', fontWeight: '800', fontSize: '11px', color: '#C8102E', backgroundColor: '#f0f0f0', border: 'none' }}>{fmtN(toplam, para)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── TUTAR YAZIYLA ── */}
        {tutar_yaziyla && (
          <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '5px 10px', marginBottom: '8px', fontSize: '9px', fontStyle: 'italic', backgroundColor: '#fafafa' }}>
            <span style={{ fontWeight: '600' }}>{tutar_yaziyla}</span>
          </div>
        )}

        {/* ── NOTLAR ── */}
        {(proforma.notlar || proforma.ozel_sartlar) && (
          <div style={{ display: 'grid', gridTemplateColumns: proforma.notlar && proforma.ozel_sartlar ? '1fr 1fr' : '1fr', gap: '8px', marginBottom: '8px' }}>
            {proforma.notlar && (
              <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '6px 8px', fontSize: '8.5px' }}>
                <div style={{ fontWeight: '700', marginBottom: '2px', color: '#555', textTransform: 'uppercase', fontSize: '7.5px' }}>Not</div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#333' }}>{proforma.notlar}</div>
              </div>
            )}
            {proforma.ozel_sartlar && (
              <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '6px 8px', fontSize: '8.5px' }}>
                <div style={{ fontWeight: '700', marginBottom: '2px', color: '#555', textTransform: 'uppercase', fontSize: '7.5px' }}>Özel Şartlar</div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#333' }}>{proforma.ozel_sartlar}</div>
              </div>
            )}
          </div>
        )}

        {/* ── ÖDEME BİLGİLERİ ── */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '8px', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Ödeme Bilgileri
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px', border: '1px solid #ddd' }}>
            <thead>
              <tr style={{ backgroundColor: '#f0f0f0' }}>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: '700', color: '#555', width: '50%' }}>Hesap Numarası (IBAN)</th>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: '700', color: '#555', width: '15%' }}>Para Birimi</th>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: '700', color: '#555' }}>Banka / Şube</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{proforma.iban}</td>
                <td style={{ padding: '4px 8px' }}>{proforma.para_birimi}</td>
                <td style={{ padding: '4px 8px' }}>{proforma.banka_adi}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── İMZA ALANI ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '12px' }}>
          {(['SATICI', 'ALICI'] as const).map(taraf => (
            <div key={taraf} style={{ border: '1px solid #ccc', borderRadius: '3px', padding: '8px 10px', minHeight: '60px' }}>
              <div style={{ fontSize: '9px', fontWeight: '700', marginBottom: '20px' }}>{taraf}</div>
              <div style={{ borderTop: '1px solid #aaa', paddingTop: '3px', fontSize: '8px', color: '#888' }}>İmza / Kaşe</div>
            </div>
          ))}
        </div>

        {/* ── FOOTER ── */}
        <div style={{ borderTop: '1px solid #ddd', paddingTop: '6px', textAlign: 'center', fontSize: '8px', color: '#888', lineHeight: '1.6' }}>
          <div style={{ fontWeight: '700', color: '#C8102E', marginBottom: '2px' }}>
            Bu belge proforma fatura niteliğinde olup, resmi fatura yerine geçmez.
          </div>
          <div style={{ fontWeight: '700', color: '#555' }}>{SIRKET.unvan} · Ticaret Sicil No: 4213</div>
          <div>Merkez: {SIRKET.adres} {SIRKET.ilce_il} · Tel: {SIRKET.telefon}</div>
        </div>

      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body   { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          th { background: transparent !important; }
        }
      `}</style>
    </div>
  )
}
