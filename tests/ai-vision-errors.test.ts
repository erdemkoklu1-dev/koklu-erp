/**
 * AI sağlayıcı hata sınıflandırması (GOREV.md §4.3 / §5.1).
 *
 * P0'ın kök nedeni buydu: sağlayıcı `404 model_not_found` döndürüyordu ama route
 * bunu diğer bütün hatalarla birlikte tek bir 502
 * "Fatura okuma servisi geçici olarak yanıt vermiyor" mesajına çeviriyordu.
 * Kalıcı bir yapılandırma hatası, geçici bir arıza gibi göründü.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import {
  AI_ERROR,
  classifyAiFetchError,
  classifyAiHttpError,
  visionModel,
} from '../src/lib/invoice-parse/ai-vision.ts'

const MODEL_NOT_FOUND_BODY = JSON.stringify({
  error: {
    message: 'The model `meta-llama/llama-4-scout-17b-16e-instruct` does not exist or you do not have access to it.',
    type: 'invalid_request_error',
    code: 'model_not_found',
  },
})

describe('Model kullanılamıyor', () => {
  it('404 kalıcı yapılandırma hatası olarak raporlanır, "tekrar deneyin" denmez', () => {
    const failure = classifyAiHttpError(404, MODEL_NOT_FOUND_BODY)
    assert.equal(failure.code, AI_ERROR.MODEL_UNAVAILABLE)
    assert.equal(failure.retryable, false)
    assert.doesNotMatch(failure.message, /tekrar deneyin/i)
    assert.match(failure.message, /GROQ_VISION_MODEL/)
  })

  it('gövdesinde model hatası olan 400 de aynı sınıfa girer', () => {
    const failure = classifyAiHttpError(400, MODEL_NOT_FOUND_BODY)
    assert.equal(failure.code, AI_ERROR.MODEL_UNAVAILABLE)
  })

  it('model ile ilgisi olmayan 400 genel yukarı akış hatası kalır', () => {
    const failure = classifyAiHttpError(400, JSON.stringify({ error: { message: 'bad request' } }))
    assert.equal(failure.code, AI_ERROR.UPSTREAM_ERROR)
  })
})

describe('Hata sınıfları birbirine karışmaz', () => {
  it('her sınıf ayrı kod üretir', () => {
    const codes = [
      classifyAiHttpError(401).code,
      classifyAiHttpError(404, MODEL_NOT_FOUND_BODY).code,
      classifyAiHttpError(429).code,
      classifyAiHttpError(500).code,
    ]
    assert.equal(new Set(codes).size, codes.length, `kodlar karıştı: ${codes.join(', ')}`)
  })

  it('kimlik hatası tekrar denenebilir değildir', () => {
    const failure = classifyAiHttpError(401)
    assert.equal(failure.code, AI_ERROR.UNAUTHORIZED)
    assert.equal(failure.retryable, false)
  })

  it('kota sınırı tekrar denenebilirdir', () => {
    const failure = classifyAiHttpError(429)
    assert.equal(failure.code, AI_ERROR.RATE_LIMITED)
    assert.equal(failure.retryable, true)
    assert.equal(failure.status, 429)
  })

  it('timeout ve ulaşılamama ayrı kodlarla raporlanır', () => {
    const timeout = classifyAiFetchError(Object.assign(new Error('x'), { name: 'TimeoutError' }))
    const network = classifyAiFetchError(new TypeError('fetch failed'))

    assert.equal(timeout.code, AI_ERROR.TIMEOUT)
    assert.equal(network.code, AI_ERROR.UNREACHABLE)
    assert.equal(timeout.retryable, true)
    assert.equal(network.retryable, true)
  })
})

describe('Kullanıcıya gösterilen mesajlar', () => {
  it('secret veya ham gövde sızdırmaz', () => {
    const body = JSON.stringify({ error: { message: 'sk-secret-token-degeri gecersiz' } })
    for (const status of [400, 401, 404, 429, 500, 503]) {
      const failure = classifyAiHttpError(status, body)
      assert.doesNotMatch(failure.message, /sk-secret-token-degeri/)
    }
  })

  it('Türkçe ve teknik ayrıntısızdır', () => {
    for (const status of [400, 401, 404, 429, 500]) {
      const { message } = classifyAiHttpError(status, MODEL_NOT_FOUND_BODY)
      assert.doesNotMatch(message, /undefined|null|\[object/)
      assert.ok(message.length > 20, `mesaj çok kısa: ${message}`)
    }
  })
})

describe('Model yapılandırması', () => {
  it('ortam değişkeni tanımlıysa onu kullanır', () => {
    const previous = process.env.GROQ_VISION_MODEL
    try {
      process.env.GROQ_VISION_MODEL = 'ornek/model-1'
      assert.equal(visionModel(), 'ornek/model-1')

      // Boş/boşluklu değer varsayılana düşer; boş model adı gönderilmez.
      process.env.GROQ_VISION_MODEL = '   '
      assert.notEqual(visionModel().trim(), '')
    } finally {
      if (previous === undefined) delete process.env.GROQ_VISION_MODEL
      else process.env.GROQ_VISION_MODEL = previous
    }
  })
})
