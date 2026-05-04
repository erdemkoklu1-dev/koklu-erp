import { requireBackupPageAccess } from '@/lib/backup/authorization'
import { BACKUP_TABLES, TABLE_EXPORT_GROUPS } from '@/lib/backup/config'
import YedeklemeClient from './YedeklemeClient'

export default async function YedeklemePage() {
  await requireBackupPageAccess()

  return (
    <YedeklemeClient
      tables={BACKUP_TABLES.map(table => ({ key: table.key, label: table.label }))}
      groups={TABLE_EXPORT_GROUPS.map(group => ({ key: group.key, label: group.label, tables: [...group.tables] }))}
    />
  )
}
