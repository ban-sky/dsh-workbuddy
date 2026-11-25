/**
 * DSH Go contribution tests: the data object, the view document, and the strip.
 *
 * The view document is pure data, so these tests can pin its shape without a
 * phone: the app rejects a document whose node types or bindings are wrong.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { GO_PANEL_ID, GO_STRIP_ID, formatCredits, formatTokens, goData, goStrip, goView, tierReward } from '../lib/dsh-go.js'

/** One signed-in snapshot with credits, usage, and a live streak. */
const SNAPSHOT = {
  status: { signedIn: true, nickname: '176****1757', activeAccountId: 'acct-1' },
  credits: { total: 748, expiringSoon: 120 },
  usage: { totals: { promptTokens: 18_900_000, cachedTokens: 15_000_000, uncachedTokens: 3_900_000, completionTokens: 1_200_000, credits: 42.5 } },
  growth: {
    supported: true,
    streak: { days: 8, nextTier: '14d', nextTierRemaining: 6 },
    cards: { balance: 2, max: 4 },
    tiers: [
      { tier: '7d', days: 7, credit: 0, energy: 2, cards: 1, state: 'redeemed' },
      { tier: '14d', days: 14, credit: 50, energy: 3, cards: 1, state: 'available' },
      { tier: '28d', days: 28, credit: 150, energy: 5, cards: 1, state: 'locked' },
    ],
    today: { counted: true },
  },
}

test('formatCredits and formatTokens keep numbers short', () => {
  assert.equal(formatCredits(748), '748')
  assert.equal(formatCredits(42.5), '42.5')
  assert.equal(formatCredits(Number.NaN), '—')
  assert.equal(formatTokens(950), '950')
  assert.match(formatTokens(18_900_000), /^18\.9M$/)
  assert.match(formatTokens(3_900_000), /^3\.9M$/)
})

test('tierReward summarizes what a tier pays', () => {
  assert.match(tierReward({ credit: 50, energy: 3, cards: 1 }, 'zh'), /50 积分/)
  assert.match(tierReward({ credit: 150, energy: 5, cards: 1 }, 'en'), /150 cr/)
})

test('goData flattens one snapshot for the app', () => {
  const data = goData(SNAPSHOT, 'zh')
  assert.equal(data.signedIn, true)
  assert.equal(data.accountName, '176****1757')
  assert.equal(data.creditTotal, '748')
  assert.equal(data.creditExpiring, '120')
  assert.equal(data.input, '18.9M')
  assert.equal(data.cached, '15M')
  assert.equal(data.spent, '42.5')
  assert.equal(data.streakDays, '8')
  assert.equal(data.todayText, '已计入')
  assert.match(data.nextTierText, /^14d · /)
  assert.equal(data.makeup, '2 / 4')
  assert.equal(data.tiers.length, 3)
  assert.deepEqual(data.tiers[1], ['14d · 14d', '50 积分 · 3 能量 · 1 补登卡', '可兑换'])
})

test('goData degrades gracefully when signed out', () => {
  const data = goData({ status: { signedIn: false }, credits: null, usage: { totals: {} }, growth: { supported: false } }, 'en')
  assert.equal(data.signedIn, false)
  assert.equal(data.creditTotal, '—')
  assert.equal(data.streakDays, '0')
  assert.deepEqual(data.tiers, [])
  assert.equal(data.growthSupported, false)
})

test('goView emits a v2 stack with the four cards, a tier table, and actions', () => {
  const view = goView('zh')
  assert.equal(view.v, 2)
  assert.equal(view.type, 'stack')
  assert.equal(view.accent, 'app')
  const types = (node) => [node.type, ...(Array.isArray(node.children) ? node.children.flatMap(types) : [])]
  const found = types(view)
  for (const type of ['text', 'stack', 'table', 'actions']) assert.ok(found.includes(type), `missing ${type}`)
  const table = JSON.stringify(view)
  assert.match(table, /档位/)
  assert.match(table, /7d/)
  const actions = JSON.stringify(view)
  for (const action of ['refresh', 'claim-gift', 'redeem-7d', 'redeem-14d', 'redeem-28d']) {
    assert.ok(actions.includes(`"action":"${action}"`), `missing action ${action}`)
  }
})

test('goView speaks English for the English locale', () => {
  const view = JSON.stringify(goView('en'))
  assert.match(view, /Credits/)
  assert.match(view, /Daily streak|Streak/)
})

test('goStrip stays a short decoration', () => {
  const strip = goStrip(SNAPSHOT, 'zh')
  assert.equal(strip.icon, 'chart')
  assert.equal(typeof strip.text, 'string')
  assert.ok(strip.text.length > 0 && strip.text.length <= 24, `strip text too long: ${strip.text}`)
  assert.match(strip.text, /748/)
})

test('ids match the manifest contract', () => {
  assert.equal(GO_PANEL_ID, 'workbuddy')
  assert.equal(GO_STRIP_ID, 'workbuddy-credits')
})
