-- Sprint 1.4 — Aracı cari hareketleri tenant tamamlama
--
-- Amaç: Fatura bazlı komisyon hakedişi DB trigger'ı ile
-- `araci_cari_hareketleri` tablosuna yazılırken hareket, kaynak faturanın
-- `firma_id` değerini de almalı. Bu dosya yalnızca `firma_id` yazma ekler;
-- komisyon formülü, durum mantığı, RLS veya constraint değiştirmez.
--
-- Not: `araci_cari_hareketleri.firma_id` kolonu `tenant_migration.sql`
-- tarafından eklenir. Bu migration onun ardından çalıştırılmalıdır.

create or replace function public.sync_invoice_broker_cari_hareketi()
returns trigger
language plpgsql
as $$
declare
  inv record;
begin
  select
    i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.customer_id,
    i.sube_id,
    i.firma_id,
    c.full_name as customer_name
  into inv
  from public.invoices i
  left join public.customers c on c.id = i.customer_id
  where i.id = new.invoice_id;

  insert into public.araci_cari_hareketleri (
    araci_id,
    hareket_tarihi,
    vade_tarihi,
    hareket_tipi,
    islem_yonu,
    tutar,
    para_birimi,
    aciklama,
    kategori,
    durum,
    odeme_tarihi,
    bagli_fatura_id,
    bagli_fatura_no,
    bagli_musteri_id,
    bagli_musteri_adi,
    komisyon_orani,
    kaynak,
    sube_id,
    firma_id
  )
  values (
    new.broker_id,
    coalesce(inv.invoice_date, current_date),
    inv.due_date,
    'Komisyon Hakedişi',
    'alacak',
    coalesce(new.commission_amount, 0),
    'TRY',
    case
      when inv.invoice_number is null then 'Fatura komisyon hakedişi'
      else inv.invoice_number || ' numaralı fatura komisyon hakedişi'
    end,
    'Komisyon',
    case when new.is_paid then 'Ödendi' else 'Bekliyor' end,
    new.paid_date,
    new.invoice_id,
    inv.invoice_number,
    inv.customer_id,
    inv.customer_name,
    new.commission_rate,
    'Fatura Komisyonu',
    inv.sube_id,
    inv.firma_id
  )
  on conflict (araci_id, bagli_fatura_id, kaynak)
  where bagli_fatura_id is not null and kaynak = 'Fatura Komisyonu'
  do update set
    hareket_tarihi = excluded.hareket_tarihi,
    vade_tarihi = excluded.vade_tarihi,
    tutar = excluded.tutar,
    aciklama = excluded.aciklama,
    durum = excluded.durum,
    odeme_tarihi = excluded.odeme_tarihi,
    bagli_fatura_no = excluded.bagli_fatura_no,
    bagli_musteri_id = excluded.bagli_musteri_id,
    bagli_musteri_adi = excluded.bagli_musteri_adi,
    komisyon_orani = excluded.komisyon_orani,
    sube_id = excluded.sube_id,
    firma_id = coalesce(public.araci_cari_hareketleri.firma_id, excluded.firma_id),
    updated_at = now();

  return new;
end;
$$;

-- Mevcut fatura kaynaklı komisyon hareketlerinde eksik firma_id'leri geri doldur.
update public.araci_cari_hareketleri ach
set firma_id = i.firma_id
from public.invoices i
where ach.bagli_fatura_id = i.id
  and ach.kaynak = 'Fatura Komisyonu'
  and ach.firma_id is null
  and i.firma_id is not null;
