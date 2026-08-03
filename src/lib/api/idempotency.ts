/**
 * Tekrar gönderim (double submit) koruması.
 *
 * DİKKAT — kapsam sınırı: bu store **process içi**dir. Tek instance / dev ortamında
 * çift tıklamayı ve hızlı retry'ı engeller. Çok instance'lı serverless dağıtımda
 * kalıcı garanti için `db/aggregate_atomic_update_rpc.sql` içindeki
 * `public.aggregate_idempotency` tablosu apply edilmelidir; o zamana kadar bu
 * koruma "best effort" olarak raporlanır ve tek gerçek koruma sayılmaz.
 *
 * Bağımlılıksızdır; `node --test` altında doğrudan test edilir.
 */

export interface IdempotencyRecord<T> {
  status: 'in_flight' | 'done'
  result?: T
  expiresAt: number
}

export type ClaimOutcome<T> =
  | { state: 'claimed'; release: (result: T) => void; abandon: () => void }
  | { state: 'in_flight' }
  | { state: 'replayed'; result: T }

export class IdempotencyStore<T> {
  private readonly entries = new Map<string, IdempotencyRecord<T>>()

  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = () => Date.now(),
    private readonly maxEntries = 500,
  ) {}

  private sweep() {
    const current = this.now()
    for (const [key, record] of this.entries) {
      if (record.expiresAt <= current) this.entries.delete(key)
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  /**
   * Anahtarı sahiplenmeye çalışır.
   *  - `claimed`   ⇒ işlemi sen yürüt, bitince `release(result)` çağır.
   *  - `in_flight` ⇒ aynı istek hâlâ işleniyor (çift tıklama).
   *  - `replayed`  ⇒ daha önce tamamlandı, sonucu aynen döndür.
   */
  claim(key: string): ClaimOutcome<T> {
    this.sweep()
    const existing = this.entries.get(key)
    if (existing) {
      if (existing.status === 'in_flight') return { state: 'in_flight' }
      return { state: 'replayed', result: existing.result as T }
    }

    this.entries.set(key, { status: 'in_flight', expiresAt: this.now() + this.ttlMs })
    return {
      state: 'claimed',
      release: (result: T) => {
        this.entries.set(key, { status: 'done', result, expiresAt: this.now() + this.ttlMs })
      },
      // Hata durumunda anahtar serbest bırakılır ki kullanıcı tekrar deneyebilsin.
      abandon: () => {
        this.entries.delete(key)
      },
    }
  }

  get size(): number {
    return this.entries.size
  }
}
