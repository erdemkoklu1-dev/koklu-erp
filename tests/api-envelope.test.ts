import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  TRANSPORT_ERROR,
  readApiResponse,
  requestApi,
  transportFailure,
} from '../src/lib/api/envelope.ts'

function res(body: string, init: { status?: number; contentType?: string | null } = {}) {
  const headers = new Headers()
  if (init.contentType !== null) headers.set('content-type', init.contentType ?? 'application/json')
  headers.set('x-request-id', 'req-test')
  return new Response(body, { status: init.status ?? 200, headers })
}

describe('readApiResponse — JSON olmayan yanıtlar asla response.json() ile okunmaz', () => {
  test('404 HTML yanıtı "Unexpected token" yerine kontrollü hata verir', async () => {
    const html = '<!DOCTYPE html><html><body>This page could not be found</body></html>'
    const out = await readApiResponse(res(html, { status: 404, contentType: 'text/html; charset=utf-8' }))

    assert.equal(out.ok, false)
    assert.equal(out.error.code, TRANSPORT_ERROR.NOT_FOUND)
    // Kullanıcıya HTML gövdesi gösterilmez.
    assert.equal(out.error.message.includes('<'), false)
  })

  test('200 ama HTML gövde (proxy/login sayfası) kontrollü hata verir', async () => {
    const out = await readApiResponse(res('<html>login</html>', { contentType: 'text/html' }))
    assert.equal(out.ok, false)
    assert.equal(out.error.code, TRANSPORT_ERROR.NON_JSON_RESPONSE)
  })

  test('500 düz metin yanıtı retryable sunucu hatası olur', async () => {
    const out = await readApiResponse(res('Internal Server Error', { status: 500, contentType: 'text/plain' }))
    assert.equal(out.ok, false)
    assert.equal(out.error.code, TRANSPORT_ERROR.SERVER_ERROR)
    assert.equal(out.error.retryable, true)
  })

  test('content-type JSON ama gövde bozuk ⇒ ayrı hata kodu', async () => {
    const out = await readApiResponse(res('{"ok": tru', { status: 200 }))
    assert.equal(out.ok, false)
    assert.equal(out.error.code, TRANSPORT_ERROR.MALFORMED_JSON)
  })

  test('JSON 500 zarfı olduğu gibi geçer', async () => {
    const body = JSON.stringify({
      ok: false,
      error: { code: 'PARSE_FAILED', message: 'Fatura okunamadı', retryable: false },
      requestId: 'req-1',
    })
    const out = await readApiResponse(res(body, { status: 500 }))
    assert.equal(out.ok, false)
    assert.equal(out.error.code, 'PARSE_FAILED')
    assert.equal(out.requestId, 'req-1')
  })

  test('başarılı zarf data taşır', async () => {
    const body = JSON.stringify({ ok: true, data: { invoiceCount: 2 }, requestId: 'req-2' })
    const out = await readApiResponse<{ invoiceCount: number }>(res(body))
    assert.equal(out.ok, true)
    assert.equal(out.data.invoiceCount, 2)
  })

  test('eski zarfsız { error } gövdesi de anlamlı hataya çevrilir', async () => {
    const out = await readApiResponse(res(JSON.stringify({ error: 'Dosya bulunamadı' }), { status: 400 }))
    assert.equal(out.ok, false)
    assert.equal(out.error.message, 'Dosya bulunamadı')
  })

  test('eski zarfsız başarı gövdesi data içine sarılır', async () => {
    const out = await readApiResponse<{ items: unknown[] }>(res(JSON.stringify({ items: [1, 2] })))
    assert.equal(out.ok, true)
    assert.deepEqual(out.data.items, [1, 2])
  })

  test('content-type başlığı hiç yoksa JSON varsayılmaz', async () => {
    const out = await readApiResponse(res('{"ok":true,"data":1,"requestId":"x"}', { contentType: null }))
    assert.equal(out.ok, false)
    assert.equal(out.error.code, TRANSPORT_ERROR.NON_JSON_RESPONSE)
  })
})

describe('requestApi — timeout, iptal ve ağ kesintisi ayrı kodlarla', () => {
  test('timeout ayrı kod döner ve exception fırlatmaz', async () => {
    const original = globalThis.fetch
    globalThis.fetch = ((_input: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('timeout', 'TimeoutError'))
        })
      })) as typeof fetch
    try {
      const out = await requestApi('/api/v1/invoices/parse', { timeoutMs: 20 })
      assert.equal(out.ok, false)
      assert.equal(out.error.code, TRANSPORT_ERROR.TIMEOUT)
      assert.equal(out.error.retryable, true)
    } finally {
      globalThis.fetch = original
    }
  })

  test('ağ kesintisi NETWORK koduna çevrilir', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    try {
      const out = await requestApi('/api/v1/invoices/parse')
      assert.equal(out.ok, false)
      assert.equal(out.error.code, TRANSPORT_ERROR.NETWORK)
    } finally {
      globalThis.fetch = original
    }
  })

  test('dışarıdan iptal ABORTED kodu verir', async () => {
    const original = globalThis.fetch
    globalThis.fetch = ((_input: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as typeof fetch
    const controller = new AbortController()
    try {
      const promise = requestApi('/api/v1/invoices/parse', { signal: controller.signal })
      controller.abort()
      const out = await promise
      assert.equal(out.ok, false)
      assert.equal(out.error.code, TRANSPORT_ERROR.ABORTED)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe('kullanıcıya gösterilen mesajlar Türkçe ve teknik ayrıntısız', () => {
  test('her taşıma hatası Türkçe mesaj taşır', () => {
    for (const code of Object.values(TRANSPORT_ERROR)) {
      const failure = transportFailure(code)
      assert.equal(typeof failure.error.message, 'string')
      assert.ok(failure.error.message.length > 10, `${code} için mesaj yok`)
      assert.equal(failure.error.message.includes('undefined'), false)
    }
  })
})
