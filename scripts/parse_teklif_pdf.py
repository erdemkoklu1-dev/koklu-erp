#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Köklü ERP — Fiyat Teklifi PDF Kalem Parser
Kullanım: python parse_teklif_pdf.py <dosya.pdf>
Çıktı: JSON array (stdout)
  [{sira, adet, aciklama, birimFiyat, toplam}]
"""

import sys
import io
import json
import re
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    import pdfplumber
except ImportError:
    print(json.dumps({"hata": "pdfplumber kurulu değil. 'pip install pdfplumber' komutunu çalıştırın."}))
    sys.exit(1)


# Özet/atlanacak satır başlangıçları (büyük harf eşleşmesi)
SKIP_PREFIXES = [
    'KDV', 'TOPLAM', 'GENEL', 'ARA TOPLAM', 'NOT:', 'TİCARİ',
    'TICARI', 'SAYIN', 'TEKLİF', 'TEKLIF', 'TARİH', 'TARIH',
    'GEÇERLİLİK', 'GECERLILIK', 'OPSIYON', 'ÖDEME', 'ODEME',
    'TESLİMAT', 'TESLIMAT', 'YALNIZ', 'YALNIZ', 'İMZA', 'IMZA',
    'SATICI', 'ALICI', 'KÖKLÜ', 'KOKLU', 'YANGIN',
    'S.NO', 'SIRA', 'ADET', 'MAL', 'B.FİYAT', 'B.FIYAT', 'FİYAT',
]

def parse_tutar(s):
    """Türkçe tutar string'ini float'a çevirir. '1.234,56' → 1234.56"""
    if not s:
        return 0.0
    s = str(s).strip()
    # Para birimi sembollerini temizle
    s = re.sub(r'[₺$€TL]', '', s).strip()
    if not s or s == '-':
        return 0.0
    # Türkçe format: nokta=binlik ayraç, virgül=ondalık
    # '1.234,56' veya '1.234.567,89'
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    else:
        # sadece nokta var — eğer 3'lü grupsa binlik, değilse ondalık
        parts = s.split('.')
        if len(parts) == 2 and len(parts[1]) != 3:
            pass  # zaten ondalık nokta
        else:
            s = s.replace('.', '')
    try:
        return float(s)
    except ValueError:
        return 0.0

def is_number(s):
    """String bir sayı mı?"""
    try:
        parse_tutar(str(s))
        return True
    except:
        return False

def should_skip(text):
    """Bu satır özet/başlık satırı mı, atlanmalı mı?"""
    if not text:
        return True
    upper = str(text).strip().upper()
    for prefix in SKIP_PREFIXES:
        if upper.startswith(prefix):
            return True
    return False

def parse_kalemler_from_tables(tables):
    """pdfplumber tablo listesinden kalem satırlarını çıkar."""
    results = []
    sira = 1

    for table in tables:
        if not table:
            continue
        for row in table:
            if not row:
                continue

            # None'ları boş stringe çevir
            cells = [str(c).strip() if c is not None else '' for c in row]

            # Boş satır atla
            if all(c == '' for c in cells):
                continue

            # İlk hücre rakamsa ve satır atlanmaması gerekiyorsa → kalem
            first = cells[0] if cells else ''
            if not first:
                # Bazı tablolarda sıra no ikinci kolonda olabilir
                first = cells[1] if len(cells) > 1 else ''

            # Başlık satırı veya özet satırı kontrolü
            # İkinci hücre (adet) veya üçüncü hücre (açıklama) kontrol
            aciklama_col = ''
            for c in cells[1:4]:
                if c and not is_number(c):
                    aciklama_col = c
                    break

            if should_skip(aciklama_col) or should_skip(first):
                continue

            # İlk hücrenin sayı olup olmadığını kontrol et
            try:
                float(first.replace(',', '.'))
                first_is_num = True
            except ValueError:
                first_is_num = False

            if not first_is_num:
                # Sıra no olmayabilir, açıklama ilk kolonda olabilir
                # Eğer hiçbir numara yoksa başlık satırıdır, atla
                has_price = False
                for c in cells:
                    try:
                        v = parse_tutar(c)
                        if v > 0:
                            has_price = True
                            break
                    except:
                        pass
                if not has_price:
                    continue

            # Kolonları tahmin et
            # Olası formatlar:
            # [sira_no, adet, aciklama, birim_fiyat, toplam]
            # [sira_no, aciklama, adet, birim_fiyat, toplam]  (nadiren)
            # [adet, aciklama, birim_fiyat, toplam]

            adet = 1.0
            aciklama = ''
            birim_fiyat = 0.0
            toplam = 0.0

            if len(cells) >= 5:
                # Standart: [sira, adet, aciklama, birim_fiyat, toplam]
                try:
                    adet = parse_tutar(cells[1]) or 1.0
                except:
                    adet = 1.0
                aciklama = cells[2]
                try:
                    birim_fiyat = parse_tutar(cells[3])
                except:
                    birim_fiyat = 0.0
                try:
                    toplam = parse_tutar(cells[4])
                except:
                    toplam = 0.0

            elif len(cells) == 4:
                # [adet, aciklama, birim_fiyat, toplam]
                try:
                    adet = parse_tutar(cells[0]) or 1.0
                except:
                    adet = 1.0
                aciklama = cells[1]
                try:
                    birim_fiyat = parse_tutar(cells[2])
                except:
                    birim_fiyat = 0.0
                try:
                    toplam = parse_tutar(cells[3])
                except:
                    toplam = 0.0

            elif len(cells) == 3:
                aciklama = cells[0]
                try:
                    birim_fiyat = parse_tutar(cells[1])
                except:
                    birim_fiyat = 0.0
                try:
                    toplam = parse_tutar(cells[2])
                except:
                    toplam = 0.0

            # Açıklama temizle
            aciklama = aciklama.strip()
            if not aciklama or should_skip(aciklama):
                continue

            # Toplam yoksa hesapla
            if toplam == 0.0 and adet > 0 and birim_fiyat > 0:
                toplam = round(adet * birim_fiyat, 2)

            results.append({
                'sira': sira,
                'adet': adet,
                'aciklama': aciklama,
                'birimFiyat': birim_fiyat,
                'toplam': toplam,
            })
            sira += 1

    return results


def parse_kalemler_from_text(text):
    """
    Tablo parse başarısız olursa düz metin üzerinde regex ile dene.
    Satır formatı: [sira.] [adet] [aciklama] [birim_fiyat] [toplam]
    """
    results = []
    sira = 1
    lines = text.split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue
        if should_skip(line):
            continue

        # Rakamla başlayan satır dene: "1  5  Yangın Tüpü 6kg  250,00  1.250,00"
        # veya "1. 5 Yangın Tüpü 6kg 250,00 1.250,00"
        m = re.match(
            r'^(\d+)[\.\s]+(\d+(?:[.,]\d+)?)\s+(.+?)\s+'
            r'(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s+'
            r'(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)$',
            line
        )
        if m:
            aciklama = m.group(3).strip()
            if should_skip(aciklama):
                continue
            results.append({
                'sira': sira,
                'adet': parse_tutar(m.group(2)),
                'aciklama': aciklama,
                'birimFiyat': parse_tutar(m.group(4)),
                'toplam': parse_tutar(m.group(5)),
            })
            sira += 1

    return results


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'hata': 'PDF dosya yolu belirtilmedi'}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(json.dumps({'hata': f'Dosya bulunamadı: {pdf_path}'}))
        sys.exit(1)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_tables = []
            full_text = ''
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)
                t = page.extract_text()
                if t:
                    full_text += t + '\n'

        # Önce tablodan dene
        kalemler = parse_kalemler_from_tables(all_tables)

        # Tablo sonuç vermediyse düz metinden dene
        if not kalemler:
            kalemler = parse_kalemler_from_text(full_text)

        print(json.dumps(kalemler, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({'hata': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
