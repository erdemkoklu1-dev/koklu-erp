# Staging Schema Apply Error Log

> Sprint 2.6 hata kayıt şablonudur. Secret, key, password veya gerçek müşteri verisi yazılmaz.

## Kullanım

Staging schema apply veya env doğrulama sırasında görülen her hata için yeni satır eklenir. Hata mesajı secret içeriyorsa maskeleme yapılır.

## Hata Tablosu

| ID | Tarih | Oturum | Faz | Dosya/komut | Hata özeti | Etki | Karar | Sahip | Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ERR-001 | | | | | | | | | |

## Hata Detay Şablonu

### ERR-001

| Alan | Değer |
| --- | --- |
| Tarih | |
| İlgili oturum | |
| Faz | |
| Dosya/komut | |
| Maskelenmiş hata mesajı | |
| Production riski var mı? | |
| Veri değişikliği oldu mu? | |
| Tekrar denenebilir mi? | |
| Alınan karar | |

#### Notlar

-

## Durdurma Kararları

```txt
[ ] NO-GO — Ortam production olabilir.
[ ] NO-GO — Temel schema kaynağı eksik.
[ ] NO-GO — Migration hatası giderilmeden devam edilemez.
[ ] DEVAM — Hata izole edildi ve sonraki fazı etkilemiyor.
```
