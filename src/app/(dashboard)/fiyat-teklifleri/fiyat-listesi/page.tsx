import { createServiceClient } from '@/lib/supabase/service'
import PrintActions from '@/app/(dashboard)/service-forms/[id]/PrintActions'

type Urun = {
  id: string
  kategori: 'cihaz' | 'dolum' | 'yedek_parca'
  ad: string
  kapasite: string | null
  tip: string | null
  kdv_dahil_fiyat: number
  kdv_haric_fiyat: number
  periyodik_bakim_fiyati: number | null
  dolum_fiyati: number | null
}

function fmt(n: number | null) {
  if (n == null) return '-'
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n) + ' ₺'
}

function toTrDate() {
  return new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function FiyatListesiPage() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('urunler')
    .select('id, kategori, ad, kapasite, tip, kdv_dahil_fiyat, kdv_haric_fiyat, periyodik_bakim_fiyati, dolum_fiyati')
    .eq('aktif', true)
    .order('kategori')
    .order('kdv_dahil_fiyat')

  const urunler = (data ?? []) as Urun[]
  const cihazlar     = urunler.filter(u => u.kategori === 'cihaz')
  const dolumlar     = urunler.filter(u => u.kategori === 'dolum')
  const yedekParcalar = urunler.filter(u => u.kategori === 'yedek_parca')

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-700">
      <PrintActions backHref="/fiyat-teklifleri" />

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
        }}
      >
        {/* ── BAŞLIK ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #C8102E' }}>
          <div>
            <div style={{ fontSize: '28px', fontWeight: '900', color: '#C8102E', letterSpacing: '1px', lineHeight: '1' }}>KÖKLÜ</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#333', marginTop: '2px', lineHeight: '1.4' }}>
              YANGIN SÖNDÜRME CİHAZLARI<br />SANAYİ VE TİCARET LTD. ŞTİ.
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#C8102E', letterSpacing: '2px' }}>FİYAT LİSTESİ</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>Tarih: {toTrDate()}</div>
            <div style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>Fiyatlara KDV dahildir. Değişiklik hakkı saklıdır.</div>
          </div>
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

        {/* ── CİHAZLAR ── */}
        {cihazlar.length > 0 && (
          <section style={{ marginBottom: '14px' }}>
            <div style={{ backgroundColor: '#C8102E', color: '#fff', padding: '5px 10px', fontWeight: '800', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '0' }}>
              YENİ YANGIN SÖNDÜRME CİHAZLARI
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '53%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '21%' }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>S.NO</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>ÜRÜN ADI</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>KDV DAHİL</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>KDV HARİÇ</th>
                </tr>
              </thead>
              <tbody>
                {cihazlar.map((u, i) => (
                  <tr key={u.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '10px', color: '#888' }}>{i + 1}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: '10px' }}>{u.ad}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', fontWeight: '600' }}>{fmt(u.kdv_dahil_fiyat)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', color: '#555' }}>{fmt(u.kdv_haric_fiyat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── DOLUMLAR ── */}
        {dolumlar.length > 0 && (
          <section style={{ marginBottom: '14px' }}>
            <div style={{ backgroundColor: '#1d4ed8', color: '#fff', padding: '5px 10px', fontWeight: '800', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '0' }}>
              PERİYODİK BAKIM & DOLUM HİZMETLERİ
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '45%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>S.NO</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>HİZMET</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>PERİYODİK BAKIM</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>DOLUM FİYATI</th>
                </tr>
              </thead>
              <tbody>
                {dolumlar.map((u, i) => (
                  <tr key={u.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '10px', color: '#888' }}>{i + 1}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: '10px' }}>{u.ad}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', fontWeight: '600' }}>{fmt(u.periyodik_bakim_fiyati)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', fontWeight: '600' }}>{fmt(u.dolum_fiyati)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ── YEDEK PARÇA ── */}
        {yedekParcalar.length > 0 && (
          <section style={{ marginBottom: '14px' }}>
            <div style={{ backgroundColor: '#b45309', color: '#fff', padding: '5px 10px', fontWeight: '800', fontSize: '11px', letterSpacing: '0.5px', marginBottom: '0' }}>
              YEDEK PARÇALAR
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: '75%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '5px 8px', textAlign: 'center', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>S.NO</th>
                  <th style={{ padding: '5px 8px', textAlign: 'left', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>PARÇA ADI</th>
                  <th style={{ padding: '5px 8px', textAlign: 'right', fontSize: '9px', fontWeight: '700', borderBottom: '1px solid #ddd', color: '#555' }}>FİYAT (KDV DAHİL)</th>
                </tr>
              </thead>
              <tbody>
                {yedekParcalar.map((u, i) => (
                  <tr key={u.id} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid #eee', fontSize: '10px', color: '#888' }}>{i + 1}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: '10px' }}>{u.ad}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid #eee', fontSize: '10px', fontWeight: '600' }}>{fmt(u.kdv_dahil_fiyat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Not */}
        <div style={{ fontSize: '9px', color: '#888', marginTop: '8px', fontStyle: 'italic', borderTop: '1px solid #eee', paddingTop: '6px' }}>
          * Fiyatlarımıza KDV dahildir. Nakliye dahil değildir. Fiyatlar döviz kuruna göre değişiklik gösterebilir.
          Teklif geçerlilik süresi için ilgili teklifinize bakınız.
        </div>

        {/* Alt bilgi */}
        <div style={{ borderTop: '1px solid #ddd', marginTop: '12px', paddingTop: '8px', textAlign: 'center', fontSize: '8.5px', color: '#777', lineHeight: '1.6' }}>
          <div style={{ fontWeight: '700', color: '#555' }}>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LİMİTED ŞİRKETİ · Ticaret Sicil No: 4213</div>
          <div>Merkez: Karaağaç Mah. 774. Sok. No:49 Erzincan · Tel: (0446) 214 45 81</div>
          <div>Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular - İstanbul · Tel: (0534) 311 49 05</div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { margin: 0; background: white; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
