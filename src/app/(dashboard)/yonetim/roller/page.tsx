import { createServiceClient } from '@/lib/supabase/service'
import RollerClient from './RollerClient'

export default async function RollerPage() {
  const supabase = createServiceClient()

  const [{ data: roller }, { data: izinler }] = await Promise.all([
    supabase.from('roller').select('*').order('ad'),
    supabase.from('modul_izinleri').select('*'),
  ])

  return <RollerClient roller={roller ?? []} izinler={izinler ?? []} />
}
