import { createServiceClient } from '@/lib/supabase/service'

/**
 * Önce ortam değişkenini, yoksa Supabase app_settings tablosunu kontrol eder.
 */
export async function getSetting(dbKey: string, envKey: string): Promise<string | null> {
  const envVal = process.env[envKey]
  if (envVal) return envVal

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', dbKey)
      .single()
    return data?.value ?? null
  } catch {
    return null
  }
}
