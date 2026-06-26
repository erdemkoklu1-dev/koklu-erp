# Tenant RLS Staging Test Planı - Sprint 1.6

Bu plan staging ortamı içindir. Production üzerinde RLS açma, policy silme veya policy oluşturma adımı içermez.

## Ön Koşullar

- Staging verisi production'a benzer tenant dağılımı içermeli.
- En az iki firma olmalı: Köklü Yangın ve test firması.
- En az üç kullanıcı tipi olmalı: normal firma kullanıcısı, şube kısıtlı kullanıcı, Super Admin.
- `db/tenant_audit_checks.sql`, `db/rls_policy_inventory.sql`, `db/rls_helper_checks.sql` temiz sonuç vermeli.
- Service role API route'larında manuel firma kontrolü korunmalı.

## Test Sırası

1. Envanter al: `rls_policy_inventory.sql`.
2. Helper kontrolü yap: `rls_helper_checks.sql`.
3. Veri uyumu kontrolü yap: `tenant_audit_checks.sql`.
4. Staging'de tek tablo veya küçük tablo grubu için tenant policy denemesi yap.
5. Normal kullanıcı ile liste, detay, PDF/yazdırma, oluşturma, güncelleme ve silme/pasife alma akışlarını test et.
6. Şube kullanıcısı ile önce firma, sonra şube filtresinin çalıştığını doğrula.
7. Super Admin ile mevcut tek firma kullanımının bozulmadığını ve ileride tüm firmaları görebilme tasarımının korunduğunu doğrula.
8. Service role route'larında RLS bypass olsa bile manuel firma kontrolünün 403 ürettiğini doğrula.
9. Client-side anon sorgu yapan ekranlarda RLS sonrası veri sızıntısı olmadığını doğrula.
10. Test sonunda policy envanterini tekrar al ve fazla izin veren policy kalıp kalmadığını raporla.

## Ekran ve API Kontrol Listesi

| Alan | Kontrol |
| --- | --- |
| `/customers` | Sadece kullanıcının firmasındaki müşteriler görünür |
| `/customers/[id]` | Başka firmaya ait id güvenli şekilde bulunamaz/engellenir |
| `/devices` ve cihaz oluşturma | Müşteri listesi ve cihaz kayıtları tenant scoped |
| `/service-forms` ve PDF sayfaları | Liste, detay, bakım/takip PDF tenant scoped |
| `/teslimatlar` | Liste, detay, PDF, kalemler tenant scoped |
| `/fiyat-teklifleri` | Teklif ve teklif kalemleri tenant scoped |
| `/cari-hesap` | Fatura, ödeme, giden/gelen fatura, cari özet tenant scoped |
| `/teknik-raporlar` | Liste, detay, kopya, teklif oluşturma, iptal/silme tenant scoped |
| `/operasyon` | Talepler, iş planları, planlı işler tenant scoped |
| `/araclar` | Broker ve aracı cari hareketleri tenant scoped |
| `/dashboard` | Kartlar önce firma, sonra şube filtresiyle hesaplanır |

## Negatif Testler

- Firma A kullanıcısı Firma B müşteri id'sine doğrudan URL ile gider: veri dönmemeli.
- Firma A kullanıcısı Firma B faturasına ödeme kaydetmeyi dener: 403 veya güvenli hata dönmeli.
- Firma A kullanıcısı Firma B teknik raporunu iptal/silme dener: 403 dönmeli.
- Client-side anon sorgu ile tenant tablo okunur: yalnızca oturum firmasının kayıtları dönmeli veya yetkisiz kalmalı.
- Şube kullanıcısı aynı firmadaki farklı şube kaydını görmeyi dener: şube scope engellemeli.

## Başarı Kriteri

- Tenant tablolarında `firma_id IS NULL` yok.
- İlişki uyumsuzluğu yok.
- Başka firmaya ait kayıt liste, detay, PDF ve API yolundan görünmüyor.
- Yeni kayıtların `firma_id` değeri kullanıcı firmasından yazılıyor.
- Service role route'ları manuel firma kontrolünü koruyor.
- Eski fazla izin veren policy'ler staging'de tenant policy ile değiştirildiğinde uygulama akışları bozulmuyor.

## Durdurma Kriteri

- Herhangi bir tabloda fazla izin veren policy kaldırıldıktan sonra beklenen ekran/API çalışmıyorsa geçiş durdurulur.
- Herhangi bir kullanıcı başka firmanın kaydını görebiliyorsa geçiş durdurulur.
- `current_firma_id()` null veya yanlış firma döndürüyorsa geçiş durdurulur.
- `planli_isler` ve client-side anon ekranların testleri tamamlanmadan production RLS'e geçilmez.
