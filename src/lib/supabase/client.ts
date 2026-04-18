import { createBrowserClient } from '@supabase/ssr'

// Singleton: tarayıcıda tek bir Supabase client örneği kullan.
// Önceki pattern her render'da yeni instance yaratıyordu (bellek israfı).
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}
