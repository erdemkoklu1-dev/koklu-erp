import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Yalnızca PDF dosyası yükleyebilirsiniz' }, { status: 400 })
    }

    // PDF'yi base64'e çevir
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `Sen bir PDF teklif/fatura kalem ayrıştırıcısısın.
Kullanıcının verdiği PDF'den ürün/hizmet kalemlerini çıkar.
SADECE JSON array döndür, başka hiçbir şey yazma.
Her kalem şu formatta olsun:
[{"aciklama": "...", "miktar": 1, "birim_fiyat": 0}]
- aciklama: ürün veya hizmet adı
- miktar: adet/miktar (sayı)
- birim_fiyat: birim fiyat (sayı, varsa)
Eğer fiyat yoksa 0 yaz. Özet satırları (KDV, toplam vb.) ekleme.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Bu PDF\'deki teklif/fatura kalemlerini JSON array olarak çıkar.',
            },
          ],
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''

    // JSON'u çıkar
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) {
      return NextResponse.json({ error: 'PDF\'den kalem bulunamadı', raw }, { status: 422 })
    }

    let items: unknown
    try {
      items = JSON.parse(match[0])
    } catch {
      return NextResponse.json({ error: 'JSON parse hatası', raw }, { status: 422 })
    }

    return NextResponse.json({ items })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
