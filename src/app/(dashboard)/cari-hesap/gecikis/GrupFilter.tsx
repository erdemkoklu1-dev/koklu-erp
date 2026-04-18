'use client'
import { useRouter, useSearchParams } from 'next/navigation'

export default function GrupFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const grupla = searchParams.get('grupla')

  function toggle(e: React.ChangeEvent<HTMLInputElement>) {
    const url = new URL(window.location.href)
    if (e.target.checked) {
      url.searchParams.set('grupla', '1')
    } else {
      url.searchParams.delete('grupla')
    }
    router.push(url.pathname + url.search)
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
      <input
        type="checkbox"
        defaultChecked={!!grupla}
        onChange={toggle}
        className="rounded border-gray-300 text-[#C8102E] focus:ring-[#C8102E]"
      />
      Tedarikçiye göre grupla
    </label>
  )
}
