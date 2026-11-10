/**
 * Token store tests: multi-account persistence, permissions, isolation, and
 * tolerance of a broken, oversized, or legacy file.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  DEFAULT_ACCOUNT_ID,
  defaultTokenStorePath,
  MAX_ACCOUNTS,
  normalizeAccountState,
  normalizeTokenRecord,
  TokenStore,
} from '../lib/token-store.js'

/**
 * Create a store in a fresh temporary directory.
 *
 * @returns {{ store: TokenStore, path: string, directory: string }} Store and paths.
 */
function makeStore() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-token-'))
  const path = join(directory, '.workbuddy-credentials.json')
  return { store: new TokenStore({ path }), path, directory }
}

test('default path lives under DSH_HOME', () => {
  assert.equal(
    defaultTokenStorePath({ DSH_HOME: '/tmp/dsh-home' }, '/home/user'),
    '/tmp/dsh-home/.workbuddy-credentials.json',
  )
  assert.equal(
    defaultTokenStorePath({}, '/home/user'),
    '/home/user/.dsh/.workbuddy-credentials.json',
  )
})

test('normalizes a token record and rejects unusable tokens', () => {
  const record = normalizeTokenRecord({ token: '  abc.def  ', uid: 'u1', domain: 'https://www.codebuddy.cn/' })
  assert.equal(record.token, 'abc.def')
  assert.equal(record.uid, 'u1')
  assert.equal(record.id, 'u1')
  assert.equal(record.domain, 'www.codebuddy.cn')
  assert.equal(record.refreshToken, '')
  assert.equal(record.expiresAt, 0)
  assert.equal(normalizeTokenRecord({ token: '' }), undefined)
  assert.equal(normalizeTokenRecord({ token: 'a\u0000b' }), undefined)
  assert.equal(normalizeTokenRecord({ token: 'x'.repeat(20_000) }), undefined)
  assert.equal(normalizeTokenRecord(null), undefined)
})

test('a legacy single-account file is read as one account, never logging out', () => {
  const state = normalizeAccountState({ version: 2, token: 'legacy', uid: 'u-legacy', domain: 'www.codebuddy.cn' })
  assert.equal(state.version, 3)
  assert.equal(state.activeId, 'u-legacy')
  assert.equal(state.accounts.length, 1)
  assert.equal(state.accounts[0].token, 'legacy')
  assert.equal(state.accounts[0].id, 'u-legacy')
})

test('a legacy file without ids falls back to the default account id', () => {
  const state = normalizeAccountState({ token: 'legacy' })
  assert.equal(state.activeId, DEFAULT_ACCOUNT_ID)
})

test('saves a 0600 file and reads it back', () => {
  const { store, path } = makeStore()
  const record = store.save({ token: 'secret-token', uid: 'u-1', enterpriseId: 'e-1', domain: 'www.codebuddy.cn' })
  assert.equal(record.token, 'secret-token')
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const document = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(document.version, 3)
  assert.equal(document.activeId, record.id)
  assert.equal(document.accounts.length, 1)
  assert.equal(document.accounts[0].token, 'secret-token')
  assert.equal(typeof document.accounts[0].savedAt, 'string')
  assert.deepEqual(store.read(), record)
  assert.equal(store.present(), true)
})

test('persists refresh metadata from the web login', () => {
  const { store } = makeStore()
  const record = store.save({
    token: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    uid: 'u-1',
    enterpriseId: 'e-1',
    tenantId: 't-1',
    domain: 'www.codebuddy.cn',
    nickname: 'Tester',
  })
  assert.equal(record.refreshToken, 'refresh-token')
  assert.equal(record.tenantId, 't-1')
  assert.equal(record.nickname, 'Tester')
  assert.deepEqual(store.read(), record)
})

test('a second sign-in becomes its own account and the first one stays intact', () => {
  const { store } = makeStore()
  store.saveAccount({ token: 'token-a', uid: 'uid-a', nickname: 'A', domain: 'www.codebuddy.cn' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b', nickname: 'B', domain: 'www.codebuddy.cn' })

  const accounts = store.list()
  assert.equal(accounts.length, 2)
  assert.deepEqual(
    accounts.map((account) => account.uid).sort(),
    ['uid-a', 'uid-b'],
  )
  // The newest sign-in is active; the older account keeps its own token.
  assert.equal(store.activeId(), 'uid-b')
  assert.equal(store.read()?.token, 'token-b')
  assert.equal(store.get('uid-a')?.token, 'token-a')
  // No identifier from one account leaks into another record.
  assert.equal(store.get('uid-a')?.nickname, 'A')
  assert.equal(store.get('uid-b')?.nickname, 'B')
})

test('switching the active account changes which token is read', () => {
  const { store } = makeStore()
  store.saveAccount({ token: 'token-a', uid: 'uid-a' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b' })
  assert.equal(store.read()?.token, 'token-b')
  assert.equal(store.setActive('uid-a'), true)
  assert.equal(store.read()?.token, 'token-a')
  assert.equal(store.setActive('missing'), false)
  assert.equal(store.read()?.token, 'token-a')
})

test('removing the active account promotes another one', () => {
  const { store } = makeStore()
  store.saveAccount({ token: 'token-a', uid: 'uid-a' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b' })
  assert.equal(store.remove('uid-b'), true)
  assert.equal(store.list().length, 1)
  assert.equal(store.read()?.uid, 'uid-a')
  assert.equal(store.remove('uid-b'), false)
})

test('removing the last account clears the file', () => {
  const { store, path } = makeStore()
  store.saveAccount({ token: 'token-a', uid: 'uid-a' })
  assert.equal(store.remove('uid-a'), true)
  assert.equal(store.present(), false)
  assert.throws(() => statSync(path), { code: 'ENOENT' })
})

test('the account cap is enforced', () => {
  const { store } = makeStore()
  for (let index = 0; index < MAX_ACCOUNTS; index += 1) {
    store.saveAccount({ token: `token-${index}`, uid: `uid-${index}` })
  }
  assert.equal(store.list().length, MAX_ACCOUNTS)
  assert.throws(() => store.saveAccount({ token: 'one-too-many', uid: 'uid-overflow' }), /最多/)
  // Replacing an existing account at the cap is still allowed.
  assert.doesNotThrow(() => store.saveAccount({ token: 'token-0-new', uid: 'uid-0' }))
  assert.equal(store.get('uid-0')?.token, 'token-0-new')
})

test('updating one account never changes another', () => {
  const { store } = makeStore()
  store.saveAccount({ token: 'token-a', uid: 'uid-a', nickname: 'A' })
  store.saveAccount({ token: 'token-b', uid: 'uid-b', nickname: 'B' })
  store.updateAccount('uid-a', { nickname: 'A renamed' })
  assert.equal(store.get('uid-a')?.nickname, 'A renamed')
  assert.equal(store.get('uid-a')?.token, 'token-a')
  assert.equal(store.get('uid-b')?.nickname, 'B')
  assert.equal(store.get('uid-b')?.token, 'token-b')
})

test('clear removes the file and is idempotent', () => {
  const { store, path } = makeStore()
  store.save({ token: 'secret-token' })
  assert.equal(store.clear(), true)
  assert.equal(store.read(), undefined)
  assert.equal(store.present(), false)
  assert.equal(store.clear(), false)
  assert.throws(() => statSync(path), { code: 'ENOENT' })
})

test('external edits are picked up by mtime', () => {
  const { store, path } = makeStore()
  store.save({ token: 'first' })
  assert.equal(store.read()?.token, 'first')
  const future = new Date(Date.now() + 5_000)
  writeFileSync(path, JSON.stringify({ version: 2, token: 'second' }))
  utimesSync(path, future, future)
  assert.equal(store.read()?.token, 'second')
})

test('a corrupt file is ignored with a warning', () => {
  const { path } = makeStore()
  const warnings = []
  const watched = new TokenStore({ path, onWarning: (message) => warnings.push(message) })
  writeFileSync(path, '{not json')
  assert.equal(watched.read(), undefined)
  assert.equal(warnings.length, 1)
})

test('an oversized file is ignored without parsing it', () => {
  const { path } = makeStore()
  const warnings = []
  const watched = new TokenStore({ path, onWarning: (message) => warnings.push(message) })
  writeFileSync(path, JSON.stringify({ token: 'x'.repeat(600 * 1024) }))
  assert.equal(watched.read(), undefined)
  assert.match(warnings[0], /过大/)
})
