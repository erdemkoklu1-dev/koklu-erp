/**
 * Test sürecinde TypeScript modül çözümlemesini taklit eden ESM kancası.
 *
 * Uygulama kodu iki şeye dayanır ve Node ikisini de bilmez:
 *   1. `@/…` alias'ı (Next.js `tsconfig.json` → `paths`)
 *   2. Uzantısız import'lar (`./foo`, `next/server`)
 *
 * Bu kanca olmadan gerçek route handler'ları `node --test` altında import
 * EDİLEMEZ; testler yalnızca saf yardımcı modülleri kapsayabilir ve route
 * sınırı hiç sınanmazdı (GOREV.md §5.1: "En az bir test gerçek
 * multipart/form-data request oluşturarak route sınırını geçmelidir").
 *
 * Kanca yalnızca **çözümlenemeyen** specifier'lara dokunur: önce Node'un
 * varsayılan çözümlemesi denenir, başarısız olursa uzantı adayları sırayla
 * eklenir. Böylece çalışan hiçbir import'un davranışı değişmez.
 */

import { existsSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

const SRC = fileURLToPath(new URL('../../src/', import.meta.url))

/** TypeScript'in denediği uzantı sırası. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs']

function fileAt(path) {
  return existsSync(path) && statSync(path).isFile()
}

/** `base` için uzantılı / `index` adaylarından ilk var olanı döndürür. */
function firstExisting(base) {
  if (fileAt(base)) return base
  for (const ext of EXTENSIONS) {
    if (fileAt(base + ext)) return base + ext
  }
  for (const ext of EXTENSIONS) {
    const indexed = join(base, `index${ext}`)
    if (fileAt(indexed)) return indexed
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  // ── 1. `@/…` alias'ı ──────────────────────────────────────────────────────
  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(join(SRC, specifier.slice(2)))
    if (resolved) {
      return { url: pathToFileURL(resolved).href, shortCircuit: true }
    }
    throw new Error(`Alias çözümlenemedi: ${specifier} (kök: ${SRC})`)
  }

  // ── 2. Varsayılan çözümleme ───────────────────────────────────────────────
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    // ── 3. Uzantısız göreli import ──────────────────────────────────────────
    if (specifier.startsWith('.') && context.parentURL) {
      const base = fileURLToPath(new URL(specifier, context.parentURL))
      const resolved = firstExisting(base)
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true }
      }
    }

    // ── 4. Uzantısız paket alt yolu (`next/server` → `next/server.js`) ──────
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && specifier.includes('/')) {
      for (const ext of EXTENSIONS) {
        try {
          return await nextResolve(specifier + ext, context)
        } catch {
          // sıradaki uzantı
        }
      }
    }

    throw error
  }
}

/**
 * Bazı uygulama modülleri (`src/lib/parsePdfBuffer.ts`) CommonJS `require`
 * kullanır; Next'in bundler'ı bunu çözer, Node'un native ESM'i çözemez.
 *
 * Bu kanca **yalnızca** `src/` altındaki TS dosyalarına ve yalnızca dosya
 * gerçekten `require(` içeriyorsa bir `createRequire` köprüsü ekler. Kodun
 * geri kalanına dokunulmaz; üretim davranışı değişmez. Amaç, gerçek route
 * handler'ının testte import edilebilmesidir.
 */
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)

  if (!url.includes('/src/') || !/\.tsx?$/.test(url)) return result
  if (typeof result.source !== 'string' && !Buffer.isBuffer(result.source)) return result

  const source = result.source.toString()
  if (!/(^|[^.\w])require\s*\(/.test(source)) return result

  const bridge =
    "import { createRequire as __createRequire } from 'node:module'\n" +
    'const require = __createRequire(import.meta.url)\n'

  return { ...result, source: bridge + source }
}
