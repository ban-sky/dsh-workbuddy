/**
 * Web-login tests: state creation, polling, account collection, and expiry.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { OAUTH_BASES, WorkBuddyOAuth } from '../lib/oauth.js'

/**
 * Build a JSON response.
 *
 * @param {unknown} body - Payload.
 * @param {number} [status] - HTTP status.
 * @returns {Response} Response.
 */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('starts a login session on the CN host', async () => {
  const calls = []
  const oauth = new WorkBuddyOAuth({
    now: () => 1_000,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return json({ code: 0, data: { state: 'state-1', authUrl: 'https://example.test/login', expiresIn: 600 } })
    },
  })
  const session = await oauth.start({ region: 'cn' })
  assert.equal(calls[0].url, `${OAUTH_BASES.cn}/v2/plugin/auth/state?platform=workbuddy`)
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.body, '{}')
  assert.equal(session.loginId, 'state-1')
  assert.equal(session.verificationUri, 'https://example.test/login')
  assert.equal(session.expiresAt, 601_000)
})

test('uses the international host when asked', async () => {
  let seen
  const oauth = new WorkBuddyOAuth({
    fetchImpl: async (url) => {
      seen = url
      return json({ code: 0, data: { state: 's', authUrl: 'https://example.test/x' } })
    },
  })
  await oauth.start({ region: 'global' })
  assert.equal(seen, `${OAUTH_BASES.global}/v2/plugin/auth/state?platform=workbuddy`)
})

test('polls through pending to a completed login', async () => {
  let tokenCalls = 0
  const oauth = new WorkBuddyOAuth({
    now: () => 10_000,
    fetchImpl: async (url) => {
      if (url.includes('/v2/plugin/auth/state')) {
        return json({ code: 0, data: { state: 'state-2', authUrl: 'https://example.test/login' } })
      }
      if (url.includes('/v2/plugin/auth/token')) {
        tokenCalls += 1
        if (tokenCalls === 1) return json({ code: 1, msg: 'pending' })
        return json({
          code: 0,
          data: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 3600, domain: 'www.codebuddy.cn' },
        })
      }
      if (url.includes('/v2/plugin/login/account')) {
        return json({ code: 0, data: { uid: 'u-2', nickname: 'Ada', enterpriseId: 'e-2' } })
      }
      throw new Error(`unexpected ${url}`)
    },
  })
  const session = await oauth.start({ region: 'cn' })
  const pending = await oauth.poll(session.loginId)
  assert.equal(pending.status, 'pending')
  const done = await oauth.poll(session.loginId)
  assert.equal(done.status, 'done')
  assert.equal(done.credential.accessToken, 'access-2')
  assert.equal(done.credential.refreshToken, 'refresh-2')
  assert.equal(done.credential.uid, 'u-2')
  assert.equal(done.credential.enterpriseId, 'e-2')
  assert.equal(done.credential.tenantId, 'e-2')
  assert.equal(done.credential.nickname, 'Ada')
  assert.equal(done.credential.expiresAt, 10_000 + 3_600_000)
  assert.equal((await oauth.poll(session.loginId)).status, 'expired')
})

test('falls back to JWT claims when the account call fails', async () => {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'u-jwt', enterprise_id: 'e-jwt', tenant_id: 't-jwt', iss: 'https://www.workbuddy.ai' }),
  ).toString('base64url')
  const token = `x.${payload}.y`
  let tokenCalls = 0
  const oauth = new WorkBuddyOAuth({
    fetchImpl: async (url) => {
      if (url.includes('/auth/state')) return json({ code: 0, data: { state: 's', authUrl: 'https://example.test/x' } })
      if (url.includes('/auth/token')) {
        tokenCalls += 1
        return tokenCalls === 1 ? json({ code: 1 }) : json({ code: 0, data: { accessToken: token } })
      }
      return json({ message: 'no' }, 500)
    },
  })
  const session = await oauth.start({ region: 'cn' })
  await oauth.poll(session.loginId)
  const done = await oauth.poll(session.loginId)
  assert.equal(done.status, 'done')
  assert.equal(done.credential.uid, 'u-jwt')
  assert.equal(done.credential.enterpriseId, 'e-jwt')
  assert.equal(done.credential.tenantId, 't-jwt')
  assert.equal(done.credential.domain, 'www.workbuddy.ai')
})

test('expires a session after its deadline', async () => {
  const oauth = new WorkBuddyOAuth({
    now: () => 0,
    ttlMs: 1000,
    fetchImpl: async () => json({ code: 0, data: { state: 's', authUrl: 'https://example.test/x' } }),
  })
  const session = await oauth.start()
  oauth.now = () => 2000
  const result = await oauth.poll(session.loginId)
  assert.equal(result.status, 'expired')
})

test('surfaces a state-endpoint failure', async () => {
  const oauth = new WorkBuddyOAuth({
    fetchImpl: async () => json({ code: 400, msg: 'bad region' }, 400),
  })
  await assert.rejects(() => oauth.start(), /bad region/)
})
