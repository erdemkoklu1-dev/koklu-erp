// Groq AI destekli fatura parse modülü
// pdfjs-dist ile çıkarılan ham text → Groq → yapılandırılmış JSON

import { suggestBranchByCity } from '@/lib/branches/branch-inference'

type GroqResponse = { choices?: Array<{ message?: { content?: string } }> }

async function callGroqApi(body: object): Promise<GroqResponse> {
  const groqApiKey = (process.env.GROQ_API_KEY ?? '').trim()
  if (!groqApiKey || groqApiKey.length < 10) {
    throw new Error('GROQ_API_KEY geçersiz veya bulunamadı')
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[groq] API HTTP hatası:', response.status, errorText.slice(0, 300))
    throw new Error(`Groq API hatası: ${response.status} - ${errorText.slice(0, 100)}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const rawText = await response.text()
    console.error('[groq] JSON dışı yanıt:', rawText.slice(0, 200))
    throw new Error('Groq API geçersiz yanıt döndü (JSON değil)')
  }

  return response.json() as Promise<GroqResponse>
}

export interface AiParsedItem {
  sira_no: number
  aciklama: string
  miktar: number
  birim: string
  birim_fiyat: number
  iskonto_orani: number
  kdv_orani: number
  kdv_tutari: number
  tutar: number
}

export interface AiParsedInvoice {
  musteri_adi: string
  musteri_vkn: string
  musteri_tckn: string
  musteri_adres: string
  musteri_il: string
  vergi_dairesi: string
  fatura_no: string
  fatura_tarihi: string   // YYYY-MM-DD
  vade_tarihi: string     // YYYY-MM-DD
  toplam_tutar: number
  kdv_toplam: number
  kalemler: AiParsedItem[]
}

const KOKLU_VKN = '5830028164'

const SYSTEM_PROMPT = `Sen bir Türk e-Arşiv / e-Fatura PDF'inden çıkarılmış ham text'i analiz eden bir yardımcısın.

Sana verilen text, bir fatura PDF'inden pdfjs-dist ile çıkarılmış ham metindir. Bu metinden fatura bilgilerini çıkarıp JSON formatında dön.

KURALLAR:
1. Satıcı (KÖKLÜ YANGIN, VKN: 5830028164) bilgilerini MÜŞTERİ olarak ALMA. Müşteri "SAYIN" kelimesinden sonra gelen taraftır.
2. Tarihler YYYY-MM-DD formatında olmalı (örn: 2024-12-24). PDF'de DD-MM-YYYY veya DD.MM.YYYY olabilir, sen dönüştür.
3. Tutarları nokta ile ondalık ayırıcı kullanarak sayı olarak dön (örn: 1200.00, 83.33). Türkçe format: 1.200,00 → 1200.00
4. Birimi her zaman "Adet" olarak dön (PDF'de "Adet" yazar).
5. musteri_il: Müşteri adresinden il bilgisini çıkar (örn: "İstanbul", "Erzincan", "Ankara").
6. Fatura numarası KOK veya KYS ile başlar.
7. VKN 10 haneli, TCKN 11 haneli. İkisinden biri olur. 5830028164 VKN'si satıcıya (Köklü Yangın) ait, müşteriye değil.
8. Kalem açıklamalarını tam yaz, kısaltma yapma. Çok satırlı açıklamaları birleştir.
9. Özet satırlarını (Mal Hizmet Toplam, KDV Matrahı, Ödenecek Tutar vb.) kalem olarak EKLEME.
10. Kalem yoksa boş dizi dön: "kalemler": []
11. Bilinmiyorsa string alanlar için "" (boş string), number alanlar için 0 dön.

SADECE JSON dön, başka hiçbir şey yazma. Markdown backtick kullanma.`

const USER_PROMPT_TEMPLATE = `Bu fatura PDF'inden çıkarılmış ham text:

---
{PDF_TEXT}
---

Yukarıdaki text'ten fatura bilgilerini çıkar ve SADECE aşağıdaki JSON formatında dön:

{
  "musteri_adi": "string",
  "musteri_vkn": "string veya boş",
  "musteri_tckn": "string veya boş",
  "musteri_adres": "string",
  "musteri_il": "string (il adı, örn: İstanbul)",
  "vergi_dairesi": "string",
  "fatura_no": "string",
  "fatura_tarihi": "YYYY-MM-DD",
  "vade_tarihi": "YYYY-MM-DD veya boş",
  "toplam_tutar": number,
  "kdv_toplam": number,
  "kalemler": [
    {
      "sira_no": number,
      "aciklama": "string",
      "miktar": number,
      "birim": "Adet",
      "birim_fiyat": number,
      "iskonto_orani": number,
      "kdv_orani": number,
      "kdv_tutari": number,
      "tutar": number
    }
  ]
}`

export async function parseInvoiceWithAI(pdfText: string): Promise<AiParsedInvoice> {
  const truncatedText = pdfText.length > 6000 ? pdfText.slice(0, 6000) + '\n...(metin kısaltıldı)' : pdfText
  const userPrompt = USER_PROMPT_TEMPLATE.replace('{PDF_TEXT}', truncatedText)

  const data = await callGroqApi({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  })

  const content = data.choices?.[0]?.message?.content ?? ''

  const cleanContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  let parsed: AiParsedInvoice
  try {
    parsed = JSON.parse(cleanContent) as AiParsedInvoice
  } catch {
    console.error('[groq] JSON parse hatası. AI yanıtı:', content.slice(0, 500))
    throw new Error('AI yanıtı JSON olarak çözümlenemedi')
  }

  // Temel validasyon
  if (!parsed.musteri_adi) throw new Error('AI: müşteri adı bulunamadı')
  if (!parsed.fatura_no)   throw new Error('AI: fatura numarası bulunamadı')

  // Köklü VKN müşteriye atanmışsa temizle
  if (parsed.musteri_vkn === KOKLU_VKN) parsed.musteri_vkn = ''

  // Kalemler dizisi garantisi
  if (!Array.isArray(parsed.kalemler)) parsed.kalemler = []

  console.log('[groq] parse başarılı:', {
    musteri: parsed.musteri_adi,
    fatura_no: parsed.fatura_no,
    tarih: parsed.fatura_tarihi,
    kalem_sayisi: parsed.kalemler.length,
    toplam: parsed.toplam_tutar,
  })

  return parsed
}

// ── Gelen fatura AI parse ──────────────────────────────────────

export interface AiParsedGelenFatura {
  tedarikci_adi: string
  tedarikci_vkn: string
  tedarikci_adres: string
  tedarikci_il: string
  vergi_dairesi: string
  fatura_no: string
  fatura_tarihi: string   // YYYY-MM-DD
  vade_tarihi: string
  toplam_tutar: number
  kdv_toplam: number
  kategori: string
  kalemler: Array<{
    sira_no: number
    aciklama: string
    miktar: number
    birim: string
    birim_fiyat: number
    kdv_orani: number
    kdv_tutari: number
    tutar: number
  }>
}

const GELEN_FATURA_SYSTEM_PROMPT = `Sen bir Türk e-Fatura/e-Arşiv PDF'inden çıkarılmış ham text'i analiz eden bir yardımcısın.

Bu bir GELEN faturadır — yani başka bir firma Köklü Yangın'a kesmiş.

KRİTİK KURAL — TEDARİKÇİ TESPİTİ:
PDF yapısı şöyledir:
- ÜST KISIM / HEADER (sol üst köşe): SATICI = TEDARİKÇİ firması. Burası tedarikci_adi ve tedarikci_vkn.
- "SAYIN" bölümü: ALICI = Köklü Yangın Söndürme Cihazları (VKN: 5830028164). Bu BİZİZ, TEDARİKÇİ DEĞİL.
- VKN 5830028164 olan taraf HER ZAMAN alıcıdır. Bu VKN'yi tedarikci_vkn olarak ASLA DÖNDÜRMEYİN.
- Tedarikçi VKN'si 5830028164'ten FARKLI olan VKN'dir.

Örnek: PDF'de üstte "TÜRK STANDARDLARI ENSTİTÜSÜ / ERZİNCAN TEMSİLCİLİĞİ, VKN: 8760051534" yazıyorsa:
  tedarikci_adi: "TÜRK STANDARDLARI ENSTİTÜSÜ"
  tedarikci_vkn: "8760051534"

"SAYIN — KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI, VKN: 5830028164" bölümü ALICIDIR, tedarikçi değildir.

KURALLAR:
1. TEDARİKÇİ (satıcı): PDF'in ÜST kısmındaki firma. VKN/TCKN, unvan, adres bilgilerini çıkar.
2. ALICI: Köklü Yangın Söndürme Cihazları (VKN: 5830028164) — bunu tedarikçi olarak ASLA ALMA.
3. Tarihler YYYY-MM-DD formatında.
4. Tutarları sayı olarak dön (nokta ondalık: 1200.00).
5. KATEGORİ: Fatura içeriğine göre otomatik kategori öner:
   - "İnternet / İletişim" → TTNET, TurkNet, Vodafone, Türk Telekom, internet, telefon
   - "Elektrik" → elektrik, enerji, EDAŞ, EPAŞ
   - "Doğalgaz" → doğalgaz, gaz dağıtım
   - "Su" → su, ASKİ, İSKİ
   - "Kira" → kira, gayrimenkul
   - "Yakıt / Akaryakıt" → benzin, motorin, akaryakıt, petrol, Opet, Shell, BP
   - "Market / Gıda" → BİM, A101, ŞOK, Migros, market, gıda
   - "Kargo / Nakliye" → kargo, nakliye, Yurtiçi, Aras, MNG, PTT
   - "Hammadde" → çelik, boru, vana, manometre, toz, köpük, kimyasal, basınçlı kap, sac, metal
   - "Araç Gideri" → araç, tamir, lastik, sigorta, muayene, otopark
   - "Vergi / Resmi" → vergi, SGK, bağkur, noter, harç
   - "Ofis / Kırtasiye" → kırtasiye, toner, yazıcı, kağıt
   - "Gaz & Dolum Malzemesi" → azot, karbondioksit, CO2, argon, dolum, gaz dolum
   - "Yangın Tüpü Parça & Malzeme" → yangın tüpü, söndürme, gövde, vana, hortum, manometre
   - "Belgelendirme" → TSE, ISO, belgelendirme, sertifika, Türkak, NEMACERT, kalibrasyon
   - "Elektronik / Teknik" → elektronik, sensör, robot, Arduino, devre, yazılım
   - "Reklam / Tanıtım" → reklam, matbaa, basım, tabela, kartvizit, katalog
   - "Muhasebe / Denetim" → muhasebe, mali müşavir, SMMM, YMM, denetim, beyanname
   - "Genel Gider" → yukarıdakilerin hiçbirine uymuyorsa
6. Kalem açıklamalarını tam yaz, özet satırlarını (Toplam, KDV, Ödenecek) kalem olarak EKLEME.
7. Çok satırlı açıklamaları birleştir.

SADECE JSON dön, Markdown backtick kullanma.`

const GELEN_FATURA_USER_PROMPT = `Bu GELEN fatura PDF'inden çıkarılmış ham text:

---
{PDF_TEXT}
---

JSON formatında dön:

{
  "tedarikci_adi": "string (faturayı kesen firma)",
  "tedarikci_vkn": "string",
  "tedarikci_adres": "string",
  "tedarikci_il": "string",
  "vergi_dairesi": "string",
  "fatura_no": "string",
  "fatura_tarihi": "YYYY-MM-DD",
  "vade_tarihi": "YYYY-MM-DD veya boş string",
  "toplam_tutar": 0,
  "kdv_toplam": 0,
  "kategori": "string",
  "kalemler": [
    {
      "sira_no": 1,
      "aciklama": "string",
      "miktar": 1,
      "birim": "string",
      "birim_fiyat": 0,
      "kdv_orani": 20,
      "kdv_tutari": 0,
      "tutar": 0
    }
  ]
}`

export async function parseGelenFaturaWithAI(pdfText: string): Promise<AiParsedGelenFatura> {
  const truncatedText = pdfText.length > 6000 ? pdfText.slice(0, 6000) + '\n...(metin kısaltıldı)' : pdfText
  const userPrompt = GELEN_FATURA_USER_PROMPT.replace('{PDF_TEXT}', truncatedText)

  const data = await callGroqApi({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: GELEN_FATURA_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  })

  const content = data.choices?.[0]?.message?.content ?? ''

  const cleanContent = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  let parsed: AiParsedGelenFatura
  try {
    parsed = JSON.parse(cleanContent) as AiParsedGelenFatura
  } catch {
    console.error('[groq gelen] JSON parse hatası. AI yanıtı:', content.slice(0, 500))
    throw new Error('AI yanıtı JSON olarak çözümlenemedi')
  }

  if (!Array.isArray(parsed.kalemler)) parsed.kalemler = []

  // Köklü VKN tedarikçi olarak atanmışsa temizle (AI yanlış parse)
  if (parsed.tedarikci_vkn === KOKLU_VKN) {
    console.warn('[groq gelen] AI Köklü VKN\'yi tedarikçiye atadı, temizleniyor')
    parsed.tedarikci_vkn = ''
  }

  console.log('[groq gelen] parse başarılı:', {
    tedarikci: parsed.tedarikci_adi,
    fatura_no: parsed.fatura_no,
    tarih: parsed.fatura_tarihi,
    kalem_sayisi: parsed.kalemler.length,
    toplam: parsed.toplam_tutar,
    kategori: parsed.kategori,
  })

  return parsed
}

// İl bilgisine göre şube otomatik atama
export function detectBranch(il: string, subeler: Array<{ id: string; ad: string }>): string | null {
  const inferred = suggestBranchByCity(il, subeler).suggestedBranchId
  if (inferred) return inferred
  if (!il) return null

  const normalizedIl = il
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .trim()

  // İstanbul → İstanbul Şube
  if (normalizedIl.includes('ISTANBUL')) {
    return subeler.find(s =>
      s.ad.toUpperCase().replace(/İ/g, 'I').includes('ISTANBUL')
    )?.id ?? null
  }

  // Diğer iller → Erzincan Merkez (varsayılan)
  return subeler.find(s =>
    s.ad.toUpperCase().replace(/İ/g, 'I').includes('ERZINCAN') ||
    s.ad.toUpperCase().includes('MERKEZ')
  )?.id ?? null
}
