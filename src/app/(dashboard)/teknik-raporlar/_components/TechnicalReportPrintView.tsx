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

function CompactReportInfoGrid({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid overflow-hidden rounded-md border text-[10px] md:grid-cols-4">
      {rows.map(row => (
        <div key={row.label} className="grid grid-cols-[72px_1fr] gap-1 border-b border-r border-gray-200 px-1.5 py-1">
          <div className="font-semibold text-gray-600">{shortLabel(row.label)}</div>
          <div className="font-medium text-gray-900">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

function shortLabel(label: string) {
  const map: Record<string, string> = {
    'Toplam Alan': 'Alan',
    'Kat Sayısı': 'Kat',
    'Oda Sayısı': 'Oda',
    'Çalışan Sayısı': 'Çalışan',
    'Ziyaretçi Yoğunluğu': 'Ziyaretçi',
    'Elektrik Pano Odası': 'Pano Odası',
    'Server Odası': 'Server',
    'Üretim Alanı': 'Üretim',
  }
  return map[label] ?? label
}

function normalizeFoamName(value: string) {
  return value.replace(/6\s*(Lt|LT|lt|Kg|KG|kg)/g, '12 Kg')
}

function normalizedMaterial(item: TechnicalReportRow['material_list'][number]) {
  const urunAdi = normalizeFoamName(item.urun_adi)
  const aciklama = normalizeFoamName(item.aciklama ?? '')
  return { ...item, urun_adi: urunAdi, aciklama }
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
        <section className="mt-3">
          <h2 className="mb-1 text-sm font-bold">Giriş Verileri</h2>
          <CompactReportInfoGrid rows={compactInputRows} />
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
        <section className="mt-3">
          <h2 className="mb-1 text-sm font-bold">Eksik / Önerilen Sistemler</h2>
          <table className="w-full text-xs">
            <thead><tr><th>Öneri</th><th>Öncelik</th><th>Açıklama</th></tr></thead>
            <tbody>{result.oneriler.map((row: any, i: number) => <tr key={i}><td>{normalizeFoamName(row.baslik ?? '')}</td><td>{row.oncelik}</td><td>{normalizeFoamName(row.aciklama ?? '')}</td></tr>)}</tbody>
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

      {report.rapor_turu === 'yangin_dolabi_hidrant_pompa' && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Sulu Sistem Ön Hesap Sonuçları</h2>
          <table className="w-full text-xs">
            <tbody>
              <tr><th>Yangın Dolabı</th><td>{result.yangin_dolabi_adedi ?? 0} adet</td><th>Hidrant</th><td>{result.hidrant_adedi ?? 0} adet</td></tr>
              <tr><th>Tasarım Debisi</th><td>{result.tasarim_debisi_l_dak ?? 0} l/dak ({result.tasarim_debisi_m3_h ?? 0} m³/h)</td><th>Boru Çapı</th><td>DN{result.boru_cap_mm ?? '-'}</td></tr>
              <tr><th>Boru Uzunluğu</th><td>{result.boru_uzunlugu_m ?? 0} m</td><th>Sürtünme Kaybı</th><td>{result.surtunme_kaybi_mSS ?? 0} mSS</td></tr>
              <tr><th>Basınç İhtiyacı</th><td>{result.basinc_ihtiyaci_bar ?? 0} bar</td><th>Motor Gücü</th><td>{result.motor_gucu_kw ?? 0} kW</td></tr>
              <tr><th>Pompa Tipi</th><td colSpan={3}>{result.pompa_tipi ?? '-'}</td></tr>
              <tr><th>Jokey Pompa</th><td>{result.jokey_pompa_debisi_l_dak ?? 0} l/dak</td><th>Yangın Suyu Deposu</th><td>{result.yangin_suyu_deposu_m3 ?? 0} m³</td></tr>
            </tbody>
          </table>
          {Array.isArray(result.uyarilar) && result.uyarilar.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {result.uyarilar.map((warning: string) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
        </section>
      )}

      {report.rapor_turu === 'sulu_sistem_hidrolik_hesap' && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Sulu Sistem Hidrolik Hesap Sonuçları</h2>
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
            <KV label="Tasarım Debisi" value={`${result.designFlowLpm ?? 0} l/dak / ${result.designFlowM3h ?? 0} m³/h`} />
            <KV label="Pompa Basıncı" value={`${result.pump?.requiredPressureBar ?? 0} bar / ${result.pump?.requiredPressureMSS ?? 0} mSS`} />
            <KV label="Pompa Gücü" value={`${result.pump?.selectedMotorPowerKw ?? 0} kW`} />
            <KV label="Yangın Suyu" value={`${result.waterTank?.requiredVolumeWithSafetyM3 ?? 0} m³ / ${result.waterTank?.requiredVolumeWithSafetyTon ?? 0} ton`} />
            <KV label="Ana Boru" value={result.pipeSummary?.segments?.[0]?.selectedDN ?? '-'} />
            <KV label="Toplam Metraj" value={`${result.pipeSummary?.totalPipeLengthM ?? 0} m`} />
          </div>
          {result.sprinkler && (
            <section className="mt-3">
              <h3 className="mb-1 text-xs font-bold">Sprinkler Hesabı</h3>
              <table className="w-full text-[10px]">
                <tbody>
                  <tr><th>Tasarım Alanı</th><td>{result.sprinkler.designAreaM2 ?? 0} m²</td><th>Koruma Alanı</th><td>{result.sprinkler.sprinklerCoverageAreaM2 ?? 0} m²/adet</td></tr>
                  <tr><th>Sprinkler Adedi</th><td>{result.sprinkler.selectedSprinklerCount ?? 0} adet</td><th>K Faktörü</th><td>K{result.sprinkler.kFactorMetric ?? 0}</td></tr>
                  <tr><th>Sprinkler Debisi</th><td>{result.sprinkler.requiredFlowLpm ?? 0} l/dak</td><th>Akma Basıncı</th><td>{result.sprinkler.selectedPressureBar ?? 0} bar</td></tr>
                  <tr><th>Sprinkler Başına Debi</th><td>{result.sprinkler.flowPerSprinklerLpm ?? 0} l/dak</td><th>Müdahale Süresi</th><td>{result.sprinkler.interventionDurationMin ?? 0} dk</td></tr>
                </tbody>
              </table>
            </section>
          )}
          {result.waterTank && (
            <section className="mt-3">
              <h3 className="mb-1 text-xs font-bold">Yangın Su Deposu m³ / Ton Hesabı</h3>
              <table className="w-full text-[10px]">
                <tbody>
                  <tr><th>Depo Süresi</th><td>{result.waterTank.durationMin ?? 0} dk</td><th>Tasarım Debisi</th><td>{result.waterTank.designFlowLpm ?? 0} l/dak</td></tr>
                  <tr><th>Net Hacim</th><td>{result.waterTank.requiredVolumeM3 ?? 0} m³</td><th>Net Ton</th><td>{result.waterTank.requiredVolumeTon ?? 0} ton</td></tr>
                  <tr><th>Emniyetli Hacim</th><td>{result.waterTank.requiredVolumeWithSafetyM3 ?? 0} m³</td><th>Emniyetli Ton</th><td>{result.waterTank.requiredVolumeWithSafetyTon ?? 0} ton</td></tr>
                  <tr><th>Mevcut Hacim</th><td>{result.waterTank.existingVolumeM3 ?? 0} m³ / {result.waterTank.existingVolumeTon ?? 0} ton</td><th>Eksik Hacim</th><td>{result.waterTank.missingVolumeM3 ?? 0} m³ / {result.waterTank.missingVolumeTon ?? 0} ton</td></tr>
                </tbody>
              </table>
            </section>
          )}
          {result.sketchPlan?.svg && (
            <div className="mt-3 rounded-md border p-2">
              <div dangerouslySetInnerHTML={{ __html: result.sketchPlan.svg }} />
              <p className="mt-1 text-xs text-gray-600">{result.sketchPlan.summary}</p>
            </div>
          )}
          {Array.isArray(result.pipeSummary?.segments) && result.pipeSummary.segments.length > 0 && (
            <>
              <h3 className="mt-3 text-xs font-bold">Hidrolik Hat Bilgileri</h3>
              <table className="w-full text-[10px]">
                <thead><tr><th>No</th><th>Hat</th><th>Debi</th><th>DN</th><th>İç Çap</th><th>Hız</th><th>Uzunluk</th><th>Eşdeğer</th></tr></thead>
                <tbody>{result.pipeSummary.segments.map((s: any, i: number) => <tr key={s.id}><td>{i + 1}</td><td>{s.label}</td><td>{s.flowLpm}</td><td>{s.selectedDN}</td><td>{s.innerDiameterMm}</td><td>{s.velocityMs}</td><td>{s.lengthM}</td><td>{s.totalEquivalentLengthM}</td></tr>)}</tbody>
              </table>
              <h3 className="mt-3 text-xs font-bold">Basınç Kayıpları</h3>
              <table className="w-full text-[10px]">
                <thead><tr><th>No</th><th>Sürtünme bar/m</th><th>Boru Kaybı</th><th>Yükseklik</th><th>Önceki</th><th>Son</th></tr></thead>
                <tbody>{result.pipeSummary.segments.map((s: any, i: number) => <tr key={s.id}><td>{i + 1}</td><td>{s.frictionLossBarPerM}</td><td>{s.pipeLossBar}</td><td>{s.heightLossBar}</td><td>{s.previousPressureLossBar}</td><td>{s.finalPressureLossBar}</td></tr>)}</tbody>
              </table>
            </>
          )}
          <section className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 p-2 text-xs">
            {(Array.isArray(result.warnings) && result.warnings[0]) || 'Bu hesap ön keşif, teklif ve yaklaşık teknik değerlendirme amacıyla hazırlanmıştır.'}
          </section>
        </section>
      )}

      {report.rapor_turu === 'havalandirma_test_raporu' && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-bold">Havalandırma Test Sonuçları</h2>
          <div className="mb-3 rounded-md border-l-4 border-[#C8102E] bg-red-50 p-2 text-xs">
            <strong>Sonuç:</strong> {result.degerlendirme ?? '-'} · {result.otomatik_degerlendirme ?? ''}
          </div>
          <table className="w-full text-xs">
            <tbody>
              <tr><th>Giriş Kesiti</th><td>{result.giris_kesit_aciklama ?? '-'}</td><th>Giriş Alanı</th><td>{result.giris_kesit_alani_m2 ?? 0} m²</td></tr>
              <tr><th>Çıkış Kesiti</th><td>{result.cikis_kesit_aciklama ?? '-'}</td><th>Çıkış Alanı</th><td>{result.cikis_kesit_alani_m2 ?? 0} m²</td></tr>
              <tr><th>Giriş Ortalama Hız</th><td>{result.giris_ortalama_hiz_ms ?? 0} m/s</td><th>Çıkış Ortalama Hız</th><td>{result.cikis_ortalama_hiz_ms ?? 0} m/s</td></tr>
              <tr><th>Min / Max Hız</th><td>{result.minimum_hiz_ms ?? 0} / {result.maksimum_hiz_ms ?? 0} m/s</td><th>Kayıp Oranı</th><td>{result.debi_artisi_var ? 'Debi artışı / ölçüm tutarsızlığı' : `%${result.kayip_orani_yuzde ?? 0}`}</td></tr>
              <tr><th>Giriş Debisi</th><td>{result.giris_debi_m3_s ?? 0} m³/s · {result.giris_debi_m3_h ?? 0} m³/h</td><th>Çıkış Debisi</th><td>{result.cikis_debi_m3_s ?? 0} m³/s · {result.cikis_debi_m3_h ?? 0} m³/h</td></tr>
              <tr><th>Minimum Hız Eşiği</th><td>{result.minimum_hiz_esigi_ms ?? 0} m/s</td><th>Maksimum Kayıp Eşiği</th><td>%{result.maksimum_kayip_esigi_yuzde ?? 0}</td></tr>
            </tbody>
          </table>
          {result.debi_artisi_var && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
              Çıkış debisi giriş debisinden yüksek hesaplanmıştır. Bu durum fan konumu, ilave hava girişi, kanal kaçakları, ölçüm noktası farklılığı veya kesit bilgisi nedeniyle oluşabilir. Ölçüm değerleri saha şartları dikkate alınarak değerlendirilmelidir.
            </div>
          )}
          {input.giris_olcumleri && (
            <section className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <MeasurementPrintTable title="Giriş 5 Nokta Ölçümü" values={input.giris_olcumleri} />
              <MeasurementPrintTable title="Çıkış 5 Nokta Ölçümü" values={input.cikis_olcumleri} muted={result.sanal_cikis_kullanildi} />
            </section>
          )}
          {result.sanal_cikis_kullanildi && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
              Çıkış ölçümü yapılamadığı için çıkış debisi ve hız değerleri tahmini sanal çıkış hesabıyla üretilmiştir.
            </div>
          )}
          {Array.isArray(result.oneriler) && result.oneriler.length > 0 && (
            <section className="mt-3">
              <h3 className="mb-1 text-xs font-bold">Otomatik Öneriler</h3>
              <ul className="list-disc pl-5 text-xs">
                {result.oneriler.map((item: string) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}
          {result.manuel_degerlendirme && (
            <section className="mt-3 rounded-md border p-2 text-xs">
              <strong>Manuel Değerlendirme:</strong> {result.manuel_degerlendirme}
            </section>
          )}
          {result.debi_artisi_aciklama && (
            <section className="mt-3 rounded-md border p-2 text-xs">
              <strong>Debi Artışı Açıklaması:</strong> {result.debi_artisi_aciklama}
            </section>
          )}
        </section>
      )}

      <section className="mt-3">
        <h2 className="mb-1 text-sm font-bold">Teklife Aktarılabilir İhtiyaç Listesi</h2>
        <table className="w-full text-xs">
          <thead><tr><th>Ürün Adı</th><th>Kategori</th><th>Miktar</th><th>Birim</th><th>Açıklama</th></tr></thead>
          <tbody>
            {(report.material_list ?? []).map(item => {
              const normalized = normalizedMaterial(item)
              return <tr key={item.id}><td>{normalized.urun_adi}</td><td>{normalized.kategori}</td><td>{normalized.miktar}</td><td>{normalized.birim}</td><td>{normalized.aciklama}</td></tr>
            })}
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-2 text-xs">
        {result.uyari || 'Bu rapor teklif/keşif destek hesabıdır; nihai mühendislik/proje onayı yerine geçmez.'}
      </section>

      {report.notes && <section className="mt-4 text-sm"><h2 className="font-bold">Açıklama ve Notlar</h2><p>{report.notes}</p></section>}

      {(report.rapor_turu === 'oda_sizdirmazlik_testi' || report.rapor_turu === 'havalandirma_test_raporu') && (
        <section className="mt-10 grid grid-cols-2 gap-12 text-sm">
          <div className="border-t pt-2">Test Personeli İmza</div>
          <div className="border-t pt-2">Müşteri Yetkilisi İmza</div>
        </section>
      )}
    </article>
  )
}

function MeasurementPrintTable({ title, values, muted = false }: { title: string; values: any; muted?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${muted ? 'text-gray-500' : ''}`}>
      <h3 className="mb-1 text-xs font-bold">{title}</h3>
      <table className="w-full text-[10px]">
        <tbody>
          <tr><th>Üst</th><td>{values?.ust ?? '-'}</td><th>Alt</th><td>{values?.alt ?? '-'}</td></tr>
          <tr><th>Sağ</th><td>{values?.sag ?? '-'}</td><th>Sol</th><td>{values?.sol ?? '-'}</td></tr>
          <tr><th>Orta</th><td colSpan={3}>{values?.orta ?? '-'}</td></tr>
        </tbody>
      </table>
    </div>
  )
}
