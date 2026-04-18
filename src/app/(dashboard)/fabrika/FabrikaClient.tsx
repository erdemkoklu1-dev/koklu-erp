'use client'

import { useState } from 'react'
import Genel            from './tabs/Genel'
import HammaddeDepo     from './tabs/HammaddeDepo'
import BomRecete        from './tabs/BomRecete'
import UretimEmirleri   from './tabs/UretimEmirleri'
import UrunDepo         from './tabs/UrunDepo'
import DepoHareketleri  from './tabs/DepoHareketleri'
import Raporlar         from './tabs/Raporlar'

const TABS = [
  { id: 'genel',      label: 'Genel Bakış'         },
  { id: 'hammadde',   label: 'Hammadde Deposu'      },
  { id: 'bom',        label: 'Ürün Reçeteleri'      },
  { id: 'emirler',    label: 'Üretim Emirleri'      },
  { id: 'urun-depo',  label: 'Ürün Deposu'          },
  { id: 'hareketler', label: 'Depo Hareketleri'     },
  { id: 'raporlar',   label: 'Raporlar'             },
] as const

type TabId = typeof TABS[number]['id']

export default function FabrikaClient() {
  const [tab, setTab] = useState<TabId>('genel')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-900 mb-4">🏭 Fabrika Yönetimi</h1>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'bg-[#C8102E] text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {tab === 'genel'      && <Genel />}
        {tab === 'hammadde'   && <HammaddeDepo />}
        {tab === 'bom'        && <BomRecete />}
        {tab === 'emirler'    && <UretimEmirleri />}
        {tab === 'urun-depo'  && <UrunDepo />}
        {tab === 'hareketler' && <DepoHareketleri />}
        {tab === 'raporlar'   && <Raporlar />}
      </div>
    </div>
  )
}
