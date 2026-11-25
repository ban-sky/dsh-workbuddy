/**
 * Daily check-in tests: streak parsing, the yearly heatmap, and redemptions.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GROWTH_PATHS,
  GrowthError,
  fetchGrowth,
  growthSupported,
  readGrowth,
  readHeatmap,
  redeemGrowth,
} from '../lib/growth.js'

const STREAK = {
  streak: {
    days: 8,
    month_total_days: 8,
    month_consumed_days: 1,
    next_tier: '14d',
    next_tier_remaining: 6,
    makeup_dates: ['2026-11-19'],
  },
  makeup_cards: { balance: 2, max: 4 },
  redemption_status: {
    tier_7d_status: 'redeemed',
    tier_7d_count: 1,
    tier_14d_status: 'locked',
    tier_14d_count: 0,
    tier_28d_status: 'locked',
    tier_28d_count: 0,
    remaining_days: 8,
    tiers: [
      { tier: '7d', days: 7, credit: 0, energy: 2, cards: 1, chances: 1 },
      { tier: '14d', days: 14, credit: 50, energy: 3, cards: 1, chances: 1 },
      { tier: '28d', days: 28, credit: 150, energy: 5, cards: 1, chances: 1 },
    ],
  },
  timezone: 'Asia/Shanghai',
  launch_date: '2026-06-17',
}

/**
 * Build a fake activity host.
 *
 * @param {object} [options] - Behaviour options.
 * @param {number} [options.redeemStatus] - HTTP status for the redemption.
 * @param {number} [options.redeemCode] - Body code for the redemption.
 * @param {number} [options.heatmapScore] - Score for today's heatmap cell.
 * @returns {{ fetchImpl: typeof fetch, calls: Array<{ url: string, method: string, body: string }> }} Fake host.
 */
function fakeHost({ redeemStatus = 200, redeemCode = 0, heatmapScore = 1 } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: String(init.method ?? 'GET'), body: String(init.body ?? '') })
    const path = new URL(String(url)).pathname
    if (path === GROWTH_PATHS.streak) return Response.json({ code: 0, data: STREAK })
    if (path === GROWTH_PATHS.heatmap) {
      return Response.json({
        code: 0,
        data: {
          cells: [
            { date: '2026-11-24', score: 3 },
            { date: '2026-11-25', score: heatmapScore },
          ],
        },
      })
    }
    return Response.json(
      { code: redeemCode, msg: redeemCode === 403 ? '连续登录天数不足，请继续打卡或使用补签卡' : 'OK', data: { credit: 50, energy: 3, cards: 1, chances: 1 } },
      { status: redeemStatus },
    )
  }
  return { fetchImpl, calls }
}

test('the growth activity is unsupported on the global host', () => {
  assert.equal(growthSupported('www.codebuddy.cn'), true)
  assert.equal(growthSupported('www.workbuddy.cn'), true)
  assert.equal(growthSupported('www.workbuddy.ai'), false)
})

test('readGrowth normalizes the streak, cards, and tier states', () => {
  const state = readGrowth(STREAK)
  assert.equal(state.streak.days, 8)
  assert.equal(state.streak.nextTier, '14d')
  assert.equal(state.streak.nextTierRemaining, 6)
  assert.deepEqual(state.streak.makeupDates, ['2026-11-19'])
  assert.deepEqual(state.cards, { balance: 2, max: 4 })
  assert.equal(state.remainingDays, 8)
  assert.equal(state.timezone, 'Asia/Shanghai')
  assert.equal(state.launchDate, '2026-06-17')
  assert.deepEqual(
    state.tiers.map((tier) => [tier.tier, tier.days, tier.credit, tier.state, tier.count]),
    [
      ['7d', 7, 0, 'redeemed', 1],
      ['14d', 14, 50, 'locked', 0],
      ['28d', 28, 150, 'locked', 0],
    ],
  )
})

test('readGrowth keeps the tier order even when the document is shuffled', () => {
  const shuffled = {
    ...STREAK,
    redemption_status: {
      ...STREAK.redemption_status,
      tiers: [STREAK.redemption_status.tiers[2], STREAK.redemption_status.tiers[0]],
    },
  }
  const state = readGrowth(shuffled)
  assert.deepEqual(
    state.tiers.map((tier) => tier.tier),
    ['7d', '14d', '28d'],
  )
  assert.equal(state.tiers[2].credit, 150)
})

test('readGrowth survives an empty document', () => {
  const state = readGrowth(null)
  assert.equal(state.streak.days, 0)
  assert.deepEqual(state.cards, { balance: 0, max: 0 })
  assert.equal(state.tiers.length, 3)
  assert.equal(state.tiers[0].state, 'locked')
})

test('readHeatmap finds today by date, not by position', () => {
  const data = { cells: [{ date: '2026-11-25', score: 2 }, { date: '2026-11-26', score: 0 }] }
  assert.deepEqual(readHeatmap(data, '2026-11-26'), { counted: false, score: 0, hotDays: 1 })
  assert.deepEqual(readHeatmap(data, '2026-11-25'), { counted: true, score: 2, hotDays: 1 })
})

test('readHeatmap reports "unknown" when today has no cell', () => {
  const data = { cells: [{ date: '2026-11-24', score: 1 }] }
  assert.deepEqual(readHeatmap(data, '2026-11-26'), { counted: null, score: 0, hotDays: 1 })
  assert.deepEqual(readHeatmap(null, '2026-11-26'), { counted: null, score: 0, hotDays: 0 })
})

test('fetchGrowth reads the streak and today from the activity host', async () => {
  const host = fakeHost({ heatmapScore: 4 })
  const state = await fetchGrowth({
    headers: { authorization: 'Bearer t' },
    base: 'https://www.codebuddy.cn',
    domain: 'www.codebuddy.cn',
    today: '2026-11-25',
    fetchImpl: host.fetchImpl,
    now: () => 7,
  })
  assert.equal(state.supported, true)
  assert.equal(state.streak.days, 8)
  assert.equal(state.today.counted, true)
  assert.equal(state.today.hotDays, 2)
  assert.equal(state.fetchedAt, 7)
  assert.deepEqual(
    host.calls.map((call) => call.url),
    ['https://www.codebuddy.cn/activity/growth/streak', 'https://www.codebuddy.cn/activity/growth/heatmap'],
  )
})

test('fetchGrowth skips every request for a global account', async () => {
  const host = fakeHost()
  const state = await fetchGrowth({
    headers: {},
    base: 'https://www.workbuddy.ai',
    domain: 'www.workbuddy.ai',
    today: '2026-11-25',
    fetchImpl: host.fetchImpl,
  })
  assert.equal(state.supported, false)
  assert.equal(state.reason, 'REGION')
  assert.equal(host.calls.length, 0)
})

test('a failing heatmap only hides today, not the streak', async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/streak')) return Response.json({ code: 0, data: STREAK })
    return new Response('nope', { status: 500 })
  }
  const state = await fetchGrowth({
    headers: {},
    base: 'https://www.codebuddy.cn',
    domain: 'www.codebuddy.cn',
    today: '2026-11-25',
    fetchImpl,
  })
  assert.equal(state.supported, true)
  assert.equal(state.streak.days, 8)
  assert.deepEqual(state.today, { counted: null, score: 0, hotDays: 0 })
})

test('a rejected streak read surfaces the upstream message', async () => {
  const fetchImpl = async () => Response.json({ code: 500, msg: '活动服务繁忙' })
  await assert.rejects(
    fetchGrowth({ headers: {}, base: 'https://www.codebuddy.cn', domain: 'www.codebuddy.cn', fetchImpl }),
    (error) => error instanceof GrowthError && error.kind === 'FAILED' && /活动服务繁忙/.test(error.message),
  )
})

test('redeemGrowth posts the tier with an idempotency token', async () => {
  const host = fakeHost()
  const receipt = await redeemGrowth({
    headers: { authorization: 'Bearer t' },
    base: 'https://www.codebuddy.cn',
    domain: 'www.codebuddy.cn',
    tier: '14d',
    clientToken: 'token-1',
    fetchImpl: host.fetchImpl,
    now: () => 9,
  })
  assert.deepEqual(receipt, { tier: '14d', credit: 50, energy: 3, cards: 1, chances: 1, fetchedAt: 9 })
  assert.equal(host.calls[0].url, 'https://www.codebuddy.cn/activity/growth/redeem')
  assert.equal(host.calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(host.calls[0].body), { tier: '14d', client_token: 'token-1' })
})

test('a locked tier is reported as not-enough-days', async () => {
  const host = fakeHost({ redeemStatus: 403, redeemCode: 403 })
  await assert.rejects(
    redeemGrowth({
      headers: {},
      base: 'https://www.codebuddy.cn',
      domain: 'www.codebuddy.cn',
      tier: '28d',
      clientToken: 'token-2',
      fetchImpl: host.fetchImpl,
    }),
    (error) => error instanceof GrowthError && error.kind === 'NOT_ENOUGH_DAYS' && /连续登录天数不足/.test(error.message),
  )
})

test('redeemGrowth refuses an unknown tier without calling the host', async () => {
  const host = fakeHost()
  await assert.rejects(
    redeemGrowth({
      headers: {},
      base: 'https://www.codebuddy.cn',
      domain: 'www.codebuddy.cn',
      tier: '3d',
      clientToken: 'token-3',
      fetchImpl: host.fetchImpl,
    }),
    (error) => error instanceof GrowthError && error.kind === 'UNSUPPORTED',
  )
  assert.equal(host.calls.length, 0)
})
