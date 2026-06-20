# Köklü ERP — Proje Bağlamı

**Son güncelleme:** 2026-06-18  
**Platform:** Next.js 16.2.1 · React 19 · TypeScript · Supabase (PostgreSQL + RLS) · Tailwind CSS 4

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 16.2.1 (App Router, `--webpack` moduyla çalışıyor) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| Veritabanı | Supabase (PostgreSQL) — tüm tablolarda RLS aktif |
| Auth | Supabase Auth + özel RBAC tabloları |
| PDF | `@react-pdf/renderer` (istemci), `pdf-parse` + `adm-zip` (sunucu) |
| AI Parse | Anthropic SDK (`@anthropic-ai/sdk`) + Google Generative AI |
| Form | `react-hook-form` + `zod` |
| Excel | `xlsx` |
| E-posta | `resend` |
| PDF canvas mock | `src/lib/canvas-mock.ts` → Turbopack uyumsuzluğu geçici çözümü |

---

## Modüller

### 1. Müşteriler (`/customers`)
- Müşteri listesi, yeni kayıt, düzenleme, detay
- İl filtresi (`add_customers_il.sql`), yetkili kişi alanı (`add_customers_authorized_person.sql`)
- Müşteri bazlı hatırlatma bölümü (`HatirlatmaSection.tsx`)

### 2. Servis Formları (`/service-forms`)
- Liste, yeni, düzenleme, silme (soft delete, `delete-action.ts`)
- Kaşe ayarları desteği (son commit: `4da6630`)
- Fatura entegrasyonu: `service_form_id` → `invoices`

### 3. Cihazlar (`/devices`, `/cihazlar`)
- Cihaz listesi, yeni kayıt, detay
- Miktar alanı (`add_devices_quantity.sql`)

### 4. Cari Hesap (`/cari-hesap`) — ana finans modülü
Sekmeler:
- **Faturalar** — kesim, ödeme ekleme (`/faturalar/[id]/odeme-ekle`)
- **Gelen Faturalar** — PDF parse + AI import, tedarikçi eşleştirme
- **Giden Faturalar**
- **Gelir/Gider** — genel işlemler
- **Sabit Giderler** — aylık/dönemsel giderler
- **Maaşlar** — personel maaş takibi
- **Vergi** — vergi takvimi, beyan takibi
- **Tedarikciler** — tedarikçi listesi, toplu ödeme, teklif modalı
- **Ön Kayıtlar** — faturasız ürün/hizmet kayıtları
- **Mali Durum** — özet dashboard
- **Gecikmiş Ödemeler** — vade geçmiş takibi
- **Belgeler** — döküman yükleme/işleme
- **Gider Raporu**
- **Müşteri Cari** — müşteri bazlı hesap ekstresi + Mutabakat Formu PDF

### 5. Hatırlatmalar (`/hatirlatmalar`)
- Kurallar, Şablonlar, Özet, Geçmiş sekmeleri
- WhatsApp / SMS / E-posta gönderim API'leri
- Planlanmış gönderim (`add_planli_gonderim_zamani.sql`)

### 6. Fiyat Teklifleri (`/fiyat-teklifleri`)
- Teklif listesi, yeni, düzenleme, durum yönetimi, PDF
- AI parser: `src/lib/teklif-ai-parser.ts`
- Tedarikçi teklif PDF/Excel import: `TedarikciTeklifModal.tsx`, `/api/parse-teklif`
- Fiyat listesi sayfası
- **Proforma Fatura**: `/fiyat-teklifleri/proforma` — liste, yeni, detay, PDF

### 7. Şubeler (`/subeler`)
- Şube listesi, yeni, düzenleme, detay
- Varsayılan şube yönetimi (`sube_varsayilan_migration.sql`)
- Şube bazlı yetki kapsamları (`rbac_sube_yetkileri_migration.sql`)

### 8. Personel / İK (`/personel`)
- Personel listesi, yeni, düzenleme, detay
- 7 sekme: Genel, İletişim, Özlük, Mali, Sigorta, İzin, Notlar
- Maaş bordro sayfası (`/personel/maas-bordro`)
- Cari Hesap → Maaşlar entegrasyonu

### 9. Fabrika / Üretim (`/fabrika`)
- Sekmeler: Genel, Hammadde Depo, Ürün Depo, Üretim Emirleri, BOM/Reçete, Depo Hareketleri, Raporlar
- Üretim emri detay sayfası (`/fabrika/uretim-emirleri/[id]`)

### 10. Teslimatlar (`/teslimatlar`)
- Sekmeler: Bekleyenler, Emanetler, Gecikmiş, Geri Teslim, Hareket Geçmişi
- Teslim formu PDF + müşteri imzası alanı
- Ön Kayda Aktar akışı
- Teslimat iptal filtreleri + fiziksel silme düzeltmesi (commit `9619a34`)

### 11. Teknik Raporlar (`/teknik-raporlar`)
Rapor türleri:
- `yangin_alarm_ihtiyac` — Yangın alarm ihtiyaç hesabı
- `genel_ihtiyac_raporu` — Genel keşif raporu
- `oda_sizdirmazlik_testi` — Oda sızdırmazlık testi
- `yangin_dolabi_hidrant_pompa` — Yangın dolabı/hidrant/pompa hesabı
- `sulu_sistem_hidrolik_hesap` — Sprinkler hidrolik hesabı
- `havalandirma_test_raporu` — Havalandırma debi/hız test raporu (en son eklenen)

Sayfalar: liste, yeni, düzenleme, yazdır, özel hesap araçları (alarm, genel ihtiyaç, oda sızdırmazlık, sulu sistem)

### 12. Operasyon (`/operasyon`)
- **Talepler** (`musteri_talepleri`): yeni, liste, detay, düzenleme, yazdır
- **İş Planları** (`is_planlari`): liste, detay
- **Planlı İşler** (`planli_isler`): iş planlarına bağlı görev satırları
- Soft delete aktif (`operasyon_talepler_soft_delete.sql`)

### 13. Aracılar (`/araclar`)
- Aracı/Pazarlamacı listesi, yeni, düzenleme, detay
- Komisyon bazlı cari hareketler (`araci_cari_hareketleri`)
- Fatura bazlı otomatik komisyon kaydı

### 14. Yönetim (`/yonetim`)
- Kullanıcılar (RBAC)
- Roller + Modül İzinleri
- Giriş Kayıtları
- Yedekleme (`/yonetim/yedekleme`) — export/restore/otomatik yedek

### 15. Profil (`/profil`)
- Kullanıcı profili güncelleme

---

## Veritabanı Tabloları (Özet)

### Temel Tablolar
| Tablo | Açıklama |
|-------|----------|
| `customers` | Müşteriler |
| `devices` | Cihazlar |
| `service_forms` | Servis formları |
| `subeler` | Şubeler |

### Finansal
| Tablo | Açıklama |
|-------|----------|
| `invoices` | Faturalar (satış/alış/iade) |
| `invoice_items` | Fatura kalemleri |
| `invoice_series` | Fatura serisi sayaçları |
| `payments` | Ödemeler |
| `on_kayitlar` | Ön kayıtlar (faturasız) |
| `on_kayit_kalemler` | Ön kayıt kalemleri (JSONB'den ayrı tablo, `on_kayit_kalemler_migration.sql`) |
| `proforma_faturalar` | Proforma faturalar |
| `proforma_kalemleri` | Proforma kalemleri |
| `gelir_gider_hareketleri` | Genel gelir/gider |
| `sabit_giderler` | Sabit dönemsel giderler |
| `calisanlar` / `maas_hareketleri` | Maaş takibi |
| `vergi_takvimleri` | Vergi beyan takvimi |
| `tedarikciler` | Tedarikçiler |
| `teklifler` | Fiyat teklifleri |
| `teklif_kalemleri` | Teklif kalemleri |

### Müşteri Cari
| Tablo | Açıklama |
|-------|----------|
| `musteri_cari_belgeler` | Müşteri cari belgeleri |
| `mutabakat_formlari` | Müşteri mutabakat formları |

### Lojistik
| Tablo | Açıklama |
|-------|----------|
| `teslimatlar` | Teslimat kayıtları |
| `teslimat_kalemleri` | Teslimat kalemleri |

### İnsan Kaynakları
| Tablo | Açıklama |
|-------|----------|
| `personeller` | Personel bilgileri |
| `personel_izinleri` | İzin kayıtları |
| `personel_belgeleri` | Personel belgeleri |
| `personel_egitim` | Eğitim kayıtları |
| `personel_performans` | Performans kayıtları |
| `personel_disiplin` | Disiplin kayıtları |
| `personel_vardiya` | Vardiya planları |

### Fabrika
| Tablo | Açıklama |
|-------|----------|
| `urunler` | Ürün kataloğu |
| `hammaddeler` | Hammadde stok |
| `urun_receteler` | BOM (Bill of Materials) |
| `uretim_emirleri` | Üretim emirleri |
| `urun_stok_hareketleri` | Ürün stok hareketleri |
| `hammadde_stok_girisler` | Hammadde giriş kayıtları |
| `depo_hareketleri` | Depo hareketleri |

### Teknik Raporlar
| Tablo | Açıklama |
|-------|----------|
| `teknik_raporlar` | Teknik hesap raporları |
| `teknik_hesap_ayarlari` | Rapor hesap parametreleri |

### Operasyon
| Tablo | Açıklama |
|-------|----------|
| `musteri_talepleri` | Müşteri talepleri |
| `is_planlari` | İş planları |
| `planli_isler` | Planlı iş satırları |

### Aracılar
| Tablo | Açıklama |
|-------|----------|
| `brokers` | Aracı/Pazarlamacı kayıtları |
| `araci_cari_hareketleri` | Aracı cari hareketleri |

### RBAC / Auth
| Tablo | Açıklama |
|-------|----------|
| `roller` | Roller |
| `kullanici_profiller` | Kullanıcı profilleri |
| `modul_izinleri` | Modül bazlı izinler |
| `giris_kayitlari` | Giriş/çıkış logları |

### Diğer
| Tablo | Açıklama |
|-------|----------|
| `hatirlatmalar` | Hatırlatma kuralları |
| `hatirlatma_sablonlari` | Hatırlatma şablonları |
| `hatirlatma_susturmalar` | Susturma kayıtları |
| `app_settings` | Uygulama ayarları |
| `backup_history` | Yedekleme geçmişi |

---

## AI / Parse Altyapısı

- `src/lib/invoice-ai-parser.ts` — Groq AI ile fatura parse (Anthropic SDK)
- `src/lib/parsePdfBuffer.ts` — PDF buffer işleme, `extractItemsKoklu` fonksiyonu
- `src/lib/teklif-ai-parser.ts` — Teklif AI parse
- `src/lib/gelen-fatura-parser-v2/` — Gelen fatura parse modülü (moneyParser, dateParser, productNormalization, supplierClassifier, parserQuality, genericIncomingInvoiceParser)
- `src/lib/gelen-fatura-supplier-matching.ts` — Tedarikçi eşleştirme
- API rotaları: `/api/parse-fatura`, `/api/parse-invoice`, `/api/parse-teklif`, `/api/gelen-pdf-parse`, `/api/pdf-fatura-parse`

---

## Teknik Raporlar Hesap Kütüphanesi

`src/lib/technical-reports/` altında:
- `alarm-calculator.ts` — Yangın alarm ihtiyaç hesabı
- `general-needs-calculator.ts` — Genel ihtiyaç hesabı
- `room-integrity-calculator.ts` — Oda sızdırmazlık testi
- `water-system-calculator.ts` — Yangın dolabı/hidrant hesabı
- `water-hydraulic-calculator.ts` — Sulu sistem hidrolik hesabı (sprinkler)
- `sprinkler-calculator.ts`, `ring-line-calculator.ts`, `hydraulic-pipe-calculator.ts`, `fire-pump-calculator.ts`, `water-tank-calculator.ts`
- `ventilation-test-calculator.ts` — Havalandırma test raporu hesabı
- `material-list.ts` — Malzeme listesi oluşturma

---

## Auth & RBAC

- `src/lib/auth/authorization.ts` — Modül bazlı izin kontrolü
- `src/lib/auth/modules.ts` — Modül listesi
- `src/lib/auth/branch-scope.ts` — Şube kapsam filtresi
- `src/lib/branches/branch-inference.ts` — Şube çıkarımı
- `src/components/ProtectedModule.tsx` — UI düzeyinde izin koruması

---

## Son Tamamlanan İşler (commit geçmişinden)

| Commit | Açıklama |
|--------|----------|
| `4da6630` | Servis formları kaşe ayarları |
| `e60edda` | Proforma PDF onay alanları kaldırıldı |
| `9619a34` | Teslimat iptal filtreleri + fiziksel silme düzeltmesi |
| `62c0b32` | Havalandırma raporu kayıt payload düzeltmesi |
| `34f73b7` | Teknik rapor kayıt hatası loglama düzeltmesi |
| `b993e00` | Havalandırma test raporu modülü eklendi |
| `a452c87` | Rol ve şube bazlı yetki sistemi eklendi |
| `79d980b` + `5afed82` | Sulu sistem teknik rapor + hidrolik hesap |
| `8aad9fe` | Teknik rapor aksiyonları (kopyala, teklif oluştur, iptal) |
| `88bc4a5` | Aracı cari hareketleri modülü |
| `bfffa3d` | Operasyon modülü sekmeli yapıya taşındı |

---

## Bilinen Açık Konular / Dikkat Edilecekler

- **Türkçe karakter** kuralı: Tüm UI metinleri doğru Türkçe karakterlerle yazılmalı (AGENTS.md)
- **Next.js canvas mock**: Turbopack uyumsuzluğu için `src/lib/canvas-mock.ts` aktif; `next.config.ts`'de alias tanımlı
- **Ön kayıt kalemleri**: JSONB'den ayrı `on_kayit_kalemler` tablosuna geçildi (`on_kayit_kalemler_migration.sql`) — eski JSONB verileri için migrasyon gerekebilir
- **Operasyon modülü**: Soft delete aktif, `is_deleted` sütunuyla; liste sorgularında filtre uygulanmalı
- **Teknik raporlar rapor_turu constraint**: Her yeni rapor türü eklendiğinde güncellenmesi gerekiyor (mevcut: 6 tür)
- **`dev` scripti**: `next dev --webpack` (Turbopack değil) — canvas mock nedeniyle

---

## Dizin Yapısı (Özet)

```
src/
  app/
    (auth)/login/         — Giriş sayfası
    (dashboard)/          — Tüm korumalı sayfalar
      customers/          — Müşteriler
      service-forms/      — Servis formları
      cihazlar/           — Cihazlar
      cari-hesap/         — Finans (12+ alt sayfa)
      hatirlatmalar/      — Hatırlatmalar
      fiyat-teklifleri/   — Teklifler + Proforma
      subeler/            — Şubeler
      personel/           — Personel / İK
      fabrika/            — Fabrika / Üretim
      teslimatlar/        — Teslimatlar
      teknik-raporlar/    — Teknik hesap raporları
      operasyon/          — Müşteri talepleri + İş planları
      araclar/            — Aracılar
      yonetim/            — Admin paneli
      profil/             — Kullanıcı profili
    api/                  — API rotaları
  lib/
    supabase/             — Supabase istemci/sunucu/servis
    auth/                 — RBAC yetkilendirme
    finance/              — Hesaplama ve formatlama
    technical-reports/    — Teknik rapor hesap modülleri
    gelen-fatura-parser-v2/ — AI fatura parse
    backup/               — Yedekleme altyapısı
  components/             — Paylaşımlı bileşenler
db/                       — SQL migration dosyaları
```
