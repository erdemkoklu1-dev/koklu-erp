# Staging Schema Apply Next Steps

> Sprint 2.6 sonraki adımlar dokümanıdır. SQL çalıştırmaz; staging schema apply sonrası karar ve takip listesidir.

## Amaç

Env doğrulama ve manuel schema apply oturumlarından sonra kalan işleri, blokajları ve GO/NO-GO kararını tek yerde toplamak.

## Güncel Karar

```txt
[ ] GO     — Schema doğrulama, seed/auth ve RLS preflight hazırlığına geçilebilir.
[ ] NO-GO  — Aşağıdaki blokajlar giderilmeden devam edilmez.
```

## Blokajlar

| ID | Blokaj | Kaynak doküman | Sahip | Hedef çözüm | Durum |
| --- | --- | --- | --- | --- | --- |
| BLK-001 | | | | | |

## Sıradaki Kontrollü Adımlar

1. `db/staging_env_verification_session.md` sonucunu netleştir.
2. `db/staging_schema_apply_manual_session.md` oturum kaydını tamamla.
3. `db/staging_schema_apply_results.md` sonuç tablolarını doldur.
4. Varsa `db/staging_schema_apply_error_log.md` kayıtlarını kapat veya NO-GO nedeni olarak bırak.
5. `db/staging_schema_required_objects_check.sql` sonuçlarını staging'de read-only olarak değerlendir.
6. Seed/Auth adımlarına geçmeden önce secret ve `.env` dosyalarının commit'e alınmadığını doğrula.
7. `db/staging_preflight_go_gate.md` GO demeden RLS helper, cleanup veya policy apply dosyalarını çalıştırma.

## RLS Preflight'e Geçiş Şartları

- [ ] Env verification GO.
- [ ] Schema apply sonuçları temiz.
- [ ] Required objects check temiz.
- [ ] Seed/Auth doğrulaması temiz.
- [ ] Hata logunda açık kritik kayıt yok.
- [ ] Preflight GO gate tüm maddeleri geçti.

## Takip Notları

-
