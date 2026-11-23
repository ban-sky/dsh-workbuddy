/**
 * Welfare-credit tests against a fake billing console.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { BenefitError, claimBenefit, fetchBenefits, readBenefit } from '../lib/benefits.js'

/**
 * Build a fake console answering the four welfare paths.
 *
 * @param {object} [options] - Behaviour options.
 * @param {number} [options.giftCode] - Response code for the gift claim.
 * @param {string} [options.giftClaimMessage] - Message for a refused claim.
 * @param {boolean} [options.active] - Whether the activities are running.
 * @param {boolean} [options.claimed] - Whether they are already claimed.
 * @returns {{ fetchImpl: typeof fetch, calls: Array<{ url: string, headers: Record<string, string>, body: string }> }} Fake console.
 */
function fakeConsole({ giftCode = 0, giftClaimMessage = 'OK', active = true, claimed = false } = {}) {
  const calls = []
  /**
   * @param {string} url - Request URL.
   * @param {RequestInit} [init] - Request options.
   * @returns {Promise<Response>} Response.
   */
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url: String(url),
      headers: /** @type {Record<string, string>} */ (init.headers ?? {}),
      body: String(init.body ?? ''),
    })
    const path = new URL(String(url)).pathname
    if (path.endsWith('claim-gift')) {
      return Response.json({ code: giftCode, msg: giftClaimMessage, data: { claimed_at: '2026-11-23 21:00:00' } })
    }
    if (path.endsWith('check-gift-claimed')) {
      return Response.json({
        code: 0,
        data: {
          claimed,
          claimed_at: claimed ? '2026-10-25 11:54:38' : '',
          active,
          credit_num: 1500,
          validity_period: 1,
          start_time: '2026-04-01 00:00:00',
          end_time: '2026-11-30 23:59:59',
        },
      })
    }
    if (path.endsWith('compensation-status')) {
      return Response.json({
        code: 0,
        data: { claimed, active: false, credit_num: 500, validity_period: 1, end_time: '2026-10-22 23:59:59' },
      })
    }
    return Response.json({ code: 0, data: { claimed_at: '2026-11-23 21:00:00' } })
  }
  return { fetchImpl: /** @type {typeof fetch} */ (fetchImpl), calls }
}

const HEADERS = { authorization: 'Bearer secret-token', 'x-user-id': 'u-1', 'x-domain': 'www.codebuddy.cn' }

test('an activity is pending only while it is active and unclaimed', () => {
  const base = { kind: 'gift', creditNum: 1500, validityPeriod: 1, startTime: '', endTime: '', claimedAt: '' }
  assert.equal(readBenefit('gift', { active: true, claimed: false }).pending, true)
  assert.equal(readBenefit('gift', { active: true, claimed: true }).pending, false)
  assert.equal(readBenefit('gift', { active: false, claimed: false }).pending, false)
  assert.deepEqual(readBenefit('gift', { active: true, claimed: false, credit_num: 1500, validity_period: 1 }), { ...base, active: true, claimed: false, pending: true })
})

test('fetchBenefits reads both activities without leaking the token', async () => {
  const console_ = fakeConsole({ active: true, claimed: true })
  const state = await fetchBenefits({ headers: HEADERS, domain: 'www.codebuddy.cn', fetchImpl: console_.fetchImpl })
  assert.equal(state.supported, true)
  assert.equal(state.gift.pending, false)
  assert.equal(state.gift.claimed, true)
  assert.equal(state.compensation.active, false)
  assert.equal(console_.calls.length, 2)
  assert.ok(console_.calls.every((call) => call.url.startsWith('https://www.codebuddy.cn/billing/meter/')))
  assert.equal(JSON.stringify(state).includes('secret-token'), false)
})

test('fetchBenefits follows the account domain to the global console', async () => {
  const console_ = fakeConsole()
  await fetchBenefits({ headers: HEADERS, domain: 'www.workbuddy.ai', fetchImpl: console_.fetchImpl })
  assert.ok(console_.calls.every((call) => call.url.startsWith('https://www.workbuddy.ai/billing/meter/')))
})

test('fetchBenefits skips enterprise accounts entirely', async () => {
  const console_ = fakeConsole()
  const state = await fetchBenefits({ headers: HEADERS, domain: 'www.codebuddy.cn', enterpriseId: 'e-1', fetchImpl: console_.fetchImpl })
  assert.equal(state.supported, false)
  assert.equal(state.reason, 'ENTERPRISE')
  assert.equal(console_.calls.length, 0)
})

test('fetchBenefits surfaces an upstream refusal as a BenefitError', async () => {
  const fetchImpl = /** @type {typeof fetch} */ (async () => Response.json({ code: 500, msg: '服务开小差了' }))
  await assert.rejects(
    fetchBenefits({ headers: HEADERS, domain: 'www.codebuddy.cn', fetchImpl }),
    (error) => error instanceof BenefitError && error.kind === 'FAILED' && /服务开小差/.test(error.message),
  )
})

test('fetchBenefits reports a non-JSON console answer', async () => {
  const fetchImpl = /** @type {typeof fetch} */ (async () => new Response('<html>502</html>', { status: 502 }))
  await assert.rejects(
    fetchBenefits({ headers: HEADERS, domain: 'www.codebuddy.cn', fetchImpl }),
    (error) => error instanceof BenefitError && error.kind === 'BAD_RESPONSE',
  )
})

test('claimBenefit returns a receipt on success', async () => {
  const console_ = fakeConsole({ giftCode: 0 })
  const receipt = await claimBenefit({ headers: HEADERS, domain: 'www.codebuddy.cn', kind: 'gift', fetchImpl: console_.fetchImpl })
  assert.equal(receipt.kind, 'gift')
  assert.equal(receipt.claimedAt, '2026-11-23 21:00:00')
  assert.equal(console_.calls.length, 1)
  assert.ok(console_.calls[0].url.endsWith('/billing/meter/claim-gift'))
  assert.equal(console_.calls[0].body, '{}')
})

test('claimBenefit maps code 10001 to ALREADY_CLAIMED', async () => {
  const console_ = fakeConsole({ giftCode: 10_001, giftClaimMessage: '每人限领一次，您已领取过无法重复领取' })
  await assert.rejects(
    claimBenefit({ headers: HEADERS, domain: 'www.codebuddy.cn', kind: 'gift', fetchImpl: console_.fetchImpl }),
    (error) => error instanceof BenefitError && error.kind === 'ALREADY_CLAIMED',
  )
})

test('claimBenefit refuses enterprise accounts and unknown kinds without a request', async () => {
  const console_ = fakeConsole()
  await assert.rejects(
    claimBenefit({ headers: HEADERS, domain: 'www.codebuddy.cn', kind: 'gift', enterpriseId: 'e-1', fetchImpl: console_.fetchImpl }),
    (error) => error instanceof BenefitError && error.kind === 'ENTERPRISE',
  )
  await assert.rejects(
    claimBenefit({ headers: HEADERS, domain: 'www.codebuddy.cn', kind: 'coupon', fetchImpl: console_.fetchImpl }),
    (error) => error instanceof BenefitError && error.kind === 'UNSUPPORTED',
  )
  assert.equal(console_.calls.length, 0)
})

test('the claim path re-reads nothing itself but never sends the product code', async () => {
  const console_ = fakeConsole()
  await claimBenefit({ headers: HEADERS, domain: 'www.codebuddy.cn', kind: 'compensation', fetchImpl: console_.fetchImpl })
  assert.ok(console_.calls[0].url.endsWith('/billing/meter/claim-compensation'))
  assert.equal(console_.calls[0].headers['x-codebuddy-request'], '1')
  assert.equal(console_.calls[0].headers['x-requested-with'], 'XMLHttpRequest')
  assert.equal(console_.calls[0].body.includes('p_tcaca'), false)
})
