import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import PrintActions from '@/app/(dashboard)/service-forms/[id]/PrintActions'

// ─── Türkçe para yazıya çevirme ────────────────────────────────
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
  if (sayi === 0) return 'Sıfır'
  const tam    = Math.floor(sayi)
  const kurus  = Math.round((sayi - tam) * 100)
  let sonuc    = ''
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

function fmtN(n: number, currency: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n)
  if (currency === 'USD') return `$ ${s}`
  if (currency === 'EUR') return `€ ${s}`
  return `${s} TL`
}

export default async function TeklifPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: teklif }, { data: kalemler }] = await Promise.all([
    supabase.from('teklifler').select('*, customers(full_name, phone, address)').eq('id', id).single(),
    supabase.from('teklif_kalemleri').select('*').eq('teklif_id', id).order('sira_no'),
  ])

  if (!teklif) notFound()

  const currency          = teklif.para_birimi as string
  const musteri           = teklif.customers as any
  const musteriAdi        = musteri?.full_name ?? teklif.musteri_adi
  const araToplam         = teklif.ara_toplam        ?? 0
  const kdvTutari         = teklif.kdv_tutari        ?? 0
  const genelToplam       = teklif.genel_toplam      ?? 0
  const genelIskontoTutar = teklif.genel_iskonto     ?? 0
  const genelIskontoTip   = teklif.genel_iskonto_tip ?? 'yuzde'
  const iskontoSonrasi    = araToplam - genelIskontoTutar
  const kdvDurumu         = teklif.kdv_durumu  as string
  const kdvOrani          = teklif.kdv_orani   as number

  const rows             = kalemler ?? []
  const varSatirIskonto  = rows.some((k: any) => Number(k.iskonto) > 0)

  const tutarYaziyla = currency === 'TL' ? sayiyiYaziyaCevir(genelToplam) : null
  const kurBilgisi   = currency !== 'TL' && teklif.doviz_kuru
    ? `(Kur: 1 ${currency} = ${Number(teklif.doviz_kuru).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ · TL Karşılığı: ${(genelToplam * teklif.doviz_kuru).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)`
    : null

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-700">
      <PrintActions backHref={`/fiyat-teklifleri/${id}`} />

      {/* Print container — A4 proportions */}
      <div
        className="bg-white dark:bg-gray-800 mx-auto my-6 shadow-lg print:shadow-none print:my-0"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '15mm',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '11px',
          color: '#1a1a1a',
          boxSizing: 'border-box',
          WebkitPrintColorAdjust: 'exact' as any,
          printColorAdjust: 'exact' as any,
        }}
      >
        {/* ── BAŞLIK BÖLÜMÜ ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '10px', borderBottom: '2px solid #C8102E' }}>
          {/* Sol: Şirket adı */}
          <div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#C8102E', letterSpacing: '1px', lineHeight: '1' }}>KÖKLÜ</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#333', marginTop: '2px', lineHeight: '1.4' }}>
              YANGIN SÖNDÜRME CİHAZLARI<br />
              SANAYİ VE TİCARET LTD. ŞTİ.
            </div>
          </div>

          {/* Orta: FİYAT TEKLİFİ başlığı */}
          <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#C8102E', letterSpacing: '2px', textTransform: 'uppercase' }}>
              FİYAT TEKLİFİ
            </div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#555', marginTop: '4px' }}>
              Teklif No: <span style={{ color: '#1a1a1a' }}>{teklif.teklif_no}</span>
            </div>
          </div>

          {/* Sağ: Adresler */}
          <div style={{ fontSize: '9px', color: '#444', textAlign: 'right', lineHeight: '1.55' }}>
            <div style={{ fontWeight: '700', marginBottom: '2px' }}>ŞUBE — İSTANBUL</div>
            <div>Kışla Cd. Seferağa San. Sit.</div>
            <div>No:181/B Topçular</div>
            <div>Tel: (0534) 311 49 05</div>
            <div style={{ fontWeight: '700', marginTop: '4px', marginBottom: '2px' }}>FABRİKA — ERZİNCAN</div>
            <div>Karaağaç Mah. 774. Sok. No:49</div>
            <div>Tel: (0446) 214 45 81</div>
          </div>
        </div>

        {/* ── TARİH + GEÇERLİLİK ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', marginBottom: '10px', fontSize: '10px', color: '#555' }}>
          <span>Tarih: <strong style={{ color: '#1a1a1a' }}>{toTrDate(teklif.tarih)}</strong></span>
          <span>Geçerlilik Bitiş: <strong style={{ color: '#1a1a1a' }}>{toTrDate(teklif.gecerlilik_bitis)}</strong></span>
          {teklif.sehir && <span>Şube: <strong style={{ color: '#1a1a1a' }}>{teklif.sehir}</strong></span>}
        </div>

        {/* ── MÜŞTERİ ── */}
        <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '10px 12px', marginBottom: '12px', backgroundColor: '#fafafa' }}>
          <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>SAYIN</div>
          <div style={{ fontSize: '15px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{musteriAdi}</div>
          {teklif.musteri_sehir && (
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#444', marginTop: '2px' }}>{teklif.musteri_sehir}</div>
          )}
          <div style={{ display: 'flex', gap: '16px', marginTop: '4px', fontSize: '9px', color: '#666' }}>
            {(musteri?.phone ?? teklif.musteri_telefon) && (
              <span>Tel: {musteri?.phone ?? teklif.musteri_telefon}</span>
            )}
            {teklif.musteri_email && <span>E-posta: {teklif.musteri_email}</span>}
          </div>
        </div>

        {/* ── AÇIKLAMA ── */}
        <div style={{ fontSize: '10px', color: '#555', marginBottom: '10px', fontStyle: 'italic' }}>
          Sayın yetkili, aşağıda belirtilen ürün ve hizmetlere ait fiyat teklifimizi bilgilerinize sunarız.
        </div>

        {/* ── KALEM TABLOSU ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: varSatirIskonto ? '46%' : '52%' }} />
            <col style={{ width: '15%' }} />
            {varSatirIskonto && <col style={{ width: '9%' }} />}
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#C8102E', color: '#ffffff', WebkitPrintColorAdjust: 'exact' as any, printColorAdjust: 'exact' as any }}>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>S.NO</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: '10px', fontWeight: '700', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>ADET</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '10px', fontWeight: '700', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>MALIN CİNSİ</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '10px', fontWeight: '700', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>B. FİYATI</th>
              {varSatirIskonto && <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '10px', fontWeight: '700', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>İSK.%</th>}
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '10px', fontWeight: '700', backgroundColor: '#C8102E', color: '#ffffff', border: 'none' }}>TOPLAM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k: any, idx: number) => (
              <tr key={k.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9f9f9' }}>
                <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '10px' }}>{k.sira_no}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '10px' }}>{k.miktar}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee', fontSize: '10px' }}>{k.aciklama}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px' }}>{fmtN(k.birim_fiyat, currency)}</td>
                {varSatirIskonto && (
                  <td style={{ padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', color: Number(k.iskonto) > 0 ? '#c00' : '#999' }}>
                    {Number(k.iskonto) > 0 ? `%${k.iskonto}` : '—'}
                  </td>
                )}
                <td style={{ padding: '5px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', fontWeight: '600' }}>{fmtN(k.toplam, currency)}</td>
              </tr>
            ))}
            {/* Minimum 5 satır için boş satırlar */}
            {Array.from({ length: Math.max(0, 5 - rows.length) }).map((_, i) => (
              <tr key={`e${i}`} style={{ backgroundColor: (rows.length + i) % 2 === 0 ? '#ffffff' : '#f9f9f9' }}>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }}>&nbsp;</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }} />
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }} />
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }} />
                {varSatirIskonto && <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }} />}
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #eee' }} />
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── ALT TOPLAMLAR ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <table style={{ borderCollapse: 'collapse', width: '240px', fontSize: '10px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 10px', color: '#555', borderBottom: '1px solid #eee' }}>KDV Hariç Toplam</td>
                <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee' }}>{fmtN(araToplam, currency)}</td>
              </tr>
              {genelIskontoTutar > 0 && (
                <tr>
                  <td style={{ padding: '4px 10px', color: '#c00', borderBottom: '1px solid #eee' }}>
                    Toplam İskonto {genelIskontoTip === 'yuzde' ? '' : '(TL)'}
                  </td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: '600', color: '#c00', borderBottom: '1px solid #eee' }}>
                    -{fmtN(genelIskontoTutar, currency)}
                  </td>
                </tr>
              )}
              {genelIskontoTutar > 0 && (
                <tr>
                  <td style={{ padding: '4px 10px', color: '#555', borderBottom: '1px solid #eee' }}>İskonto Sonrası</td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee' }}>{fmtN(iskontoSonrasi, currency)}</td>
                </tr>
              )}
              {kdvDurumu !== 'yok' && (
                <tr>
                  <td style={{ padding: '4px 10px', color: '#555', borderBottom: '1px solid #eee' }}>KDV (%{kdvOrani})</td>
                  <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid #eee' }}>{fmtN(kdvTutari, currency)}</td>
                </tr>
              )}
              <tr style={{ backgroundColor: '#f0f0f0', WebkitPrintColorAdjust: 'exact' as any, printColorAdjust: 'exact' as any }}>
                <td style={{ padding: '6px 10px', fontWeight: '800', fontSize: '12px', color: '#111827', backgroundColor: '#f0f0f0', border: 'none' }}>GENEL TOPLAM</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '800', fontSize: '13px', color: '#C8102E', backgroundColor: '#f0f0f0', border: 'none' }}>{fmtN(genelToplam, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── TUTAR YAZIYLA ── */}
        <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '6px 10px', marginBottom: '10px', fontSize: '10px', fontStyle: 'italic', color: '#333', backgroundColor: '#fafafa' }}>
          {tutarYaziyla && <span style={{ fontWeight: '600' }}>{tutarYaziyla}</span>}
          {kurBilgisi && <span style={{ marginLeft: '8px', color: '#666', fontStyle: 'normal', fontSize: '9px' }}>{kurBilgisi}</span>}
        </div>

        {/* ── NOTLAR ── */}
        {teklif.notlar && (
          <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '8px 10px', marginBottom: '10px', fontSize: '10px' }}>
            <div style={{ fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px', color: '#555' }}>Notlar</div>
            <div style={{ whiteSpace: 'pre-wrap', color: '#333' }}>{teklif.notlar}</div>
          </div>
        )}

        {/* ── TİCARİ ŞARTNAME ── */}
        {teklif.ticari_sartname_ekli && teklif.ticari_sartname_metni && (
          <div style={{ border: '1px solid #ddd', borderRadius: '3px', padding: '8px 10px', marginBottom: '10px', fontSize: '9.5px', breakBefore: 'auto' as any }}>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, lineHeight: '1.6', color: '#333' }}>
              {teklif.ticari_sartname_metni}
            </pre>
          </div>
        )}

        {/* ── İMZA ALANI ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '16px', marginTop: '10px' }}>
          {(['SATICI', 'ALICI'] as const).map(taraf => (
            <div key={taraf} style={{ border: '1px solid #ccc', borderRadius: '3px', padding: '10px 12px', minHeight: '70px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', marginBottom: '24px' }}>{taraf}</div>
              <div style={{ borderTop: '1px solid #aaa', paddingTop: '4px', fontSize: '9px', color: '#888' }}>İmza / Kaşe</div>
            </div>
          ))}
        </div>

        {/* ── ALT BİLGİ ── */}
        <div style={{ borderTop: '1px solid #ddd', paddingTop: '8px', textAlign: 'center', fontSize: '8.5px', color: '#777', lineHeight: '1.6' }}>
          <div style={{ fontWeight: '700', color: '#555' }}>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LİMİTED ŞİRKETİ · Ticaret Sicil No: 4213</div>
          <div>Merkez: Karaağaç Mah. 774. Sok. No:49 Erzincan · Tel: (0446) 214 45 81</div>
          <div>Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular - İstanbul · Tel: (0534) 311 49 05</div>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          th { background: transparent !important; }
        }
      `}</style>
    </div>
  )
}
