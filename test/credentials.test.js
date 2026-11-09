/**
 * Credential discovery, parsing, header construction, and refresh tests.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  CredentialError,
  WorkBuddyCredentials,
  findAuthFile,
  parseAuthDocument,
  resolveBaseURL,
} from '../lib/credentials.js'

/**
 * Create a fake home containing a WorkBuddy auth document.
 *
 * @param {object} auth - Auth document.
 * @param {string} [name] - File name.
 * @returns {{ home: string, file: string }} Paths.
 */
function makeHome(auth, name = 'workbuddy-desktop.info') {
  const home = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-'))
  const directory = join(home, '.local', 'share', 'CodeBuddyExtension', 'Data', 'Public', 'auth')
  mkdirSync(directory, { recursive: true })
  const file = join(directory, name)
  writeFileSync(file, JSON.stringify(auth, null, 2))
  return { home, file }
}

test('parses the nested desktop auth shape and normalizes seconds to ms', () => {
  const parsed = parseAuthDocument({
    auth: {
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      domain: 'www.codebuddy.cn',
    },
    account: { uid: 'u1', enterpriseId: 'e1', nickname: 'Ada', enterpriseName: 'Acme' },
  })
  assert.equal(parsed.accessToken, 'token-1')
  assert.equal(parsed.refreshToken, 'refresh-1')
  assert.equal(parsed.uid, 'u1')
  assert.equal(parsed.enterpriseId, 'e1')
  assert.ok(parsed.expiresAt > Date.now() + 3_000_000, 'seconds were converted to milliseconds')
})

test('parses the flat panel shape', () => {
  const parsed = parseAuthDocument({
    accessToken: 'token-2',
    refreshToken: 'refresh-2',
    uid: 'u2',
    enterpriseId: 'e2',
  })
  assert.equal(parsed.accessToken, 'token-2')
  assert.equal(parsed.uid, 'u2')
  assert.equal(parsed.enterpriseId, 'e2')
})

test('rejects a missing token', () => {
  assert.throws(() => parseAuthDocument({ auth: {} }), (error) => {
    assert.ok(error instanceof CredentialError)
    assert.equal(error.kind, 'malformed')
    return true
  })
})

test('reports an encrypted token field instead of guessing', () => {
  assert.throws(
    () => parseAuthDocument({ auth: { accessToken: { ciphertext: 'x', nonce: 'y', authTag: 'z' } } }),
    (error) => {
      assert.ok(error instanceof CredentialError)
      assert.equal(error.kind, 'encrypted')
      return true
    },
  )
})

test('finds the auth file under the Linux XDG data directory', () => {
  const { home, file } = makeHome({ accessToken: 't' })
  assert.equal(findAuthFile({ env: {}, platform: 'linux', home }), file)
})

test('prefers an explicit auth file and expands ~', () => {
  const { home, file } = makeHome({ accessToken: 't' })
  assert.equal(findAuthFile({ authFile: '~/custom.info', home, env: {}, platform: 'linux' }), join(home, 'custom.info'))
  assert.equal(findAuthFile({ authFile: file, home, env: {}, platform: 'linux' }), file)
})

test('prefers a workbuddy document over a codebuddy one', () => {
  const { home } = makeHome({ accessToken: 'a' }, 'codebuddy-desktop.info')
  const directory = join(home, '.local', 'share', 'CodeBuddyExtension', 'Data', 'Public', 'auth')
  writeFileSync(join(directory, 'workbuddy-ai.info'), JSON.stringify({ accessToken: 'b' }))
  assert.equal(findAuthFile({ env: {}, platform: 'linux', home }), join(directory, 'workbuddy-ai.info'))
})

test('builds account headers from a manual token', async () => {
  const credentials = new WorkBuddyCredentials({
    token: 'manual-token',
    uid: 'u9',
    enterpriseId: 'e9',
    domain: 'www.codebuddy.cn',
    env: {},
    platform: 'linux',
    home: mkdtempSync(join(tmpdir(), 'dsh-workbuddy-empty-')),
    fetch: async () => {
      throw new Error('no network expected')
    },
  })
  const headers = await credentials.headers()
  assert.equal(headers.authorization, 'Bearer manual-token')
  assert.equal(headers['x-user-id'], 'u9')
  assert.equal(headers['x-enterprise-id'], 'e9')
  assert.equal(headers['x-domain'], 'www.codebuddy.cn')
  assert.equal(credentials.status().source, 'token')
})

test('refreshes an expiring file token in memory and keeps the file untouched', async () => {
  const { home, file } = makeHome({
    auth: {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000,
      domain: 'www.codebuddy.cn',
    },
    account: { uid: 'u1', enterpriseId: 'e1' },
  })
  const calls = []
  const credentials = new WorkBuddyCredentials({
    authFile: file,
    env: {},
    platform: 'linux',
    home,
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
  })
  const headers = await credentials.headers()
  assert.equal(headers.authorization, 'Bearer new-token')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.endsWith('/v2/plugin/auth/token/refresh'), true)
  assert.equal(calls[0].init.headers['x-refresh-token'], 'refresh-token')
  assert.equal(calls[0].init.headers['x-auth-refresh-source'], 'plugin')
})

test('shares one refresh between concurrent callers', async () => {
  const { home, file } = makeHome({
    auth: { accessToken: 'old', refreshToken: 'r', expiresAt: Date.now() - 1000 },
  })
  let calls = 0
  const credentials = new WorkBuddyCredentials({
    authFile: file,
    env: {},
    platform: 'linux',
    home,
    fetch: async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
      return new Response(JSON.stringify({ code: 0, data: { accessToken: 'fresh', expiresIn: 3600 } }), {
        status: 200,
      })
    },
  })
  const results = await Promise.all([credentials.headers(), credentials.headers(), credentials.headers()])
  assert.deepEqual(
    results.map((headers) => headers.authorization),
    ['Bearer fresh', 'Bearer fresh', 'Bearer fresh'],
  )
  assert.equal(calls, 1)
})

test('surfaces a refresh failure with kind refresh-failed', async () => {
  const { home, file } = makeHome({
    auth: { accessToken: 'old', refreshToken: 'r', expiresAt: Date.now() - 1000 },
  })
  const credentials = new WorkBuddyCredentials({
    authFile: file,
    env: {},
    platform: 'linux',
    home,
    fetch: async () =>
      new Response(JSON.stringify({ code: 12153, msg: 'Offline user session not found' }), { status: 200 }),
  })
  await assert.rejects(credentials.headers(), (error) => {
    assert.ok(error instanceof CredentialError)
    assert.equal(error.kind, 'refresh-failed')
    assert.match(error.message, /Offline user session not found/)
    return true
  })
})

test('a manual token never triggers a refresh request', async () => {
  const credentials = new WorkBuddyCredentials({
    token: 'manual',
    env: {},
    platform: 'linux',
    home: mkdtempSync(join(tmpdir(), 'dsh-workbuddy-empty-')),
    fetch: async () => {
      throw new Error('no network expected')
    },
  })
  assert.equal(credentials.refreshDue(), false)
  await assert.rejects(credentials.refresh(), (error) => error.kind === 'expired')
})

test('resolves the gateway from region and domain', () => {
  assert.equal(resolveBaseURL({ region: 'cn', domain: 'www.codebuddy.cn' }), 'https://copilot.tencent.com')
  assert.equal(resolveBaseURL({ region: 'global', domain: '' }), 'https://www.workbuddy.ai')
  assert.equal(resolveBaseURL({ domain: 'account.workbuddy.ai' }), 'https://www.workbuddy.ai')
  assert.equal(resolveBaseURL({ baseURL: 'http://127.0.0.1:9/' }), 'http://127.0.0.1:9')
})

test('reports missing credentials without throwing from status()', async () => {
  const credentials = new WorkBuddyCredentials({
    env: {},
    platform: 'linux',
    home: mkdtempSync(join(tmpdir(), 'dsh-workbuddy-empty-')),
  })
  assert.equal(credentials.status().signedIn, false)
  await assert.rejects(credentials.headers(), (error) => error.kind === 'missing')
})
