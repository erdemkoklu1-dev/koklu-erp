/**
 * OTOMATİK ÜRETİLMİŞTİR — ELLE DÜZENLEMEYİN.
 *
 * Üretici : scripts/generate-db-types.mjs
 * Kaynak  : db/*.sql migration zinciri (49 dosya)
 * Komut   : npm run db:types:generate
 * Kontrol : npm run db:types:check   (drift varsa CI düşer)
 *
 * Bu dosya elle değiştirilirse `db:types:check` non-zero döner.
 * Şema değişikliği yapıldığında migration'ı yazın ve üreticiyi tekrar çalıştırın.
 *
 * ── KANONİKLİK SINIRI ──────────────────────────────────────────────────────
 * Aşağıdaki tablolar migration zincirinde yalnızca FK/ALTER üzerinden görülüyor;
 * CREATE TABLE tanımları repoda YOK (bkz. db/staging_migration_inventory.md,
 * "Kritik Gözlem"). Kolonları UYDURULMAMIŞTIR — yalnızca kanıtlanabilenler
 * listelenmiştir, bu yüzden bu tabloların tipleri EKSİKTİR:
 *   - customers
 *   - devices
 *   - service_form_items
 *   - service_forms
 *
 * Bu boşluk kapatılmadan "migration zinciri kanoniktir" denemez.
 * Çözüm: eksik CREATE TABLE migration'ları repoya eklenmeli veya Gate 0'dan
 * geçmiş bir staging şemasından schema-only tanım alınmalıdır.
 *
 * ── TENANT LİSTESİ DRIFT'İ ─────────────────────────────────────────────────
 * Aşağıdaki adlar `db/tenant_migration.sql` gibi dinamik tablo listelerinde
 * geçiyor ama repoda böyle bir tablo YOK (ne CREATE ne FK). O migration
 * `if to_regclass(...) is not null` ile koruduğu için bu tablolar SESSİZCE
 * atlanmıştır — yani hedeflenen `firma_id` kolonunu hiç almamışlardır.
 * (Denetim raporundaki S1 / `proforma_kalemleri` bulgusunun aynı sınıfı.)
 *   - backup_history
 *   - calisanlar
 *   - gelir_gider_hareketleri
 *   - hammadde_stok_girisler
 *   - hatirlatmalar
 *   - maas_hareketleri
 *   - musteri_cari_belgeler
 *   - on_kayit_kalemler
 *   - proforma_kalemleri
 *   - sabit_giderler
 *   - urun_stok_hareketleri
 *   - vergi_takvimleri
 * ───────────────────────────────────────────────────────────────────────────
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** CREATE TABLE tanımı repoda bulunmayan ama FK/ALTER ile kanıtlı tablolar. */
export const UNRESOLVED_SCHEMA_TABLES = ["customers","devices","service_form_items","service_forms"] as const

/** Dinamik migration listelerinde geçen ama repoda karşılığı olmayan tablo adları. */
export const PHANTOM_TENANT_TABLES = ["backup_history","calisanlar","gelir_gider_hareketleri","hammadde_stok_girisler","hatirlatmalar","maas_hareketleri","musteri_cari_belgeler","on_kayit_kalemler","proforma_kalemleri","sabit_giderler","urun_stok_hareketleri","vergi_takvimleri"] as const

export type Database = {
  public: {
    Tables: {
      aggregate_idempotency: {
        Row: {
          created_at: string
          expires_at: string
          firma_id: string
          key: string
          module: string
          parent_id: string
          payload_fingerprint: string | null
          result: Json | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          firma_id: string
          key?: string
          module: string
          parent_id: string
          payload_fingerprint?: string | null
          result?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          firma_id?: string
          key?: string
          module?: string
          parent_id?: string
          payload_fingerprint?: string | null
          result?: Json | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          firma_id: string | null
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          firma_id?: string | null
          key?: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          firma_id?: string | null
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      araci_cari_hareketleri: {
        Row: {
          aciklama: string | null
          araci_id: string
          bagli_fatura_id: string | null
          bagli_fatura_no: string | null
          bagli_musteri_adi: string | null
          bagli_musteri_id: string | null
          belge_no: string | null
          created_at: string
          created_by: string | null
          dosya_url: string | null
          durum: string
          firma_id: string | null
          hareket_no: string | null
          hareket_tarihi: string
          hareket_tipi: string
          id: string
          islem_yonu: string
          kategori: string | null
          kaynak: string
          komisyon_orani: number | null
          odeme_tarihi: string | null
          para_birimi: string
          sube_id: string | null
          tutar: number
          updated_at: string
          updated_by: string | null
          vade_tarihi: string | null
        }
        Insert: {
          aciklama?: string | null
          araci_id: string
          bagli_fatura_id?: string | null
          bagli_fatura_no?: string | null
          bagli_musteri_adi?: string | null
          bagli_musteri_id?: string | null
          belge_no?: string | null
          created_at?: string
          created_by?: string | null
          dosya_url?: string | null
          durum?: string
          firma_id?: string | null
          hareket_no?: string | null
          hareket_tarihi?: string
          hareket_tipi: string
          id?: string
          islem_yonu: string
          kategori?: string | null
          kaynak?: string
          komisyon_orani?: number | null
          odeme_tarihi?: string | null
          para_birimi?: string
          sube_id?: string | null
          tutar?: number
          updated_at?: string
          updated_by?: string | null
          vade_tarihi?: string | null
        }
        Update: {
          aciklama?: string | null
          araci_id?: string
          bagli_fatura_id?: string | null
          bagli_fatura_no?: string | null
          bagli_musteri_adi?: string | null
          bagli_musteri_id?: string | null
          belge_no?: string | null
          created_at?: string
          created_by?: string | null
          dosya_url?: string | null
          durum?: string
          firma_id?: string | null
          hareket_no?: string | null
          hareket_tarihi?: string
          hareket_tipi?: string
          id?: string
          islem_yonu?: string
          kategori?: string | null
          kaynak?: string
          komisyon_orani?: number | null
          odeme_tarihi?: string | null
          para_birimi?: string
          sube_id?: string | null
          tutar?: number
          updated_at?: string
          updated_by?: string | null
          vade_tarihi?: string | null
        }
        Relationships: []
      }
      backup_jobs: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          error_message: string | null
          file_size: number | null
          id: string
          included_tables: string[]
          row_counts: Json
          status: string
          storage_bucket: string | null
          storage_path: string | null
          storage_saved: boolean
          total_rows: number
        }
        Insert: {
          backup_type: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_size?: number | null
          id?: string
          included_tables?: string[]
          row_counts?: Json
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_saved?: boolean
          total_rows?: number
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_size?: number | null
          id?: string
          included_tables?: string[]
          row_counts?: Json
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_saved?: boolean
          total_rows?: number
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          created_at: string
          details: Json
          id: string
          job_id: string | null
          level: string
          message: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          job_id?: string | null
          level?: string
          message: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          job_id?: string | null
          level?: string
          message?: string
        }
        Relationships: []
      }
      backup_restores: {
        Row: {
          created_at: string
          dry_run_result: Json
          file_name: string
          file_size: number | null
          id: string
          requested_by: string | null
          status: string
          table_count: number
          total_rows: number
        }
        Insert: {
          created_at?: string
          dry_run_result?: Json
          file_name: string
          file_size?: number | null
          id?: string
          requested_by?: string | null
          status?: string
          table_count?: number
          total_rows?: number
        }
        Update: {
          created_at?: string
          dry_run_result?: Json
          file_name?: string
          file_size?: number | null
          id?: string
          requested_by?: string | null
          status?: string
          table_count?: number
          total_rows?: number
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          enabled: boolean
          id: string
          run_at: string
          storage_enabled: boolean
          updated_at: string
          updated_by: string | null
          weekday: number
        }
        Insert: {
          enabled?: boolean
          id?: string
          run_at?: string
          storage_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Update: {
          enabled?: boolean
          id?: string
          run_at?: string
          storage_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          weekday?: number
        }
        Relationships: []
      }
      brokers: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          firma_id: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          firma_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          firma_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_accounts: {
        Row: {
          created_at: string
          credit_limit: number
          customer_id: string
          id: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_limit?: number
          customer_id: string
          id?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_limit?: number
          customer_id?: string
          id?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          authorized_person: string | null
          authorized_phone: string | null
          bank_name: string | null
          firma_id: string | null
          iban: string | null
          il: string | null
          sube_id: string | null
        }
        Insert: {
          authorized_person?: string | null
          authorized_phone?: string | null
          bank_name?: string | null
          firma_id?: string | null
          iban?: string | null
          il?: string | null
          sube_id?: string | null
        }
        Update: {
          authorized_person?: string | null
          authorized_phone?: string | null
          bank_name?: string | null
          firma_id?: string | null
          iban?: string | null
          il?: string | null
          sube_id?: string | null
        }
        Relationships: []
      }
      depo_hareketleri: {
        Row: {
          aciklama: string | null
          created_at: string
          firma_id: string | null
          hareket_tipi: string
          id: string
          kaynak: string
          kaynak_id: string
          miktar: number
          referans_no: string | null
          tarih: string
        }
        Insert: {
          aciklama?: string | null
          created_at?: string
          firma_id?: string | null
          hareket_tipi: string
          id?: string
          kaynak: string
          kaynak_id: string
          miktar: number
          referans_no?: string | null
          tarih?: string
        }
        Update: {
          aciklama?: string | null
          created_at?: string
          firma_id?: string | null
          hareket_tipi?: string
          id?: string
          kaynak?: string
          kaynak_id?: string
          miktar?: number
          referans_no?: string | null
          tarih?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          firma_id: string | null
          quantity: number
        }
        Insert: {
          firma_id?: string | null
          quantity?: number
        }
        Update: {
          firma_id?: string | null
          quantity?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          amount: number | null
          customer_id: string | null
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          invoice_id: string | null
          mime_type: string | null
          notes: string | null
          payment_id: string | null
          processed: boolean
          processed_at: string | null
          uploaded_at: string
        }
        Insert: {
          amount?: number | null
          customer_id?: string | null
          document_type?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          payment_id?: string | null
          processed?: boolean
          processed_at?: string | null
          uploaded_at?: string
        }
        Update: {
          amount?: number | null
          customer_id?: string | null
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          payment_id?: string | null
          processed?: boolean
          processed_at?: string | null
          uploaded_at?: string
        }
        Relationships: []
      }
      emanet_takipleri: {
        Row: {
          created_at: string
          customer_id: string
          durum: string
          firma_id: string | null
          geri_alinan_miktar: number
          hedef_tarih: string | null
          id: string
          kalem_id: string
          kapandi_at: string | null
          miktar: number
          sube_id: string | null
          teslimat_id: string
          urun_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          durum?: string
          firma_id?: string | null
          geri_alinan_miktar?: number
          hedef_tarih?: string | null
          id?: string
          kalem_id: string
          kapandi_at?: string | null
          miktar?: number
          sube_id?: string | null
          teslimat_id: string
          urun_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          durum?: string
          firma_id?: string | null
          geri_alinan_miktar?: number
          hedef_tarih?: string | null
          id?: string
          kalem_id?: string
          kapandi_at?: string | null
          miktar?: number
          sube_id?: string | null
          teslimat_id?: string
          urun_id?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string
          end_date: string | null
          full_name: string
          gross_salary: number
          iban: string | null
          id: string
          notes: string | null
          phone: string | null
          sgk_no: string | null
          start_date: string
          status: Database["public"]["Enums"]["employee_status"]
          tc_no: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          full_name: string
          gross_salary?: number
          iban?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          sgk_no?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["employee_status"]
          tc_no?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          full_name?: string
          gross_salary?: number
          iban?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          sgk_no?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["employee_status"]
          tc_no?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      firmalar: {
        Row: {
          ad: string
          adres: string | null
          aktif: boolean
          created_at: string
          email: string | null
          id: string
          slug: string
          telefon: string | null
          updated_at: string
          vergi_dairesi: string | null
          vergi_no: string | null
        }
        Insert: {
          ad: string
          adres?: string | null
          aktif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          slug: string
          telefon?: string | null
          updated_at?: string
          vergi_dairesi?: string | null
          vergi_no?: string | null
        }
        Update: {
          ad?: string
          adres?: string | null
          aktif?: boolean
          created_at?: string
          email?: string | null
          id?: string
          slug?: string
          telefon?: string | null
          updated_at?: string
          vergi_dairesi?: string | null
          vergi_no?: string | null
        }
        Relationships: []
      }
      fixed_expenses: {
        Row: {
          amount: number
          auto_create_entry: boolean
          category_id: string
          created_at: string
          day_of_month: number
          end_date: string | null
          id: string
          is_active: boolean
          kdv_rate: number
          name: string
          notes: string | null
          period: Database["public"]["Enums"]["recurrence_period"]
          start_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          auto_create_entry?: boolean
          category_id: string
          created_at?: string
          day_of_month?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          kdv_rate?: number
          name: string
          notes?: string | null
          period?: Database["public"]["Enums"]["recurrence_period"]
          start_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_create_entry?: boolean
          category_id?: string
          created_at?: string
          day_of_month?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          kdv_rate?: number
          name?: string
          notes?: string | null
          period?: Database["public"]["Enums"]["recurrence_period"]
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      geri_teslim_takipleri: {
        Row: {
          created_at: string
          customer_id: string
          durum: string
          firma_id: string | null
          hedef_tarih: string | null
          id: string
          kalem_id: string
          kapandi_at: string | null
          miktar: number
          sube_id: string | null
          teslim_edilen_miktar: number
          teslimat_id: string
          urun_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          kalem_id: string
          kapandi_at?: string | null
          miktar?: number
          sube_id?: string | null
          teslim_edilen_miktar?: number
          teslimat_id: string
          urun_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          kalem_id?: string
          kapandi_at?: string | null
          miktar?: number
          sube_id?: string | null
          teslim_edilen_miktar?: number
          teslimat_id?: string
          urun_id?: string | null
        }
        Relationships: []
      }
      giris_kayitlari: {
        Row: {
          ad_soyad: string | null
          created_at: string | null
          email: string | null
          id: string
          ip_adresi: string | null
          islem_tipi: string
          kullanici_id: string | null
          tarayici: string | null
        }
        Insert: {
          ad_soyad?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          ip_adresi?: string | null
          islem_tipi: string
          kullanici_id?: string | null
          tarayici?: string | null
        }
        Update: {
          ad_soyad?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          ip_adresi?: string | null
          islem_tipi?: string
          kullanici_id?: string | null
          tarayici?: string | null
        }
        Relationships: []
      }
      hammaddeler: {
        Row: {
          ad: string
          aktif: boolean
          birim: string
          birim_maliyet: number
          created_at: string
          firma_id: string | null
          id: string
          kategori: string
          mevcut_stok: number
          minimum_stok: number
          notlar: string | null
          tedarikci_id: string | null
        }
        Insert: {
          ad: string
          aktif?: boolean
          birim: string
          birim_maliyet?: number
          created_at?: string
          firma_id?: string | null
          id?: string
          kategori: string
          mevcut_stok?: number
          minimum_stok?: number
          notlar?: string | null
          tedarikci_id?: string | null
        }
        Update: {
          ad?: string
          aktif?: boolean
          birim?: string
          birim_maliyet?: number
          created_at?: string
          firma_id?: string | null
          id?: string
          kategori?: string
          mevcut_stok?: number
          minimum_stok?: number
          notlar?: string | null
          tedarikci_id?: string | null
        }
        Relationships: []
      }
      hatirlatma_kayitlari: {
        Row: {
          alici_email: string | null
          alici_telefon: string | null
          cihaz_id: string | null
          created_at: string
          durum: string
          gonderim_zamani: string
          hata_mesaji: string | null
          id: string
          kanal: string
          kural_id: string | null
          mesaj_icerigi: string | null
          musteri_id: string | null
          planli_gonderim_zamani: string | null
        }
        Insert: {
          alici_email?: string | null
          alici_telefon?: string | null
          cihaz_id?: string | null
          created_at?: string
          durum?: string
          gonderim_zamani?: string
          hata_mesaji?: string | null
          id?: string
          kanal: string
          kural_id?: string | null
          mesaj_icerigi?: string | null
          musteri_id?: string | null
          planli_gonderim_zamani?: string | null
        }
        Update: {
          alici_email?: string | null
          alici_telefon?: string | null
          cihaz_id?: string | null
          created_at?: string
          durum?: string
          gonderim_zamani?: string
          hata_mesaji?: string | null
          id?: string
          kanal?: string
          kural_id?: string | null
          mesaj_icerigi?: string | null
          musteri_id?: string | null
          planli_gonderim_zamani?: string | null
        }
        Relationships: []
      }
      hatirlatma_kurallari: {
        Row: {
          aktif: boolean
          created_at: string
          gun_oncesi: number
          id: string
          sablon_id: string | null
          tetikleyici_tip: string
        }
        Insert: {
          aktif?: boolean
          created_at?: string
          gun_oncesi?: number
          id?: string
          sablon_id?: string | null
          tetikleyici_tip: string
        }
        Update: {
          aktif?: boolean
          created_at?: string
          gun_oncesi?: number
          id?: string
          sablon_id?: string | null
          tetikleyici_tip?: string
        }
        Relationships: []
      }
      hatirlatma_sablonlari: {
        Row: {
          ad: string
          aktif: boolean
          created_at: string
          firma_id: string | null
          id: string
          kanal: string
          konu: string | null
          mesaj_sablonu: string
        }
        Insert: {
          ad: string
          aktif?: boolean
          created_at?: string
          firma_id?: string | null
          id?: string
          kanal: string
          konu?: string | null
          mesaj_sablonu: string
        }
        Update: {
          ad?: string
          aktif?: boolean
          created_at?: string
          firma_id?: string | null
          id?: string
          kanal?: string
          konu?: string | null
          mesaj_sablonu?: string
        }
        Relationships: []
      }
      hatirlatma_susturmalar: {
        Row: {
          created_at: string | null
          firma_id: string | null
          id: string
          musteri_id: string | null
        }
        Insert: {
          created_at?: string | null
          firma_id?: string | null
          id?: string
          musteri_id?: string | null
        }
        Update: {
          created_at?: string | null
          firma_id?: string | null
          id?: string
          musteri_id?: string | null
        }
        Relationships: []
      }
      invoice_brokers: {
        Row: {
          broker_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          firma_id: string | null
          id: string
          invoice_id: string
          is_paid: boolean
          notes: string | null
          paid_date: string | null
          updated_at: string
        }
        Insert: {
          broker_id: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          firma_id?: string | null
          id?: string
          invoice_id: string
          is_paid?: boolean
          notes?: string | null
          paid_date?: string | null
          updated_at?: string
        }
        Update: {
          broker_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          firma_id?: string | null
          id?: string
          invoice_id?: string
          is_paid?: boolean
          notes?: string | null
          paid_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_amount: number
          discount_rate: number
          firma_id: string | null
          id: string
          invoice_id: string
          kdv_rate: number
          line_order: number
          notes: string | null
          quantity: number
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_amount?: number
          discount_rate?: number
          firma_id?: string | null
          id?: string
          invoice_id: string
          kdv_rate?: number
          line_order?: number
          notes?: string | null
          quantity?: number
          unit?: string
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_amount?: number
          discount_rate?: number
          firma_id?: string | null
          id?: string
          invoice_id?: string
          kdv_rate?: number
          line_order?: number
          notes?: string | null
          quantity?: number
          unit?: string
          unit_price?: number
        }
        Relationships: []
      }
      invoice_series: {
        Row: {
          created_at: string
          firma_id: string | null
          id: string
          last_number: number
          prefix: string
          year: number
        }
        Insert: {
          created_at?: string
          firma_id?: string | null
          id?: string
          last_number?: number
          prefix: string
          year: number
        }
        Update: {
          created_at?: string
          firma_id?: string | null
          id?: string
          last_number?: number
          prefix?: string
          year?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          firma_id: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          kdv_amount: number
          kdv_rate: number
          mahsup_aciklama: string | null
          mahsup_durumu: string
          mahsup_tarihi: string | null
          musteri_adres: string | null
          musteri_email: string | null
          musteri_il: string | null
          musteri_ilce: string | null
          musteri_telefon: string | null
          musteri_unvan: string | null
          musteri_vergi_no: string | null
          notes: string | null
          paid_amount: number
          series_id: string | null
          service_form_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stopaj_amount: number
          stopaj_rate: number
          sube_id: string | null
          subtotal: number
          supplier_name: string | null
          supplier_tax_no: string | null
          tedarikci_adres: string | null
          tedarikci_il: string | null
          tedarikci_ilce: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          firma_id?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          kdv_amount?: number
          kdv_rate?: number
          mahsup_aciklama?: string | null
          mahsup_durumu?: string
          mahsup_tarihi?: string | null
          musteri_adres?: string | null
          musteri_email?: string | null
          musteri_il?: string | null
          musteri_ilce?: string | null
          musteri_telefon?: string | null
          musteri_unvan?: string | null
          musteri_vergi_no?: string | null
          notes?: string | null
          paid_amount?: number
          series_id?: string | null
          service_form_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stopaj_amount?: number
          stopaj_rate?: number
          sube_id?: string | null
          subtotal?: number
          supplier_name?: string | null
          supplier_tax_no?: string | null
          tedarikci_adres?: string | null
          tedarikci_il?: string | null
          tedarikci_ilce?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          firma_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          kdv_amount?: number
          kdv_rate?: number
          mahsup_aciklama?: string | null
          mahsup_durumu?: string
          mahsup_tarihi?: string | null
          musteri_adres?: string | null
          musteri_email?: string | null
          musteri_il?: string | null
          musteri_ilce?: string | null
          musteri_telefon?: string | null
          musteri_unvan?: string | null
          musteri_vergi_no?: string | null
          notes?: string | null
          paid_amount?: number
          series_id?: string | null
          service_form_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stopaj_amount?: number
          stopaj_rate?: number
          sube_id?: string | null
          subtotal?: number
          supplier_name?: string | null
          supplier_tax_no?: string | null
          tedarikci_adres?: string | null
          tedarikci_il?: string | null
          tedarikci_ilce?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      is_planlari: {
        Row: {
          aciklama: string | null
          baslangic_tarihi: string
          baslik: string
          bitis_tarihi: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          durum: string
          firma_id: string | null
          id: string
          iptal_is_sayisi: number
          notlar: string | null
          plan_no: string
          plan_turu: string
          sonraki_is_tarihi: string | null
          sorumlu_personel_id: string | null
          source_request_id: string | null
          sube_id: string
          tamamlanan_is_sayisi: number
          tekrar_araligi: number
          tekrar_tipi: string
          toplam_is_sayisi: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aciklama?: string | null
          baslangic_tarihi: string
          baslik: string
          bitis_tarihi?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          durum?: string
          firma_id?: string | null
          id?: string
          iptal_is_sayisi?: number
          notlar?: string | null
          plan_no: string
          plan_turu: string
          sonraki_is_tarihi?: string | null
          sorumlu_personel_id?: string | null
          source_request_id?: string | null
          sube_id: string
          tamamlanan_is_sayisi?: number
          tekrar_araligi?: number
          tekrar_tipi?: string
          toplam_is_sayisi?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aciklama?: string | null
          baslangic_tarihi?: string
          baslik?: string
          bitis_tarihi?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          durum?: string
          firma_id?: string | null
          id?: string
          iptal_is_sayisi?: number
          notlar?: string | null
          plan_no?: string
          plan_turu?: string
          sonraki_is_tarihi?: string | null
          sorumlu_personel_id?: string | null
          source_request_id?: string | null
          sube_id?: string
          tamamlanan_is_sayisi?: number
          tekrar_araligi?: number
          tekrar_tipi?: string
          toplam_is_sayisi?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      kullanici_profiller: {
        Row: {
          ad_soyad: string | null
          aktif: boolean | null
          avatar_url: string | null
          created_at: string | null
          departman: string | null
          firma_id: string | null
          id: string
          rol_id: string | null
          sube_id: string | null
          telefon: string | null
          updated_at: string | null
        }
        Insert: {
          ad_soyad?: string | null
          aktif?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          departman?: string | null
          firma_id?: string | null
          id?: string
          rol_id?: string | null
          sube_id?: string | null
          telefon?: string | null
          updated_at?: string | null
        }
        Update: {
          ad_soyad?: string | null
          aktif?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          departman?: string | null
          firma_id?: string | null
          id?: string
          rol_id?: string | null
          sube_id?: string | null
          telefon?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      kullanici_rolleri: {
        Row: {
          created_at: string | null
          id: string
          kullanici_id: string
          rol_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          kullanici_id: string
          rol_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kullanici_id?: string
          rol_id?: string
        }
        Relationships: []
      }
      kullanici_sube_yetkileri: {
        Row: {
          created_at: string | null
          id: string
          kullanici_id: string
          sube_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          kullanici_id: string
          sube_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kullanici_id?: string
          sube_id?: string
        }
        Relationships: []
      }
      maas_odemeleri: {
        Row: {
          aciklama: string | null
          brut_maas: number
          created_at: string
          damga_vergisi: number
          gelir_vergisi: number
          id: string
          ikramiye: number
          kesinti: number
          mesai_ucreti: number
          net_maas: number
          odeme_donemi: string
          odeme_tarihi: string | null
          odeme_yontemi: string | null
          odendi: boolean
          personel_id: string
          sgk_isci_payi: number
          sgk_isveren_payi: number
          toplam_odenen: number
        }
        Insert: {
          aciklama?: string | null
          brut_maas?: number
          created_at?: string
          damga_vergisi?: number
          gelir_vergisi?: number
          id?: string
          ikramiye?: number
          kesinti?: number
          mesai_ucreti?: number
          net_maas?: number
          odeme_donemi: string
          odeme_tarihi?: string | null
          odeme_yontemi?: string | null
          odendi?: boolean
          personel_id: string
          sgk_isci_payi?: number
          sgk_isveren_payi?: number
          toplam_odenen?: number
        }
        Update: {
          aciklama?: string | null
          brut_maas?: number
          created_at?: string
          damga_vergisi?: number
          gelir_vergisi?: number
          id?: string
          ikramiye?: number
          kesinti?: number
          mesai_ucreti?: number
          net_maas?: number
          odeme_donemi?: string
          odeme_tarihi?: string | null
          odeme_yontemi?: string | null
          odendi?: boolean
          personel_id?: string
          sgk_isci_payi?: number
          sgk_isveren_payi?: number
          toplam_odenen?: number
        }
        Relationships: []
      }
      mesai_kayitlari: {
        Row: {
          aciklama: string | null
          calisma_suresi: number | null
          cikis_saati: string | null
          created_at: string
          giris_saati: string | null
          id: string
          mesai_suresi: number | null
          mesai_tipi: string | null
          personel_id: string
          tarih: string
        }
        Insert: {
          aciklama?: string | null
          calisma_suresi?: number | null
          cikis_saati?: string | null
          created_at?: string
          giris_saati?: string | null
          id?: string
          mesai_suresi?: number | null
          mesai_tipi?: string | null
          personel_id: string
          tarih: string
        }
        Update: {
          aciklama?: string | null
          calisma_suresi?: number | null
          cikis_saati?: string | null
          created_at?: string
          giris_saati?: string | null
          id?: string
          mesai_suresi?: number | null
          mesai_tipi?: string | null
          personel_id?: string
          tarih?: string
        }
        Relationships: []
      }
      modul_izinleri: {
        Row: {
          id: string
          modul_adi: string
          okuma: boolean | null
          rol_id: string
          silme: boolean | null
          yazma: boolean | null
        }
        Insert: {
          id?: string
          modul_adi: string
          okuma?: boolean | null
          rol_id: string
          silme?: boolean | null
          yazma?: boolean | null
        }
        Update: {
          id?: string
          modul_adi?: string
          okuma?: boolean | null
          rol_id?: string
          silme?: boolean | null
          yazma?: boolean | null
        }
        Relationships: []
      }
      musteri_talepleri: {
        Row: {
          aciklama: string
          baslik: string
          cihaz_id: string | null
          cihaz_name_snapshot: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name_snapshot: string | null
          deleted_at: string | null
          deleted_by: string | null
          durum: string
          firma_id: string | null
          hedef_tarih: string | null
          id: string
          ilgili_is_plani_id: string | null
          ilgili_servis_form_id: string | null
          ilgili_teklif_id: string | null
          ilgili_teslimat_id: string | null
          kategori: string
          kaynak: string
          notlar: string | null
          oncelik: string
          sorumlu_personel_id: string | null
          sube_id: string
          talebi_alan_personel_id: string | null
          talep_no: string
          talep_tarihi: string
          tamamlanma_tarihi: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aciklama: string
          baslik: string
          cihaz_id?: string | null
          cihaz_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          ilgili_is_plani_id?: string | null
          ilgili_servis_form_id?: string | null
          ilgili_teklif_id?: string | null
          ilgili_teslimat_id?: string | null
          kategori: string
          kaynak?: string
          notlar?: string | null
          oncelik?: string
          sorumlu_personel_id?: string | null
          sube_id: string
          talebi_alan_personel_id?: string | null
          talep_no: string
          talep_tarihi?: string
          tamamlanma_tarihi?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aciklama?: string
          baslik?: string
          cihaz_id?: string | null
          cihaz_name_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          ilgili_is_plani_id?: string | null
          ilgili_servis_form_id?: string | null
          ilgili_teklif_id?: string | null
          ilgili_teslimat_id?: string | null
          kategori?: string
          kaynak?: string
          notlar?: string | null
          oncelik?: string
          sorumlu_personel_id?: string | null
          sube_id?: string
          talebi_alan_personel_id?: string | null
          talep_no?: string
          talep_tarihi?: string
          tamamlanma_tarihi?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      mutabakat_formlari: {
        Row: {
          bizim_bakiye: number
          created_at: string
          durum: string
          firma_id: string | null
          id: string
          musteri_bakiyesi: number | null
          musteri_id: string
          musteri_onay_tarihi: string | null
          mutabakat_tarihi: string
          notlar: string | null
          olusturan_kullanici_id: string | null
        }
        Insert: {
          bizim_bakiye?: number
          created_at?: string
          durum?: string
          firma_id?: string | null
          id?: string
          musteri_bakiyesi?: number | null
          musteri_id: string
          musteri_onay_tarihi?: string | null
          mutabakat_tarihi: string
          notlar?: string | null
          olusturan_kullanici_id?: string | null
        }
        Update: {
          bizim_bakiye?: number
          created_at?: string
          durum?: string
          firma_id?: string | null
          id?: string
          musteri_bakiyesi?: number | null
          musteri_id?: string
          musteri_onay_tarihi?: string | null
          mutabakat_tarihi?: string
          notlar?: string | null
          olusturan_kullanici_id?: string | null
        }
        Relationships: []
      }
      on_kayitlar: {
        Row: {
          aciklama: string
          birim: string
          birim_fiyat: number
          created_at: string
          customer_id: string
          durum: string
          firma_id: string | null
          id: string
          invoice_id: string | null
          kalemler: Json | null
          kayit_tarihi: string
          miktar: number
          notlar: string | null
          toplam_tutar: number
          updated_at: string
        }
        Insert: {
          aciklama: string
          birim?: string
          birim_fiyat?: number
          created_at?: string
          customer_id: string
          durum?: string
          firma_id?: string | null
          id?: string
          invoice_id?: string | null
          kalemler?: Json | null
          kayit_tarihi?: string
          miktar?: number
          notlar?: string | null
          toplam_tutar?: number
          updated_at?: string
        }
        Update: {
          aciklama?: string
          birim?: string
          birim_fiyat?: number
          created_at?: string
          customer_id?: string
          durum?: string
          firma_id?: string | null
          id?: string
          invoice_id?: string | null
          kalemler?: Json | null
          kayit_tarihi?: string
          miktar?: number
          notlar?: string | null
          toplam_tutar?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          direction: Database["public"]["Enums"]["payment_direction"]
          firma_id: string | null
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_date: string
          reference_no: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          direction: Database["public"]["Enums"]["payment_direction"]
          firma_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date: string
          reference_no?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          firma_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          reference_no?: string | null
        }
        Relationships: []
      }
      performans_degerlendirmeleri: {
        Row: {
          aciklama: string | null
          created_at: string
          degerlendiren_id: string | null
          donem: string
          hedefler: string | null
          id: string
          kategori: string | null
          personel_id: string
          puan: number | null
        }
        Insert: {
          aciklama?: string | null
          created_at?: string
          degerlendiren_id?: string | null
          donem: string
          hedefler?: string | null
          id?: string
          kategori?: string | null
          personel_id: string
          puan?: number | null
        }
        Update: {
          aciklama?: string | null
          created_at?: string
          degerlendiren_id?: string | null
          donem?: string
          hedefler?: string | null
          id?: string
          kategori?: string | null
          personel_id?: string
          puan?: number | null
        }
        Relationships: []
      }
      personel_belgeler: {
        Row: {
          belge_adi: string
          belge_no: string | null
          belge_tipi: string | null
          created_at: string
          dosya_url: string | null
          gecerlilik_tarihi: string | null
          id: string
          notlar: string | null
          personel_id: string
          veren_kurum: string | null
          verilis_tarihi: string | null
        }
        Insert: {
          belge_adi: string
          belge_no?: string | null
          belge_tipi?: string | null
          created_at?: string
          dosya_url?: string | null
          gecerlilik_tarihi?: string | null
          id?: string
          notlar?: string | null
          personel_id: string
          veren_kurum?: string | null
          verilis_tarihi?: string | null
        }
        Update: {
          belge_adi?: string
          belge_no?: string | null
          belge_tipi?: string | null
          created_at?: string
          dosya_url?: string | null
          gecerlilik_tarihi?: string | null
          id?: string
          notlar?: string | null
          personel_id?: string
          veren_kurum?: string | null
          verilis_tarihi?: string | null
        }
        Relationships: []
      }
      personel_izinler: {
        Row: {
          aciklama: string | null
          baslangic_tarihi: string
          bitis_tarihi: string
          created_at: string
          durum: string
          gun_sayisi: number
          id: string
          izin_tipi: string
          notlar: string | null
          onay_tarihi: string | null
          onaylayan_id: string | null
          personel_id: string
          talep_tarihi: string
        }
        Insert: {
          aciklama?: string | null
          baslangic_tarihi: string
          bitis_tarihi: string
          created_at?: string
          durum?: string
          gun_sayisi?: number
          id?: string
          izin_tipi: string
          notlar?: string | null
          onay_tarihi?: string | null
          onaylayan_id?: string | null
          personel_id: string
          talep_tarihi?: string
        }
        Update: {
          aciklama?: string | null
          baslangic_tarihi?: string
          bitis_tarihi?: string
          created_at?: string
          durum?: string
          gun_sayisi?: number
          id?: string
          izin_tipi?: string
          notlar?: string | null
          onay_tarihi?: string | null
          onaylayan_id?: string | null
          personel_id?: string
          talep_tarihi?: string
        }
        Relationships: []
      }
      personeller: {
        Row: {
          acil_iletisim_adi: string | null
          acil_iletisim_telefonu: string | null
          acil_iletisim_yakinligi: string | null
          ad: string
          adres: string | null
          avatar_url: string | null
          banka_adi: string | null
          calisma_sekli: string | null
          cinsiyet: string | null
          created_at: string
          departman: string | null
          dogum_tarihi: string | null
          dogum_yeri: string | null
          durum: string | null
          email: string | null
          firma_id: string | null
          iban: string | null
          id: string
          ise_baslama_tarihi: string | null
          isten_cikis_tarihi: string | null
          istihdam_tipi: string | null
          kan_grubu: string | null
          maas: number | null
          maas_turu: string | null
          medeni_durum: string | null
          notlar: string | null
          posta_kodu: string | null
          pozisyon: string | null
          rol_id: string | null
          sehir: string | null
          sgk_no: string | null
          sicil_no: string | null
          soyad: string
          sube_id: string | null
          tc_kimlik_no: string | null
          telefon: string | null
          updated_at: string
          uyruk: string
          vergi_no: string | null
        }
        Insert: {
          acil_iletisim_adi?: string | null
          acil_iletisim_telefonu?: string | null
          acil_iletisim_yakinligi?: string | null
          ad: string
          adres?: string | null
          avatar_url?: string | null
          banka_adi?: string | null
          calisma_sekli?: string | null
          cinsiyet?: string | null
          created_at?: string
          departman?: string | null
          dogum_tarihi?: string | null
          dogum_yeri?: string | null
          durum?: string | null
          email?: string | null
          firma_id?: string | null
          iban?: string | null
          id?: string
          ise_baslama_tarihi?: string | null
          isten_cikis_tarihi?: string | null
          istihdam_tipi?: string | null
          kan_grubu?: string | null
          maas?: number | null
          maas_turu?: string | null
          medeni_durum?: string | null
          notlar?: string | null
          posta_kodu?: string | null
          pozisyon?: string | null
          rol_id?: string | null
          sehir?: string | null
          sgk_no?: string | null
          sicil_no?: string | null
          soyad: string
          sube_id?: string | null
          tc_kimlik_no?: string | null
          telefon?: string | null
          updated_at?: string
          uyruk?: string
          vergi_no?: string | null
        }
        Update: {
          acil_iletisim_adi?: string | null
          acil_iletisim_telefonu?: string | null
          acil_iletisim_yakinligi?: string | null
          ad?: string
          adres?: string | null
          avatar_url?: string | null
          banka_adi?: string | null
          calisma_sekli?: string | null
          cinsiyet?: string | null
          created_at?: string
          departman?: string | null
          dogum_tarihi?: string | null
          dogum_yeri?: string | null
          durum?: string | null
          email?: string | null
          firma_id?: string | null
          iban?: string | null
          id?: string
          ise_baslama_tarihi?: string | null
          isten_cikis_tarihi?: string | null
          istihdam_tipi?: string | null
          kan_grubu?: string | null
          maas?: number | null
          maas_turu?: string | null
          medeni_durum?: string | null
          notlar?: string | null
          posta_kodu?: string | null
          pozisyon?: string | null
          rol_id?: string | null
          sehir?: string | null
          sgk_no?: string | null
          sicil_no?: string | null
          soyad?: string
          sube_id?: string | null
          tc_kimlik_no?: string | null
          telefon?: string | null
          updated_at?: string
          uyruk?: string
          vergi_no?: string | null
        }
        Relationships: []
      }
      planli_isler: {
        Row: {
          aciklama: string | null
          atanan_personel_id: string | null
          baslik: string
          cihaz_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          durum: string
          firma_id: string | null
          hedef_tarih: string | null
          id: string
          ilgili_servis_form_id: string | null
          ilgili_talep_id: string | null
          ilgili_teslimat_id: string | null
          is_plani_id: string
          notlar: string | null
          oncelik: string
          planlanan_tarih: string
          sira_no: number
          sube_id: string
          tamamlanma_tarihi: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aciklama?: string | null
          atanan_personel_id?: string | null
          baslik: string
          cihaz_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          ilgili_servis_form_id?: string | null
          ilgili_talep_id?: string | null
          ilgili_teslimat_id?: string | null
          is_plani_id: string
          notlar?: string | null
          oncelik?: string
          planlanan_tarih: string
          sira_no: number
          sube_id: string
          tamamlanma_tarihi?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aciklama?: string | null
          atanan_personel_id?: string | null
          baslik?: string
          cihaz_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          ilgili_servis_form_id?: string | null
          ilgili_talep_id?: string | null
          ilgili_teslimat_id?: string | null
          is_plani_id?: string
          notlar?: string | null
          oncelik?: string
          planlanan_tarih?: string
          sira_no?: number
          sube_id?: string
          tamamlanma_tarihi?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      proforma_fatura_kalemleri: {
        Row: {
          aciklama: string | null
          birim: string | null
          birim_fiyat: number
          created_at: string | null
          firma_id: string | null
          id: string
          iskonto_orani: number | null
          iskonto_tutari: number | null
          kdv_orani: number | null
          kdv_tutari: number | null
          mal_hizmet: string
          miktar: number
          proforma_id: string
          sira_no: number
          toplam_tutar: number | null
          updated_at: string
          urun_id: string | null
        }
        Insert: {
          aciklama?: string | null
          birim?: string | null
          birim_fiyat?: number
          created_at?: string | null
          firma_id?: string | null
          id?: string
          iskonto_orani?: number | null
          iskonto_tutari?: number | null
          kdv_orani?: number | null
          kdv_tutari?: number | null
          mal_hizmet: string
          miktar?: number
          proforma_id: string
          sira_no?: number
          toplam_tutar?: number | null
          updated_at?: string
          urun_id?: string | null
        }
        Update: {
          aciklama?: string | null
          birim?: string | null
          birim_fiyat?: number
          created_at?: string | null
          firma_id?: string | null
          id?: string
          iskonto_orani?: number | null
          iskonto_tutari?: number | null
          kdv_orani?: number | null
          kdv_tutari?: number | null
          mal_hizmet?: string
          miktar?: number
          proforma_id?: string
          sira_no?: number
          toplam_tutar?: number | null
          updated_at?: string
          urun_id?: string | null
        }
        Relationships: []
      }
      proforma_faturalar: {
        Row: {
          ara_toplam: number | null
          banka_adi: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          durum: string | null
          firma_id: string | null
          iban: string | null
          id: string
          kdv_matrahi: number | null
          kdv_tutari: number | null
          musteri_adres: string | null
          musteri_email: string | null
          musteri_telefon: string | null
          musteri_unvan: string
          musteri_vergi_dairesi: string | null
          musteri_vkn: string | null
          notlar: string | null
          ozel_sartlar: string | null
          para_birimi: string | null
          proforma_no: string
          sube_id: string | null
          tarih: string
          teklif_id: string | null
          toplam_iskonto: number | null
          toplam_tutar: number | null
          updated_at: string | null
          vade_tarihi: string | null
        }
        Insert: {
          ara_toplam?: number | null
          banka_adi?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          durum?: string | null
          firma_id?: string | null
          iban?: string | null
          id?: string
          kdv_matrahi?: number | null
          kdv_tutari?: number | null
          musteri_adres?: string | null
          musteri_email?: string | null
          musteri_telefon?: string | null
          musteri_unvan: string
          musteri_vergi_dairesi?: string | null
          musteri_vkn?: string | null
          notlar?: string | null
          ozel_sartlar?: string | null
          para_birimi?: string | null
          proforma_no: string
          sube_id?: string | null
          tarih?: string
          teklif_id?: string | null
          toplam_iskonto?: number | null
          toplam_tutar?: number | null
          updated_at?: string | null
          vade_tarihi?: string | null
        }
        Update: {
          ara_toplam?: number | null
          banka_adi?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          durum?: string | null
          firma_id?: string | null
          iban?: string | null
          id?: string
          kdv_matrahi?: number | null
          kdv_tutari?: number | null
          musteri_adres?: string | null
          musteri_email?: string | null
          musteri_telefon?: string | null
          musteri_unvan?: string
          musteri_vergi_dairesi?: string | null
          musteri_vkn?: string | null
          notlar?: string | null
          ozel_sartlar?: string | null
          para_birimi?: string | null
          proforma_no?: string
          sube_id?: string | null
          tarih?: string
          teklif_id?: string | null
          toplam_iskonto?: number | null
          toplam_tutar?: number | null
          updated_at?: string | null
          vade_tarihi?: string | null
        }
        Relationships: []
      }
      rol_yetkileri: {
        Row: {
          created_at: string | null
          id: string
          modul_adi: string
          okuma: boolean | null
          rol_id: string
          silme: boolean | null
          yazma: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          modul_adi: string
          okuma?: boolean | null
          rol_id: string
          silme?: boolean | null
          yazma?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          modul_adi?: string
          okuma?: boolean | null
          rol_id?: string
          silme?: boolean | null
          yazma?: boolean | null
        }
        Relationships: []
      }
      roller: {
        Row: {
          aciklama: string | null
          ad: string
          created_at: string | null
          id: string
          renk: string
          sistem_rolu: boolean
        }
        Insert: {
          aciklama?: string | null
          ad: string
          created_at?: string | null
          id?: string
          renk?: string
          sistem_rolu?: boolean
        }
        Update: {
          aciklama?: string | null
          ad?: string
          created_at?: string | null
          id?: string
          renk?: string
          sistem_rolu?: boolean
        }
        Relationships: []
      }
      salary_payments: {
        Row: {
          created_at: string
          employee_id: string
          gross_amount: number
          id: string
          income_tax: number
          net_amount: number
          notes: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_month: number
          payment_year: number
          sgk_employee: number
          sgk_employer: number
          stamp_tax: number
          transaction_id: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          gross_amount: number
          id?: string
          income_tax?: number
          net_amount: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_month: number
          payment_year: number
          sgk_employee?: number
          sgk_employer?: number
          stamp_tax?: number
          transaction_id?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          gross_amount?: number
          id?: string
          income_tax?: number
          net_amount?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_month?: number
          payment_year?: number
          sgk_employee?: number
          sgk_employer?: number
          stamp_tax?: number
          transaction_id?: string | null
        }
        Relationships: []
      }
      service_form_items: {
        Row: {
          firma_id: string | null
          updated_at: string
        }
        Insert: {
          firma_id?: string | null
          updated_at?: string
        }
        Update: {
          firma_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_forms: {
        Row: {
          firma_id: string | null
          sube_id: string | null
          updated_at: string
        }
        Insert: {
          firma_id?: string | null
          sube_id?: string | null
          updated_at?: string
        }
        Update: {
          firma_id?: string | null
          sube_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sube_gider_gelir: {
        Row: {
          aciklama: string | null
          belge_no: string | null
          created_at: string
          id: string
          kategori: string | null
          kullanici_id: string | null
          sube_id: string
          tarih: string
          tip: string
          tutar: number
        }
        Insert: {
          aciklama?: string | null
          belge_no?: string | null
          created_at?: string
          id?: string
          kategori?: string | null
          kullanici_id?: string | null
          sube_id: string
          tarih: string
          tip: string
          tutar?: number
        }
        Update: {
          aciklama?: string | null
          belge_no?: string | null
          created_at?: string
          id?: string
          kategori?: string | null
          kullanici_id?: string | null
          sube_id?: string
          tarih?: string
          tip?: string
          tutar?: number
        }
        Relationships: []
      }
      subeler: {
        Row: {
          acilis_tarihi: string | null
          ad: string
          adres: string | null
          aktif: boolean
          created_at: string
          email: string | null
          firma_id: string | null
          id: string
          ilce: string | null
          notlar: string | null
          posta_kodu: string | null
          sehir: string | null
          telefon: string | null
          tip: string
          yetkili_kisi: string | null
          yetkili_telefon: string | null
        }
        Insert: {
          acilis_tarihi?: string | null
          ad: string
          adres?: string | null
          aktif?: boolean
          created_at?: string
          email?: string | null
          firma_id?: string | null
          id?: string
          ilce?: string | null
          notlar?: string | null
          posta_kodu?: string | null
          sehir?: string | null
          telefon?: string | null
          tip?: string
          yetkili_kisi?: string | null
          yetkili_telefon?: string | null
        }
        Update: {
          acilis_tarihi?: string | null
          ad?: string
          adres?: string | null
          aktif?: boolean
          created_at?: string
          email?: string | null
          firma_id?: string | null
          id?: string
          ilce?: string | null
          notlar?: string | null
          posta_kodu?: string | null
          sehir?: string | null
          telefon?: string | null
          tip?: string
          yetkili_kisi?: string | null
          yetkili_telefon?: string | null
        }
        Relationships: []
      }
      tax_declarations: {
        Row: {
          base_amount: number | null
          created_at: string
          declaration_date: string | null
          due_date: string
          id: string
          notes: string | null
          paid_amount: number
          period_month: number | null
          period_quarter: number | null
          period_year: number
          status: Database["public"]["Enums"]["declaration_status"]
          tax_amount: number | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at: string
        }
        Insert: {
          base_amount?: number | null
          created_at?: string
          declaration_date?: string | null
          due_date: string
          id?: string
          notes?: string | null
          paid_amount?: number
          period_month?: number | null
          period_quarter?: number | null
          period_year: number
          status?: Database["public"]["Enums"]["declaration_status"]
          tax_amount?: number | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Update: {
          base_amount?: number | null
          created_at?: string
          declaration_date?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          period_month?: number | null
          period_quarter?: number | null
          period_year?: number
          status?: Database["public"]["Enums"]["declaration_status"]
          tax_amount?: number | null
          tax_type?: Database["public"]["Enums"]["tax_type"]
          updated_at?: string
        }
        Relationships: []
      }
      tedarikciler: {
        Row: {
          adres: string | null
          aktif: boolean
          created_at: string
          email: string | null
          firma_adi: string
          firma_id: string | null
          id: string
          notlar: string | null
          odeme_vadesi: number | null
          sehir: string | null
          telefon: string | null
          updated_at: string
          urunler_hizmetler: string | null
          vergi_dairesi: string | null
          vergi_no: string | null
          web_sitesi: string | null
          yetkili_adi: string | null
          yetkili_telefon: string | null
        }
        Insert: {
          adres?: string | null
          aktif?: boolean
          created_at?: string
          email?: string | null
          firma_adi: string
          firma_id?: string | null
          id?: string
          notlar?: string | null
          odeme_vadesi?: number | null
          sehir?: string | null
          telefon?: string | null
          updated_at?: string
          urunler_hizmetler?: string | null
          vergi_dairesi?: string | null
          vergi_no?: string | null
          web_sitesi?: string | null
          yetkili_adi?: string | null
          yetkili_telefon?: string | null
        }
        Update: {
          adres?: string | null
          aktif?: boolean
          created_at?: string
          email?: string | null
          firma_adi?: string
          firma_id?: string | null
          id?: string
          notlar?: string | null
          odeme_vadesi?: number | null
          sehir?: string | null
          telefon?: string | null
          updated_at?: string
          urunler_hizmetler?: string | null
          vergi_dairesi?: string | null
          vergi_no?: string | null
          web_sitesi?: string | null
          yetkili_adi?: string | null
          yetkili_telefon?: string | null
        }
        Relationships: []
      }
      teklif_kalemleri: {
        Row: {
          aciklama: string
          birim_fiyat: number
          created_at: string
          firma_id: string | null
          id: string
          iskonto: number
          miktar: number
          sira_no: number
          teklif_id: string
          toplam: number
          updated_at: string
        }
        Insert: {
          aciklama?: string
          birim_fiyat?: number
          created_at?: string
          firma_id?: string | null
          id?: string
          iskonto?: number
          miktar?: number
          sira_no?: number
          teklif_id: string
          toplam?: number
          updated_at?: string
        }
        Update: {
          aciklama?: string
          birim_fiyat?: number
          created_at?: string
          firma_id?: string | null
          id?: string
          iskonto?: number
          miktar?: number
          sira_no?: number
          teklif_id?: string
          toplam?: number
          updated_at?: string
        }
        Relationships: []
      }
      teklifler: {
        Row: {
          ara_toplam: number
          created_at: string
          doviz_kuru: number | null
          durum: string
          firma_id: string | null
          gecerlilik_bitis: string | null
          gecerlilik_suresi: number
          genel_iskonto: number
          genel_iskonto_tip: string
          genel_iskonto_tutar: number
          genel_toplam: number
          id: string
          kar_orani: number | null
          kdv_durumu: string
          kdv_orani: number
          kdv_tutari: number
          musteri_adi: string
          musteri_email: string | null
          musteri_id: string | null
          musteri_sehir: string | null
          musteri_telefon: string | null
          notlar: string | null
          para_birimi: string
          sehir: string | null
          tarih: string
          teklif_no: string
          ticari_sartname_ekli: boolean
          ticari_sartname_metni: string | null
          updated_at: string
        }
        Insert: {
          ara_toplam?: number
          created_at?: string
          doviz_kuru?: number | null
          durum?: string
          firma_id?: string | null
          gecerlilik_bitis?: string | null
          gecerlilik_suresi?: number
          genel_iskonto?: number
          genel_iskonto_tip?: string
          genel_iskonto_tutar?: number
          genel_toplam?: number
          id?: string
          kar_orani?: number | null
          kdv_durumu?: string
          kdv_orani?: number
          kdv_tutari?: number
          musteri_adi?: string
          musteri_email?: string | null
          musteri_id?: string | null
          musteri_sehir?: string | null
          musteri_telefon?: string | null
          notlar?: string | null
          para_birimi?: string
          sehir?: string | null
          tarih?: string
          teklif_no: string
          ticari_sartname_ekli?: boolean
          ticari_sartname_metni?: string | null
          updated_at?: string
        }
        Update: {
          ara_toplam?: number
          created_at?: string
          doviz_kuru?: number | null
          durum?: string
          firma_id?: string | null
          gecerlilik_bitis?: string | null
          gecerlilik_suresi?: number
          genel_iskonto?: number
          genel_iskonto_tip?: string
          genel_iskonto_tutar?: number
          genel_toplam?: number
          id?: string
          kar_orani?: number | null
          kdv_durumu?: string
          kdv_orani?: number
          kdv_tutari?: number
          musteri_adi?: string
          musteri_email?: string | null
          musteri_id?: string | null
          musteri_sehir?: string | null
          musteri_telefon?: string | null
          notlar?: string | null
          para_birimi?: string
          sehir?: string | null
          tarih?: string
          teklif_no?: string
          ticari_sartname_ekli?: boolean
          ticari_sartname_metni?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      teknik_hesap_ayarlari: {
        Row: {
          aciklama: string | null
          aktif: boolean
          ayar_adi: string
          ayar_degeri: string
          ayar_grubu: string
          birim: string | null
          created_at: string
          firma_id: string | null
          id: string
          max_value: number | null
          min_value: number | null
          options_json: Json | null
          sort_order: number | null
          updated_at: string
          value_type: string | null
        }
        Insert: {
          aciklama?: string | null
          aktif?: boolean
          ayar_adi: string
          ayar_degeri: string
          ayar_grubu: string
          birim?: string | null
          created_at?: string
          firma_id?: string | null
          id?: string
          max_value?: number | null
          min_value?: number | null
          options_json?: Json | null
          sort_order?: number | null
          updated_at?: string
          value_type?: string | null
        }
        Update: {
          aciklama?: string | null
          aktif?: boolean
          ayar_adi?: string
          ayar_degeri?: string
          ayar_grubu?: string
          birim?: string | null
          created_at?: string
          firma_id?: string | null
          id?: string
          max_value?: number | null
          min_value?: number | null
          options_json?: Json | null
          sort_order?: number | null
          updated_at?: string
          value_type?: string | null
        }
        Relationships: []
      }
      teknik_raporlar: {
        Row: {
          adres: string | null
          baslik: string
          calculation_result: Json
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name_snapshot: string
          durum: string
          firma_id: string | null
          hazirlayan_personel_id: string | null
          id: string
          input_data: Json
          lokasyon: string | null
          material_list: Json
          notes: string | null
          pdf_url: string | null
          rapor_no: string
          rapor_tarihi: string
          rapor_turu: string
          standart_profili: string | null
          sube_id: string
          talep_id: string | null
          teklif_id: string | null
          teslimat_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adres?: string | null
          baslik: string
          calculation_result?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot: string
          durum?: string
          firma_id?: string | null
          hazirlayan_personel_id?: string | null
          id?: string
          input_data?: Json
          lokasyon?: string | null
          material_list?: Json
          notes?: string | null
          pdf_url?: string | null
          rapor_no: string
          rapor_tarihi?: string
          rapor_turu: string
          standart_profili?: string | null
          sube_id: string
          talep_id?: string | null
          teklif_id?: string | null
          teslimat_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adres?: string | null
          baslik?: string
          calculation_result?: Json
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name_snapshot?: string
          durum?: string
          firma_id?: string | null
          hazirlayan_personel_id?: string | null
          id?: string
          input_data?: Json
          lokasyon?: string | null
          material_list?: Json
          notes?: string | null
          pdf_url?: string | null
          rapor_no?: string
          rapor_tarihi?: string
          rapor_turu?: string
          standart_profili?: string | null
          sube_id?: string
          talep_id?: string | null
          teklif_id?: string | null
          teslimat_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      teslimat_durum_gecmisi: {
        Row: {
          aciklama: string | null
          created_at: string
          created_by: string | null
          eski_durum: string | null
          firma_id: string | null
          id: string
          teslimat_id: string
          yeni_durum: string
        }
        Insert: {
          aciklama?: string | null
          created_at?: string
          created_by?: string | null
          eski_durum?: string | null
          firma_id?: string | null
          id?: string
          teslimat_id: string
          yeni_durum: string
        }
        Update: {
          aciklama?: string | null
          created_at?: string
          created_by?: string | null
          eski_durum?: string | null
          firma_id?: string | null
          id?: string
          teslimat_id?: string
          yeni_durum?: string
        }
        Relationships: []
      }
      teslimat_kalemleri: {
        Row: {
          aciklama: string
          birim: string
          birim_fiyat: number
          created_at: string
          emanet_mi: boolean
          faturalanir_mi: boolean
          firma_id: string | null
          geri_alinmasi_gerekir_mi: boolean
          hareket_tipi: string
          hareket_yonu: string
          hedef_tarih: string | null
          id: string
          miktar: number
          musteri_envanterine_isler_mi: boolean
          notlar: string | null
          onceki_kalem_id: string | null
          stoktan_duser_mi: boolean
          teslimat_id: string
          toplam_tutar: number
          urun_id: string | null
        }
        Insert: {
          aciklama: string
          birim?: string
          birim_fiyat?: number
          created_at?: string
          emanet_mi?: boolean
          faturalanir_mi?: boolean
          firma_id?: string | null
          geri_alinmasi_gerekir_mi?: boolean
          hareket_tipi: string
          hareket_yonu: string
          hedef_tarih?: string | null
          id?: string
          miktar?: number
          musteri_envanterine_isler_mi?: boolean
          notlar?: string | null
          onceki_kalem_id?: string | null
          stoktan_duser_mi?: boolean
          teslimat_id: string
          toplam_tutar?: number
          urun_id?: string | null
        }
        Update: {
          aciklama?: string
          birim?: string
          birim_fiyat?: number
          created_at?: string
          emanet_mi?: boolean
          faturalanir_mi?: boolean
          firma_id?: string | null
          geri_alinmasi_gerekir_mi?: boolean
          hareket_tipi?: string
          hareket_yonu?: string
          hedef_tarih?: string | null
          id?: string
          miktar?: number
          musteri_envanterine_isler_mi?: boolean
          notlar?: string | null
          onceki_kalem_id?: string | null
          stoktan_duser_mi?: boolean
          teslimat_id?: string
          toplam_tutar?: number
          urun_id?: string | null
        }
        Relationships: []
      }
      teslimat_takip_kapatma: {
        Row: {
          created_at: string
          firma_id: string | null
          id: string
          kalem_id: string
          miktar: number
          takip_id: string
          takip_tipi: string
        }
        Insert: {
          created_at?: string
          firma_id?: string | null
          id?: string
          kalem_id: string
          miktar: number
          takip_id: string
          takip_tipi: string
        }
        Update: {
          created_at?: string
          firma_id?: string | null
          id?: string
          kalem_id?: string
          miktar?: number
          takip_id?: string
          takip_tipi?: string
        }
        Relationships: []
      }
      teslimatlar: {
        Row: {
          aciklama: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          durum: string
          firma_id: string | null
          hedef_tarih: string | null
          id: string
          imza_atan_ad_soyad: string | null
          imza_atan_unvan: string | null
          imza_tarihi: string | null
          musteri_imza_data: string | null
          notlar: string | null
          on_kayit_olusturuldu: boolean
          on_kayit_secimi: string
          personel_id: string | null
          sube_id: string | null
          teslim_form_mail_gonderildi: boolean
          teslim_form_mail_tarihi: string | null
          teslim_form_no: string | null
          teslim_form_pdf_url: string | null
          teslimat_no: string
          teslimat_tarihi: string
          updated_at: string
        }
        Insert: {
          aciklama?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          imza_atan_ad_soyad?: string | null
          imza_atan_unvan?: string | null
          imza_tarihi?: string | null
          musteri_imza_data?: string | null
          notlar?: string | null
          on_kayit_olusturuldu?: boolean
          on_kayit_secimi?: string
          personel_id?: string | null
          sube_id?: string | null
          teslim_form_mail_gonderildi?: boolean
          teslim_form_mail_tarihi?: string | null
          teslim_form_no?: string | null
          teslim_form_pdf_url?: string | null
          teslimat_no: string
          teslimat_tarihi?: string
          updated_at?: string
        }
        Update: {
          aciklama?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          durum?: string
          firma_id?: string | null
          hedef_tarih?: string | null
          id?: string
          imza_atan_ad_soyad?: string | null
          imza_atan_unvan?: string | null
          imza_tarihi?: string | null
          musteri_imza_data?: string | null
          notlar?: string | null
          on_kayit_olusturuldu?: boolean
          on_kayit_secimi?: string
          personel_id?: string | null
          sube_id?: string | null
          teslim_form_mail_gonderildi?: boolean
          teslim_form_mail_tarihi?: string | null
          teslim_form_no?: string | null
          teslim_form_pdf_url?: string | null
          teslimat_no?: string
          teslimat_tarihi?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          id: string
          invoice_id: string | null
          kdv_amount: number
          kdv_included: boolean
          kdv_rate: number
          net_amount: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          recurring_id: string | null
          reference_no: string | null
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          id?: string
          invoice_id?: string | null
          kdv_amount?: number
          kdv_included?: boolean
          kdv_rate?: number
          net_amount: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recurring_id?: string | null
          reference_no?: string | null
          transaction_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          description?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          id?: string
          invoice_id?: string | null
          kdv_amount?: number
          kdv_included?: boolean
          kdv_rate?: number
          net_amount?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recurring_id?: string | null
          reference_no?: string | null
          transaction_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      uretim_emirleri: {
        Row: {
          created_at: string
          durum: string
          emir_no: string
          firma_id: string | null
          gercek_baslangic: string | null
          gercek_bitis: string | null
          id: string
          miktar: number
          notlar: string | null
          planlanan_baslangic: string | null
          planlanan_bitis: string | null
          sorumlu: string | null
          urun_id: string
        }
        Insert: {
          created_at?: string
          durum?: string
          emir_no: string
          firma_id?: string | null
          gercek_baslangic?: string | null
          gercek_bitis?: string | null
          id?: string
          miktar: number
          notlar?: string | null
          planlanan_baslangic?: string | null
          planlanan_bitis?: string | null
          sorumlu?: string | null
          urun_id: string
        }
        Update: {
          created_at?: string
          durum?: string
          emir_no?: string
          firma_id?: string | null
          gercek_baslangic?: string | null
          gercek_bitis?: string | null
          id?: string
          miktar?: number
          notlar?: string | null
          planlanan_baslangic?: string | null
          planlanan_bitis?: string | null
          sorumlu?: string | null
          urun_id?: string
        }
        Relationships: []
      }
      uretim_hareketleri: {
        Row: {
          hammadde_id: string
          id: string
          kullanilan_miktar: number
          notlar: string | null
          tarih: string
          uretim_emri_id: string
        }
        Insert: {
          hammadde_id: string
          id?: string
          kullanilan_miktar: number
          notlar?: string | null
          tarih?: string
          uretim_emri_id: string
        }
        Update: {
          hammadde_id?: string
          id?: string
          kullanilan_miktar?: number
          notlar?: string | null
          tarih?: string
          uretim_emri_id?: string
        }
        Relationships: []
      }
      urun_receteler: {
        Row: {
          birim: string
          firma_id: string | null
          hammadde_id: string
          id: string
          miktar: number
          notlar: string | null
          urun_id: string
        }
        Insert: {
          birim: string
          firma_id?: string | null
          hammadde_id: string
          id?: string
          miktar: number
          notlar?: string | null
          urun_id: string
        }
        Update: {
          birim?: string
          firma_id?: string | null
          hammadde_id?: string
          id?: string
          miktar?: number
          notlar?: string | null
          urun_id?: string
        }
        Relationships: []
      }
      urun_stok: {
        Row: {
          id: string
          stok_adedi: number
          updated_at: string
          urun_id: string
        }
        Insert: {
          id?: string
          stok_adedi?: number
          updated_at?: string
          urun_id: string
        }
        Update: {
          id?: string
          stok_adedi?: number
          updated_at?: string
          urun_id?: string
        }
        Relationships: []
      }
      urunler: {
        Row: {
          ad: string
          aktif: boolean
          birim: string
          created_at: string
          dolum_fiyati: number | null
          firma_id: string | null
          id: string
          kapasite: string | null
          kategori: string
          kdv_dahil_fiyat: number
          kdv_haric_fiyat: number
          periyodik_bakim_fiyati: number | null
          tip: string | null
          updated_at: string
        }
        Insert: {
          ad: string
          aktif?: boolean
          birim?: string
          created_at?: string
          dolum_fiyati?: number | null
          firma_id?: string | null
          id?: string
          kapasite?: string | null
          kategori: string
          kdv_dahil_fiyat?: number
          kdv_haric_fiyat?: number
          periyodik_bakim_fiyati?: number | null
          tip?: string | null
          updated_at?: string
        }
        Update: {
          ad?: string
          aktif?: boolean
          birim?: string
          created_at?: string
          dolum_fiyati?: number | null
          firma_id?: string | null
          id?: string
          kapasite?: string | null
          kategori?: string
          kdv_dahil_fiyat?: number
          kdv_haric_fiyat?: number
          periyodik_bakim_fiyati?: number | null
          tip?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      yillik_izin_hakki: {
        Row: {
          created_at: string
          devreden: number
          id: string
          kalan: number
          kullanilan: number
          personel_id: string
          toplam_hak: number
          yil: number
        }
        Insert: {
          created_at?: string
          devreden?: number
          id?: string
          kalan?: number
          kullanilan?: number
          personel_id: string
          toplam_hak?: number
          yil: number
        }
        Update: {
          created_at?: string
          devreden?: number
          id?: string
          kalan?: number
          kullanilan?: number
          personel_id?: string
          toplam_hak?: number
          yil?: number
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      aggregate_update_lines: {
        Args: {
          p_parent_table: string
          p_line_table: string
          p_line_parent_column: string
          p_parent_id: string
          p_firma_id: string
          p_parent_patch: Json
          p_lines_to_insert: Json
          p_lines_to_update: Json
          p_line_ids_to_delete: string[]
          p_expected_updated_at?: string | null
        }
        Returns: Json
      }
      current_firma_id: {
        Args: {
          [key: string]: never
        }
        Returns: string
      }
      generate_proforma_no: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      generate_sicil_no: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      increment_invoice_series: {
        Args: {
          p_prefix: string
          p_year: number
        }
        Returns: string
      }
      invoice_apply_optional_patch: {
        Args: {
          p_invoice_id: string
          p_patch: Json
        }
        Returns: undefined
      }
      invoice_update_atomic: {
        Args: {
          p_invoice_id: string
          p_invoice_patch: Json
          p_items: Json
          p_delete_item_ids?: string[] | null
          p_brokers?: Json | null
          p_delete_broker_ids?: string[] | null
          p_confirm_delete_all?: boolean | null
          p_expected_updated_at?: string | null
          p_idempotency_key?: string | null
          p_user_id?: string | null
          p_firma_id?: string | null
        }
        Returns: Json
      }
      is_super_admin: {
        Args: {
          [key: string]: never
        }
        Returns: boolean
      }
      next_operasyon_no: {
        Args: {
          prefix: string
          table_name: string
          column_name: string
        }
        Returns: unknown
      }
      set_is_plani_no: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      set_musteri_talep_no: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      set_planli_is_updated_at: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      set_updated_at: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      sync_invoice_payment_status: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      teslimat_takip_kapatma_geri_al: {
        Args: {
          p_kalem_ids: string[]
        }
        Returns: undefined
      }
      teslimat_update_atomic: {
        Args: {
          p_teslimat_id: string
          p_parent_patch: Json
          p_lines: Json
          p_delete_line_ids?: string[] | null
          p_confirm_delete_all?: boolean | null
          p_expected_updated_at?: string | null
          p_idempotency_key?: string | null
          p_user_id?: string | null
          p_firma_id?: string | null
        }
        Returns: Json
      }
      update_proforma_updated_at: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
      update_updated_at: {
        Args: {
          [key: string]: never
        }
        Returns: unknown
      }
    }
    Enums: {
      declaration_status: "hazirlanacak" | "hazirlandi" | "verildi" | "odendi"
      employee_status: "aktif" | "izinli" | "ayrildi"
      invoice_status: "taslak" | "kesildi" | "gonderildi" | "odendi" | "kismi_odendi" | "iptal"
      invoice_type: "satis" | "alis" | "iade_satis" | "iade_alis"
      payment_direction: "tahsilat" | "odeme"
      payment_method: "nakit" | "havale_eft" | "kredi_karti" | "cek" | "senet" | "diger"
      recurrence_period: "aylik" | "ucaylik" | "altiaylik" | "yillik"
      tax_type: "kdv" | "muhtasar" | "gelir_vergisi" | "kurumlar_vergisi" | "sgk_bildirimi" | "damga_vergisi"
      transaction_direction: "gelir" | "gider"
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
