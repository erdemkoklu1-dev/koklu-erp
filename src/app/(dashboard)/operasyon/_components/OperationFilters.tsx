import Link from 'next/link'

type Sube = { id: string; ad: string | null }

type Props = {
  action: string
  subeler: Sube[]
  values: {
    q?: string
    sube?: string
    durum?: string
    baslangic?: string
    bitis?: string
  }
  durumlar?: Array<string | { value: string; label: string }>
  searchPlaceholder?: string
  lockedSubeId?: string | null
}

export default function OperationFilters({ action, subeler, values, durumlar, searchPlaceholder = 'Ara', lockedSubeId = null }: Props) {
  const selectedSube = lockedSubeId ?? values.sube ?? ''

  return (
    <form action={action} className="no-print grid gap-3 rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-6">
      {lockedSubeId && <input type="hidden" name="sube" value={lockedSubeId} />}
      <input
        name="q"
        defaultValue={values.q ?? ''}
        placeholder={searchPlaceholder}
        className="rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 md:col-span-2"
      />
      <select
        name={lockedSubeId ? undefined : 'sube'}
        defaultValue={selectedSube}
        disabled={!!lockedSubeId}
        className="rounded-md border px-3 py-2 text-sm disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:disabled:bg-gray-800"
      >
        {!lockedSubeId && <option value="">Tüm şubeler</option>}
        {subeler.map(sube => <option key={sube.id} value={sube.id}>{sube.ad}</option>)}
      </select>
      {durumlar ? (
        <select name="durum" defaultValue={values.durum ?? ''} className="rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">Tüm durumlar</option>
          {durumlar.map(durum => {
            const option = typeof durum === 'string' ? { value: durum, label: durum } : durum
            return <option key={option.value} value={option.value}>{option.label}</option>
          })}
        </select>
      ) : (
        <div className="hidden md:block" />
      )}
      <input type="date" name="baslangic" defaultValue={values.baslangic ?? ''} className="rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      <input type="date" name="bitis" defaultValue={values.bitis ?? ''} className="rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
      <div className="flex gap-2 md:col-span-6">
        <button className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25]">
          Uygula
        </button>
        <Link href={action} className="rounded-md border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
          Temizle
        </Link>
      </div>
    </form>
  )
}
