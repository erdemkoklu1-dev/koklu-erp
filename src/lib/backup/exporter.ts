import AdmZip from 'adm-zip'
import { createServiceClient } from '@/lib/supabase/service'
import {
  BACKUP_STORAGE_BUCKET,
  BACKUP_TABLES,
  FULL_BACKUP_TABLE_KEYS,
  type BackupTableConfig,
  type BackupTableKey,
} from './config'
import type { AuthorizedBackupUser } from './authorization'

type BackupType = 'full' | 'selected' | 'automatic'

type BuildBackupOptions = {
  type: BackupType
  selectedTables?: string[]
  saveToStorage?: boolean
  createdBy: AuthorizedBackupUser
}

export type BackupBuildResult = {
  backupId: string
  filename: string
  buffer: Buffer
  manifest: Record<string, unknown>
  storagePath: string | null
  rowCounts: Record<string, number>
  totalRows: number
  errors: Record<string, string>
}

function resolveTables(type: BackupType, selectedTables?: string[]) {
  if (type === 'full' || type === 'automatic') {
    return BACKUP_TABLES.filter(table => FULL_BACKUP_TABLE_KEYS.includes(table.key))
  }

  const selected = new Set(selectedTables ?? [])
  return BACKUP_TABLES.filter(table => selected.has(table.key))
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sanitizeSettings(rows: Array<Record<string, unknown>>) {
  return rows.map(row => ({
    ...row,
    value: row.value ? '[MASKED]' : row.value,
  }))
}

async function readTableRows(table: BackupTableConfig) {
  const supabase = createServiceClient()
  let query = supabase.from(table.table).select('*')
  for (const filter of table.filters ?? []) {
    query = query.eq(filter.column, filter.value)
  }
  if (table.orderBy) query = query.order(table.orderBy, { ascending: true })

  const { data, error } = await query
  if (error) throw error

  const rows = table.sensitive ? sanitizeSettings(data ?? []) : (data ?? [])
  return rows
}

export async function buildBackupZip(options: BuildBackupOptions): Promise<BackupBuildResult> {
  const tables = resolveTables(options.type, options.selectedTables)
  if (tables.length === 0) {
    throw new Error('En az bir tablo secilmeli.')
  }

  const backupId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const rowCounts: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const zip = new AdmZip()

  for (const table of tables) {
    try {
      const rows = await readTableRows(table)
      rowCounts[table.key] = rows.length
      zip.addFile(`${table.key}.json`, Buffer.from(JSON.stringify(rows, null, 2), 'utf8'))
    } catch (error) {
      rowCounts[table.key] = 0
      errors[table.key] = error instanceof Error ? error.message : 'Tablo okunamadi'
      zip.addFile(`${table.key}.json`, Buffer.from(JSON.stringify([], null, 2), 'utf8'))
    }
  }

  const manifest: Record<string, unknown> = {
    backup_id: backupId,
    created_at: createdAt,
    created_by: {
      id: options.createdBy.id,
      email: options.createdBy.email,
      name: options.createdBy.name,
      role: options.createdBy.role,
    },
    backup_type: options.type,
    included_tables: tables.map(table => table.key),
    physical_tables: Object.fromEntries(tables.map(table => [table.key, table.table])),
    row_counts: rowCounts,
    app_version: process.env.npm_package_version ?? '0.1.0',
    errors,
  }

  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))

  const buffer = zip.toBuffer()
  const totalRows = Object.values(rowCounts).reduce((sum, count) => sum + count, 0)
  const stamp = backupTimestamp()
  const tableSlug = tables.length === 1 ? tables[0].key : `${tables[0].key}-${tables.length}-tables`
  const filename = options.type === 'full' || options.type === 'automatic'
    ? `${stamp}-${options.type}.zip`
    : `${stamp}-${tableSlug}.zip`

  let storagePath: string | null = null
  if (options.saveToStorage) {
    const folder = options.type === 'full' || options.type === 'automatic' ? 'full' : 'selected'
    storagePath = `${folder}/${filename}`
    const supabase = createServiceClient()
    const { error } = await supabase.storage
      .from(BACKUP_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'application/zip',
        upsert: false,
      })

    if (error) {
      storagePath = null
      errors.storage = error.message
    }
  }

  return { backupId, filename, buffer, manifest, storagePath, rowCounts, totalRows, errors }
}

export function parseSelectedTables(input: unknown): BackupTableKey[] {
  if (!Array.isArray(input)) return []
  const allowed = new Set(BACKUP_TABLES.map(table => table.key))
  return input.filter((key): key is BackupTableKey => typeof key === 'string' && allowed.has(key as BackupTableKey))
}
