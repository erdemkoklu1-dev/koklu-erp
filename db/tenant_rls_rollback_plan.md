# Tenant RLS Rollback Planı - Sprint 1.6

Bu plan production'da uygulanmış bir değişikliğin kaydı değildir. Sprint 1.6'da production RLS açılmadı, policy silinmedi ve policy oluşturulmadı. Plan, ileride staging veya production migration hazırlanırken geri dönüş prosedürünü netleştirmek için yazılmıştır.

## Rollback Tetikleyicileri

- Kullanıcı kendi firmasındaki kayıtları göremiyor.
- Kullanıcı başka firmaya ait kayıt görebiliyor.
- Yeni kayıt oluşturma `firma_id` veya RLS nedeniyle başarısız oluyor.
- Kritik ekranlar boş dönüyor: müşteri, cihaz, servis formu, fatura, teslimat, teklif, operasyon, teknik rapor, aracı cari.
- PDF/yazdırma route'ları yetkili kullanıcıda çalışmıyor.
- Service role route'larında beklenmeyen veri sızıntısı veya 500 hatası var.

## Rollback Ön Koşulları

- Her production migration öncesi `rls_policy_inventory.sql` çıktısı saklanmalı.
- Her tablo için eski policy adları, `qual`, `with_check`, `roles`, `cmd` alanları kaydedilmeli.
- Uygulanan migration küçük batch olmalı; tüm tenant tablolarını tek migration ile değiştirmemeli.
- Rollback migration ayrı dosya olarak önceden hazırlanmalı ve staging'de denenmeli.

## Genel Rollback Stratejisi

1. Etkilenen tablo grubunu belirle.
2. İlgili release'i veya migration'ı durdur.
3. Önce uygulama trafiğini gözlemle; veri silme veya taşıma yapma.
4. Staging'de denenmiş rollback migration'ını uygula.
5. Eski policy envanterini geri yükle veya son güvenli tenant policy setine dön.
6. `rls_policy_inventory.sql`, `rls_helper_checks.sql`, `tenant_audit_checks.sql` tekrar çalıştır.
7. Negatif ve pozitif erişim testlerini tekrar yap.

## Rollback SQL Taslağı

Aşağıdaki örnekler çalıştırılabilir talimat değildir; bilinçli olarak yorum satırıdır.

-- BEGIN;
--   -- Yeni tenant policy'leri kaldır veya disable etme stratejisini tablo bazında uygula.
--   -- Eski policy'leri yalnızca envanter çıktısına birebir uygun şekilde geri oluştur.
--   -- Gerekirse RLS durumunu önceki envanterdeki hale döndür.
-- COMMIT;

Not: Geniş `USING (true)` policy'leri geri getirmek güvenlik riskidir. Rollback hedefi mümkünse eski geniş policy'ye dönmek değil, son çalışan tenant-scoped policy setine dönmek olmalıdır.

## Veri Rollback'i

Bu sprint ve RLS geçiş planı veri silme/taşıma içermez. Rollback veri üzerinde işlem yapmamalıdır. `firma_id NOT NULL` yapılmadığı için kolon constraint rollback'i bu planın konusu değildir.

## Doğrulama

- Firma A kullanıcısı Firma A kayıtlarını görebilir.
- Firma A kullanıcısı Firma B kayıtlarını göremez.
- Şube kullanıcısı yalnız kendi şube kapsamını görür.
- Super Admin beklenen kapsamı görür.
- Service role API route'ları manuel firma kontrolüyle çalışır.
- Dashboard kartları tenant ve şube kapsamına göre doğru hesaplanır.

## İletişim ve Karar

Rollback kararı teknik bulguya dayanmalı: veri sızıntısı varsa geçiş hemen durdurulur; sadece ekran kırılması varsa ilgili tablo batch'i geri alınır. Production RLS ancak staging rollback provası başarılı olduktan sonra planlanmalıdır.
