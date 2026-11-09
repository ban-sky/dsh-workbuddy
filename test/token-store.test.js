/**
 * Token store tests: persistence, permissions, precedence helpers, and
 * tolerance of a broken or missing file.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { defaultTokenStorePath, normalizeTokenRecord, TokenStore } from '../lib/token-store.js'

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
  assert.deepEqual(normalizeTokenRecord({ token: '  abc.def  ', uid: 'u1', domain: 'https://www.codebuddy.cn/' }), {
    token: 'abc.def',
    uid: 'u1',
    enterpriseId: '',
    domain: 'www.codebuddy.cn',
  })
  assert.equal(normalizeTokenRecord({ token: '' }), undefined)
  assert.equal(normalizeTokenRecord({ token: 'a\u0000b' }), undefined)
  assert.equal(normalizeTokenRecord({ token: 'x'.repeat(20_000) }), undefined)
  assert.equal(normalizeTokenRecord(null), undefined)
})

test('saves a 0600 file and reads it back', () => {
  const { store, path } = makeStore()
  const record = store.save({ token: 'secret-token', uid: 'u-1', enterpriseId: 'e-1', domain: 'www.codebuddy.cn' })
  assert.equal(record.token, 'secret-token')
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const document = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(document.version, 1)
  assert.equal(document.token, 'secret-token')
  assert.equal(typeof document.savedAt, 'string')
  assert.deepEqual(store.read(), record)
  assert.equal(store.present(), true)
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
  writeFileSync(path, JSON.stringify({ version: 1, token: 'second' }))
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
  writeFileSync(path, JSON.stringify({ token: 'x'.repeat(70 * 1024) }))
  assert.equal(watched.read(), undefined)
  assert.match(warnings[0], /过大/)
})
