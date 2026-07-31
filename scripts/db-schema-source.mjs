/**
 * Kanonik şema kaynağı okuyucusu — `db/*.sql` migration zinciri.
 *
 * NEDEN UZAK VERİTABANI DEĞİL:
 *   - Production hiçbir koşulda tip kaynağı olamaz (GOREV.md §10).
 *   - Staging gate NO-GO (`node scripts/verify-staging-env.mjs` → exit 1).
 *   ⇒ Geriye tek güvenli kaynak olarak repo içindeki migration zinciri kalır.
 *     Bu, GOREV.md §10'un "daha güvenli local migration tabanlı üretim mümkünse
 *     onu tercih et" yönergesiyle de örtüşür ve hiçbir secret/ağ erişimi gerektirmez.
 *
 * KANONİKLİK SINIRI (dürüstlük notu):
 *   `db/staging_migration_inventory.md` "Kritik Gözlem" bölümünde kanıtlandığı gibi
 *   `customers`, `devices`, `service_forms`, `service_form_items` tablolarının
 *   CREATE TABLE migration'ı repoda YOKTUR. Bu okuyucu onları uydurmaz; yalnızca
 *   ALTER/FK üzerinden kanıtlanabilen kolonları toplar ve `unresolved` olarak
 *   işaretler. Kanoniklik iddiası ancak bu boşluk kapatıldığında yapılabilir.
 *
 * Saf ve bağımlılıksızdır (yalnızca node:fs / node:path); çapraz platformdur.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Şema tanımlamayan dosyalar. RLS taslakları, dry-run'lar ve salt-okunur denetim
 * sorguları şemayı TANIMLAMAZ; içlerindeki ifadeler tip üretimine karışmamalıdır.
 */
const EXCLUDED_PREFIXES = ['staging_', 'rls_', 'tenant_rls_', 'read_only_']
/** Test harness'leri şema TANIMLAMAZ; fikstürleri ve `pg_temp` yardımcıları tip yüzeyine girmemeli. */
const EXCLUDED_SUFFIXES = ['_tests.sql', '_test.sql']
const EXCLUDED_FILES = new Set([
  'tenant_audit_checks.sql',
  'tenant_rls_policy_draft.sql',
])

/** CREATE TABLE'ı repoda bulunmayan, kaynağı doğrulanmamış tablolar. */
export const UNRESOLVED_TABLES = ['customers', 'devices', 'service_forms', 'service_form_items']

export function listSchemaFiles(dbDir) {
  return readdirSync(dbDir)
    .filter(name => name.endsWith('.sql'))
    .filter(name => !EXCLUDED_FILES.has(name))
    .filter(name => !EXCLUDED_PREFIXES.some(prefix => name.startsWith(prefix)))
    .filter(name => !EXCLUDED_SUFFIXES.some(suffix => name.endsWith(suffix)))
    .sort() // Deterministik sıra ⇒ tekrarlanabilir çıktı.
}

/** SQL yorumlarını temizler. `$$ ... $$` gövdeleri korunur (fonksiyon metni). */
function stripLineComments(sql) {
  return sql
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--')
      if (idx === -1) return line
      // Tırnak içindeki `--` korunur.
      const before = line.slice(0, idx)
      const quotes = (before.match(/'/g) || []).length
      return quotes % 2 === 0 ? before : line
    })
    .join('\n')
}

/** Dengeli parantez içeriğini çıkarır. */
function extractBalanced(text, startIndex) {
  let depth = 0
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) return { body: text.slice(startIndex + 1, i), end: i }
    }
  }
  return null
}

/** Virgülle ayrılmış kolon tanımlarını, iç parantezleri sayarak böler. */
function splitColumns(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of body) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current)
  return parts.map(p => p.trim()).filter(Boolean)
}

const TABLE_CONSTRAINT_START =
  /^(primary\s+key|foreign\s+key|unique|check|constraint|exclude|like)\b/i

function parseColumnDefinition(raw) {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || TABLE_CONSTRAINT_START.test(text)) return null

  const nameMatch = text.match(/^"?([a-z_][a-z0-9_]*)"?\s+(.+)$/i)
  if (!nameMatch) return null

  const name = nameMatch[1].toLowerCase()
  const rest = nameMatch[2]

  // Tip: ilk token (+ opsiyonel boyut/şema niteleyicisi + dizi işareti)
  const typeMatch = rest.match(/^((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_ ]*?)(\([^)]*\))?(\s*\[\])?(?=\s|$)/i)
  if (!typeMatch) return null

  let sqlType = typeMatch[1].trim().toLowerCase()
  const isArray = Boolean(typeMatch[3])

  // "double precision", "timestamp with time zone" gibi çok kelimeli tipler
  const multiWord = rest.match(/^(double precision|timestamp with time zone|timestamp without time zone|time with time zone|time without time zone|character varying)/i)
  if (multiWord) sqlType = multiWord[1].toLowerCase()

  const notNull = /\bnot\s+null\b/i.test(rest)
  const hasDefault = /\bdefault\b/i.test(rest) || /\bgenerated\b/i.test(rest)
  const isPrimaryKey = /\bprimary\s+key\b/i.test(rest)

  return { name, sqlType, isArray, notNull, hasDefault, isPrimaryKey }
}

function ensureTable(tables, name) {
  if (!tables.has(name)) {
    // `defined`    : CREATE TABLE görüldü.
    // `referenced` : FK hedefi veya açık `alter table` görüldü ⇒ gerçek tablo.
    // İkisi de yoksa yalnızca dinamik bir `array[...]` listesinde geçiyordur
    // ⇒ büyük olasılıkla var olmayan bir tablo adı (drift).
    tables.set(name, { name, columns: new Map(), defined: false, referenced: false })
  }
  return tables.get(name)
}

function addColumn(tables, tableName, column, { fromCreate }) {
  const table = ensureTable(tables, tableName)
  const existing = table.columns.get(column.name)
  if (existing && !fromCreate) {
    // ALTER aynı kolonu tekrar eklerse (idempotent migration) ilk tanım korunur.
    return
  }
  table.columns.set(column.name, column)
}

/**
 * Tek bir SQL dosyasını şema modeline uygular.
 */
function applyFile(model, sql) {
  const clean = stripLineComments(sql)
  const { tables, enums, functions } = model

  // ── CREATE TYPE ... AS ENUM ──
  const enumRe = /create\s+type\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+as\s+enum\s*\(([^)]*)\)/gi
  for (const match of clean.matchAll(enumRe)) {
    const values = [...match[2].matchAll(/'([^']*)'/g)].map(m => m[1])
    enums.set(match[1].toLowerCase(), values)
  }

  // ── CREATE TABLE ──
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi
  for (const match of clean.matchAll(createRe)) {
    const tableName = match[1].toLowerCase()
    const openParen = match.index + match[0].length - 1
    const balanced = extractBalanced(clean, openParen)
    if (!balanced) continue

    const table = ensureTable(tables, tableName)
    table.defined = true
    for (const part of splitColumns(balanced.body)) {
      const column = parseColumnDefinition(part)
      if (column) addColumn(tables, tableName, column, { fromCreate: true })
    }
  }

  // ── FK hedefleri: gerçek tablo kanıtı ──
  for (const match of clean.matchAll(/references\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
    ensureTable(tables, match[1].toLowerCase()).referenced = true
  }

  // ── ALTER TABLE ... ADD COLUMN (tek veya çoklu) ──
  const alterRe = /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+([\s\S]*?);/gi
  for (const match of clean.matchAll(alterRe)) {
    const tableName = match[1].toLowerCase()
    const body = match[2]
    ensureTable(tables, tableName).referenced = true
    const addRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]*?)(?=,\s*add\s+column|$)/gi
    for (const addMatch of body.matchAll(addRe)) {
      const column = parseColumnDefinition(addMatch[1].replace(/;$/, ''))
      if (column) addColumn(tables, tableName, column, { fromCreate: false })
    }
  }

  // ── DO $$ ... $$ blokları: dinamik `format()` ile toplu kolon ekleme ──
  //    (tenant_migration.sql'deki tenant_tables döngüsü ve atomik RPC dosyaları)
  const doRe = /do\s+\$\$([\s\S]*?)\$\$\s*;/gi
  for (const doMatch of clean.matchAll(doRe)) {
    const block = doMatch[1]
    const dynamicAdds = [
      ...block.matchAll(/add\s+column\s+if\s+not\s+exists\s+([a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_ ]*?)(?:\s+references|\s+not\s+null|\s+default|')/gi),
    ]
    if (dynamicAdds.length === 0) continue

    const arrayLiterals = [...block.matchAll(/array\s*\[([\s\S]*?)\]/gi)]
    const targets = new Set()
    for (const arr of arrayLiterals) {
      for (const item of arr[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)) {
        targets.add(item[1].toLowerCase())
      }
    }
    if (targets.size === 0) continue

    for (const add of dynamicAdds) {
      const name = add[1].toLowerCase()
      const sqlType = add[2].trim().toLowerCase()
      const notNull = /not\s+null/i.test(add[0])
      for (const tableName of targets) {
        addColumn(
          tables,
          tableName,
          { name, sqlType, isArray: false, notNull, hasDefault: true, isPrimaryKey: false },
          { fromCreate: false },
        )
      }
    }
  }

  // ── CREATE FUNCTION (RPC imzaları) ──
  const fnRe =
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi
  for (const match of clean.matchAll(fnRe)) {
    const fnName = match[1].toLowerCase()
    const openParen = match.index + match[0].length - 1
    const balanced = extractBalanced(clean, openParen)
    if (!balanced) continue

    const after = clean.slice(balanced.end, balanced.end + 200)
    const returnsMatch = after.match(/returns\s+((?:setof\s+)?[a-z_][a-z0-9_ .]*)/i)

    const args = splitColumns(balanced.body)
      .map(arg => {
        const m = arg
          .replace(/\s+/g, ' ')
          .trim()
          .match(/^(?:in|out|inout|variadic\s+)?\s*([a-z_][a-z0-9_]*)\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_ ]*?)(\[\])?(?:\s+default\s+[\s\S]*)?$/i)
        if (!m) return null
        return {
          name: m[1].toLowerCase(),
          sqlType: m[2].trim().toLowerCase(),
          isArray: Boolean(m[3]),
          optional: /\bdefault\b/i.test(arg),
        }
      })
      .filter(Boolean)

    functions.set(fnName, {
      name: fnName,
      args,
      returns: returnsMatch ? returnsMatch[1].trim().toLowerCase() : 'void',
    })
  }
}

/**
 * `db/` dizinindeki migration zincirini okuyup şema modelini üretir.
 * Ağ erişimi YOKTUR; hiçbir secret okunmaz.
 */
export function readSchemaModel(dbDir) {
  const model = { tables: new Map(), enums: new Map(), functions: new Map() }
  const files = listSchemaFiles(dbDir)

  for (const file of files) {
    applyFile(model, readFileSync(join(dbDir, file), 'utf8'))
  }

  // ── İki farklı boşluk sınıfı ──
  const unresolved = [] // FK/ALTER ile kanıtlı ama CREATE TABLE'ı yok ⇒ gerçek şema boşluğu
  const phantom = []    // yalnızca dinamik `array[...]` listesinde geçiyor ⇒ tablo adı drift'i

  for (const [name, table] of model.tables) {
    if (table.defined) continue
    if (table.referenced) unresolved.push(name)
    else phantom.push(name)
  }

  // Var olmayan tablo adları tip yüzeyine ÇIKARILMAZ.
  for (const name of phantom) model.tables.delete(name)

  return {
    files,
    tables: model.tables,
    enums: model.enums,
    functions: model.functions,
    unresolved: unresolved.sort(),
    phantom: phantom.sort(),
  }
}
