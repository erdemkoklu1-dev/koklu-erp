'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Sube = { id: string; ad: string }

interface SubeSelectProps {
  value: string | null
  onChange: (subeId: string) => void
  required?: boolean
  label?: string
  className?: string
}

export default function SubeSelect({ value, onChange, required, label = 'Şube', className }: SubeSelectProps) {
  const [subeler, setSubeler] = useState<Sube[]>([])

  useEffect(() => {
    createClient().from('subeler').select('id, ad').order('ad')
      .then(({ data }: { data: any; error: any }) => { if (data) setSubeler(data as Sube[]) })
  }, [])

  return (
    <div className={className}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white"
      >
        <option value="">— Şube seçin</option>
        {subeler.map(s => (
          <option key={s.id} value={s.id}>{s.ad}</option>
        ))}
      </select>
    </div>
  )
}
