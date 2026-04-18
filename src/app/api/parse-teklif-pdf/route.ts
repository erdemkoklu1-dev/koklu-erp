import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'parse_teklif_pdf.py')

async function findPython(): Promise<string> {
  const candidates = ['python3', 'python', 'py']
  for (const cmd of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(cmd, ['--version'], { shell: process.platform === 'win32' })
      p.on('close', (code) => resolve(code === 0))
      p.on('error', () => resolve(false))
    })
    if (ok) return cmd
  }
  throw new Error('Python bulunamadı. Lütfen Python 3 kurun.')
}

function runPython(python: string, pdfPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, ['-X', 'utf8', SCRIPT_PATH, pdfPath], {
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
      },
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))

    proc.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf8')
      const stderr = Buffer.concat(errChunks).toString('utf8')
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Python hatası (${code}): ${stderr.slice(0, 500)}`))
      } else {
        resolve(stdout)
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Python çalıştırılamadı: ${err.message}`))
    })
  })
}

export async function POST(req: NextRequest) {
  const tmpPath = join(tmpdir(), `koklu-teklif-pdf-${randomUUID()}.pdf`)

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

    const bytes = await file.arrayBuffer()
    await writeFile(tmpPath, Buffer.from(bytes))

    const python = await findPython()
    const raw = await runPython(python, tmpPath)

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: `Parse çıktısı JSON değil: ${raw.slice(0, 300)}` },
        { status: 500 }
      )
    }

    // Hata objesi mi?
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as any).hata) {
      return NextResponse.json({ error: (parsed as any).hata }, { status: 422 })
    }

    return NextResponse.json({ items: parsed })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    try { await unlink(tmpPath) } catch { /* ignore */ }
  }
}
