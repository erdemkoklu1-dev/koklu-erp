-- ============================================================
-- HATIRLATMALAR MIGRATION (idempotent)
-- Köklü ERP — Hatırlatma & Bildirim Sistemi
-- ============================================================

-- Mesaj şablonları
create table if not exists public.hatirlatma_sablonlari (
  id              uuid primary key default gen_random_uuid(),
  ad              text not null,
  kanal           text not null check (kanal in ('email', 'sms', 'whatsapp')),
  konu            text,   -- email için
  mesaj_sablonu   text not null,
  aktif           boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Otomatik tetikleme kuralları
create table if not exists public.hatirlatma_kurallari (
  id               uuid primary key default gen_random_uuid(),
  sablon_id        uuid references public.hatirlatma_sablonlari(id) on delete set null,
  tetikleyici_tip  text not null check (tetikleyici_tip in (
                     'kontrol_yaklasiyor', 'skt_yaklasiyor',
                     'kontrol_gecti', 'skt_gecti'
                   )),
  gun_oncesi       integer not null default 7,
  aktif            boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Gönderim kayıtları
create table if not exists public.hatirlatma_kayitlari (
  id               uuid primary key default gen_random_uuid(),
  kural_id         uuid references public.hatirlatma_kurallari(id) on delete set null,
  musteri_id       uuid references public.customers(id) on delete cascade,
  cihaz_id         uuid references public.devices(id) on delete cascade,
  kanal            text not null check (kanal in ('email', 'sms', 'whatsapp')),
  alici_email      text,
  alici_telefon    text,
  mesaj_icerigi    text,
  gonderim_zamani  timestamptz not null default now(),
  durum            text not null default 'bekliyor' check (durum in ('bekliyor', 'gonderildi', 'hata')),
  hata_mesaji      text,
  created_at       timestamptz not null default now()
);

create index if not exists hatirlatma_kayitlari_musteri_idx on public.hatirlatma_kayitlari (musteri_id);
create index if not exists hatirlatma_kayitlari_durum_idx   on public.hatirlatma_kayitlari (durum);
create index if not exists hatirlatma_kayitlari_tarih_idx   on public.hatirlatma_kayitlari (gonderim_zamani desc);

-- RLS
alter table public.hatirlatma_sablonlari enable row level security;
alter table public.hatirlatma_kurallari   enable row level security;
alter table public.hatirlatma_kayitlari   enable row level security;

drop policy if exists "Service role has full access" on public.hatirlatma_sablonlari;
drop policy if exists "Service role has full access" on public.hatirlatma_kurallari;
drop policy if exists "Service role has full access" on public.hatirlatma_kayitlari;

create policy "Service role has full access" on public.hatirlatma_sablonlari using (true) with check (true);
create policy "Service role has full access" on public.hatirlatma_kurallari   using (true) with check (true);
create policy "Service role has full access" on public.hatirlatma_kayitlari   using (true) with check (true);

-- ============================================================
-- VARSAYILAN ŞABLONLAR
-- ============================================================

insert into public.hatirlatma_sablonlari (ad, kanal, konu, mesaj_sablonu) values
(
  'Kontrol Yaklaşıyor (E-posta)',
  'email',
  'Yangın Söndürme Cihazı Bakım Hatırlatması - {cihaz_adi}',
  'Sayın {musteri_adi},

{cihaz_adi} adlı yangın söndürme cihazınızın {kontrol_tarihi} tarihinde periyodik bakım/kontrolünün yapılması gerekmektedir.
{gun_kaldi} gün kaldı.

Randevu için: (0446) 214 45 81

Köklü Yangın Söndürme Cihazları'
),
(
  'Kontrol Hatırlatması (SMS)',
  'sms',
  null,
  'Sayin {musteri_adi}, {cihaz_adi} cihazinizin bakimi {gun_kaldi} gun sonra. Randevu: 0446 214 45 81 - Koklu Yangin'
),
(
  'SKT Yaklaşıyor (E-posta)',
  'email',
  'Yangın Söndürme Cihazı SKT Uyarısı - {cihaz_adi}',
  'Sayın {musteri_adi},

{cihaz_adi} adlı yangın söndürme cihazınızın son kullanma tarihi {kontrol_tarihi} tarihinde dolmaktadır.
{gun_kaldi} gün kaldı. Cihazınızın yenilenmesi için bizimle iletişime geçmenizi öneririz.

Köklü Yangın Söndürme Cihazları
Tel: (0446) 214 45 81'
),
(
  'Kontrol Geçti Uyarısı (E-posta)',
  'email',
  'ACİL: Yangın Cihazı Kontrolü Gecikti - {cihaz_adi}',
  'Sayın {musteri_adi},

{cihaz_adi} adlı yangın söndürme cihazınızın {kontrol_tarihi} tarihinde yapılması gereken periyodik bakımı henüz gerçekleştirilmemiştir.

Lütfen en kısa sürede randevu alınız.
Tel: (0446) 214 45 81

Köklü Yangın Söndürme Cihazları'
)
on conflict do nothing;

-- ============================================================
-- VARSAYILAN KURALLAR
-- ============================================================

insert into public.hatirlatma_kurallari (sablon_id, tetikleyici_tip, gun_oncesi, aktif)
select s.id, 'kontrol_yaklasiyor', 30, true
from public.hatirlatma_sablonlari s where s.ad = 'Kontrol Yaklaşıyor (E-posta)'
on conflict do nothing;

insert into public.hatirlatma_kurallari (sablon_id, tetikleyici_tip, gun_oncesi, aktif)
select s.id, 'kontrol_yaklasiyor', 7, true
from public.hatirlatma_sablonlari s where s.ad = 'Kontrol Yaklaşıyor (E-posta)'
on conflict do nothing;

insert into public.hatirlatma_kurallari (sablon_id, tetikleyici_tip, gun_oncesi, aktif)
select s.id, 'kontrol_yaklasiyor', 7, true
from public.hatirlatma_sablonlari s where s.ad = 'Kontrol Hatırlatması (SMS)'
on conflict do nothing;

insert into public.hatirlatma_kurallari (sablon_id, tetikleyici_tip, gun_oncesi, aktif)
select s.id, 'kontrol_yaklasiyor', 1, true
from public.hatirlatma_sablonlari s where s.ad = 'Kontrol Hatırlatması (SMS)'
on conflict do nothing;

insert into public.hatirlatma_kurallari (sablon_id, tetikleyici_tip, gun_oncesi, aktif)
select s.id, 'kontrol_gecti', 0, true
from public.hatirlatma_sablonlari s where s.ad = 'Kontrol Geçti Uyarısı (E-posta)'
on conflict do nothing;
