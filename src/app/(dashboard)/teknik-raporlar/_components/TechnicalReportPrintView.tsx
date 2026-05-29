import { formatDateTR, personName } from '@/lib/technical-reports/report-utils'
import { getCompactInputRows } from '@/lib/technical-reports/technicalReportLabels'
import { REPORT_TYPE_LABELS, REPORT_TYPE_SUBTITLES, type TechnicalReportRow } from '@/lib/technical-reports/types'

function KV({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value || '-'}</dd>
    </div>
  )
}

function CompactRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
      {rows.map(row => (
        <div key={row.label} className="grid grid-cols-[150px_1fr] border-b border-gray-200 py-1 text-sm">
          <div className="font-medium text-gray-600">{row.label}</div>
          <div className="text-gray-900">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

export default function TechnicalReportPrintView({ report }: { report: TechnicalReportRow }) {
  const result = report.calculation_result ?? {}
  const input = report.input_data ?? {}
  const compactInputRows = getCompactInputRows(input, report.rapor_turu)

  return (
    <article className="mx-auto max-w-5xl bg-white p-5 text-gray-900 print:max-w-none print:p-0">
      <header className="border-b-2 border-[#C8102E] pb-3">
        <div className="text-base font-bold">KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SAN. TİC. LTD. ŞTİ.</div>
        <div className="mt-1 text-xs text-gray-600">Teknik Rapor</div>
        <h1 className="mt-3 text-xl font-bold">{REPORT_TYPE_LABELS[report.rapor_turu]}</h1>
        <p className="mt-1 text-sm text-gray-600">{REPORT_TYPE_SUBTITLES[report.rapor_turu]}</p>
        {report.baslik !== REPORT_TYPE_LABELS[report.rapor_turu] && <p className="mt-1 text-sm font-medium">{report.baslik}</p>}
      </header>

      <section className="mt-4 grid grid-cols-2 gap-3 border-b pb-4 md:grid-cols-4">
        <KV label="Rapor No" value={report.rapor_no} />
        <KV label="Rapor Tarihi" value={formatDateTR(report.rapor_tarihi)} />
        <KV label="Müşteri" value={report.customer_name_snapshot} />
        <KV label="Şube" value={report.subeler?.ad} />
        <KV label="Lokasyon" value={report.lokasyon} />
        <KV label="Hazırlayan" value={personName(report.personeller)} />
        <KV label="Durum" value={report.durum} />
        <KV label="Standart Profili" value={report.standart_profili} />
      </section>

      {compactInputRows.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Giriş Verileri</h2>
          <div className="rounded-lg border p-3">
            <CompactRows rows={compactInputRows} />
          </div>
        </section>
      )}

      {Array.isArray(result.bolum_sonuclari) && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Kat/Bölüm Bazlı Cihaz Önerileri</h2>
          <table className="w-full text-sm">
            <thead><tr><th>Bölüm</th><th>Kat</th><th>Alan</th><th>Dedektör Tipi</th><th>Adet</th></tr></thead>
            <tbody>
              {result.bolum_sonuclari.map((row: any, i: number) => (
                <tr key={i}><td>{row.bolum_adi || '-'}</td><td>{row.kat || '-'}</td><td>{row.alan_m2 || 0} m²</td><td>{row.onerilen_dedektor_tipi}</td><td>{row.dedektor_adedi}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {Array.isArray(result.oneriler) && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Eksik / Önerilen Sistemler</h2>
          <table className="w-full text-sm">
            <thead><tr><th>Öneri</th><th>Öncelik</th><th>Açıklama</th></tr></thead>
            <tbody>{result.oneriler.map((row: any, i: number) => <tr key={i}><td>{row.baslik}</td><td>{row.oncelik}</td><td>{row.aciklama}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      {result.degerlendirme && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Ölçüm ve Değerlendirme Sonucu</h2>
          <div className="rounded-lg border p-3 text-sm">
            <p><strong>Brüt Hacim:</strong> {result.brut_hacim} m³</p>
            <p><strong>Net Korunan Hacim:</strong> {result.net_korunan_hacim} m³</p>
            <p><strong>Sonuç:</strong> {result.degerlendirme}</p>
          </div>
        </section>
      )}

      <section className="mt-4">
        <h2 className="mb-2 text-sm font-bold">Teklife Aktarılabilir İhtiyaç Listesi</h2>
        <table className="w-full text-sm">
          <thead><tr><th>Ürün Adı</th><th>Kategori</th><th>Miktar</th><th>Birim</th><th>Açıklama</th></tr></thead>
          <tbody>
            {(report.material_list ?? []).map(item => (
              <tr key={item.id}><td>{item.urun_adi}</td><td>{item.kategori}</td><td>{item.miktar}</td><td>{item.birim}</td><td>{item.aciklama}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-2 text-xs">
        {result.uyari || 'Bu rapor teklif/keşif destek hesabıdır; nihai mühendislik/proje onayı yerine geçmez.'}
      </section>

      {report.notes && <section className="mt-4 text-sm"><h2 className="font-bold">Açıklama ve Notlar</h2><p>{report.notes}</p></section>}

      {report.rapor_turu === 'oda_sizdirmazlik_testi' && (
        <section className="mt-10 grid grid-cols-2 gap-12 text-sm">
          <div className="border-t pt-2">Test Personeli İmza</div>
          <div className="border-t pt-2">Müşteri Yetkilisi İmza</div>
        </section>
      )}
    </article>
  )
}
