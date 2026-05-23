import path from 'path'
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { HAREKET_TIPI_LABELS, type HareketTipi } from '@/lib/teslimatlar'
import type { TeslimFormData } from '@/lib/teslim-form-data'

const C = {
  red: '#C8102E',
  redDark: '#9f1239',
  border: '#d1d5db',
  gray: '#6b7280',
  light: '#f9fafb',
  text: '#111827',
  white: '#ffffff',
  green: '#15803d',
  orange: '#c2410c',
}

const FONT_FAMILY = 'LiberationSansTR'

Font.register({
  family: FONT_FAMILY,
  fonts: [
    { src: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf'), fontWeight: 700 },
    { src: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf'), fontStyle: 'italic' },
    { src: path.join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
  ],
})

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: FONT_FAMILY, color: C.text, backgroundColor: C.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: C.red, paddingBottom: 10 },
  logo: { fontSize: 23, fontWeight: 700, color: C.red },
  company: { fontSize: 8, color: C.gray, marginTop: 4, lineHeight: 1.35 },
  titleBox: { alignItems: 'flex-end' },
  title: { fontSize: 19, fontWeight: 700, color: C.red },
  badge: { marginTop: 6, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.light, color: C.red, fontSize: 8 },
  grid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  box: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 9, backgroundColor: C.light },
  boxTitle: { fontSize: 8, fontWeight: 700, color: C.red, marginBottom: 6, textTransform: 'uppercase' },
  line: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 82, color: C.gray, fontWeight: 700 },
  value: { flex: 1 },
  sectionTitle: { marginTop: 13, marginBottom: 6, fontSize: 9, fontWeight: 700, color: C.text },
  table: { borderWidth: 1, borderColor: C.border },
  tr: { flexDirection: 'row' },
  th: { backgroundColor: C.red, color: C.white, padding: 4, fontWeight: 700, borderRightWidth: 1, borderRightColor: C.redDark },
  td: { padding: 4, borderTopWidth: 1, borderTopColor: C.border, borderRightWidth: 1, borderRightColor: C.border },
  totals: { marginTop: 8, alignSelf: 'flex-end', width: 180, borderWidth: 1, borderColor: C.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 6 },
  totalStrong: { backgroundColor: C.light, color: C.red, fontWeight: 700 },
  noteGrid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  noteBox: { flex: 1, borderWidth: 1, borderColor: C.border, padding: 8, minHeight: 52 },
  summaryGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  summaryBox: { flex: 1, borderWidth: 1, borderColor: C.border, borderTopWidth: 2, borderTopColor: C.red, padding: 8 },
  signatureGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  signatureBox: { flex: 1, borderWidth: 1, borderColor: C.border, padding: 8, minHeight: 82 },
  signatureLine: { marginTop: 40, borderBottomWidth: 1, borderBottomColor: C.gray, borderStyle: 'dashed' },
  signatureImage: { width: 150, height: 54, objectFit: 'contain', marginTop: 4 },
  footer: { position: 'absolute', bottom: 18, left: 28, right: 28, paddingTop: 5, borderTopWidth: 1, borderTopColor: C.border, textAlign: 'center', fontSize: 7, color: C.gray },
})

function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

function money(value: unknown) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0))
}

function getJoin<T extends object>(value: unknown): T | null {
  return (value && typeof value === 'object' ? value as T : null)
}

export function TeslimFormPdfDocument({ data }: { data: TeslimFormData }) {
  const { teslimat, kalemler, emanetler, bekleyenler } = data
  const customer = getJoin<{ full_name?: string | null; phone?: string | null; email?: string | null; address?: string | null; tax_number?: string | null; authorized_person?: string | null }>(teslimat.customers)
  const sube = getJoin<{ ad?: string | null }>(teslimat.subeler)
  const personel = getJoin<{ ad?: string | null; soyad?: string | null }>(teslimat.personeller)
  const personelAd = personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() : ''
  const toplam = kalemler.reduce((sum, row) => sum + Number(row.toplam_tutar ?? 0), 0)
  const acikEmanet = emanetler.filter(row => ['acik', 'kismi_kapandi'].includes(String(row.durum))).length
  const geriBekleyen = bekleyenler.filter(row => ['bekliyor', 'kismi_teslim'].includes(String(row.durum))).length
  const imza = teslimat.musteri_imza_data as string | null

  return (
    <Document title={`${teslimat.teslimat_no} Teslim Formu`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>KÖKLÜ</Text>
            <Text>YANGIN SÖNDÜRME CİHAZLARI SAN. VE TİC. LTD. ŞTİ.</Text>
            <Text style={styles.company}>Erzincan Fabrika: Karaağaç Mah. 774. Sok. No:49 · Tel: (0446) 214 45 81</Text>
            <Text style={styles.company}>İstanbul Şube: Kışla Cd. Seferağa San. Sit. No:181/B Topçular · Tel: (0534) 311 49 05</Text>
          </View>
          <View style={styles.titleBox}>
            <Text style={styles.title}>TESLİM FORMU</Text>
            <Text>Form No: {teslimat.teslim_form_no ?? teslimat.teslimat_no}</Text>
            <Text>Tarih: {formatDate(teslimat.teslimat_tarihi)}</Text>
            <Text style={styles.badge}>{String(teslimat.durum ?? '').toLocaleUpperCase('tr-TR')}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Müşteri Bilgileri</Text>
            {[['Müşteri', customer?.full_name], ['Yetkili', customer?.authorized_person], ['Telefon', customer?.phone], ['Vergi No', customer?.tax_number], ['Teslim Yeri', customer?.address]].map(([l, v]) => (
              <View key={l} style={styles.line}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v ?? '-'}</Text></View>
            ))}
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Teslimat Bilgileri</Text>
            {[['Teslim No', teslimat.teslimat_no], ['Şube', sube?.ad ?? 'Genel'], ['Personel', personelAd || '-'], ['Hedef Tarih', formatDate(teslimat.hedef_tarih)], ['Ön Kayıt', teslimat.on_kayit_olusturuldu ? 'Oluşturuldu' : teslimat.on_kayit_secimi]].map(([l, v]) => (
              <View key={l} style={styles.line}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v ?? '-'}</Text></View>
            ))}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Kalem Tablosu</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            {['No', 'Ürün / Hizmet', 'İşlem Tipi', 'Yön', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam'].map((h, i) => (
              <Text key={h} style={[styles.th, { width: [24, 120, 96, 40, 42, 38, 62, 62][i] }]}>{h}</Text>
            ))}
          </View>
          {kalemler.map((row, index) => {
            const urun = getJoin<{ ad?: string | null }>(row.urunler)
            return (
              <View key={row.id} style={styles.tr} wrap={false}>
                <Text style={[styles.td, { width: 24 }]}>{index + 1}</Text>
                <Text style={[styles.td, { width: 120 }]}>{urun?.ad ?? row.aciklama}</Text>
                <Text style={[styles.td, { width: 96 }]}>{HAREKET_TIPI_LABELS[row.hareket_tipi as HareketTipi] ?? row.hareket_tipi}</Text>
                <Text style={[styles.td, { width: 40 }]}>{row.hareket_yonu}</Text>
                <Text style={[styles.td, { width: 42 }]}>{row.miktar}</Text>
                <Text style={[styles.td, { width: 38 }]}>{row.birim}</Text>
                <Text style={[styles.td, { width: 62 }]}>{money(row.birim_fiyat)}</Text>
                <Text style={[styles.td, { width: 62 }]}>{money(row.toplam_tutar)}</Text>
              </View>
            )
          })}
        </View>

        <View style={styles.totals}>
          <View style={[styles.totalRow, styles.totalStrong]}>
            <Text>Toplam</Text>
            <Text>{money(toplam)} TL</Text>
          </View>
        </View>

        <View style={styles.noteGrid}>
          <View style={styles.noteBox}>
            <Text style={styles.boxTitle}>Açıklama / Not</Text>
            <Text>{teslimat.aciklama ?? teslimat.notlar ?? '-'}</Text>
          </View>
          <View style={styles.noteBox}>
            <Text style={styles.boxTitle}>Müşteriye Not</Text>
            <Text>Teslim edilen ürün ve hizmetler yukarıdaki gibidir.</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryBox}><Text>Açık Emanet</Text><Text style={{ color: acikEmanet > 0 ? C.orange : C.green }}>{acikEmanet > 0 ? `${acikEmanet} kayıt var` : 'Yok'}</Text></View>
          <View style={styles.summaryBox}><Text>Geri Teslim</Text><Text style={{ color: geriBekleyen > 0 ? C.orange : C.green }}>{geriBekleyen > 0 ? `${geriBekleyen} bekleyen` : 'Yok'}</Text></View>
          <View style={styles.summaryBox}><Text>Ön Kayıt</Text><Text>{teslimat.on_kayit_olusturuldu ? 'Aktarıldı' : 'Bekliyor / Yok'}</Text></View>
        </View>

        <View style={styles.signatureGrid}>
          <View style={styles.signatureBox}>
            <Text>Teslim Alan</Text>
            <Text>{teslimat.imza_atan_ad_soyad ?? customer?.authorized_person ?? customer?.full_name ?? '-'}</Text>
            {imza ? <Image src={imza} style={styles.signatureImage} /> : <View style={styles.signatureLine} />}
          </View>
          <View style={styles.signatureBox}><Text>Teslim Eden</Text><Text>{personelAd || '-'}</Text><View style={styles.signatureLine} /></View>
          <View style={styles.signatureBox}><Text>Firma Yetkilisi / Onaylayan</Text><View style={styles.signatureLine} /></View>
        </View>

        <Text style={styles.footer}>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI SANAYİ VE TİCARET LTD. ŞTİ. · Teslim formu elektronik ortamda oluşturulmuştur.</Text>
      </Page>
    </Document>
  )
}
