/**
 * AI vision sağlayıcısı yapılandırması ve **hata sınıflandırması**.
 *
 * ── NEDEN AYRI MODÜL ────────────────────────────────────────────────────────
 * Vision route'ları sağlayıcıdan gelen HER hatayı tek bir 502
 * "servis geçici olarak yanıt vermiyor" mesajına çeviriyordu. Sağlayıcı modeli
 * kaldırdığında (`404 model_not_found`) bu, kalıcı bir yapılandırma hatasını
 * "birazdan tekrar deneyin" gibi gösterdi ve gerçek neden aylarca görünmez
 * kaldı. Sınıflandırma burada saf bir fonksiyondur; `node --test` altında
 * doğrudan doğrulanır.
 *
 * Model adı koda gömülmez: sağlayıcılar model kimliklerini emekliye ayırır.
 * `GROQ_VISION_MODEL` ile yapılandırılır.
 */

export const AI_ERROR = {
  /** API anahtarı tanımlı değil. */
  NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  /** Model bu hesapta yok / emekliye ayrılmış — yönetici müdahalesi gerekir. */
  MODEL_UNAVAILABLE: 'AI_MODEL_UNAVAILABLE',
  /** Anahtar geçersiz veya yetkisiz. */
  UNAUTHORIZED: 'AI_UNAUTHORIZED',
  /** Kota/hız sınırı — bir süre sonra tekrar denenebilir. */
  RATE_LIMITED: 'AI_RATE_LIMITED',
  /** Sağlayıcı tarafında geçici arıza. */
  UPSTREAM_ERROR: 'AI_UPSTREAM_ERROR',
  /** Sağlayıcı JSON dışında bir gövde döndürdü. */
  NON_JSON: 'AI_NON_JSON',
  /** İstek zaman aşımına uğradı. */
  TIMEOUT: 'AI_TIMEOUT',
  /** Sağlayıcıya hiç ulaşılamadı (ağ/DNS). */
  UNREACHABLE: 'AI_UNREACHABLE',
} as const

export type AiErrorCode = (typeof AI_ERROR)[keyof typeof AI_ERROR]

export interface AiFailure {
  code: AiErrorCode
  /** Kullanıcıya gösterilecek Türkçe mesaj. */
  message: string
  /** İstemcinin aynı isteği tekrar denemesi anlamlı mı? */
  retryable: boolean
  /** Bu route'un döndüreceği HTTP durumu. */
  status: number
}

/**
 * Vision modeli. Sağlayıcı model kimliklerini emekliye ayırdığında yalnızca
 * ortam değişkeni güncellenir; kod değişmez.
 */
export function visionModel(): string {
  return (process.env.GROQ_VISION_MODEL ?? '').trim() || 'meta-llama/llama-4-scout-17b-16e-instruct'
}

/** Sağlayıcının gövdesi model hatası mı bildiriyor? (gövde loglanmaz) */
function mentionsModel(body: string): boolean {
  return /model_not_found|does not exist|decommission|model[_ ]?(is )?(not )?(available|supported)/i.test(body)
}

/**
 * Sağlayıcının HTTP yanıtını kullanıcıya gösterilecek hataya çevirir.
 *
 * `body` yalnızca **kod tespiti** için okunur; hiçbir yere loglanmaz ve
 * istemciye gönderilmez (fatura içeriği/PII taşıyabilir).
 */
export function classifyAiHttpError(status: number, body = ''): AiFailure {
  if (status === 401 || status === 403) {
    return {
      code: AI_ERROR.UNAUTHORIZED,
      message: 'Fatura okuma servisi kimlik doğrulaması başarısız. Sistem yöneticisine bildirin.',
      retryable: false,
      status: 503,
    }
  }

  // 404 daima modelin yokluğunu, 400 ise çoğunlukla geçersiz model adını bildirir.
  if (status === 404 || (status === 400 && mentionsModel(body))) {
    return {
      code: AI_ERROR.MODEL_UNAVAILABLE,
      message:
        'Fatura okuma için yapılandırılan yapay zekâ modeli sağlayıcıda bulunamadı. ' +
        'Sistem yöneticisinin GROQ_VISION_MODEL ayarını güncellemesi gerekiyor.',
      retryable: false,
      status: 503,
    }
  }

  if (status === 429) {
    return {
      code: AI_ERROR.RATE_LIMITED,
      message: 'Fatura okuma servisi kota sınırına ulaştı. Lütfen biraz sonra tekrar deneyin.',
      retryable: true,
      status: 429,
    }
  }

  return {
    code: AI_ERROR.UPSTREAM_ERROR,
    message: 'Fatura okuma servisi geçici olarak yanıt vermiyor. Lütfen tekrar deneyin.',
    retryable: true,
    status: 502,
  }
}

/** `fetch` fırlattığında (ağ hatası / abort) sınıflandırma. */
export function classifyAiFetchError(error: unknown): AiFailure {
  const name = (error as { name?: string } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') {
    return {
      code: AI_ERROR.TIMEOUT,
      message: 'Fatura okuma zaman aşımına uğradı. Lütfen tekrar deneyin.',
      retryable: true,
      status: 504,
    }
  }
  return {
    code: AI_ERROR.UNREACHABLE,
    message: 'Fatura okuma servisine ulaşılamadı. Lütfen tekrar deneyin.',
    retryable: true,
    status: 504,
  }
}
