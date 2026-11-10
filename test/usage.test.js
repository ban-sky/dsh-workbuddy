import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  USAGE_VERSION,
  UsageLedger,
  addUsage,
  createUsageTap,
  defaultUsagePath,
  readAccountEntry,
  readCounters,
  readUpstreamUsage,
  summarizeCounters,
} from '../lib/usage.js'

/**
 * Create an isolated temp directory for one test.
 *
 * @returns {string} Directory path.
 */
function tempDir() {
  return mkdtempSync(join(tmpdir(), 'wb-usage-'))
}

/**
 * A realistic gateway usage block.
 *
 * @param {Record<string, unknown>} [overrides] - Field overrides.
 * @returns {Record<string, unknown>} Usage block.
 */
function usageBlock(overrides = {}) {
  return {
    prompt_tokens: 1100,
    completion_tokens: 240,
    total_tokens: 1340,
    prompt_cache_hit_tokens: 900,
    prompt_cache_miss_tokens: 200,
    completion_thinking_tokens: 0,
    credit: 0.05,
    ...overrides,
  }
}

test('defaultUsagePath prefers DSH_HOME', () => {
  assert.equal(defaultUsagePath({ DSH_HOME: '/srv/dsh' }, '/home/u'), '/srv/dsh/.workbuddy-usage.json')
  assert.equal(defaultUsagePath({}, '/home/u'), '/home/u/.dsh/.workbuddy-usage.json')
})

test('readCounters keeps only known fields and floors at zero', () => {
  const counters = readCounters({ requests: 3, promptTokens: -5, credits: '0.25', bogus: 9 })
  assert.equal(counters.requests, 3)
  assert.equal(counters.promptTokens, 0)
  assert.equal(counters.credits, 0.25)
  assert.equal('bogus' in counters, false)
})

test('readUpstreamUsage splits cached and uncached prompt tokens', () => {
  const parsed = readUpstreamUsage(usageBlock())
  assert.equal(parsed.promptTokens, 1100)
  assert.equal(parsed.completionTokens, 240)
  assert.equal(parsed.totalTokens, 1340)
  assert.equal(parsed.cachedTokens, 900)
  assert.equal(parsed.uncachedTokens, 200)
  assert.equal(parsed.credits, 0.05)
})

test('readUpstreamUsage derives a miss count when only hits are reported', () => {
  const parsed = readUpstreamUsage({ prompt_tokens: 100, completion_tokens: 10, cached_tokens: 40 })
  assert.equal(parsed.cachedTokens, 40)
  assert.equal(parsed.uncachedTokens, 60)
  assert.equal(parsed.totalTokens, 110)
})

test('readUpstreamUsage reads the OpenAI details shape', () => {
  const parsed = readUpstreamUsage({
    prompt_tokens: 50,
    completion_tokens: 5,
    prompt_tokens_details: { cached_tokens: 20 },
    completion_tokens_details: { reasoning_tokens: 7 },
  })
  assert.equal(parsed.cachedTokens, 20)
  assert.equal(parsed.uncachedTokens, 30)
  assert.equal(parsed.reasoningTokens, 7)
})

test('readUpstreamUsage never reports more cached tokens than prompt tokens', () => {
  const parsed = readUpstreamUsage({ prompt_tokens: 10, completion_tokens: 1, prompt_cache_hit_tokens: 99 })
  assert.equal(parsed.cachedTokens, 10)
  assert.equal(parsed.uncachedTokens, 0)
})

test('addUsage accumulates counters and tracks the time window', () => {
  const first = addUsage(readCounters({}), readUpstreamUsage(usageBlock()), 1000)
  const second = addUsage(first, readUpstreamUsage(usageBlock({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 10, credit: 0.01 })), 2000)
  assert.equal(second.requests, 2)
  assert.equal(second.promptTokens, 1110)
  assert.equal(second.completionTokens, 242)
  assert.equal(second.totalTokens, 1352)
  assert.equal(second.cachedTokens, 900)
  assert.equal(second.uncachedTokens, 210)
  assert.equal(second.credits, 0.06)
  assert.equal(second.firstAt, 1000)
  assert.equal(second.lastAt, 2000)
})

test('summarizeCounters derives the credit-to-token conversion', () => {
  const summary = summarizeCounters(
    readCounters({ requests: 2, promptTokens: 1000, completionTokens: 500, totalTokens: 1500, cachedTokens: 750, uncachedTokens: 250, credits: 0.5 }),
  )
  assert.equal(summary.cacheHitRate, 0.75)
  assert.equal(summary.tokensPerCredit, 3000)
  assert.equal(summary.creditsPerKToken, 0.333333)
})

test('summarizeCounters reports zero ratios instead of NaN', () => {
  const summary = summarizeCounters(readCounters({}))
  assert.equal(summary.cacheHitRate, 0)
  assert.equal(summary.tokensPerCredit, 0)
  assert.equal(summary.creditsPerKToken, 0)
})

test('ledger records per account and keeps models apart', () => {
  const ledger = new UsageLedger({ path: '', now: () => 5000 })
  ledger.record({ accountId: 'a1', model: 'deepseek-v4-flash', usage: usageBlock() })
  ledger.record({ accountId: 'a1', model: 'deepseek-v4-flash', usage: usageBlock() })
  ledger.record({ accountId: 'a1', model: 'glm-5.3', usage: usageBlock({ prompt_tokens: 10, completion_tokens: 1, total_tokens: 11, credit: 0.01 }) })
  const view = ledger.view('a1')
  assert.equal(view.accounts.length, 1)
  const account = view.accounts[0]
  assert.equal(account.requests, 3)
  assert.equal(account.models.length, 2)
  assert.equal(account.models[0].id, 'deepseek-v4-flash')
  assert.equal(account.models[0].requests, 2)
  assert.equal(account.models[1].id, 'glm-5.3')
  assert.equal(view.totals.requests, 3)
})

test('ledger isolates accounts from each other', () => {
  const ledger = new UsageLedger({ path: '', now: () => 1 })
  ledger.record({ accountId: 'a1', model: 'm', usage: usageBlock() })
  ledger.record({ accountId: 'a2', model: 'm', usage: usageBlock({ prompt_tokens: 5, completion_tokens: 1, total_tokens: 6, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 5, credit: 0.01 }) })
  assert.equal(ledger.view('a1').accounts[0].totalTokens, 1340)
  assert.equal(ledger.view('a2').accounts[0].totalTokens, 6)
  assert.equal(ledger.view().accounts.length, 2)
})

test('an empty usage block is not recorded', () => {
  const ledger = new UsageLedger({ path: '', now: () => 1 })
  const recorded = ledger.record({ accountId: 'a1', model: 'm', usage: {} })
  assert.equal(recorded, undefined)
  assert.equal(ledger.view().accounts.length, 0)
})

test('ledger persists with mode 0600 and reloads', () => {
  const path = join(tempDir(), 'usage.json')
  const first = new UsageLedger({ path, now: () => 4000 })
  first.record({ accountId: 'a1', model: 'deepseek-v4-flash', usage: usageBlock() })
  first.flush()
  const info = statSync(path)
  assert.equal(info.mode & 0o777, 0o600)
  const document = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(document.version, USAGE_VERSION)
  assert.equal(document.accounts.a1.requests, 1)
  assert.equal(document.accounts.a1.models['deepseek-v4-flash'].credits, 0.05)
  const second = new UsageLedger({ path, now: () => 9000 })
  assert.equal(second.view('a1').accounts[0].totalTokens, 1340)
})

test('reset clears one account or all of them', () => {
  const path = join(tempDir(), 'usage.json')
  const ledger = new UsageLedger({ path, now: () => 1 })
  ledger.record({ accountId: 'a1', model: 'm', usage: usageBlock() })
  ledger.record({ accountId: 'a2', model: 'm', usage: usageBlock() })
  ledger.reset('a1')
  assert.equal(ledger.view().accounts.length, 1)
  assert.equal(ledger.view().accounts[0].id, 'a2')
  ledger.reset()
  assert.equal(ledger.view().accounts.length, 0)
  const document = JSON.parse(readFileSync(path, 'utf8'))
  assert.deepEqual(document.accounts, {})
})

test('a corrupt ledger file is ignored with a warning', () => {
  const path = join(tempDir(), 'usage.json')
  writeFileSync(path, '{not json', { mode: 0o600 })
  const warnings = []
  const ledger = new UsageLedger({ path, onWarning: (message) => warnings.push(message) })
  assert.equal(ledger.view().accounts.length, 0)
  assert.equal(warnings.length, 1)
})

test('an oversized ledger file is ignored', () => {
  const path = join(tempDir(), 'usage.json')
  writeFileSync(path, JSON.stringify({ version: 1, accounts: {} }).padEnd(1024 * 1024 + 1, ' '), { mode: 0o600 })
  const warnings = []
  const ledger = new UsageLedger({ path, onWarning: (message) => warnings.push(message) })
  assert.equal(ledger.view().accounts.length, 0)
  assert.match(warnings[0], /过大/)
})

test('readAccountEntry drops unknown model ids and keeps known counters', () => {
  const entry = readAccountEntry({ requests: 2, totalTokens: 30, models: { m1: { requests: 1, totalTokens: 10 } } })
  assert.equal(entry.counters.requests, 2)
  assert.equal(entry.models.get('m1').totalTokens, 10)
  assert.equal(entry.models.size, 1)
})

test('createUsageTap extracts usage from streamed SSE chunks', () => {
  const seen = []
  const tap = createUsageTap((usage) => seen.push(usage))
  const chunk = (payload) => `data: ${JSON.stringify(payload)}\n\n`
  tap.push(chunk({ choices: [{ delta: { content: 'hi' } }] }))
  tap.push(chunk({ choices: [], usage: usageBlock() }))
  tap.push('data: [DONE]\n\n')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].prompt_tokens, 1100)
})

test('createUsageTap reassembles a chunk split mid-line', () => {
  const seen = []
  const tap = createUsageTap((usage) => seen.push(usage))
  const line = `data: ${JSON.stringify({ usage: usageBlock() })}\n\n`
  const cut = Math.floor(line.length / 2)
  tap.push(line.slice(0, cut))
  assert.equal(seen.length, 0)
  tap.push(line.slice(cut))
  assert.equal(seen.length, 1)
})

test('createUsageTap flush handles a trailing line without a newline', () => {
  const seen = []
  const tap = createUsageTap((usage) => seen.push(usage))
  tap.push(`data: ${JSON.stringify({ usage: usageBlock() })}`)
  assert.equal(seen.length, 0)
  tap.flush()
  assert.equal(seen.length, 1)
})

test('createUsageTap ignores non-data lines and malformed JSON', () => {
  const seen = []
  const tap = createUsageTap((usage) => seen.push(usage))
  tap.push('event: message\n')
  tap.push('data: {oops\n')
  tap.push('data: \n')
  assert.equal(seen.length, 0)
})
