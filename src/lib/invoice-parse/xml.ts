/**
 * Bağımlılıksız, **XXE'ye yapısal olarak kapalı** XML okuyucusu.
 *
 * ── NEDEN HAZIR KÜTÜPHANE DEĞİL ─────────────────────────────────────────────
 * Klasik XML parser'larda DTD / external entity / network resolution
 * *varsayılan olarak açıktır* ve güvenlik ancak doğru bayrakla kapatılır; bir
 * sürüm yükseltmesi bu bayrağı sessizce anlamsızlaştırabilir. Buradaki okuyucu
 * entity çözümlemesini **hiç uygulamaz**: XXE, billion-laughs ve SSRF sınıfı
 * saldırılar bir ayarla değil, yokluğuyla imkânsızdır.
 *
 * Desteklenen: element, öznitelik, metin, CDATA, yorum, XML bildirimi,
 * beş öntanımlı entity (`&lt; &gt; &amp; &quot; &apos;`) ve sayısal karakter
 * referansları.
 *
 * REDDEDİLEN (kontrollü hata ile):
 *   - `<!DOCTYPE ...>` (DTD) — entity bombası ve external entity vektörü
 *   - `<!ENTITY ...>`
 *   - derinlik / düğüm sayısı sınırını aşan belgeler
 *
 * Namespace dayanıklılığı: `cbc:ID`, `ns2:ID`, `ID` aynı **yerel ada** indirgenir.
 * UBL-TR üreticileri arasında prefix'ler değiştiği için eşleme daima yerel ad
 * üzerinden yapılır.
 */

export const XML_ERROR = {
  DOCTYPE_FORBIDDEN: 'XML_DOCTYPE_FORBIDDEN',
  ENTITY_FORBIDDEN: 'XML_ENTITY_FORBIDDEN',
  TOO_DEEP: 'XML_TOO_DEEP',
  TOO_MANY_NODES: 'XML_TOO_MANY_NODES',
  MALFORMED: 'XML_MALFORMED',
  EMPTY: 'XML_EMPTY',
} as const

export type XmlErrorCode = (typeof XML_ERROR)[keyof typeof XML_ERROR]

export interface XmlError {
  code: XmlErrorCode
  message: string
}

export interface XmlElement {
  /** Prefix'i atılmış yerel ad (`cbc:ID` → `ID`). */
  name: string
  /** Öznitelikler; anahtarlar da yerel ada indirgenir. */
  attrs: Record<string, string>
  children: XmlElement[]
  /** Doğrudan metin içeriği (alt elementlerin metni DAHİL DEĞİL). */
  text: string
}

export type XmlResult = { ok: true; root: XmlElement } | { ok: false; error: XmlError }

export interface XmlLimits {
  maxDepth?: number
  maxNodes?: number
}

const DEFAULT_MAX_DEPTH = 100
const DEFAULT_MAX_NODES = 200_000

const PREDEFINED: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

/** Yalnızca öntanımlı ve sayısal referansları çözer. Özel entity ÇÖZÜLMEZ. */
export function decodeXmlText(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    // Tanınmayan (yani belgeye özel tanımlanmış) entity OLDUĞU GİBİ bırakılır;
    // asla bir dosya yolu ya da URL'e çözülmez.
    return PREDEFINED[body] ?? match
  })
}

/** `cbc:ID` → `ID`. Prefix'ler üreticiden üreticiye değişir. */
export function localName(qualified: string): string {
  const idx = qualified.indexOf(':')
  return idx === -1 ? qualified : qualified.slice(idx + 1)
}

function fail(code: XmlErrorCode, message: string): { ok: false; error: XmlError } {
  return { ok: false, error: { code, message } }
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([A-Za-z_][\w.\-:]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const value = match[3] ?? match[4] ?? ''
    attrs[localName(match[1])] = decodeXmlText(value)
  }
  return attrs
}

/**
 * XML metnini ağaca çevirir.
 *
 * Hata durumunda **ham belge içeriği mesajda taşınmaz**; yalnızca stabil kod ve
 * genel bir açıklama döner (fatura verisi log/istemciye sızmamalıdır).
 */
export function parseXml(source: string, limits: XmlLimits = {}): XmlResult {
  const maxDepth = limits.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxNodes = limits.maxNodes ?? DEFAULT_MAX_NODES

  if (!source || source.trim().length === 0) {
    return fail(XML_ERROR.EMPTY, 'XML içeriği boş.')
  }

  // BOM temizliği — bazı e-fatura üreticileri UTF-8 BOM ile yazar.
  let text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source

  if (/<!DOCTYPE/i.test(text)) {
    return fail(
      XML_ERROR.DOCTYPE_FORBIDDEN,
      'XML belgesi DTD (DOCTYPE) içeriyor. Güvenlik gereği işlenmedi.',
    )
  }
  if (/<!ENTITY/i.test(text)) {
    return fail(
      XML_ERROR.ENTITY_FORBIDDEN,
      'XML belgesi özel entity tanımı içeriyor. Güvenlik gereği işlenmedi.',
    )
  }

  // Yorumlar ve işlem yönergeleri düşürülür (içerik taşımazlar).
  text = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '')

  const stack: XmlElement[] = []
  let root: XmlElement | null = null
  let nodes = 0
  let index = 0

  while (index < text.length) {
    const open = text.indexOf('<', index)

    if (open === -1) break

    if (open > index) {
      const chunk = text.slice(index, open)
      if (stack.length > 0 && chunk.trim().length > 0) {
        stack[stack.length - 1].text += decodeXmlText(chunk)
      }
    }

    // CDATA: içerik ham olarak alınır, entity çözümlemesi YAPILMAZ.
    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open)
      if (end === -1) return fail(XML_ERROR.MALFORMED, 'CDATA bloğu kapatılmamış.')
      if (stack.length > 0) stack[stack.length - 1].text += text.slice(open + 9, end)
      index = end + 3
      continue
    }

    const close = text.indexOf('>', open)
    if (close === -1) return fail(XML_ERROR.MALFORMED, 'Kapatılmamış etiket bulundu.')

    const inner = text.slice(open + 1, close).trim()
    index = close + 1

    if (inner.startsWith('!')) continue // kalan bildirimler yok sayılır

    if (inner.startsWith('/')) {
      const name = localName(inner.slice(1).trim())
      const current = stack.pop()
      if (!current) return fail(XML_ERROR.MALFORMED, 'Fazladan kapanış etiketi bulundu.')
      if (current.name !== name) {
        return fail(XML_ERROR.MALFORMED, 'Açılış ve kapanış etiketleri eşleşmiyor.')
      }
      continue
    }

    const selfClosing = inner.endsWith('/')
    const body = selfClosing ? inner.slice(0, -1).trim() : inner
    const spaceIdx = body.search(/\s/)
    const rawName = spaceIdx === -1 ? body : body.slice(0, spaceIdx)
    if (!rawName) return fail(XML_ERROR.MALFORMED, 'Etiket adı okunamadı.')

    nodes++
    if (nodes > maxNodes) {
      return fail(XML_ERROR.TOO_MANY_NODES, 'XML belgesi çok fazla düğüm içeriyor.')
    }

    const element: XmlElement = {
      name: localName(rawName),
      attrs: spaceIdx === -1 ? {} : parseAttributes(body.slice(spaceIdx)),
      children: [],
      text: '',
    }

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(element)
    } else if (root === null) {
      root = element
    } else {
      return fail(XML_ERROR.MALFORMED, 'Belgede birden fazla kök element var.')
    }

    if (!selfClosing) {
      stack.push(element)
      if (stack.length > maxDepth) {
        return fail(XML_ERROR.TOO_DEEP, 'XML belgesi izin verilen iç içe geçme sınırını aşıyor.')
      }
    }
  }

  if (stack.length > 0) return fail(XML_ERROR.MALFORMED, 'Kapatılmamış element bulundu.')
  if (!root) return fail(XML_ERROR.MALFORMED, 'Belgede kök element bulunamadı.')

  return { ok: true, root }
}

// ─── Ağaç üzerinde gezinme yardımcıları (hepsi yerel ad bazlı) ─────────────────

/** Doğrudan çocuklar arasında adı eşleşen ilk element. */
export function child(element: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!element) return null
  return element.children.find(c => c.name === name) ?? null
}

/** Doğrudan çocuklar arasında adı eşleşen bütün elementler. */
export function children(element: XmlElement | null | undefined, name: string): XmlElement[] {
  if (!element) return []
  return element.children.filter(c => c.name === name)
}

/** `path` boyunca aşağı iner: `at(root, 'A', 'B', 'C')`. */
export function at(element: XmlElement | null | undefined, ...path: string[]): XmlElement | null {
  let current: XmlElement | null = element ?? null
  for (const name of path) {
    current = child(current, name)
    if (!current) return null
  }
  return current
}

/** Bir yolun metin içeriği (kırpılmış). Bulunamazsa `null`. */
export function textAt(element: XmlElement | null | undefined, ...path: string[]): string | null {
  const node = at(element, ...path)
  if (!node) return null
  const value = node.text.trim()
  return value.length > 0 ? value : null
}

/** Ağaçta (derinlemesine) adı eşleşen ilk elementi bulur. */
export function findFirst(element: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!element) return null
  if (element.name === name) return element
  for (const c of element.children) {
    const found = findFirst(c, name)
    if (found) return found
  }
  return null
}

/** Ağaçta (derinlemesine) adı eşleşen bütün elementleri toplar. */
export function findAll(element: XmlElement | null | undefined, name: string): XmlElement[] {
  const out: XmlElement[] = []
  const walk = (node: XmlElement) => {
    if (node.name === name) out.push(node)
    for (const c of node.children) walk(c)
  }
  if (element) walk(element)
  return out
}
