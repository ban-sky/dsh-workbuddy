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
import { UsageLedger } from '../lib/usage.js'

/**
 * Fake credential surface used by the handler.
 *
 * @param {{ signedIn?: boolean }} [options] - Fake state.
 * @returns {Record<string, any>} Fake credentials.
 */
function fakeCredentials({ signedIn = true, store } = {}) {
  return {
    reloaded: 0,
    deviceSalt: 'a'.repeat(64),
    activeAccountId() {
      return signedIn ? (store?.activeId() ?? 'u-1') : ''
    },
    switchAccount(id) {
      const changed = store === undefined ? id === 'u-1' : store.setActive(id)
      if (changed) this.reloaded += 1
      return changed
    },
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
  const credentials = fakeCredentials({ ...options, store })
  const oauth = fakeOAuth()
  const usage = options.usage ?? new UsageLedger({ path: '' })
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
    usage,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
  })
  return { handle, store, credentials, oauth, usage }
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

test('accounts lists every saved account and marks the active one', async () => {
  const { handle, store } = harness()
  store.saveAccount({ token: 'token-a', uid: 'uid-a', nickname: 'A' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b', nickname: 'B' })
  const { status, body, text } = await post(handle, { action: 'accounts' })
  assert.equal(status, 200)
  assert.equal(body.value.accounts.length, 2)
  const ids = body.value.accounts.map((account) => account.id).sort()
  assert.deepEqual(ids, ['uid-a', 'uid-b'])
  assert.equal(text.includes('token-a'), false)
  assert.equal(text.includes('token-b'), false)
})

test('switchAccount changes the active account in the store', async () => {
  const { handle, store } = harness()
  store.saveAccount({ token: 'token-a', uid: 'uid-a' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b' })
  assert.equal(store.activeId(), 'uid-b')
  const { status, body } = await post(handle, { action: 'switchAccount', id: 'uid-a' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(store.activeId(), 'uid-a')
  assert.equal(store.read()?.token, 'token-a')
})

test('switchAccount rejects an unknown account', async () => {
  const { handle } = harness()
  const { status, body } = await post(handle, { action: 'switchAccount', id: 'nope' })
  assert.equal(status, 404)
  assert.equal(body.error.code, 'UNKNOWN_ACCOUNT')
})

test('removeAccount removes only the requested account', async () => {
  const { handle, store } = harness()
  store.saveAccount({ token: 'token-a', uid: 'uid-a' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b' })
  const { status, body } = await post(handle, { action: 'removeAccount', id: 'uid-b' })
  assert.equal(status, 200)
  assert.equal(body.value.accounts.length, 1)
  assert.equal(store.get('uid-a')?.token, 'token-a')
  assert.equal(store.get('uid-b'), undefined)
})

test('renameAccount relabels one account without touching its token', async () => {
  const { handle, store } = harness()
  store.saveAccount({ token: 'token-a', uid: 'uid-a', nickname: 'A' })
  const { status, body } = await post(handle, { action: 'renameAccount', id: 'uid-a', label: '工作号' })
  assert.equal(status, 200)
  const renamed = body.value.accounts.find((account) => account.id === 'uid-a')
  assert.equal(renamed.label, '工作号')
  assert.equal(store.get('uid-a')?.token, 'token-a')
})

test('credits reports the balance without leaking the token', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({
        code: 0,
        msg: 'OK',
        data: {
          Response: {
            Data: {
              TotalDosage: 903,
              Accounts: [
                {
                  PackageName: '个人体验版',
                  CapacityRemain: 500,
                  CapacitySize: 500,
                  CapacityType: 4,
                  CycleEndTime: '2026-11-30 23:59:59',
                },
                { PackageName: '权益包', CapacityRemain: 403, CapacitySize: 1500, ExpiredTime: '2099-01-01 00:00:00' },
              ],
            },
          },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  const { handle } = harness({ fetchImpl })
  const { status, body, text } = await post(handle, { action: 'credits' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.total, 903)
  assert.equal(body.value.packages.length, 2)
  assert.equal(text.includes('secret-token'), false)
  assert.equal(calls[0].url, 'https://www.codebuddy.cn/v2/billing/meter/get-user-resource')
  assert.equal(calls[0].init.headers['x-codebuddy-request'], '1')
})

test('credits reports an upstream failure instead of a zero balance', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ code: 500, msg: 'boom' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  const { handle } = harness({ fetchImpl })
  const { status, body } = await post(handle, { action: 'credits' })
  assert.equal(status, 502)
  assert.equal(body.error.code, 'CREDITS_FAILED')
  assert.match(body.error.message, /boom/)
})

test('usage returns recorded counters and the credit-to-token conversion', async () => {
  const { handle, usage } = harness()
  usage.record({
    accountId: 'u-1',
    model: 'glm-5.3',
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
      prompt_cache_hit_tokens: 750,
      prompt_cache_miss_tokens: 250,
      credit: 0.5,
    },
  })
  const { status, body, text } = await post(handle, { action: 'usage' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.totals.requests, 1)
  assert.equal(body.value.totals.promptTokens, 1000)
  assert.equal(body.value.totals.completionTokens, 500)
  assert.equal(body.value.totals.cachedTokens, 750)
  assert.equal(body.value.totals.uncachedTokens, 250)
  assert.equal(body.value.totals.credits, 0.5)
  assert.equal(body.value.totals.cacheHitRate, 0.75)
  assert.equal(body.value.totals.tokensPerCredit, 3000)
  assert.equal(body.value.accounts.length, 1)
  assert.equal(body.value.accounts[0].models.length, 1)
  assert.equal(body.value.accounts[0].models[0].id, 'glm-5.3')
  assert.equal(text.includes('secret-token'), false)
})

test('usage is empty rather than failing before the first completion', async () => {
  const { handle } = harness()
  const { status, body } = await post(handle, { action: 'usage' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.totals.requests, 0)
  assert.deepEqual(body.value.accounts, [])
})

test('resetUsage clears the active account and leaves the others alone', async () => {
  const { handle, usage } = harness()
  const block = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, credit: 0.01 }
  usage.record({ accountId: 'u-1', model: 'a', usage: block })
  usage.record({ accountId: 'u-2', model: 'a', usage: block })
  const { status, body } = await post(handle, { action: 'resetUsage', id: 'u-1' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.accounts.length, 0)
  assert.equal(body.value.totals.requests, 0)
  // The other account still has its counters.
  const other = await post(handle, { action: 'usage', id: 'u-2' })
  assert.equal(other.body.value.totals.requests, 1)
})
