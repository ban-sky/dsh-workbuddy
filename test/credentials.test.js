/**
 * Browser-login credential tests: JWT claims, headers, refresh, and status.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { TokenStore } from '../lib/token-store.js'
import {
  CredentialError,
  WorkBuddyCredentials,
  resolveBaseURL,
} from '../lib/credentials.js'

/**
 * Build an unsigned JWT with the given claims.
 *
 * @param {object} payload - Claims.
 * @returns {string} Compact JWT.
 */
function makeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`
}

/**
 * Create a token store in a fresh temporary directory.
 *
 * @returns {TokenStore} Store.
 */
function makeStore() {
  return new TokenStore({ path: join(mkdtempSync(join(tmpdir(), 'dsh-workbuddy-store-')), 'tokens.json') })
}

/**
 * Build saved-token credentials.
 *
 * @param {object} record - Token record.
 * @param {object} [options] - Extra credential options.
 * @returns {WorkBuddyCredentials} Credentials.
 */
function makeCredentials(record, options = {}) {
  const store = options.store ?? makeStore()
  store.save(record)
  return new WorkBuddyCredentials({ savedStore: store, ...options })
}

test('reports missing credentials without throwing from status()', async () => {
  const store = makeStore()
  const credentials = new WorkBuddyCredentials({ savedStore: store })
  assert.equal(credentials.status().signedIn, false)
  assert.equal(credentials.status().source, 'none')
  await assert.rejects(credentials.headers(), (error) => {
    assert.ok(error instanceof CredentialError)
    assert.equal(error.kind, 'missing')
    assert.match(error.message, /生成登录链接/)
    return true
  })
})

test('reads account headers from the saved JWT', async () => {
  const token = makeJwt({
    sub: 'u-jwt',
    enterprise_id: 'e-jwt',
    tenant_id: 't-jwt',
    iss: 'https://www.workbuddy.ai',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const credentials = makeCredentials({ token })
  const headers = await credentials.headers()
  assert.equal(headers.authorization, `Bearer ${token}`)
  assert.equal(headers['x-user-id'], 'u-jwt')
  assert.equal(headers['x-enterprise-id'], 'e-jwt')
  assert.equal(headers['x-tenant-id'], 't-jwt')
  assert.equal(headers['x-domain'], 'www.workbuddy.ai')
  assert.equal(credentials.baseURL(), 'https://www.workbuddy.ai')
  assert.ok(credentials.status().expiresAt > Date.now())
  assert.equal(credentials.status().source, 'saved')
})

test('saved account ids win over JWT claims and tenant falls back to enterprise', async () => {
  const token = makeJwt({ sub: 'u-claim', enterprise_id: 'e-claim', iss: 'https://www.codebuddy.cn' })
  const credentials = makeCredentials({ token, uid: 'u-store', enterpriseId: 'e-store' })
  const headers = await credentials.headers()
  assert.equal(headers['x-user-id'], 'u-store')
  assert.equal(headers['x-enterprise-id'], 'e-store')
  assert.equal(headers['x-tenant-id'], 'e-store')
})

test('refreshes an expiring token and persists the rotation', async () => {
  const calls = []
  const credentials = makeCredentials(
    {
      token: 'old-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000,
      domain: 'www.codebuddy.cn',
      uid: 'u1',
      enterpriseId: 'e1',
    },
    {
      baseURL: 'https://gateway.test',
      fetch: async (url, init) => {
        calls.push({ url, init })
        return new Response(
          JSON.stringify({
            code: 0,
            data: { accessToken: 'new-token', refreshToken: 'rotated', expiresIn: 3600, domain: 'www.codebuddy.cn' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      },
    },
  )
  const headers = await credentials.headers()
  assert.equal(headers.authorization, 'Bearer new-token')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://gateway.test/v2/plugin/auth/token/refresh')
  assert.equal(calls[0].init.headers['x-refresh-token'], 'refresh-token')
  assert.equal(calls[0].init.headers['x-auth-refresh-source'], 'plugin')
  const stored = credentials.savedStore.read()
  assert.equal(stored?.token, 'new-token')
  assert.equal(stored?.refreshToken, 'rotated')
})

test('shares one refresh between concurrent callers', async () => {
  let calls = 0
  const credentials = makeCredentials(
    { token: 'old', refreshToken: 'r', expiresAt: Date.now() - 1000 },
    {
      baseURL: 'https://gateway.test',
      fetch: async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        return new Response(JSON.stringify({ code: 0, data: { accessToken: 'fresh', expiresIn: 3600 } }), {
          status: 200,
        })
      },
    },
  )
  const results = await Promise.all([credentials.headers(), credentials.headers(), credentials.headers()])
  assert.deepEqual(
    results.map((headers) => headers.authorization),
    ['Bearer fresh', 'Bearer fresh', 'Bearer fresh'],
  )
  assert.equal(calls, 1)
})

test('surfaces a refresh failure with kind refresh-failed', async () => {
  const credentials = makeCredentials(
    { token: 'old', refreshToken: 'r', expiresAt: Date.now() - 1000 },
    {
      baseURL: 'https://gateway.test',
      fetch: async () => new Response(JSON.stringify({ code: 12153, msg: 'Offline user session not found' }), { status: 200 }),
    },
  )
  await assert.rejects(credentials.headers(), (error) => {
    assert.ok(error instanceof CredentialError)
    assert.equal(error.kind, 'refresh-failed')
    assert.match(error.message, /Offline user session not found/)
    return true
  })
})

test('an expired token without a refresh token asks the user to sign in again', async () => {
  const credentials = makeCredentials({ token: 'old', expiresAt: Date.now() - 1000 })
  assert.equal(credentials.refreshDue(), false)
  await assert.rejects(credentials.refresh(), (error) => error.kind === 'expired')
})

test('reload picks up a token written by the login flow', async () => {
  const store = makeStore()
  const credentials = new WorkBuddyCredentials({ savedStore: store })
  assert.equal(credentials.status().signedIn, false)
  store.save({ token: 'fresh-token', uid: 'u-new' })
  credentials.reload()
  assert.equal(credentials.status().signedIn, true)
  assert.equal((await credentials.headers()).authorization, 'Bearer fresh-token')
})

test('resolves the gateway from region and domain', () => {
  assert.equal(resolveBaseURL({ region: 'cn', domain: 'www.codebuddy.cn' }), 'https://copilot.tencent.com')
  assert.equal(resolveBaseURL({ region: 'global', domain: '' }), 'https://www.workbuddy.ai')
  assert.equal(resolveBaseURL({ domain: 'account.workbuddy.ai' }), 'https://www.workbuddy.ai')
  assert.equal(resolveBaseURL({ baseURL: 'http://127.0.0.1:9/' }), 'http://127.0.0.1:9')
})
