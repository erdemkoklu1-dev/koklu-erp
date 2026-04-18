/**
 * Debug endpoint — tek bir PDF dosyası yükleyip ham parse sonucunu görmek için.
 * Kullanım: POST /api/pdf-debug  (FormData: file = tek PDF)
 * Sadece geliştirme aşamasında kullanın.
 */
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const SCRIPT = join(process.cwd(), 'scripts', 'parse_pdf.py')

export async function POST(req: NextRequest) {
  const tmpPath = join(tmpdir(), `pdf-debug-${randomUUID()}.pdf`)
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Dosya yok' }, { status: 400 })

    await writeFile(tmpPath, Buffer.from(await file.arrayBuffer()))

    const python = await new Promise<string>((resolve, reject) => {
      const tries = ['python3', 'python', 'py']
      let i = 0
      function next() {
        if (i >= tries.length) { reject(new Error('Python bulunamadı')); return }
        const p = spawn(tries[i], ['--version'], { shell: process.platform === 'win32' })
        p.on('close', c => { if (c === 0) resolve(tries[i]); else { i++; next() } })
        p.on('error', () => { i++; next() })
      }
      next()
    })

    const raw = await new Promise<string>((resolve, reject) => {
      const proc = spawn(python, [SCRIPT, tmpPath], { shell: process.platform === 'win32' })
      let out = '', err = ''
      proc.stdout.on('data', (d: Buffer) => { out += d.toString('utf8') })
      proc.stderr.on('data', (d: Buffer) => { err += d.toString('utf8') })
      proc.on('close', () => resolve(out || err))
      proc.on('error', reject)
    })

    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { parsed = raw }
    return NextResponse.json({ raw, parsed })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  } finally {
    try { await unlink(tmpPath) } catch { /* ignore */ }
  }
}
