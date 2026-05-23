import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { getTeslimFormData, teslimFormFileName } from '@/lib/teslim-form-data'
import { TeslimFormPdfDocument } from '@/lib/teslim-form-pdf'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getTeslimFormData(id)
  const buffer = await renderToBuffer(createElement(TeslimFormPdfDocument, { data }) as any)
  const disposition = new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${teslimFormFileName(data.teslimat.teslimat_no)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
