/**
 * Settings-route tests: envelopes, storage, credential reloading, and the
 * gateway probe. No token may leave the Host in a response body.
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
        source: signedIn ? 'file' : 'none',
        authFile: signedIn ? '/home/user/auth.info' : '',
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
      if (!signedIn) throw new CredentialError('未找到 WorkBuddy 登录凭据。', 'missing')
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
 * Build a handler with a store in a fresh temporary directory.
 *
 * @param {{ signedIn?: boolean }} [options] - Fake state.
 * @returns {{ handle: Function, store: TokenStore, credentials: Record<string, any> }} Harness.
 */
function harness(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-http-'))
  const store = new TokenStore({ path: join(directory, '.workbuddy-credentials.json') })
  const credentials = fakeCredentials(options)
  const handle = createWorkBuddyHandler({ credentials, tokenStore: store, modelCount: 20 })
  return { handle, store, credentials }
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
  assert.equal(body.value.source, 'file')
  assert.equal(body.value.modelCount, 20)
  assert.equal(body.value.saved, false)
  assert.equal(text.includes('secret-token'), false)
  assert.equal(Object.hasOwn(body.value, 'token'), false)
})

test('save persists the token and reloads credentials', async () => {
  const { handle, store, credentials } = harness()
  const { status, body, text } = await post(handle, {
    action: 'save',
    token: 'secret-token',
    uid: 'u-1',
    enterpriseId: 'e-1',
    domain: 'www.codebuddy.cn',
  })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.saved, true)
  assert.equal(text.includes('secret-token'), false)
  assert.equal(credentials.reloaded, 1)
  assert.equal(store.read()?.token, 'secret-token')
})

test('save rejects a missing or unusable token', async () => {
  const { handle, store } = harness()
  const missing = await post(handle, { action: 'save', token: '  ' })
  assert.equal(missing.status, 400)
  assert.equal(missing.body.error.code, 'MISSING_TOKEN')
  const control = await post(handle, { action: 'save', token: 'a\u0000b' })
  assert.equal(control.status, 400)
  assert.equal(control.body.error.code, 'INVALID_TOKEN')
  assert.equal(store.present(), false)
})

test('clear removes the saved token and reloads credentials', async () => {
  const { handle, store, credentials } = harness()
  await post(handle, { action: 'save', token: 'secret-token' })
  const { status, body } = await post(handle, { action: 'clear' })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.value.saved, false)
  assert.equal(store.present(), false)
  assert.equal(credentials.reloaded, 2)
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
    assert.equal(probe.stream, false)
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

test('probeGateway surfaces a missing credential without a request', async () => {
  const credentials = fakeCredentials({ signedIn: false })
  const result = await probeGateway(credentials, async () => {
    throw new Error('must not be called')
  })
  assert.equal(result.connected, false)
  assert.equal(result.code, 'missing')
  assert.match(result.message, /凭据/)
})
