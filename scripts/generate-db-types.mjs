#!/usr/bin/env node
/**
 * Supabase `Database` TypeScript tipini kanonik şema kaynağından üretir.
 *
 * Kullanım:
 *   node scripts/generate-db-types.mjs               # dosyayı yazar
 *   node scripts/generate-db-types.mjs --check       # drift VEYA eksik canonical
 *                                                    # şema varsa exit 1
 *   node scripts/generate-db-types.mjs --drift-only  # yalnızca drift kapısı
 *   node scripts/generate-db-types.mjs --stdout      # içeriği yazdırır
 *
 * İKİ AYRI KAPI — bilinçli olarak ayrıştırılmıştır:
 *   1. DRIFT   : migration zinciri ile commit edilmiş tip dosyası uyuşuyor mu?
 *                Bu kapı bugün YEŞİLDİR ve yeşil kalmalıdır (`--drift-only`).
 *   2. CANONICAL: şema kaynağı gerçekten tam mı? `customers`, `devices`,
 *                `service_forms`, `service_form_items` için CREATE TABLE repoda
 *                YOKTUR; bu tabloların tipleri EKSİKTİR.
 *                Eskiden bu durum yalnızca "UYARI" satırıydı ve `--check` yine
 *                exit 0 dönüyordu ⇒ eksik şemayla "tam tip güncel" izlenimi
 *                veriliyordu. Artık AÇIK BLOKAJ olarak non-zero döner
 *                (GOREV.md §11-8). Boşluk kolon uydurularak KAPATILMAZ.
 *
 * Güvenlik:
 *   - Ağ erişimi YOK. Supabase CLI, project ref, connection string kullanılmaz.
 *   - Hiçbir secret veya project URL okunmaz/yazdırılmaz.
 *   - `--check` repo dosyasını ASLA overwrite etmez.
 *
 * Çapraz platform: yalnızca node:fs / node:path; shell'e özel komut yok.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { readSchemaModel } from './db-schema-source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

// Yol geçersiz kılmaları YALNIZCA test içindir; varsayılan davranış repo yollarıdır.
// Hiçbiri secret veya bağlantı bilgisi taşımaz.
const DB_DIR = process.env.KOKLU_DB_DIR || join(ROOT, 'db')
const OUT_FILE =
  process.env.KOKLU_DB_TYPES_OUT || join(ROOT, 'src', 'types', 'database.generated.ts')

// ─── SQL → TypeScript tip eşlemesi ────────────────────────────────────────────

const SCALAR_TYPES = new Map([
  ['uuid', 'string'],
  ['text', 'string'],
  ['citext', 'string'],
  ['varchar', 'string'],
  ['character varying', 'string'],
  ['char', 'string'],
  ['bpchar', 'string'],
  ['name', 'string'],
  ['int', 'number'],
  ['int2', 'number'],
  ['int4', 'number'],
  ['int8', 'number'],
  ['integer', 'number'],
  ['bigint', 'number'],
  ['smallint', 'number'],
  ['serial', 'number'],
  ['bigserial', 'number'],
  ['numeric', 'number'],
  ['decimal', 'number'],
  ['real', 'number'],
  ['float4', 'number'],
  ['float8', 'number'],
  ['double precision', 'number'],
  ['money', 'number'],
  ['boolean', 'boolean'],
  ['bool', 'boolean'],
  ['date', 'string'],
  ['time', 'string'],
  ['timetz', 'string'],
  ['timestamp', 'string'],
  ['timestamptz', 'string'],
  ['timestamp with time zone', 'string'],
  ['timestamp without time zone', 'string'],
  ['time with time zone', 'string'],
  ['time without time zone', 'string'],
  ['interval', 'string'],
  ['json', 'Json'],
  ['jsonb', 'Json'],
  ['bytea', 'string'],
  ['inet', 'string'],
  ['void', 'undefined'],
  ['trigger', 'unknown'],
  ['record', 'Json'],
])

function tsType(sqlType, isArray, enums) {
  const normalized = String(sqlType || '').replace(/^public\./, '').trim()
  let base = SCALAR_TYPES.get(normalized)

  if (!base && enums.has(normalized)) {
    base = `Database["public"]["Enums"]["${normalized}"]`
  }
  if (!base) base = 'unknown'

  return isArray ? `${base}[]` : base
}

// ─── Kod üretimi ──────────────────────────────────────────────────────────────

function quoteKey(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

function renderTable(table, enums) {
  const columns = [...table.columns.values()].sort((a, b) => a.name.localeCompare(b.name))

  const row = columns
    .map(col => {
      const type = tsType(col.sqlType, col.isArray, enums)
      const nullable = col.notNull || col.isPrimaryKey ? '' : ' | null'
      return `          ${quoteKey(col.name)}: ${type}${nullable}`
    })
    .join('\n')

  const insert = columns
    .map(col => {
      const type = tsType(col.sqlType, col.isArray, enums)
      // NOT NULL + DEFAULT ⇒ insert'te opsiyonel. Nullable ⇒ opsiyonel + null.
      const required = col.notNull && !col.hasDefault && !col.isPrimaryKey
      const nullable = col.notNull || col.isPrimaryKey ? '' : ' | null'
      return `          ${quoteKey(col.name)}${required ? '' : '?'}: ${type}${nullable}`
    })
    .join('\n')

  const update = columns
    .map(col => {
      const type = tsType(col.sqlType, col.isArray, enums)
      const nullable = col.notNull || col.isPrimaryKey ? '' : ' | null'
      return `          ${quoteKey(col.name)}?: ${type}${nullable}`
    })
    .join('\n')

  // ── İlişkiler ──
  // Supabase istemcisi gömülü kaynak sorgularını (`select('a, subeler(ad)')`)
  // yalnızca burada tanımlı ilişkiler üzerinden tip düzeyinde çözer. Boş bırakmak
  // her gömülü sorguyu `SelectQueryError<"could not find the relation…">` yapar.
  // İlişkiler migration'daki gerçek FK'lerden okunur; UYDURULMAZ.
  const relations = [...table.relationships.values()].sort((a, b) => a.column.localeCompare(b.column))
  const relationships = relations.length
    ? relations
        .map(relation =>
          [
            `          {`,
            `            foreignKeyName: "${table.name}_${relation.column}_fkey"`,
            `            columns: [${JSON.stringify(relation.column)}]`,
            `            isOneToOne: ${relation.isOneToOne}`,
            `            referencedRelation: ${JSON.stringify(relation.referencedRelation)}`,
            `            referencedColumns: [${JSON.stringify(relation.referencedColumn)}]`,
            `          }`,
          ].join('\n'),
        )
        .join(',\n')
    : null

  return [
    `      ${quoteKey(table.name)}: {`,
    `        Row: {`,
    row || '          [key: string]: never',
    `        }`,
    `        Insert: {`,
    insert || '          [key: string]: never',
    `        }`,
    `        Update: {`,
    update || '          [key: string]: never',
    `        }`,
    relationships ? `        Relationships: [\n${relationships}\n        ]` : `        Relationships: []`,
    `      }`,
  ].join('\n')
}

function renderFunction(fn, enums) {
  const args = fn.args.length
    ? fn.args
        .map(arg => {
          const type = tsType(arg.sqlType, arg.isArray, enums)
          // SQL tarafında DEFAULT taşıyan argüman hem atlanabilir hem de
          // açıkça NULL geçilebilir; tip bunu yansıtmalıdır.
          return `          ${quoteKey(arg.name)}${arg.optional ? `?: ${type} | null` : `: ${type}`}`
        })
        .join('\n')
    : '          [key: string]: never'

  const returnsRaw = fn.returns.replace(/^setof\s+/, '')
  const isSetOf = /^setof\s+/.test(fn.returns)
  const returnType = tsType(returnsRaw, isSetOf, enums)

  return [
    `      ${quoteKey(fn.name)}: {`,
    `        Args: {`,
    args,
    `        }`,
    `        Returns: ${returnType}`,
    `      }`,
  ].join('\n')
}

export function generate() {
  const model = readSchemaModel(DB_DIR)

  const tables = [...model.tables.values()].sort((a, b) => a.name.localeCompare(b.name))
  const enums = [...model.enums.entries()].sort(([a], [b]) => a.localeCompare(b))
  const functions = [...model.functions.values()]
    // Trigger fonksiyonları ve iç yardımcılar RPC yüzeyi değildir.
    .filter(fn => fn.returns !== 'trigger')
    .sort((a, b) => a.name.localeCompare(b.name))

  const unresolvedNote = model.unresolved.length
    ? model.unresolved.map(name => ` *   - ${name}`).join('\n')
    : ' *   (yok)'

  const phantomNote = model.phantom.length
    ? model.phantom.map(name => ` *   - ${name}`).join('\n')
    : ' *   (yok)'

  const header = `/**
 * OTOMATİK ÜRETİLMİŞTİR — ELLE DÜZENLEMEYİN.
 *
 * Üretici : scripts/generate-db-types.mjs
 * Kaynak  : db/*.sql migration zinciri (${model.files.length} dosya)
 * Komut   : npm run db:types:generate
 * Kontrol : npm run db:types:check   (drift varsa CI düşer)
 *
 * Bu dosya elle değiştirilirse \`db:types:check\` non-zero döner.
 * Şema değişikliği yapıldığında migration'ı yazın ve üreticiyi tekrar çalıştırın.
 *
 * ── KANONİKLİK SINIRI ──────────────────────────────────────────────────────
 * Aşağıdaki tablolar migration zincirinde yalnızca FK/ALTER üzerinden görülüyor;
 * CREATE TABLE tanımları repoda YOK (bkz. db/staging_migration_inventory.md,
 * "Kritik Gözlem"). Kolonları UYDURULMAMIŞTIR — yalnızca kanıtlanabilenler
 * listelenmiştir, bu yüzden bu tabloların tipleri EKSİKTİR:
${unresolvedNote}
 *
 * Bu boşluk kapatılmadan "migration zinciri kanoniktir" denemez.
 * Çözüm: eksik CREATE TABLE migration'ları repoya eklenmeli veya Gate 0'dan
 * geçmiş bir staging şemasından schema-only tanım alınmalıdır.
 *
 * ── TENANT LİSTESİ DRIFT'İ ─────────────────────────────────────────────────
 * Aşağıdaki adlar \`db/tenant_migration.sql\` gibi dinamik tablo listelerinde
 * geçiyor ama repoda böyle bir tablo YOK (ne CREATE ne FK). O migration
 * \`if to_regclass(...) is not null\` ile koruduğu için bu tablolar SESSİZCE
 * atlanmıştır — yani hedeflenen \`firma_id\` kolonunu hiç almamışlardır.
 * (Denetim raporundaki S1 / \`proforma_kalemleri\` bulgusunun aynı sınıfı.)
${phantomNote}
 * ───────────────────────────────────────────────────────────────────────────
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** CREATE TABLE tanımı repoda bulunmayan ama FK/ALTER ile kanıtlı tablolar. */
export const UNRESOLVED_SCHEMA_TABLES = ${JSON.stringify(model.unresolved)} as const

/** Dinamik migration listelerinde geçen ama repoda karşılığı olmayan tablo adları. */
export const PHANTOM_TENANT_TABLES = ${JSON.stringify(model.phantom)} as const

export type Database = {
  public: {
    Tables: {
${tables.map(table => renderTable(table, model.enums)).join('\n')}
    }
    Views: Record<string, never>
    Functions: {
${functions.map(fn => renderFunction(fn, model.enums)).join('\n')}
    }
    Enums: {
${enums.map(([name, values]) => `      ${quoteKey(name)}: ${values.map(v => JSON.stringify(v)).join(' | ') || 'never'}`).join('\n')}
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
`

  return { content: header, model }
}

/** Satır sonu ve sondaki boşluk farklarını yok sayan karşılaştırma. */
function normalize(text) {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()
}

/** Şema boşlukları HER çalıştırmada raporlanır ki sessizce unutulmasın. */
function reportGaps(model) {
  if (model.unresolved.length) {
    console.log(`UYARI: CREATE TABLE migration'ı bulunmayan ${model.unresolved.length} tablo: ${model.unresolved.join(', ')}`)
    console.log('       Tipleri EKSİKTİR; şema kaynağı doğrulanana kadar kanoniklik iddia edilemez.')
  }
  if (model.phantom.length) {
    console.log(`UYARI: dinamik migration listelerinde geçen ama repoda karşılığı olmayan ${model.phantom.length} tablo adı:`)
    console.log(`       ${model.phantom.join(', ')}`)
    console.log('       Bu adlar tenant migration tarafından SESSİZCE atlanmıştır (firma_id eklenmemiştir).')
  }
}

/**
 * Canonical şema tamlık kapısı.
 *
 * `unresolved` = migration zincirinde FK/ALTER ile GÖRÜLEN ama CREATE TABLE
 * tanımı repoda BULUNMAYAN tablolar. Bu tabloların generated tipi eksiktir;
 * `createClient<Database>` ile bağlanan kod onlara güvenle dayanamaz.
 *
 * Kolonları uygulama sorgularından tahmin ederek CREATE TABLE yazmak GOREV.md
 * §11 tarafından açıkça yasaklanmıştır. Bu yüzden kapı, boşluğu gizlemek yerine
 * non-zero döndürür ve kapatma yolunu yazar.
 *
 * @returns {boolean} true ⇒ blokaj var
 */
function reportCanonicalGap(model) {
  if (model.unresolved.length === 0) return false

  console.error('BLOKE: canonical şema eksik — generated tipler TAM DEĞİL.')
  console.error(`  CREATE TABLE migration'ı bulunmayan ${model.unresolved.length} tablo:`)
  for (const name of model.unresolved) console.error(`    - ${name}`)
  console.error('  Bu tabloların kolonları TAHMİN EDİLMEZ; tip yüzeyi eksik bırakılmıştır.')
  console.error('  Kapatma yolu (yalnızca biri):')
  console.error('    a) eksik CREATE TABLE migration’larını repoya ekleyin, veya')
  console.error('    b) staging Gate 0 (node scripts/verify-staging-env.mjs → exit 0)')
  console.error('       geçtikten sonra staging’den schema-only tanım alın.')
  console.error('  Yalnızca drift kapısını çalıştırmak için: npm run db:types:drift')
  return true
}

function main() {
  const args = process.argv.slice(2)
  const isDriftOnly = args.includes('--drift-only')
  const isCheck = args.includes('--check') || isDriftOnly
  const isStdout = args.includes('--stdout')

  const { content, model } = generate()

  if (isStdout) {
    process.stdout.write(content)
    return
  }

  if (isCheck) {
    let current
    try {
      current = readFileSync(OUT_FILE, 'utf8')
    } catch {
      console.error('DRIFT: generated tip dosyası bulunamadı.')
      console.error(`  Beklenen: ${relative(ROOT, OUT_FILE)}`)
      console.error('  Çözüm   : npm run db:types:generate')
      process.exit(1)
    }

    if (normalize(current) !== normalize(content)) {
      console.error('DRIFT: migration zinciri ile commit edilmiş tip dosyası uyuşmuyor.')
      console.error(`  Dosya : ${relative(ROOT, OUT_FILE)}`)
      console.error(`  Kaynak: db/*.sql (${model.files.length} dosya)`)
      console.error('  Çözüm : npm run db:types:generate  (sonra değişikliği commit edin)')
      console.error('  Not   : bu kontrol repo dosyasını DEĞİŞTİRMEZ.')
      process.exit(1)
    }

    console.log(`OK: drift yok — generated tipler migration zinciriyle uyumlu (${model.tables.size} tablo, ${model.enums.size} enum).`)
    reportGaps(model)

    if (isDriftOnly) return

    // Drift yok demek "şema tam" demek DEĞİLDİR. Canonical kapı ayrıca çalışır.
    if (reportCanonicalGap(model)) process.exit(1)

    console.log('OK: canonical şema tam — CREATE TABLE kaynağı olmayan tablo yok.')
    return
  }

  writeFileSync(OUT_FILE, content, 'utf8')
  console.log(`Yazıldı: ${relative(ROOT, OUT_FILE)}`)
  console.log(`  ${model.tables.size} tablo, ${model.enums.size} enum, kaynak: db/*.sql (${model.files.length} dosya)`)
  reportGaps(model)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
