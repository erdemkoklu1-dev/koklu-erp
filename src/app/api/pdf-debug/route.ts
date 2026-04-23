/**
 * Debug endpoint — tek bir PDF dosyası yükleyip ham parse sonucunu görmek için.
 * Kullanım: POST /api/pdf-debug  (FormData: file = tek PDF)
 * Sadece geliştirme aşamasında kullanın.
 */
import { NextRequest, NextResponse } from 'next/server'
import { parsePdfBuffer } from '@/lib/parsePdfBuffer'

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Dosya yok' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parsePdfBuffer(buffer, file.name, 'satis')
    return NextResponse.json({ parsed })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
