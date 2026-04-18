import { NextResponse } from 'next/server'

const GATEWAY = process.env.WHATSAPP_GATEWAY_URL ?? 'http://localhost:3001'

export async function GET() {
  try {
    const res = await fetch(`${GATEWAY}/status`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'disconnected', qrImage: null })
  }
}
