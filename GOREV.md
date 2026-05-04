# GOREV

## Kalan Takip

- [ ] Canli ortamda servis formu ZIP yedegi ile dry-run testi yapilacak.
- [ ] Kullanici onayi sonrasi servis formlari import testi yapilacak.
- [ ] Ayni ZIP ikinci kez import edilerek duplicate kayitlarin atlandigi dogrulanacak.
# GÖREV: Yedekleme Geri Yükleme + Giriş Kayıtları Otomatik Temizleme

## 2 ana iş var.

---

## BÖLÜM 1: GERÇEK GERİ YÜKLEME (Servis Formları)

### 1.1 Mevcut Durum
- `/yonetim/yedekleme` sayfası mevcut
- Dry-run (önizleme) çalışıyor — ZIP yüklenince "2 tablo, 5 kayıt bulundu" diyor
- Gerçek geri yükleme (import) yapılmıyor
- service_form_items tablosu "Tablo okunamadi" hatası veriyor (boş tablo)

### 1.2 ZIP Yedek Yapısı

```
backup.zip
├── manifest.json          — yedek meta bilgileri
├── service_forms.json     — servis formları (ana tablo)
└── service_form_items.json — servis form kalemleri (alt tablo)
```

**manifest.json örneği:**
```json
{
  "backup_id": "ec34d168-...",
  "created_at": "2026-05-04T19:07:52.470Z",
  "created_by": { "id": "...", "email": "admin@koklu.com", "name": "Admin", "role": "Admin" },
  "backup_type": "selected",
  "included_tables": ["service_forms", "service_form_items"],
  "row_counts": { "service_forms": 5, "service_form_items": 0 }
}
```

**service_forms.json örneği (her kayıt):**
```json
{
  "id": "3dab1bcb-5887-4140-a24d-054ab084a9b8",
  "form_number": "SF-2026-16483",
  "customer_id": "f6e83f9d-681d-4f16-b1f2-40ddb8085daa",
  "technician_name": "Erdem Köklü",
  "service_date": "2026-03-29",
  "status": "completed",
  "general_notes": "Deneme Kayıt",
  "created_by": null,
  "created_at": "2026-03-29T15:41:56.963104+00:00",
  "control_number": 4,
  "customer_note": "Bu kayıt deneme amaçlı oluşturulmuştur.",
  "next_service_date": "2026-07-21",
  "sube_id": null
}
```

### 1.3 Geri Yükleme Akışı

Mevcut dry-run akışını koru. Sonrasına "Geri Yükle" butonu ekle:

```
1. Kullanıcı ZIP yükler
2. Dry-run çalışır → "2 tablo, 5 kayıt bulundu" gösterilir
3. Her kayıt için duplicate kontrolü yapılır:
   - service_forms.id ile mevcut veritabanında arama
   - Varsa → "ATLANACAK (zaten var)" olarak işaretle
   - Yoksa → "EKLENECEK" olarak işaretle
4. Önizleme tablosu gösterilir:
   | Tablo | Toplam | Eklenecek | Atlanacak (duplicate) | 
   |-------|--------|-----------|----------------------|
   | service_forms | 5 | 2 | 3 |
   | service_form_items | 0 | 0 | 0 |
5. Kullanıcı "Geri Yükle" butonuna tıklar
6. Onay dialogu: "2 servis formu eklenecek, 3 kayıt atlanacak. Devam etmek istiyor musunuz?"
7. Onaylarsa gerçek import başlar
8. Sonuç özeti gösterilir
```

### 1.4 API Endpoint — Gerçek Geri Yükleme

Dosya: Mevcut yedekleme API'sine ek endpoint veya aynı endpoint'e `action: 'restore'` parametresi ekle.

```typescript
// POST /api/yedekleme/restore
export async function POST(request: NextRequest) {
  // 1. Yetki kontrolü — sadece Admin ve Yönetici
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 });
  
  // Kullanıcı rolünü kontrol et
  const { data: profil } = await supabase
    .from('kullanici_profiller')
    .select('rol')
    .eq('id', user.id)
    .single();
  
  if (!profil || !['Admin', 'Yönetici'].includes(profil.rol)) {
    return NextResponse.json({ error: 'Bu işlem için Admin veya Yönetici yetkisi gerekli' }, { status: 403 });
  }
  
  // 2. ZIP'i parse et
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const mode = formData.get('mode') as string; // 'dry-run' veya 'restore'
  
  const buffer = Buffer.from(await file.arrayBuffer());
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(buffer);
  
  // manifest.json oku
  const manifestEntry = zip.getEntry('manifest.json');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  
  // 3. Her tablo için işle
  const results = {
    tables: {} as Record<string, { total: number; inserted: number; skipped: number; errors: string[] }>,
  };
  
  for (const tableName of manifest.included_tables) {
    const entry = zip.getEntry(`${tableName}.json`);
    if (!entry) {
      results.tables[tableName] = { total: 0, inserted: 0, skipped: 0, errors: ['Dosya bulunamadı'] };
      continue;
    }
    
    const records = JSON.parse(entry.getData().toString('utf8'));
    if (!Array.isArray(records) || records.length === 0) {
      results.tables[tableName] = { total: 0, inserted: 0, skipped: 0, errors: [] };
      continue;
    }
    
    const tableResult = { total: records.length, inserted: 0, skipped: 0, errors: [] as string[] };
    
    // 4. Duplicate kontrolü — mevcut ID'leri çek
    const existingIds = new Set<string>();
    const ids = records.map((r: any) => r.id).filter(Boolean);
    
    if (ids.length > 0) {
      // Supabase'de batch olarak kontrol et (50'şerli gruplar)
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { data: existing } = await supabase
          .from(tableName)
          .select('id')
          .in('id', batch);
        
        if (existing) {
          existing.forEach((r: any) => existingIds.add(r.id));
        }
      }
    }
    
    if (mode === 'dry-run') {
      // Sadece sayıları döndür
      tableResult.inserted = records.filter((r: any) => !existingIds.has(r.id)).length;
      tableResult.skipped = records.filter((r: any) => existingIds.has(r.id)).length;
    } else {
      // GERÇEK GERİ YÜKLEME
      const toInsert = records.filter((r: any) => !existingIds.has(r.id));
      
      if (toInsert.length > 0) {
        // Batch insert (50'şerli gruplar)
        for (let i = 0; i < toInsert.length; i += 50) {
          const batch = toInsert.slice(i, i + 50);
          const { data, error } = await supabase
            .from(tableName)
            .insert(batch);
          
          if (error) {
            tableResult.errors.push(`Batch ${i}: ${error.message}`);
          } else {
            tableResult.inserted += batch.length;
          }
        }
      }
      
      tableResult.skipped = existingIds.size;
    }
    
    results.tables[tableName] = tableResult;
  }
  
  return NextResponse.json({
    mode,
    backup_id: manifest.backup_id,
    backup_date: manifest.created_at,
    results,
  });
}
```

### 1.5 Frontend — Geri Yükleme UI

Mevcut "Geri Yükleme Önizleme" bölümüne ekle:

```tsx
// Dry-run sonucu gösterildikten sonra:

{dryRunResult && (
  <div className="mt-4">
    {/* Önizleme tablosu */}
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-100 dark:bg-gray-700">
          <th className="p-2 text-left">Tablo</th>
          <th className="p-2 text-center">Toplam</th>
          <th className="p-2 text-center text-green-600">Eklenecek</th>
          <th className="p-2 text-center text-yellow-600">Atlanacak</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(dryRunResult.results.tables).map(([table, info]) => (
          <tr key={table} className="border-b dark:border-gray-600">
            <td className="p-2 font-medium">{table}</td>
            <td className="p-2 text-center">{info.total}</td>
            <td className="p-2 text-center text-green-600 font-bold">{info.inserted}</td>
            <td className="p-2 text-center text-yellow-600">{info.skipped}</td>
          </tr>
        ))}
      </tbody>
    </table>
    
    {/* Geri Yükle butonu */}
    <div className="flex gap-3 mt-4">
      <button
        onClick={handleRestore}
        disabled={restoring || totalInsertable === 0}
        className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50"
      >
        {restoring ? 'Geri yükleniyor...' : `Geri Yükle (${totalInsertable} kayıt)`}
      </button>
      <button
        onClick={() => setDryRunResult(null)}
        className="border px-4 py-2 rounded dark:border-gray-600"
      >
        İptal
      </button>
    </div>
  </div>
)}
```

### 1.6 Onay Dialogu

```tsx
const handleRestore = () => {
  const insertCount = Object.values(dryRunResult.results.tables)
    .reduce((sum, t) => sum + t.inserted, 0);
  const skipCount = Object.values(dryRunResult.results.tables)
    .reduce((sum, t) => sum + t.skipped, 0);
  
  const confirmed = window.confirm(
    `${insertCount} kayıt eklenecek, ${skipCount} kayıt atlanacak (zaten mevcut).\n\nDevam etmek istiyor musunuz?`
  );
  
  if (!confirmed) return;
  
  performRestore();
};

const performRestore = async () => {
  setRestoring(true);
  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('mode', 'restore');
  
  try {
    const res = await fetch('/api/yedekleme/restore', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    
    if (res.ok) {
      const inserted = Object.values(data.results.tables)
        .reduce((sum, t) => sum + t.inserted, 0);
      const skipped = Object.values(data.results.tables)
        .reduce((sum, t) => sum + t.skipped, 0);
      const errors = Object.values(data.results.tables)
        .flatMap(t => t.errors);
      
      setRestoreResult({ inserted, skipped, errors });
      // Başarı mesajı göster
      alert(`Geri yükleme tamamlandı!\n${inserted} kayıt eklendi\n${skipped} kayıt atlandı${errors.length > 0 ? '\n\nHatalar:\n' + errors.join('\n') : ''}`);
    } else {
      alert('Geri yükleme hatası: ' + (data.error || 'Bilinmeyen hata'));
    }
  } catch (error) {
    alert('Bağlantı hatası');
  } finally {
    setRestoring(false);
  }
};
```

### 1.7 service_form_items Hatası Düzeltme

Manifest'te `"service_form_items": "Tablo okunamadi"` hatası var. Bu muhtemelen yedek alırken service_form_items tablosuna erişim hatası (RLS policy veya tablo adı sorunu).

**Yedek alma fonksiyonunu kontrol et:**
- `service_form_items` tablosunun Supabase'de var olduğunu doğrula
- RLS policy'sinin SELECT izni verdiğini kontrol et
- Tablo adının doğru yazıldığından emin ol

```sql
-- Kontrol:
SELECT * FROM public.service_form_items LIMIT 5;

-- RLS policy yoksa ekle:
CREATE POLICY IF NOT EXISTS "sfi_select" ON public.service_form_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY IF NOT EXISTS "sfi_insert" ON public.service_form_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
```

### 1.8 Sıralama: Önce Ana Tablo, Sonra Alt Tablo

Geri yüklemede sıralama önemli — FK constraint'ler nedeniyle:

```typescript
// Geri yükleme sırası:
const RESTORE_ORDER = [
  'service_forms',       // Önce ana tablo
  'service_form_items',  // Sonra alt tablo (service_forms.id'ye FK var)
];

// Tablolarını bu sırada işle:
for (const tableName of RESTORE_ORDER) {
  if (manifest.included_tables.includes(tableName)) {
    // ... insert işlemi
  }
}
```

---

## BÖLÜM 2: GİRİŞ/ÇIKIŞ KAYITLARI OTOMATİK TEMİZLEME

### 2.1 Sorun
`giris_kayitlari` tablosu her giriş/çıkış işleminde kayıt ekliyor. Zamanla bu tablo çok büyüyecek ve veritabanını şişirecek. 15 günden eski kayıtlar otomatik silinmeli.

### 2.2 Çözüm: Supabase Scheduled Function (pg_cron) veya API-based Cleanup

**Yöntem A: Supabase SQL — pg_cron ile (En İyi)**

Supabase SQL Editor'da çalıştır:

```sql
-- 1. pg_cron extension'ını aktifle (Supabase Pro planda mevcut)
-- Supabase Dashboard → Database → Extensions → pg_cron → Enable

-- 2. Temizleme fonksiyonu oluştur
CREATE OR REPLACE FUNCTION cleanup_old_giris_kayitlari()
RETURNS void AS $$
BEGIN
  DELETE FROM public.giris_kayitlari
  WHERE created_at < NOW() - INTERVAL '15 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Her gece 03:00'te çalıştır
SELECT cron.schedule(
  'cleanup-giris-kayitlari',     -- job adı
  '0 3 * * *',                    -- cron pattern: her gün saat 03:00
  'SELECT cleanup_old_giris_kayitlari()'
);
```

**NOT:** pg_cron Supabase Free planda çalışmayabilir. O durumda Yöntem B kullan.

**Yöntem B: API Route + Vercel Cron**

```typescript
// src/app/api/cron/cleanup-logs/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Cron job güvenliği — secret key kontrolü
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // 15 günden eski kayıtları sil
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  
  const { data, error, count } = await supabase
    .from('giris_kayitlari')
    .delete()
    .lt('created_at', fifteenDaysAgo.toISOString())
    .select('id', { count: 'exact' });
  
  if (error) {
    console.error('Cleanup hatası:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  console.log(`${count || 0} eski giriş kaydı silindi`);
  
  return NextResponse.json({
    success: true,
    deleted: count || 0,
    cutoff_date: fifteenDaysAgo.toISOString(),
  });
}
```

**Vercel Cron ayarı — `vercel.json`:**

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-logs",
      "schedule": "0 3 * * *"
    }
  ]
}
```

**CRON_SECRET env variable ekle:**
- Vercel Dashboard → Environment Variables → `CRON_SECRET` = rastgele bir string (ör: `koklu-cron-secret-2026`)
- `.env.local`'a da ekle

### 2.3 RLS Policy — DELETE İzni

`giris_kayitlari` tablosunda DELETE policy olduğundan emin ol:

```sql
-- Service role key ile silme yapıldığı için RLS bypass edilir
-- Ama güvenlik için policy de ekle:
CREATE POLICY IF NOT EXISTS "gk_delete" ON public.giris_kayitlari
  FOR DELETE USING (auth.uid() IS NOT NULL);
```

### 2.4 Yönetim Sayfasında Manuel Temizleme Butonu

`/yonetim` → Giriş/Çıkış Kayıtları sayfasına "Eski Kayıtları Temizle" butonu ekle:

```tsx
<button
  onClick={async () => {
    const confirmed = window.confirm(
      '15 günden eski tüm giriş/çıkış kayıtları silinecek. Devam etmek istiyor musunuz?'
    );
    if (!confirmed) return;
    
    setCleaningUp(true);
    try {
      const res = await fetch('/api/cron/cleanup-logs', {
        headers: { Authorization: `Bearer ${CRON_SECRET}` }
      });
      // Veya direkt Supabase'den:
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
      
      const { error, count } = await supabase
        .from('giris_kayitlari')
        .delete()
        .lt('created_at', fifteenDaysAgo.toISOString());
      
      if (error) throw error;
      alert(`${count || 0} eski kayıt silindi.`);
      // Tabloyu yenile
      fetchKayitlar();
    } catch (err) {
      alert('Temizleme hatası: ' + err.message);
    } finally {
      setCleaningUp(false);
    }
  }}
  className="border border-yellow-500 text-yellow-700 px-4 py-2 rounded hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
>
  🗑️ 15 Günden Eski Kayıtları Temizle
</button>
```

### 2.5 Giriş/Çıkış Sayfasında Bilgi Notu

Sayfanın üstüne küçük bir bilgi notu ekle:

```tsx
<div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded text-sm text-blue-700 dark:text-blue-300 mb-4">
  ℹ️ Giriş/çıkış kayıtları 15 günden eski olanlar otomatik temizlenir.
  Son temizleme: {lastCleanupDate || 'Henüz yapılmadı'}
</div>
```

---

## UYGULAMA SIRASI

1. **service_form_items RLS policy kontrol/düzelt** (Supabase SQL Editor)
2. **Geri yükleme API endpoint'i oluştur** (dry-run + restore mode)
3. **Frontend: önizleme tablosu + Geri Yükle butonu + onay dialogu**
4. **Giriş kayıtları cleanup API route** (`/api/cron/cleanup-logs`)
5. **vercel.json cron ayarı**
6. **Yönetim sayfasına manuel temizle butonu**
7. **Test et**

## ⚠️ DİKKAT
- Sadece servis formları için geri yükleme aç — diğer tablolar (customers, faturalar) için AÇMA
- Duplicate kontrolü ID bazlı — aynı ID varsa ATLA, ekleme
- FK sıralamasına dikkat: önce service_forms, sonra service_form_items
- Geri yükleme sadece Admin ve Yönetici rolüne açık
- Giriş kayıtları silme geri alınamaz — onay dialogu gerekli
- vercel.json cron'u için Vercel Pro gerekebilir — Free planda cron sınırlı
- CRON_SECRET env variable'ını hem Vercel'e hem .env.local'a ekle