import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { parsePdfBuffer } from '@/lib/parsePdfBuffer'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'zip' && ext !== 'pdf') {
      return NextResponse.json({ error: 'Yalnızca PDF veya ZIP dosyası yükleyebilirsiniz' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const invoices = []

    if (ext === 'zip') {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
        .filter(e => e.entryName.toLowerCase().endsWith('.pdf') && !e.entryName.startsWith('__MACOSX'))
        .sort((a, b) => a.entryName.localeCompare(b.entryName))

      for (const entry of entries) {
        const pdfBuffer = entry.getData()
        const parsed = await parsePdfBuffer(pdfBuffer, entry.entryName, 'satis')
        invoices.push(parsed)
      }
    } else {
      const parsed = await parsePdfBuffer(buffer, file.name, 'satis')
      invoices.push(parsed)
    }

    return NextResponse.json({ invoices })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
