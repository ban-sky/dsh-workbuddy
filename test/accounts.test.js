/**
 * Account isolation and risk-control primitives: derived device identity,
 * per-account pacing, and the salt file.
 */

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  deriveDeviceId,
  loadDeviceSalt,
  MAX_CONCURRENT_PER_ACCOUNT,
  MIN_REQUEST_GAP_MS,
  RequestPacer,
  withDeviceIdentity,
} from '../lib/accounts.js'

/** A fixed salt for deterministic derivations. */
const SALT = 'a'.repeat(64)

test('a device id is stable for one account and salt', () => {
  const first = deriveDeviceId('uid-a', 'machine', SALT)
  const second = deriveDeviceId('uid-a', 'machine', SALT)
  assert.equal(first, second)
  assert.equal(first.length, 36)
  assert.match(first, /^[0-9a-f]{36}$/)
})

test('two accounts never share a device id', () => {
  assert.notEqual(deriveDeviceId('uid-a', 'machine', SALT), deriveDeviceId('uid-b', 'machine', SALT))
  assert.notEqual(deriveDeviceId('uid-a', 'session', SALT), deriveDeviceId('uid-b', 'session', SALT))
})

test('the machine and session identities differ for one account', () => {
  assert.notEqual(deriveDeviceId('uid-a', 'machine', SALT), deriveDeviceId('uid-a', 'session', SALT))
})

test('two installations with different salts derive different ids', () => {
  const other = 'b'.repeat(64)
  assert.notEqual(deriveDeviceId('uid-a', 'machine', SALT), deriveDeviceId('uid-a', 'machine', other))
})

test('no uid or no salt derives nothing rather than a shared default', () => {
  assert.equal(deriveDeviceId('', 'machine', SALT), '')
  assert.equal(deriveDeviceId('uid-a', 'machine', ''), '')
})

test('withDeviceIdentity adds both headers only when derivable', () => {
  const headers = { authorization: 'Bearer t' }
  const enriched = withDeviceIdentity(headers, { uid: 'uid-a', salt: SALT })
  assert.equal(enriched['x-machine-id'], deriveDeviceId('uid-a', 'machine', SALT))
  assert.equal(enriched['x-session-id'], deriveDeviceId('uid-a', 'session', SALT))
  assert.equal(enriched.authorization, 'Bearer t')
  assert.deepEqual(withDeviceIdentity(headers, { uid: '', salt: SALT }), headers)
  assert.deepEqual(withDeviceIdentity(headers, { uid: 'uid-a', salt: '' }), headers)
})

test('the salt file is created once, 0600, and read back', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-salt-'))
  const path = join(directory, 'credentials.json.device')
  const first = loadDeviceSalt(path)
  assert.match(first, /^[0-9a-f]{64}$/)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal(loadDeviceSalt(path), first)
  assert.equal(readFileSync(path, 'utf8').trim(), first)
})

test('an unreadable salt file is replaced rather than reused', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-salt-'))
  const path = join(directory, 'credentials.json.device')
  const first = loadDeviceSalt(path)
  writeFileSync(path, 'too-short')
  const second = loadDeviceSalt(path)
  assert.notEqual(second, 'too-short')
  assert.match(second, /^[0-9a-f]{64}$/)
  assert.notEqual(second, first)
})

test('pacing spaces request starts per account', async () => {
  let clock = 0
  const pacer = new RequestPacer({ minGapMs: 500, maxConcurrent: 2, now: () => clock })
  const first = await pacer.acquire('uid-a')
  assert.equal(first, undefined)
  assert.equal(pacer.channel('uid-a').active, 1)

  // The next start for the same account waits for the gap.
  let released = false
  const started = Date.now()
  const waiting = pacer.acquire('uid-a').then(() => {
    released = true
  })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(released, false)
  clock += 500
  await waiting
  assert.equal(released, true)
  assert.equal(pacer.channel('uid-a').active, 2)
  assert.ok(Date.now() - started >= 0)
})

test('one account never blocks another', async () => {
  const pacer = new RequestPacer({ minGapMs: 60_000, maxConcurrent: 1, now: () => 0 })
  await pacer.acquire('uid-a')
  // uid-a is saturated for a minute, but uid-b must run immediately.
  const started = Date.now()
  await pacer.acquire('uid-b')
  assert.ok(Date.now() - started < 250)
  assert.equal(pacer.channel('uid-b').active, 1)
  assert.equal(pacer.channel('uid-a').active, 1)
})

test('the concurrency cap holds within one account', async () => {
  let clock = 0
  const pacer = new RequestPacer({ minGapMs: 0, maxConcurrent: MAX_CONCURRENT_PER_ACCOUNT, now: () => clock })
  for (let index = 0; index < MAX_CONCURRENT_PER_ACCOUNT; index += 1) {
    await pacer.acquire('uid-a')
  }
  let admitted = false
  const blocked = pacer.acquire('uid-a').then(() => {
    admitted = true
  })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(admitted, false)
  pacer.release('uid-a')
  await blocked
  assert.equal(admitted, true)
})

test('releasing and forgetting an account resets its channel', async () => {
  const pacer = new RequestPacer({ minGapMs: 0, maxConcurrent: 2, now: () => 0 })
  await pacer.acquire('uid-a')
  pacer.release('uid-a')
  assert.equal(pacer.channel('uid-a').active, 0)
  pacer.forget('uid-a')
  assert.equal(pacer.channels.has('uid-a'), false)
  assert.equal(MIN_REQUEST_GAP_MS > 0, true)
})
