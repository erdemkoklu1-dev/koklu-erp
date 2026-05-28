# GÖREV

Aracılar modülünü Aracı Cari yapısına dönüştürme işi tamamlandı.

## Kalan Opsiyonel Notlar

- PDF/Excel cari ekstre dışa aktarımı ayrıca ele alınabilir.
- Manuel ödeme girildiğinde belirli bir alacak hareketini otomatik kısmi/tam ödendi durumuna bağlama daha sonra ayrı bir eşleştirme alanıyla genişletilebilir.

## Kontrol

- `araci_cari_hareketleri` tablosu migration dosyası eklendi.
- Mevcut bağlı faturalar için güvenli komisyon hareketi backfill’i eklendi.
- Yeni fatura-komisyon bağlarında duplicate korumalı cari hareket sync trigger’ı eklendi.
- Aracı detayında cari hareketler ve finansal özetler eklendi.
- Aracılar listesinde finansal özetler ve filtreler eklendi.
- Build kontrolü yapıldı.
