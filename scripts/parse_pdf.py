#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Köklü ERP — e-Fatura PDF parser
Kullanım: python parse_pdf.py <dosya.zip> [--mode gelen|satis]
  --mode satis  (varsayılan): Giden faturalar — müşteri bilgisini parse et
  --mode gelen              : Gelen faturalar — satıcı bilgisini parse et
Çıktı: JSON array (stdout)
"""

import sys
import io
import json
import zipfile
import tempfile
import os
import re
import argparse

# Windows'ta stdout'u UTF-8 olarak zorla
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import pdfplumber
except ImportError:
    print(json.dumps([{"hata": "pdfplumber kurulu değil. 'pip install pdfplumber' komutunu çalıştırın."}]))
    sys.exit(1)


# ── Sabit listeler ──────────────────────────────────────────────

# Adres satırını kesen anahtar kelimeler (başında geçerse o satır ve
# sonrasını adrese alma)
ADRES_STOP = [
    'özelleştirme no', 'ozellestirme no',
    'senaryo',
    'fatura tipi', 'fatura no', 'fatura numarası',
    'web sitesi', 'e-posta', 'eposta',
    'tel:', 'fax:', 'telefon',
    'vergi no', 'vkn', 'tckn',
    'iban', 'banka',
]

# Bu metinleri içeren satırlar ürün kalemi DEĞİL, özet satırıdır
# Gider kategori kuralları (gelen mod)
# Her tuple: (kategori_adi, tedarikci_keywords, urun_keywords)
GIDER_KATEGORILERI = [
    (
        'Yiyecek & İçecek',
        # Tedarikçi adında bu kelimelerden biri varsa
        ['MİGROS', 'MIGROS', 'BİM', 'BIM', 'A101', 'ŞOK', 'SOK',
         'CARREFOUR', 'GIDA', 'MARKET', 'BAKKAL', 'MANAV'],
        # Ürün adlarında bu kelimelerden biri varsa
        ['EKMEK', 'SÜT', 'SÜTT', 'YOĞURT', 'YOGURT', 'MEYVE', 'SEBZE',
         'ET', 'TAVUK', 'GOFRET', 'ÇİKOLATA', 'CIKOLATA', 'YAĞ', 'UN ',
         'ŞEKER', 'KREMA', 'MANGO', 'ARMUT', 'MUZ', 'DOMATES', 'BİBER',
         'BIBER', 'HELVA', 'SU ', 'MANTARI', 'TAHINI', 'CEVİZ', 'CEVIZ',
         'GIDA', 'İÇECEK', 'ICECEK'],
    ),
    (
        'Yangın Tüpü Parça & Malzeme',
        ['YANGIN', 'SÖNDÜRME', 'SONDURME'],
        ['YANGIN TÜPÜ', 'YANGIN TUPU', 'GÖVDE', 'GOVDE', 'VANA',
         'HORTUM', 'MANOMETRE', 'BOYASIZ', 'TÜPÜ', 'TUPU'],
    ),
    (
        'Gaz & Dolum Malzemesi',
        ['GAZ', 'DEMİR ÇELİK', 'DEMIR CELIK', 'SEMİHLER', 'SEMIHLER'],
        ['AZOT', 'KARBONDİOKSİT', 'KARBONDIOKSIT', 'ARGON', 'CO2',
         'DOLUM', 'GAZI', ' GAZ'],
    ),
    (
        'Hammadde & Sanayi Malzemesi',
        ['METAL', 'SAC', 'DEMİR', 'DEMIR', 'ÇELİK', 'CELIK',
         'PLASTİK', 'PLASTIK', 'AMBALAJ', 'KİMYA', 'KIMYA'],
        ['SAC', 'BORU', 'PROFİL', 'PROFIL', 'METAL', 'PLASTİK', 'PLASTIK'],
    ),
]


def detect_gider_kategorisi(satici_adi, kalemler):
    """
    Önce tedarikçi adına, sonra ürün içeriğine bakarak gider kategorisi belirle.
    """
    s = (satici_adi or '').upper()
    all_desc = ' '.join((k.get('urun_adi') or '') for k in (kalemler or [])).upper()
    for (kategori, satici_kws, urun_kws) in GIDER_KATEGORILERI:
        # 1. Tedarikçi adı kontrolü
        if any(kw in s for kw in satici_kws):
            return kategori
        # 2. Ürün içeriği kontrolü
        if urun_kws and any(kw in all_desc for kw in urun_kws):
            return kategori
    return 'Genel Gider'


# Tedarikçi adı bulunurken bu anahtar kelimeler görülünce adres/footer
# bölümüne geçildiği anlaşılır → dur
SATICI_STOP_PREFIXES = [
    'adres:', 'tel:', 'faks:', 'fax:', 'vkn:', 'vergi dairesi:',
    'mersis', 'web sitesi:', 'e-posta:', 'eposta:', 'telefon:',
    'ticaret sicil', 'sayın', 'sayin', 'alıcı', 'alici',
    'fatura no', 'fatura numarası', 'özelleştirme', 'ozellestirme',
    'senaryo:', 'fatura tipi',
]


def _is_satici_stop_line(line):
    """Bu satır tedarikçi adresine/footer'ına ait mi?"""
    low = normalize(line)
    # Bilinen stop keyword ile başlıyor ya da içinde geçiyorsa
    if any(low.startswith(kw) for kw in SATICI_STOP_PREFIXES):
        return True
    # Rakamla başlıyorsa (telefon, posta kodu, adres no, VKN vb.)
    if re.match(r'^\d', line):
        return True
    # Posta kodu içeriyorsa (5 haneli rakam)
    if re.search(r'\b\d{5}\b', line):
        return True
    return False


def extract_satici_bilgi(text):
    """
    Gelen faturalarda satıcı adı ve VKN'sini çıkar.

    Kural:
    - İlk bulunan VKN (10 haneli) = satıcının VKN'si
    - Satıcı adı: metnin en başından, stop koşuluna kadar
      okunan ilk 1-2 anlamlı satır.
      Firma adı olamayacak satırlar göründüğünde dur:
      "Adres:", "Tel:", "Faks:", "VKN:", "Vergi Dairesi:",
      "MERSIS NO", "Web Sitesi:", "E-Posta:", "Telefon:",
      "Ticaret Sicil", rakamla başlayan satır, 5 haneli posta kodu.
    """
    satici_adi = None
    satici_vkn = None

    # İlk bulunan VKN satıcınındır
    vkns = re.findall(r'VKN\s*[:\s]+(\d{10})', text, re.IGNORECASE)
    if vkns:
        satici_vkn = vkns[0]

    # Metnin başından satır satır oku
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    name_parts = []

    for line in lines[:25]:
        if _is_satici_stop_line(line):
            break
        # Anlamlı firma adı satırı: en az 4 karakter, harf içeriyor
        if len(line) >= 4 and re.search(r'[A-ZÇĞİÖŞÜa-zçğışöşü]', line):
            name_parts.append(line)
            if len(name_parts) >= 2:
                break

    if name_parts:
        satici_adi = ' '.join(name_parts)

    return satici_adi, satici_vkn


def parse_bakiye_notu(text):
    """Hidropres tarzı 'Bakiyeniz: 34.030,00 TRL Alacak' notunu yakala."""
    m = re.search(
        r'Bakiye(?:niz)?\s*[:\s]+([\d.,]+)\s*TRL?\s*(Alacak|Bor[cç]|ALACAK|BORÇ)?',
        text, re.IGNORECASE
    )
    if m:
        tutar = m.group(1)
        tip = (m.group(2) or '').strip()
        return f"Bakiye: {tutar} TRL {tip}".strip()
    return None


OZET_SATIRLAR = [
    'mal hizmet toplam',
    'toplam iskonto',
    'kdv matrah',
    'hesaplanan kdv',
    'vergiler dahil',
    'ödenecek tutar', 'odenecek tutar',
    'toplam tutar',
    'genel toplam',
    'ara toplam',
    'vergi toplam',
]


# ── Yardımcı fonksiyonlar ───────────────────────────────────────

def normalize(s):
    """Küçük harf + fazla boşluk temizle"""
    return str(s or '').lower().strip()


def parse_amount(s):
    """
    Farklı fatura formatlarındaki tutarları float'a çevirir.
    Desteklenen formatlar:
      "1.218,84 TL"  → 1218.84   (Türkçe: nokta binlik, virgül ondalık)
      "1067.57"      → 1067.57   (Migros özet: nokta ondalık)
      "85,82TL"      → 85.82     (virgül ondalık, TL yapışık)
      "500,0000 TL"  → 500.0     (fazla ondalık basamak)
      "8.700,00 TL"  → 8700.0
    """
    if s is None:
        return None
    # TL, TRY, ₺ ve boşlukları temizle
    s = re.sub(r'[TRYtry₺\s]', '', str(s).strip())
    # Yüzde işareti kaldır (% 20,00 gibi ifadeler için)
    s = s.replace('%', '')
    # Geriye sadece rakam, nokta, virgül kalmalı
    s = re.sub(r'[^\d.,]', '', s)
    if not s:
        return None

    dot_pos   = s.rfind('.')
    comma_pos = s.rfind(',')

    if dot_pos != -1 and comma_pos != -1:
        # Her ikisi de var — son gelen ondalık ayraçtır
        if dot_pos > comma_pos:
            # "1,234.56" → nokta ondalık
            s = s.replace(',', '')
        else:
            # "1.234,56" → virgül ondalık (Türkçe format)
            s = s.replace('.', '').replace(',', '.')
    elif comma_pos != -1:
        # Sadece virgül var: ondalık ayraç
        s = s.replace(',', '.')
    # else: sadece nokta var — direkt float

    try:
        val = float(s)
        return round(val, 2)
    except ValueError:
        return None


def parse_date(s):
    """
    DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY → YYYY-MM-DD
    Soft-hyphen (\\xad / U+00AD) → normal tire
    """
    if not s:
        return None
    # HATA 3: soft-hyphen temizle
    s = str(s).strip().replace('\u00ad', '-').replace('\xad', '-')
    m = re.search(r'(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})', s)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    if re.match(r'\d{4}-\d{2}-\d{2}', s):
        return s[:10]
    return None


def find_field(text, *patterns):
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.UNICODE)
        if m:
            val = m.group(1).strip()
            # Soft-hyphen temizle
            return val.replace('\u00ad', '-').replace('\xad', '-')
    return None


def is_ozet_satir(cells):
    """Hücre metinleri özet/toplam satırı içeriyor mu?"""
    text = ' '.join(normalize(c) for c in cells if c)
    return any(kw in text for kw in OZET_SATIRLAR)


def is_sira_no(val):
    """İlk kolon sıra numarası mı? (1, 2, 3, ...)"""
    s = str(val or '').strip()
    return bool(re.match(r'^\d{1,4}$', s))


# ── Müşteri adresini SAYIN bloğundan çıkar ─────────────────────

def extract_musteri_adres(text):
    """
    Adres parse – SAYIN (veya ALICI) bloğundan sonra gelen satırları al,
    ancak ADRES_STOP anahtar kelimeleri geçen satırlarda dur.

    Desteklenen formatlar:
      - SAYIN\\nİSİM  (isim sonraki satırda)
      - SAYIN İSİM    (isim aynı satırda)
      - SAYIN: İSİM
      - ALICI\\nİSİM  (alternatif başlık)
    """
    # SAYIN veya ALICI keyword'ünü bul; ardından gelen boşluk/: karakterlerini atla
    m = re.search(r'(?:SAYIN|ALICI)[:\s]*', text, re.IGNORECASE)
    if not m:
        return None, None

    after = text[m.end():]
    # Satırlara böl, tüm boş satırları atla
    lines = [l.strip() for l in after.split('\n') if l.strip()]

    musteri_adi = None
    adres_lines = []

    for line in lines:
        low = normalize(line)

        # Dur koşulu: stop keyword'lerinden biriyle başlıyorsa adres bitti
        should_stop = any(low.startswith(kw) or (kw + ':') in low for kw in ADRES_STOP)
        if should_stop:
            break

        if musteri_adi is None:
            musteri_adi = line
        else:
            adres_lines.append(line)

        # Posta kodu (5 hane) veya "İlçe/Şehir" formatı → adres bitti
        if re.search(r'\d{5}', line) or '/' in line:
            break

    adres = ' '.join(adres_lines).strip() or None
    return musteri_adi, adres


# ── HATA 2: Migros toplam tutarı tablo 2'den çek ───────────────

def extract_migros_total(pdf):
    """
    Migros faturalarında toplam tutar Tablo 2'de gelir:
      ['', 'ARA TOPLAM :', '1067.57']
      ['', 'FATURA TOPLAMI :', '449.89']
    FATURA TOPLAMI değerini döndür, yoksa ARA TOPLAM'ı döndür.
    """
    fatura_toplami = None
    ara_toplam = None

    for page in pdf.pages:
        for strategy in [
            {'vertical_strategy': 'lines',  'horizontal_strategy': 'lines'},
            {'vertical_strategy': 'text',   'horizontal_strategy': 'text'},
        ]:
            tables = page.extract_tables(strategy) or []
            for table in tables:
                for row in (table or []):
                    if not row:
                        continue
                    row_text = ' '.join(normalize(c) for c in row if c)
                    # Son sütundaki değeri al
                    last_val = None
                    for cell in reversed(row):
                        if cell and str(cell).strip():
                            last_val = str(cell).strip()
                            break

                    if 'fatura toplami' in row_text or 'fatura toplam' in row_text:
                        fatura_toplami = parse_amount(last_val)
                    elif 'ara toplam' in row_text:
                        ara_toplam = parse_amount(last_val)

    return fatura_toplami or ara_toplam


# ── Tablo çıkarma: Tablo 1 = ürün kalemleri ────────────────────

def extract_tables_items(pdf):
    """
    Pdfplumber tabloları kullanarak kalem çıkar.
    Desteklenen özel formatlar:
      - Migros (Format A): "Ürün Kodu / Ürün Barkodu / Ürün Adı" başlıklı tablo
      - Semihler (Format D): tüm kalemler tek büyük hücrede
    """
    all_items = []

    for page in pdf.pages:
        for strategy in [
            {'vertical_strategy': 'lines',  'horizontal_strategy': 'lines'},
            {'vertical_strategy': 'text',   'horizontal_strategy': 'text'},
        ]:
            tables = page.extract_tables(strategy) or []
            for table in tables:
                if not table or len(table) < 2:
                    continue

                # ── Semihler: tek büyük hücre tespiti ────────────────
                # Eğer tablodaki bir satır 1 hücre içeriyor ve o hücre
                # sıra numarasıyla başlayan satırlar barındırıyorsa Semihler formatı
                for row in table:
                    if not row:
                        continue
                    non_empty = [c for c in row if c and str(c).strip()]
                    if len(non_empty) == 1:
                        cell_text = str(non_empty[0])
                        semihler_items = extract_items_semihler(cell_text)
                        if semihler_items:
                            all_items.extend(semihler_items)

                if all_items:
                    break

                # ── Başlık satırını bul ───────────────────────────────
                header_idx = None
                is_migros  = False
                for ri, row in enumerate(table[:5]):
                    if not row:
                        continue
                    joined = ' '.join(normalize(c) for c in row if c)
                    # Migros formatı tespiti
                    if 'ürün kodu' in joined or 'barkod' in joined:
                        header_idx = ri
                        is_migros  = True
                        break
                    # Genel format
                    if any(kw in joined for kw in
                           ['mal', 'hizmet', 'açıklama', 'ürün', 'urun',
                            'miktar', 'birim', 'adet']):
                        header_idx = ri
                        break

                if header_idx is None:
                    continue

                header = [normalize(c) for c in table[header_idx]]

                # ── Migros format parse ───────────────────────────────
                if is_migros:
                    # Başlık: Ürün Kodu | Ürün Barkodu | Ürün Adı | Miktar | Birim | Birim Fiyat | ...
                    col = {}
                    for i, h in enumerate(header):
                        if 'ürün adı' in h or ('ürün' in h and 'kod' not in h and 'barkod' not in h):
                            col.setdefault('desc', i)
                        if re.search(r'\bmiktar\b|\badet\b', h):
                            col.setdefault('qty', i)
                        if 'birim' in h and 'fiyat' in h:
                            col.setdefault('unit_price', i)
                        elif 'fiyat' in h and 'unit_price' not in col:
                            col.setdefault('unit_price', i)
                        if 'birim' in h and 'fiyat' not in h and 'kod' not in h:
                            col.setdefault('unit', i)
                        if 'kdv' in h and ('oran' in h or '%' in h):
                            col.setdefault('kdv_rate', i)
                        if ('toplam' in h or 'tutar' in h) and 'kdv' not in h:
                            col.setdefault('line_total', i)

                    if 'desc' not in col:
                        continue

                    for row in table[header_idx + 1:]:
                        if not row:
                            continue
                        if is_ozet_satir(row):
                            continue
                        # Migros'ta ilk kolon sıra numarası değil, ürün kodu olabilir
                        # Desc sütununa bak
                        desc_idx = col.get('desc')
                        if desc_idx is None or desc_idx >= len(row):
                            continue
                        desc = str(row[desc_idx] or '').strip()
                        if not desc or len(desc) < 2:
                            continue
                        if is_ozet_satir([desc]):
                            continue

                        def get_migros(r, key):
                            idx = col.get(key)
                            if idx is None or idx >= len(r):
                                return None
                            v = r[idx]
                            return str(v).strip() if v else None

                        qty  = parse_amount(get_migros(row, 'qty'))        or 1.0
                        up   = parse_amount(get_migros(row, 'unit_price')) or 0.0
                        unit = get_migros(row, 'unit')                     or 'adet'
                        kr   = parse_amount(get_migros(row, 'kdv_rate'))
                        if kr is None or kr > 100:
                            kr = 18.0  # Migros genelde %18 KDV
                        lt   = parse_amount(get_migros(row, 'line_total'))

                        net = qty * up
                        ka  = round(net * kr / 100, 2)
                        if lt is None:
                            lt = round(net + ka, 2)

                        all_items.append({
                            'urun_adi':       desc,
                            'miktar':         qty,
                            'birim':          unit,
                            'birim_fiyat':    round(up, 2),
                            'iskonto_orani':  0.0,
                            'iskonto_tutari': 0.0,
                            'kdv_orani':      kr,
                            'kdv_tutari':     ka,
                            'satir_toplam':   lt,
                        })
                    if all_items:
                        break
                    continue

                # ── Genel format parse ────────────────────────────────
                col = {}
                for i, h in enumerate(header):
                    if not h:
                        continue
                    if ('mal' in h or 'hizmet' in h or 'açıklama' in h
                            or 'ürün' in h or 'urun' in h or 'isim' in h
                            or 'tanım' in h or 'tanim' in h):
                        col.setdefault('desc', i)
                    if re.search(r'\bmiktar\b|\badet\b', h):
                        col.setdefault('qty', i)
                    if 'birim' in h and 'fiyat' in h:
                        col.setdefault('unit_price', i)
                    elif 'fiyat' in h and 'unit_price' not in col:
                        col.setdefault('unit_price', i)
                    if 'birim' in h and 'fiyat' not in h and 'tutar' not in h:
                        col.setdefault('unit', i)
                    if 'iskonto' in h or 'indirim' in h:
                        if 'oran' in h or '%' in h:
                            col.setdefault('disc_rate', i)
                        else:
                            col.setdefault('disc_amt', i)
                    if 'kdv' in h and 'oran' in h:
                        col.setdefault('kdv_rate', i)
                    if 'kdv' in h and ('tutar' in h or 'miktar' in h):
                        col.setdefault('kdv_amt', i)
                    if ('toplam' in h or 'tutar' in h) and 'kdv' not in h:
                        col.setdefault('line_total', i)

                if 'desc' not in col:
                    continue

                def get_cell(row, key):
                    idx = col.get(key)
                    if idx is None or idx >= len(row):
                        return None
                    v = row[idx]
                    return str(v).strip() if v else None

                for row in table[header_idx + 1:]:
                    if not row:
                        continue
                    if is_ozet_satir(row):
                        continue

                    # İlk kolon sıra numarası olmalı
                    first = str(row[0] or '').strip()
                    if not is_sira_no(first):
                        continue

                    desc = get_cell(row, 'desc')
                    if not desc or len(desc) < 2:
                        continue

                    qty  = parse_amount(get_cell(row, 'qty'))        or 1.0
                    up   = parse_amount(get_cell(row, 'unit_price')) or 0.0
                    unit = get_cell(row, 'unit')                     or 'adet'
                    dr   = parse_amount(get_cell(row, 'disc_rate'))  or 0.0
                    da   = parse_amount(get_cell(row, 'disc_amt'))   or 0.0
                    kr   = parse_amount(get_cell(row, 'kdv_rate'))   or 20.0
                    ka   = parse_amount(get_cell(row, 'kdv_amt'))
                    lt   = parse_amount(get_cell(row, 'line_total'))

                    net = qty * up - da
                    if ka is None:
                        ka = round(net * kr / 100, 2)
                    if lt is None:
                        lt = round(net + ka, 2)

                    all_items.append({
                        'urun_adi':       desc,
                        'miktar':         qty,
                        'birim':          unit,
                        'birim_fiyat':    round(up, 2),
                        'iskonto_orani':  dr,
                        'iskonto_tutari': da,
                        'kdv_orani':      kr,
                        'kdv_tutari':     ka,
                        'satir_toplam':   lt,
                    })

            if all_items:
                break  # Bu strateji işe yaradı, diğerini deneme

    return all_items


# ── HATA 4: Hidropres metin bazlı kalem çıkarma ────────────────

def extract_items_hidropres(text):
    """
    Hidropres formatı: pdfplumber tabloları boş döndürüyor.
    Metin satırları:
      "1 12 KG YANGIN TÜPÜ BOYASIZ GÖVDE 15 Adet 580,00 TL %20,00 8.700,00 TL"
    Regex: sıra_no + açıklama + miktar + Adet + birim_fiyat + TL
    """
    items = []
    pattern = re.compile(
        r'^(\d{1,3})\s+'                          # sıra no
        r'(.+?)\s+'                               # açıklama (greedy olmayan)
        r'(\d+[\.,]?\d*)\s+'                      # miktar
        r'(Adet|adet|KG|kg|Lt|lt|Mt|mt|Ton|ton|Kutu|kutu|Paket|paket)\s+'
        r'([\d\.,]+)\s*TL',                       # birim fiyat
        re.IGNORECASE | re.MULTILINE
    )
    for m in pattern.finditer(text):
        desc = m.group(2).strip()
        if len(desc) < 2 or is_ozet_satir([desc]):
            continue
        qty  = parse_amount(m.group(3)) or 1.0
        unit = m.group(4).strip()
        up   = parse_amount(m.group(5)) or 0.0

        # KDV oranını aynı satırdan çek (% sonrası sayı)
        line_text = m.group(0)
        kdv_m = re.search(r'%\s*([\d\.,]+)', line_text)
        kr = parse_amount(kdv_m.group(1)) if kdv_m else 20.0
        if kr is None or kr > 100:
            kr = 20.0

        net = qty * up
        ka  = round(net * kr / 100, 2)
        lt  = round(net + ka, 2)

        items.append({
            'urun_adi':       desc,
            'miktar':         qty,
            'birim':          unit,
            'birim_fiyat':    round(up, 2),
            'iskonto_orani':  0.0,
            'iskonto_tutari': 0.0,
            'kdv_orani':      kr,
            'kdv_tutari':     ka,
            'satir_toplam':   lt,
        })
    return items


# ── HATA 5: Semihler tek hücre parse ───────────────────────────

def extract_items_semihler(cell_text):
    """
    Semihler formatı: tüm kalemler tek büyük hücrede.
    Her satır:
      "1 UN1079 AZOT GAZI 9,4M3 4 Adet 500,0000 TL % 20,00 400,00 TL 2.000,00 TL"
    Parse: sıra_no + [stok_kodu] + açıklama + miktar + birim + birim_fiyat
    """
    items = []
    for line in cell_text.split('\n'):
        line = line.strip()
        if not line:
            continue

        # Satır sıra numarasıyla başlamalı
        m = re.match(r'^(\d{1,3})\s+', line)
        if not m:
            continue

        rest = line[m.end():]

        # Stok kodu varsa atla (büyük harf + rakam kombinasyonu, örn. UN1079)
        rest = re.sub(r'^[A-Z]{1,5}\d{3,}\s+', '', rest)

        # "N Adet" / "N KG" buluncaya kadar olan kısım açıklamadır
        birim_m = re.search(
            r'([\d\.,]+)\s+(Adet|adet|KG|kg|Lt|lt|Mt|mt|Ton|ton|Kutu|kutu|Paket|paket)\s+',
            rest, re.IGNORECASE
        )
        if not birim_m:
            continue

        desc = rest[:birim_m.start()].strip()
        if len(desc) < 2 or is_ozet_satir([desc]):
            continue

        qty  = parse_amount(birim_m.group(1)) or 1.0
        unit = birim_m.group(2).strip()

        # Birim fiyatı: birim bilgisinden sonraki ilk "sayı TL" kalıbı
        after_unit = rest[birim_m.end():]
        up_m = re.search(r'([\d\.,]+)\s*TL', after_unit, re.IGNORECASE)
        up   = parse_amount(up_m.group(1)) if up_m else 0.0

        # KDV oranı
        kdv_m = re.search(r'%\s*([\d\.,]+)', line)
        kr = parse_amount(kdv_m.group(1)) if kdv_m else 20.0
        if kr is None or kr > 100:
            kr = 20.0

        net = qty * up
        ka  = round(net * kr / 100, 2)

        items.append({
            'urun_adi':       desc,
            'miktar':         qty,
            'birim':          unit,
            'birim_fiyat':    round(up, 2),
            'iskonto_orani':  0.0,
            'iskonto_tutari': 0.0,
            'kdv_orani':      kr,
            'kdv_tutari':     ka,
            'satir_toplam':   round(net + ka, 2),
        })
    return items


# ── Metin bazlı kalem çıkarma (fallback) ───────────────────────

def extract_items_from_text(text):
    """Tablo çıkaramazsa önce Hidropres regex'ini dene, sonra genel regex."""
    # Hidropres stili: "N Adet XXX TL" formatı
    items = extract_items_hidropres(text)
    if items:
        return items

    # Genel fallback: "sıra_no  açıklama  miktar  birim  fiyat"
    items = []
    pattern = re.compile(
        r'^\s*(\d{1,3})\s+'
        r'(.+?)\s{2,}'
        r'([\d.,]+)\s+'
        r'(adet|kg|lt|mt|m2|m3|ton|kutu|paket|hizmet|saat|gün)\s+'
        r'([\d.,]+)',
        re.IGNORECASE | re.MULTILINE
    )
    for m in pattern.finditer(text):
        desc = m.group(2).strip()
        if len(desc) < 2 or is_ozet_satir([desc]):
            continue
        qty  = parse_amount(m.group(3)) or 1.0
        unit = m.group(4).strip()
        up   = parse_amount(m.group(5)) or 0.0
        net  = qty * up
        ka   = round(net * 0.20, 2)
        items.append({
            'urun_adi':       desc,
            'miktar':         qty,
            'birim':          unit,
            'birim_fiyat':    round(up, 2),
            'iskonto_orani':  0.0,
            'iskonto_tutari': 0.0,
            'kdv_orani':      20.0,
            'kdv_tutari':     ka,
            'satir_toplam':   round(net + ka, 2),
        })
    return items


# ── Kelime konumu bazlı kalem çıkarma (son çare) ───────────────

def extract_items_words(pdf):
    items = []
    for page in pdf.pages:
        words = page.extract_words()
        if not words:
            continue
        rows_by_y = {}
        for w in words:
            y = round(w['top'] / 5) * 5
            rows_by_y.setdefault(y, []).append(w)

        for y in sorted(rows_by_y.keys()):
            row_words = sorted(rows_by_y[y], key=lambda w: w['x0'])
            texts = [w['text'] for w in row_words]
            if not texts:
                continue
            if not is_sira_no(texts[0]):
                continue
            if is_ozet_satir(texts):
                continue
            amounts = [parse_amount(t) for t in texts
                       if re.match(r'^[\d.,]{3,}$', t) and parse_amount(t) is not None]
            if not amounts:
                continue
            desc_parts = [t for t in texts[1:]
                          if not re.match(r'^[\d.,]+$', t)
                          and normalize(t) not in ('adet','kg','lt','mt','m2','ton','kutu','paket')]
            desc = ' '.join(desc_parts).strip()
            if len(desc) < 2:
                continue
            up  = amounts[-1]
            qty = 1.0
            for t in texts:
                a = parse_amount(t)
                if a and a < 1000 and a != up:
                    qty = a
                    break
            net = qty * up
            ka  = round(net * 0.20, 2)
            items.append({
                'urun_adi':       desc,
                'miktar':         qty,
                'birim':          'adet',
                'birim_fiyat':    up,
                'iskonto_orani':  0.0,
                'iskonto_tutari': 0.0,
                'kdv_orani':      20.0,
                'kdv_tutari':     ka,
                'satir_toplam':   round(net + ka, 2),
            })
    return items


# ── Ana parse fonksiyonu ────────────────────────────────────────

def parse_pdf_file(path, mode='satis'):
    """
    mode='satis' : Giden fatura — müşteri (alıcı) bilgisini parse et
    mode='gelen' : Gelen fatura — satıcı bilgisini parse et
    """
    is_gelen = (mode == 'gelen')
    result = {
        'filename':        os.path.basename(path),
        'fatura_no':       None,
        'fatura_tarihi':   None,
        'vade_tarihi':     None,
        'senaryo':         None,
        'musteri_adi':     None,
        'musteri_vkn':     None,
        'musteri_adresi':  None,
        'kdv_matrahi':     None,
        'kdv_tutari':      None,
        'odenecek_tutar':  None,
        'kalemler':        [],
        'banka_bilgileri': [],
        'hata':            None,
    }
    if is_gelen:
        result['satici_adi']        = None
        result['satici_vkn']        = None
        result['gider_kategorisi']  = 'Genel Gider'
        result['bakiye_notu']       = None

    try:
        with pdfplumber.open(path) as pdf:
            pages_text = [page.extract_text() or '' for page in pdf.pages]
            text = '\n'.join(pages_text)

            # Soft-hyphen'ları temizle (HATA 3)
            text = text.replace('\u00ad', '-').replace('\xad', '-')

            # ── Fatura No ──────────────────────────────────────────
            result['fatura_no'] = find_field(
                text,
                r'Fatura\s+No[:\s]+([A-Z0-9\-]+)',
                r'FATURA\s+NO[:\s]+([A-Z0-9\-]+)',
                r'No\s*:\s*([A-Z]{2,}[\-]\d+[\-]\d+)',
            )

            # ── Fatura Tarihi (HATA 3: soft-hyphen zaten temizlendi) ──
            result['fatura_tarihi'] = parse_date(find_field(
                text,
                r'Fatura\s+Tarihi[:\s]+([\d.\-/]+)',
                r'FATURA\s+TARİHİ[:\s]+([\d.\-/]+)',
                r'Düzenleme\s+Tarihi[:\s]+([\d.\-/]+)',
            ))

            # ── Vade Tarihi ────────────────────────────────────────
            result['vade_tarihi'] = parse_date(find_field(
                text,
                r'Son\s+[ÖO]deme\s+Tarihi[:\s]+([\d.\-/]+)',
                r'Vade\s+Tarihi[:\s]+([\d.\-/]+)',
                r'VADESİ[:\s]+([\d.\-/]+)',
            ))

            # ── Senaryo ────────────────────────────────────────────
            if re.search(r'TEMELFATURA', text, re.IGNORECASE):
                result['senaryo'] = 'TEMELFATURA'
            elif re.search(r'T[İI]CAR[İI]FATURA', text, re.IGNORECASE):
                result['senaryo'] = 'TICARIFATURA'

            # ── Müşteri / Satıcı Adı + VKN ────────────────────────
            if is_gelen:
                # Gelen faturada satıcı bilgisini çıkar
                satici_adi, satici_vkn = extract_satici_bilgi(text)
                result['satici_adi'] = satici_adi
                result['satici_vkn'] = satici_vkn
                # Köklü'nün kendi bilgisi musteri_adi alanında kalsın
                musteri_adi, musteri_adresi = extract_musteri_adres(text)
                result['musteri_adi']    = musteri_adi
                result['musteri_adresi'] = musteri_adresi
            else:
                # Giden faturada müşteri (alıcı) bilgisini çıkar
                musteri_adi, musteri_adresi = extract_musteri_adres(text)
                result['musteri_adi']    = musteri_adi
                result['musteri_adresi'] = musteri_adresi

                vkns = re.findall(r'VKN\s*[:\s]+(\d{10})', text, re.IGNORECASE)
                if len(vkns) >= 2:
                    result['musteri_vkn'] = vkns[1]
                elif len(vkns) == 1:
                    result['musteri_vkn'] = vkns[0]
                if not result['musteri_vkn']:
                    tckns = re.findall(
                        r'(?:T\.?C\.?\s*(?:Kimlik\s*No)?|TCKN)\s*[:\s]+(\d{11})',
                        text, re.IGNORECASE
                    )
                    if not tckns:
                        tckns = re.findall(r'\b(\d{11})\b', text)
                    if tckns:
                        result['musteri_vkn'] = tckns[-1]

            # ── Finansal Tutarlar ──────────────────────────────────
            result['kdv_matrahi'] = parse_amount(find_field(
                text,
                r'KDV\s+Matrah[ıi][:\s]+([\d.,]+)',
                r'Vergi\s+Matrah[ıi][:\s]+([\d.,]+)',
                r'Matrah[:\s]+([\d.,]+)',
            ))
            result['kdv_tutari'] = parse_amount(find_field(
                text,
                r'Hesaplanan\s+KDV[:\s]+([\d.,]+)',
                r'KDV\s+Tutar[ıi][:\s]+([\d.,]+)',
                r'Toplam\s+KDV[:\s]+([\d.,]+)',
            ))
            result['odenecek_tutar'] = parse_amount(find_field(
                text,
                r'[ÖO]denecek\s+Tutar[:\s]+([\d.,]+)',
                r'Vergiler\s+Dahil\s+Toplam[:\s]+([\d.,]+)',
                r'Genel\s+Toplam[:\s]+([\d.,]+)',
                r'GENEL\s+TOPLAM[:\s]+([\d.,]+)',
            ))

            # ── HATA 2: Migros tablo bazlı tutar çıkarma ──────────
            # Migros total is in a separate summary table, not in text.
            # extract_migros_total only returns a value when it finds
            # 'FATURA TOPLAMI' or 'ARA TOPLAM' rows — Migros-specific.
            if result['odenecek_tutar'] is None:
                result['odenecek_tutar'] = extract_migros_total(pdf)

            # ── Kalemler (HATA 2) ──────────────────────────────────
            items = extract_tables_items(pdf)
            if not items:
                items = extract_items_from_text(text)
            if not items:
                items = extract_items_words(pdf)
            result['kalemler'] = items

            # ── IBAN ──────────────────────────────────────────────
            ibans = re.findall(r'TR\s*\d{2}\s*(?:\d{4}\s*){5}\d{2}', text)
            ibans = list(dict.fromkeys(re.sub(r'\s', '', i) for i in ibans))
            banka_adlari = re.findall(
                r'((?:Ziraat|İş\s*Bankası|Garanti|Akbank|Yapı\s*Kredi|Halkbank|'
                r'Vakıfbank|Denizbank|QNB|ING|TEB|Şekerbank|HSBC|Odeabank|'
                r'Fibabanka|Albaraka|Kuveyt\s*Türk|Türkiye\s*Finans)[^\n]*)',
                text, re.IGNORECASE
            )
            result['banka_bilgileri'] = [
                {'iban': iban,
                 'banka_adi': banka_adlari[i] if i < len(banka_adlari) else None}
                for i, iban in enumerate(ibans)
            ]

            # ── Gelen fatura ek alanları ───────────────────────────
            if is_gelen:
                result['gider_kategorisi'] = detect_gider_kategorisi(
                    result.get('satici_adi'), result.get('kalemler', [])
                )
                result['bakiye_notu'] = parse_bakiye_notu(text)

    except Exception as e:
        result['hata'] = str(e)

    return result


# ── Entry point ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Köklü ERP PDF parser')
    parser.add_argument('path', help='ZIP veya PDF dosyası')
    parser.add_argument('--mode', choices=['satis', 'gelen'], default='satis',
                        help='satis: giden fatura (müşteri parse), gelen: gelen fatura (satıcı parse)')
    args = parser.parse_args()

    path = args.path
    mode = args.mode
    results = []

    if path.lower().endswith('.zip'):
        try:
            with zipfile.ZipFile(path, 'r') as zf:
                pdf_names = sorted(
                    n for n in zf.namelist()
                    if n.lower().endswith('.pdf') and not n.startswith('__MACOSX')
                )
                for name in pdf_names:
                    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                        tmp.write(zf.read(name))
                        tmp_path = tmp.name
                    try:
                        parsed = parse_pdf_file(tmp_path, mode=mode)
                        parsed['filename'] = name
                        results.append(parsed)
                    except Exception as e:
                        results.append({'filename': name, 'hata': str(e)})
                    finally:
                        try:
                            os.unlink(tmp_path)
                        except Exception:
                            pass
        except zipfile.BadZipFile as e:
            results.append({'hata': f'Geçersiz ZIP: {e}'})
    elif path.lower().endswith('.pdf'):
        results.append(parse_pdf_file(path, mode=mode))
    else:
        results.append({'hata': 'Desteklenmeyen dosya türü.'})

    print(json.dumps(results, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
