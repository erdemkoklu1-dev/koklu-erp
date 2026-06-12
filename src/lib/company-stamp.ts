import { createServiceClient } from '@/lib/supabase/service'

export type CompanyStampSettings = {
  stampDataUrl: string | null
  stampFileName: string | null
  defaultStamped: boolean
  updatedAt: string | null
  scope: 'global' | 'branch'
  branchId: string | null
}

const GLOBAL_KEY = 'company_stamp_settings'

function branchKey(branchId: string) {
  return `${GLOBAL_KEY}:${branchId}`
}

function parseSettings(value: string | null | undefined, scope: 'global' | 'branch', branchId: string | null): CompanyStampSettings | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<CompanyStampSettings>
    return {
      stampDataUrl: typeof parsed.stampDataUrl === 'string' && parsed.stampDataUrl ? parsed.stampDataUrl : null,
      stampFileName: typeof parsed.stampFileName === 'string' && parsed.stampFileName ? parsed.stampFileName : null,
      defaultStamped: Boolean(parsed.defaultStamped),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      scope,
      branchId,
    }
  } catch {
    return null
  }
}

export async function getCompanyStampSettings(branchId?: string | null): Promise<CompanyStampSettings> {
  const supabase = createServiceClient()
  const keys = branchId ? [branchKey(branchId), GLOBAL_KEY] : [GLOBAL_KEY]
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', keys)

  const rows = new Map((data ?? []).map(row => [row.key as string, row.value as string | null]))

  if (branchId) {
    const branchSettings = parseSettings(rows.get(branchKey(branchId)), 'branch', branchId)
    if (branchSettings) return branchSettings
  }

  return parseSettings(rows.get(GLOBAL_KEY), 'global', null) ?? {
    stampDataUrl: null,
    stampFileName: null,
    defaultStamped: false,
    updatedAt: null,
    scope: 'global',
    branchId: null,
  }
}

export async function saveCompanyStampSettings(input: {
  stampDataUrl?: string | null
  stampFileName?: string | null
  defaultStamped: boolean
  branchId?: string | null
}) {
  const supabase = createServiceClient()
  const key = input.branchId ? branchKey(input.branchId) : GLOBAL_KEY
  const value = JSON.stringify({
    stampDataUrl: input.stampDataUrl ?? null,
    stampFileName: input.stampFileName ?? null,
    defaultStamped: input.defaultStamped,
    updatedAt: new Date().toISOString(),
  })

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) throw error
}
