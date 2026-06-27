# Staging RLS Preflight Interpretation

## Amaç

Bu dosya, preflight sonuçlarının nasıl yorumlanacağını açıklar.

## 1. Kritik Tablo Kontrolü

Eğer herhangi bir kritik tabloda `table_exists = false` ise RLS dry-run'a geçilmez.

Eksik tablo varsa önce staging schema eşitlemesi yapılmalıdır.

## 2. firma_id Kolon Kontrolü

Aşağıdaki kritik tablolarda `firma_id_exists = true` olmalıdır:

- customers
- devices
- service_forms
- service_form_items
- invoices
- invoice_items
- invoice_brokers
- payments
- teslimatlar
- teslimat_kalemleri
- teklifler
- teklif_kalemleri
- proforma_faturalar
- proforma_fatura_kalemleri
- teknik_raporlar
- musteri_talepleri
- is_planlari
- planli_isler
- brokers
- araci_cari_hareketleri
- subeler
- kullanici_profiller

## 3. Helper Fonksiyon Kontrolü

Preflight aşamasında mevcut helper fonksiyonlar görülebilir.

Helper upgrade sonrasında beklenen fonksiyonlar:

- current_firma_id
- is_super_admin
- current_user_role
- current_user_sube_id

## 4. Kullanıcı / Firma / Rol Kontrolü

En az iki firma ve mümkünse iki kullanıcı olmalıdır.

Minimum test senaryosu:

- Köklü Yangın kullanıcısı
- Test Yangın Firması kullanıcısı

Eğer tek firma varsa negatif tenant testi yapılamaz. Bu durumda staging test verisi hazırlanmalıdır.

## 5. Fazla İzin Veren Policy Sayısı

Production envanterinde fazla izin veren policy sayısı 59 idi.

Staging preflight'te bu sayı benzer olabilir. Cleanup sonrası azalması beklenir.

## 6. Geçiş Kararı

Helper upgrade aşamasına yalnızca şu şartlarda geç:

- Ortam production değil.
- Kritik tablolar var.
- firma_id kolonları var.
- Kullanıcı/firma verisi test için yeterli.
- Preflight SQL hata vermeden çalıştı.
