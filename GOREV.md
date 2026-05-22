# GÖREV: Büyük ZIP Dosyası Desteği

## 🔴 Sorun
5.3MB ZIP dosyası "Dosya çok büyük" hatası veriyor. Vercel Hobby plan body limiti 4.5MB.

## ✅ Çözüm: ZIP'i frontend'de aç, PDF'leri parça parça gönder

### ADIM 1: Frontend'e JSZip ekle

```bash
npm install jszip
```

### ADIM 2: Gelen fatura upload fonksiyonunu güncelle

Dosyayı bul:
```bash
grep -rn "handleFile\|handleUpload\|onDrop\|onChange.*file\|MAX_FILE_SIZE" src/app/(dashboard)/cari-hesap/fatura-import/ --include="*.tsx"
```

Mevcut upload mantığını şu şekilde değiştir:

```typescript
import JSZip from 'jszip';

// Dosya boyutu limiti — artık ZIP için daha yüksek (client-side açılacak)
const MAX_SINGLE_PDF_SIZE = 4 * 1024 * 1024; // 4MB tek PDF için
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB ZIP için (client-side açılacak)

async function handleFile(file: File) {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.zip')) {
    // ZIP dosyası — frontend'de aç, PDF'leri parça parça gönder
    if (file.size > MAX_ZIP_SIZE) {
      setError(`ZIP dosyası çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimum 50MB.`);
      return;
    }
    
    setLoading(true);
    setProgress('ZIP açılıyor...');
    
    try {
      const zip = await JSZip.loadAsync(file);
      const pdfFiles: Array<{name: string; data: Blob}> = [];
      
      // ZIP içindeki PDF'leri çıkar
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && path.toLowerCase().endsWith('.pdf')) {
          const data = await zipEntry.async('blob');
          pdfFiles.push({ name: path.split('/').pop() || path, data });
        }
      }
      
      if (pdfFiles.length === 0) {
        setError('ZIP içinde PDF dosyası bulunamadı.');
        setLoading(false);
        return;
      }
      
      setProgress(`${pdfFiles.length} PDF bulundu, parse ediliyor...`);
      
      // PDF'leri BATCH halinde gönder (5'er 5'er)
      const BATCH_SIZE = 5;
      const allInvoices: any[] = [];
      
      for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
        const batch = pdfFiles.slice(i, i + BATCH_SIZE);
        setProgress(`Parse ediliyor: ${Math.min(i + BATCH_SIZE, pdfFiles.length)}/${pdfFiles.length}`);
        
        // Her batch'teki PDF'leri ayrı ayrı gönder
        const batchPromises = batch.map(async (pdf) => {
          const formData = new FormData();
          formData.append('file', new File([pdf.data], pdf.name, { type: 'application/pdf' }));
          
          try {
            const response = await fetch('/api/gelen-pdf-parse', {
              method: 'POST',
              body: formData,
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Parse hatası (${pdf.name}):`, errorText);
              return null;
            }
            
            const result = await response.json();
            return result;
          } catch (err) {
            console.error(`Parse hatası (${pdf.name}):`, err);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          if (result && result.invoices) {
            allInvoices.push(...result.invoices);
          } else if (result && result.invoice) {
            allInvoices.push(result.invoice);
          }
        }
        
        // Rate limiting — batch'ler arası bekleme
        if (i + BATCH_SIZE < pdfFiles.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      setProgress('Tamamlandı!');
      // allInvoices'ı mevcut önizleme state'ine set et
      setInvoices(allInvoices);
      setLoading(false);
      
    } catch (err) {
      console.error('ZIP açma hatası:', err);
      setError('ZIP dosyası açılamadı. Dosyanın bozuk olmadığından emin olun.');
      setLoading(false);
    }
    
  } else if (fileName.endsWith('.pdf')) {
    // Tek PDF — mevcut mantık
    if (file.size > MAX_SINGLE_PDF_SIZE) {
      setError(`PDF dosyası çok büyük (${(file.size / 1024 / 1024).toFixed(1)}MB). Maksimum 4MB.`);
      return;
    }
    
    // Mevcut tek PDF upload mantığı...
    const formData = new FormData();
    formData.append('file', file);
    // ... mevcut kod ...
  }
}
```

### ADIM 3: API route'u tek PDF kabul edecek şekilde kontrol et

Mevcut `/api/gelen-pdf-parse/route.ts` dosyasının hem ZIP hem tek PDF kabul ettiğini kontrol et. Eğer sadece ZIP kabul ediyorsa, tek PDF desteği de ekle:

```bash
grep -rn "adm-zip\|AdmZip\|application/zip" src/app/api/gelen-pdf-parse/ --include="*.ts"
```

Eğer route sadece ZIP bekliyorsa, tek PDF desteği ekle:

```typescript
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.zip')) {
    // Mevcut ZIP parse mantığı...
  } else if (fileName.endsWith('.pdf')) {
    // Tek PDF parse
    const arrayBuffer = await file.arrayBuffer();
    const pdfText = await extractTextFromPdf(Buffer.from(arrayBuffer));
    
    // AI veya regex parse...
    const invoice = await parseSinglePdf(pdfText, file.name);
    
    return NextResponse.json({ success: true, invoices: [invoice] });
  }
}
```

### ADIM 4: İlerleme göstergesi ekle

Upload sırasında kullanıcıya ilerleme göster:

```tsx
{loading && (
  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
    <div className="flex items-center gap-3">
      <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
      <span className="text-blue-700 dark:text-blue-300">{progress}</span>
    </div>
    {/* İlerleme çubuğu */}
    <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
      <div 
        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${(processedCount / totalCount) * 100}%` }}
      />
    </div>
  </div>
)}
```

## ⚠️ Teknik Notlar
- JSZip client-side çalışır, Vercel body limiti sorun olmaz
- Her PDF tek tek API'ye gönderilir (max 4MB/istek)
- 5'er 5'er batch — paralel ama kontrollü
- Batch'ler arası 500ms bekleme — rate limiting
- Hata olan PDF'ler atlanır, diğerleri devam eder
- `npm install jszip` unutma

## 🔍 Kontrol
- [ ] 5.3MB ZIP yüklenebiliyor mu?
- [ ] İlerleme çubuğu görünüyor mu?
- [ ] Parse sırasında "X/Y parse ediliyor" gösteriliyor mu?
- [ ] Tüm PDF'ler parse ediliyor mu?
- [ ] Hata olan PDF'ler sistemi çökertmiyor mu?
- [ ] Local'de ve canlıda çalışıyor mu?