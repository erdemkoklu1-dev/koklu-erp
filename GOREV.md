İki sorun var:

SORUN 1 - FATURA KALEMİ BİRİM FİYAT YANLIŞ KAYDEDİLMİŞ:

Fatura FT02026000000042'nin kalem bilgileri:
- Veritabanında birim_fiyat: 88.40 (yanlış, 88400 olmalı)
- Veritabanında satir_toplam: 106.08 (yanlış, 106080 olmalı)
- Veritabanında genel_toplam: 106080 (doğru)

Bu tutarsızlık PDF parse sırasında oluştu.
Kalem tutarları yanlış parse edilmiş.

Önce mevcut yanlış kaydı düzelt:
Supabase'de şu sorguyu çalıştır:
SELECT id, aciklama, miktar, birim_fiyat, toplam
FROM invoice_items  -- veya fatura_kalemleri
WHERE invoice_id = (
  SELECT id FROM gelen_faturalar 
  WHERE fatura_no = 'FT02026000000042'
);

Tablo adını bul, sonra düzelt:
UPDATE [tablo_adi]
SET birim_fiyat = birim_fiyat * 1000,
    toplam = toplam * 1000
WHERE invoice_id = (
  SELECT id FROM gelen_faturalar
  WHERE fatura_no = 'FT02026000000042'
);

Sonra diğer hatalı kayıtları da bul:
SELECT id, aciklama, birim_fiyat, toplam
FROM [tablo_adi]
WHERE birim_fiyat < 1000 
AND toplam > 10000;
-- Birim fiyat düşük ama toplam yüksekse 
-- parse hatası var demektir

SORUN 2 - DOUBLE INSERT DEVAM EDİYOR:

payments tablosunda duplicate kayıt var.
Önce temizle:
DELETE FROM payments a
USING payments b
WHERE a.created_at > b.created_at
AND a.invoice_id = b.invoice_id
AND a.amount = b.amount;

Sonra ödeme kaydetme kodunu bul.
"payments" insert yapan tüm yerleri bul.
Butonun tıklanma handler'ına şunu ekle:

const [submitting, setSubmitting] = useState(false)

const handleSubmit = async () => {
  if (submitting) return  // Double tıklamayı engelle
  setSubmitting(true)
  try {
    // insert işlemi
  } finally {
    setSubmitting(false)
    router.refresh()
  }
}

<button disabled={submitting}>
  {submitting ? 'Kaydediliyor...' : 'Kaydet'}
</button>

Son olarak payments tablosuna unique constraint ekle:
ALTER TABLE payments 
ADD CONSTRAINT payments_no_dup 
UNIQUE (invoice_id, amount, payment_date);
Tedarikçiler sayfasına toplu ödeme özelliği ekle.

GÖREV - TEDARİKÇİ BAZLI TOPLU ÖDEME:

Tedarikçiler sayfasında her tedarikçi grubunun
başlık satırına "Toplu Öde" butonu ekle.

Buton konumu:
Tedarikçi adı ve borç tutarının yanında,
mevcut fatura listesinin üstünde.

TOPLU ÖDEME MODALI:

"Toplu Öde" butonuna tıklanınca modal açılsın.

Modal içeriği:
Başlık: "[Tedarikçi Adı] - Toplu Ödeme"

Fatura listesi:
Tedarikçiye ait ödenmemiş tüm faturalar
checkbox listesi olarak gösterilsin.
Her satır: ☐ Fatura No | Tarih | Tutar | Kalan

Üstte "Tümünü Seç" checkbox'ı olsun.
Varsayılan olarak tüm ödenmemiş faturalar
seçili gelsin.

Alt kısım:
Seçili fatura sayısı: X fatura
Toplam ödenecek: ₺XX.XXX,XX (seçilenlerin kalan tutarı)

Ödeme bilgileri:
- Ödeme Tarihi (varsayılan: bugün)
- Ödeme Yöntemi (nakit/havale/çek dropdown)
- Referans/Dekont No (opsiyonel)
- Notlar (opsiyonel)

"Öde" butonu (kırmızı, büyük)
"İptal" butonu

KAYDETME MANTIĞI:

"Öde" butonuna tıklanınca:
1. Seçili her fatura için ayrı payments kaydı oluştur
2. Her faturanın odeme_durumu = 'odendi' olarak güncelle
3. Her faturanın odenen_tutar = tutar olarak güncelle
4. Tüm insert'ler transaction içinde yapılsın:
   Herhangi biri başarısız olursa hepsi geri alınsın

Supabase transaction örneği:
const { error } = await supabase.rpc('toplu_odeme', {
  fatura_ids: seciliFaturaIds,
  odeme_tarihi: tarih,
  odeme_yontemi: yontem,
  referans_no: referans,
  notlar: notlar
})

Supabase'de stored procedure oluştur:
CREATE OR REPLACE FUNCTION toplu_odeme(
  fatura_ids uuid[],
  odeme_tarihi date,
  odeme_yontemi text,
  referans_no text DEFAULT NULL,
  notlar text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  fatura_id uuid;
  fatura_tutari decimal;
BEGIN
  FOREACH fatura_id IN ARRAY fatura_ids LOOP
    -- Fatura tutarını al
    SELECT COALESCE(tutar, 0) INTO fatura_tutari
    FROM gelen_faturalar
    WHERE id = fatura_id;
    
    -- Ödeme kaydı ekle
    INSERT INTO payments (
      invoice_id, amount, payment_date,
      payment_method, reference_no, notes
    ) VALUES (
      fatura_id, fatura_tutari, odeme_tarihi,
      odeme_yontemi, referans_no, notlar
    );
    
    -- Fatura durumunu güncelle
    UPDATE gelen_faturalar
    SET odeme_durumu = 'odendi',
        odenen_tutar = fatura_tutari
    WHERE id = fatura_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

Stored procedure için RLS:
GRANT EXECUTE ON FUNCTION toplu_odeme TO authenticated;

BAŞARI SONRASI:

Modal kapansın.
Tedarikçiler sayfası yenilensin (router.refresh()).
Başarı bildirimi gösterilsin:
"X fatura başarıyla ödendi. Toplam: ₺XX.XXX"

Ödenen faturalar:
- Tedarikçiler sayfasında "Ödendi" badge gösterilsin
- Gelen Faturalar listesinde "Ödendi" görünsün
- Gecikmiş Borçlar listesinden kalksın
- Cari hesap bakiyesi güncel hesaplansın
- Tedarikçi borç toplamı sıfırlansın veya azalsın

KISMİ ÖDEME SEÇENEĞİ:

Her fatura satırında tutar alanı düzenlenebilsin.
Varsayılan kalan tutar, kullanıcı değiştirebilsin.
Kısmi ödeme girilirse odeme_durumu = 'kismi_odendi'
olarak güncellensin.

Mevcut projenin yapısına tamamen uy.