/**
 * Settings-route tests: envelopes, storage, login actions, and the gateway
 * probe. No token may leave the Host in a response body.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { CredentialError } from '../lib/credentials.js'
import { createWorkBuddyHandler, probeGateway } from '../lib/http.js'
import { TokenStore } from '../lib/token-store.js'

/**
 * Fake credential surface used by the handler.
 *
 * @param {{ signedIn?: boolean }} [options] - Fake state.
 * @returns {Record<string, any>} Fake credentials.
 */
function fakeCredentials({ signedIn = true } = {}) {
  return {
    reloaded: 0,
    reload() {
      this.reloaded += 1
    },
    status() {
      return {
        signedIn,
        source: signedIn ? 'saved' : 'none',
        uid: 'u-1',
        nickname: '',
        enterpriseName: 'Acme',
        domain: 'www.codebuddy.cn',
        expiresAt: 0,
        refreshable: false,
        baseURL: 'https://copilot.tencent.com',
      }
    },
    async headers() {
      if (!signedIn) throw new CredentialError('尚未登录 WorkBuddy，请先完成网页登录。', 'missing')
      return {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
        'x-user-id': 'u-1',
      }
    },
    baseURL() {
      return 'https://copilot.tencent.com'
    },
  }
}

/**
 * Fake OAuth session surface.
 *
 * @returns {Record<string, any>} Fake OAuth.
 */
function fakeOAuth() {
  return {
    starts: [],
    async start(input) {
      this.starts.push(input)
      return { loginId: 'login-1', verificationUri: 'https://example.test/login', expiresAt: 1, region: input.region }
    },
    async poll() {
      return {
        status: 'done',
        credential: {
          accessToken: 'web-token',
          refreshToken: 'web-refresh',
          expiresAt: 123,
          domain: 'www.codebuddy.cn',
          uid: 'u-web',
          enterpriseId: 'e-web',
          tenantId: 't-web',
          nickname: 'Ada',
          enterpriseName: 'Acme',
        },
      }
    },
    cancel() {},
  }
}

/**
 * Build a handler with a store in a fresh temporary directory.
 *
 * @param {{ signedIn?: boolean }} [options] - Fake state.
 * @returns {{ handle: Function, store: TokenStore, credentials: Record<string, any>, oauth: Record<string, any> }} Harness.
 */
function harness(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-http-'))
  const store = new TokenStore({ path: join(directory, '.workbuddy-credentials.json') })
  const credentials = fakeCredentials(options)
  const oauth = fakeOAuth()
  const catalogState = {
    source: 'fallback',
    fetchedAt: 1_700_000_000_000,
    models: Array.from({ length: 20 }, (_, index) => ({
      id: index === 0 ? 'glm-5.3' : 'model-' + index,
      name: 'Model ' + index,
      contextWindow: 200_000,
      maxTokens: 32_000,
      supportsImages: index === 0,
      efforts: ['off', 'low', 'high'],
      reasoningDefault: 'high',
      canDisableThinking: true,
      credits: 0.29,
      creditsText: '×0.29',
      descriptionZh: '中文说明',
      descriptionEn: 'English description',
      promotion: index === 0 ? { id: 'promo', badge: { label: '限时免费' }, status: 'active' } : undefined,
      tier: index === 0 ? { badge: { label: '订阅优先' } } : undefined,
    })),
  }
  const handle = createWorkBuddyHandler({
    credentials,
    tokenStore: store,
    oauth,
    catalog: () => catalogState,
    refreshCatalog: async () => catalogState,
  })
  return { handle, store, credentials, oauth }
}

/**
 * POST one action to the handler.
 *
 * @param {Function} handle - Handler.
 * @param {unknown} body - JSON body or a raw string.
 * @param {string} [contentType] - Content type header.
 * @returns {Promise<{ status: number, body: any, text: string }>} Response.
 */
async function post(handle, body, contentType = 'application/json') {
  const request = new Request('http://localhost/api/workbuddy', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const response = await handle(request)
  const text = await response.text()
  return { status: response.status, body: JSON.parse(text), text }
}

test('status reports non-secret state only', async () => {
  const { handle } = harness()
  const { status, body, text } = await post(handle, { action: 'status' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.signedIn, true)
  assert.equal(body.value.source, 'saved')
  assert.equal(body.value.modelCount, 20)
  assert.equal(body.value.saved, false)
  assert.equal(text.includes('secret-token'), false)
  assert.equal(Object.hasOwn(body.value, 'token'), false)
  assert.equal(Object.hasOwn(body.value, 'authFile'), false)
})

test('models action returns roster metadata without secrets', async () => {
  const { handle } = harness()
  const { status, body, text } = await post(handle, { action: 'models' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.source, 'fallback')
  assert.equal(body.value.models.length, 20)
  assert.deepEqual(body.value.models[0].efforts, ['off', 'low', 'high'])
  assert.equal(body.value.models[0].creditsText, '×0.29')
  assert.equal(body.value.models[0].promotion.badge.label, '限时免费')
  assert.equal(body.value.models[0].tier.badge.label, '订阅优先')
  assert.equal(text.includes('secret-token'), false)
  assert.equal(text.includes('提示词'), false)
})

test('refreshModels returns the refreshed roster', async () => {
  const { handle } = harness()
  const { status, body } = await post(handle, { action: 'refreshModels' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.models.length, 20)
})

test('clear removes the saved token and reloads credentials', async () => {
  const { handle, store, credentials } = harness()
  store.save({ token: 'secret-token', refreshToken: 'refresh-token' })
  const { status, body } = await post(handle, { action: 'clear' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.saved, false)
  assert.equal(store.present(), false)
  assert.equal(credentials.reloaded, 1)
})

test('unknown actions and bad bodies get a stable error envelope', async () => {
  const { handle } = harness()
  const unknown = await post(handle, { action: 'nope' })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.body.ok, false)
  assert.equal(unknown.body.error.code, 'UNKNOWN_ACTION')
  const badJson = await post(handle, '{')
  assert.equal(badJson.status, 400)
  assert.equal(badJson.body.error.code, 'INVALID_JSON')
  const wrongType = await post(handle, 'action=status', 'text/plain')
  assert.equal(wrongType.status, 415)
  assert.equal(wrongType.body.error.code, 'INVALID_CONTENT_TYPE')
})

test('test action sends a one-token chat completion with the credential headers', async () => {
  const { handle } = harness()
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const { status, body } = await post(handle, { action: 'test' })
    assert.equal(status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.value.connected, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://copilot.tencent.com/v2/chat/completions')
    assert.equal(calls[0].init.method, 'POST')
    assert.equal(calls[0].init.headers.authorization, 'Bearer secret-token')
    const probe = JSON.parse(calls[0].init.body)
    assert.equal(probe.max_tokens, 1)
    assert.equal(probe.stream, true)
    assert.equal(probe.messages.length, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('test action reports an invalid token', async () => {
  const { handle } = harness()
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('', { status: 401 })
  try {
    const { body } = await post(handle, { action: 'test' })
    assert.equal(body.ok, true)
    assert.equal(body.value.connected, false)
    assert.equal(body.value.authFailed, true)
    assert.equal(body.value.httpStatus, 401)
  } finally {
    globalThis.fetch = original
  }
})

test('loginStart creates a session and loginPoll saves the token', async () => {
  const { handle, store, credentials, oauth } = harness()
  const started = await post(handle, { action: 'loginStart', region: 'global' })
  assert.equal(started.status, 200)
  assert.equal(started.body.value.loginId, 'login-1')
  assert.equal(oauth.starts[0].region, 'global')

  const polled = await post(handle, { action: 'loginPoll', loginId: 'login-1' })
  assert.equal(polled.status, 200)
  assert.equal(polled.body.value.status, 'done')
  assert.equal(polled.body.text ?? '', '')
  assert.equal(credentials.reloaded, 1)
  const stored = store.read()
  assert.equal(stored?.token, 'web-token')
  assert.equal(stored?.refreshToken, 'web-refresh')
  assert.equal(stored?.uid, 'u-web')
  assert.equal(stored?.tenantId, 't-web')
  const text = JSON.stringify(polled.body)
  assert.equal(text.includes('web-token'), false)
  assert.equal(text.includes('web-refresh'), false)
})

test('probeGateway surfaces a missing credential without a request', async () => {
  const credentials = fakeCredentials({ signedIn: false })
  const result = await probeGateway(credentials, async () => {
    throw new Error('must not be called')
  })
  assert.equal(result.connected, false)
  assert.equal(result.code, 'missing')
  assert.match(result.message, /登录/)
})
