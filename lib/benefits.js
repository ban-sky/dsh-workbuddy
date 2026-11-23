/**
 * Claimable WorkBuddy welfare credits.
 *
 * The billing console exposes two independent give-aways per account: the
 * one-off new-user gift and a time-boxed compensation grant. Both are read
 * with a plain status call and claimed with a separate write call, and both
 * answer the same document shape:
 *
 * ```json
 * { "claimed": false, "active": true, "credit_num": 1500,
 *   "validity_period": 1, "start_time": "2026-04-01 00:00:00",
 *   "end_time": "2026-11-30 23:59:59", "claimed_at": "" }
 * ```
 *
 * Three rules are load-bearing here:
 *
 * 1. **`active` alone does not mean claimable.** A claimed activity keeps
 *    reporting `active: true`, so the button may only appear when
 *    `active && !claimed`.
 * 2. **`end_time` is not compared against the local clock.** The console's
 *    timestamps are in the account's timezone and the local clock may drift;
 *    `active` is the authority and the date is only shown to the user.
 * 3. **Enterprise accounts are skipped.** The console rejects them with the
 *    same already-claimed error a personal account gets after claiming, so
 *    offering the button would be a lie. `enterpriseId !== ''` short-circuits.
 *
 * Claiming is one activity for one account per click, and the status is
 * re-read by the caller immediately before it writes, so a stale panel cannot
 * fire a second claim.
 *
 * @module @ban-sky/dsh-workbuddy/benefits
 */

import { billingBaseOf, billingHeaders } from './credits.js'

/** Request timeout for the console calls. */
export const BENEFIT_TIMEOUT_MS = 15_000

/** Console paths per activity. The console uses no `/v2` prefix here. */
export const BENEFIT_PATHS = {
  gift: {
    status: '/billing/meter/check-gift-claimed',
    claim: '/billing/meter/claim-gift',
  },
  compensation: {
    status: '/billing/meter/compensation-status',
    claim: '/billing/meter/claim-compensation',
  },
}

/** Upstream code for "this account already claimed this activity". */
const ALREADY_CLAIMED_CODE = 10_001

/**
 * Error with a stable kind the route can map onto a status code.
 */
export class BenefitError extends Error {
  /**
   * @param {string} message - Human-readable reason.
   * @param {'ENTERPRISE' | 'ALREADY_CLAIMED' | 'UNSUPPORTED' | 'FAILED' | 'BAD_RESPONSE'} kind - Error kind.
   */
  constructor(message, kind) {
    super(message)
    this.name = 'BenefitError'
    this.kind = kind
  }
}

/**
 * @param {unknown} value - Raw field.
 * @returns {string} Trimmed text, or ''.
 */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * @param {unknown} value - Raw field.
 * @returns {number} Finite non-negative number, or 0.
 */
function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Normalise one activity document.
 *
 * @param {'gift' | 'compensation'} kind - Activity kind.
 * @param {unknown} data - `data` field of the console response.
 * @returns {{ kind: 'gift' | 'compensation', active: boolean, claimed: boolean, pending: boolean, creditNum: number, validityPeriod: number, startTime: string, endTime: string, claimedAt: string }} Activity state.
 */
export function readBenefit(kind, data) {
  const root = data !== null && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {}
  const active = root.active === true
  const claimed = root.claimed === true
  return {
    kind,
    active,
    claimed,
    pending: active && !claimed,
    creditNum: num(root.credit_num),
    validityPeriod: num(root.validity_period),
    startTime: text(root.start_time),
    endTime: text(root.end_time),
    claimedAt: text(root.claimed_at),
  }
}

/**
 * POST one console path and return its parsed body.
 *
 * @param {object} options - Request inputs.
 * @param {string} options.url - Absolute URL.
 * @param {Record<string, string>} options.headers - Console headers.
 * @param {typeof fetch} options.fetchImpl - Fetch implementation.
 * @param {number} options.timeoutMs - Timeout in milliseconds.
 * @returns {Promise<{ ok: boolean, status: number, payload: Record<string, any> }>} Parsed response.
 * @throws {BenefitError} When the body is not JSON.
 */
async function postJson({ url, headers, fetchImpl, timeoutMs }) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: '{}',
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await response.text()
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    throw new BenefitError(`福利接口返回了非 JSON 响应（HTTP ${response.status}）`, 'BAD_RESPONSE')
  }
  return { ok: response.ok, status: response.status, payload }
}

/**
 * Read both activities for one account.
 *
 * @param {object} options - Request inputs.
 * @param {Record<string, string>} options.headers - Credential headers.
 * @param {string} options.domain - Account domain (selects the console).
 * @param {string} [options.enterpriseId] - Enterprise id, when the account has one.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {number} [options.timeoutMs] - Request timeout.
 * @param {number} [options.now] - Current epoch milliseconds.
 * @returns {Promise<{ supported: boolean, reason: string, gift: object | null, compensation: object | null, fetchedAt: number }>} Activity states.
 * @throws {BenefitError} When the console answers unusably.
 */
export async function fetchBenefits({
  headers,
  domain,
  enterpriseId = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = BENEFIT_TIMEOUT_MS,
  now = Date.now(),
}) {
  if (enterpriseId !== '') {
    return { supported: false, reason: 'ENTERPRISE', gift: null, compensation: null, fetchedAt: now }
  }
  const base = billingBaseOf(domain)
  const consoleHeaders = billingHeaders(headers, base)
  /**
   * @param {'gift' | 'compensation'} kind - Activity kind.
   * @returns {Promise<object>} Activity state.
   */
  const read = async (kind) => {
    const answer = await postJson({ url: base + BENEFIT_PATHS[kind].status, headers: consoleHeaders, fetchImpl, timeoutMs })
    if (answer.payload?.code !== 0) {
      throw new BenefitError(
        text(answer.payload?.displayMsg?.zh) || text(answer.payload?.msg) || `福利状态读取失败（HTTP ${answer.status}）`,
        'FAILED',
      )
    }
    return readBenefit(kind, answer.payload?.data)
  }
  const [gift, compensation] = await Promise.all([read('gift'), read('compensation')])
  return { supported: true, reason: '', gift, compensation, fetchedAt: now }
}

/**
 * Claim one activity for one account.
 *
 * The caller is expected to have read the status immediately before calling
 * this, so an already-claimed activity normally never reaches the network.
 *
 * @param {object} options - Request inputs.
 * @param {Record<string, string>} options.headers - Credential headers.
 * @param {string} options.domain - Account domain (selects the console).
 * @param {'gift' | 'compensation'} options.kind - Activity kind.
 * @param {string} [options.enterpriseId] - Enterprise id, when the account has one.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {number} [options.timeoutMs] - Request timeout.
 * @param {number} [options.now] - Current epoch milliseconds.
 * @returns {Promise<{ kind: string, claimedAt: string, creditNum: number, fetchedAt: number }>} Claim receipt.
 * @throws {BenefitError} When the console refuses or answers unusably.
 */
export async function claimBenefit({
  headers,
  domain,
  kind,
  enterpriseId = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = BENEFIT_TIMEOUT_MS,
  now = Date.now(),
}) {
  if (BENEFIT_PATHS[kind] === undefined) throw new BenefitError('未知的福利类型。', 'UNSUPPORTED')
  if (enterpriseId !== '') throw new BenefitError('企业账号没有个人福利可以领取。', 'ENTERPRISE')
  const base = billingBaseOf(domain)
  const answer = await postJson({
    url: base + BENEFIT_PATHS[kind].claim,
    headers: billingHeaders(headers, base),
    fetchImpl,
    timeoutMs,
  })
  const payload = answer.payload ?? {}
  if (payload.code === ALREADY_CLAIMED_CODE) {
    throw new BenefitError(text(payload.msg) || '该福利已经领取过。', 'ALREADY_CLAIMED')
  }
  if (!answer.ok || payload.code !== 0) {
    throw new BenefitError(
      text(payload.displayMsg?.zh) || text(payload.msg) || `领取失败（HTTP ${answer.status}）`,
      'FAILED',
    )
  }
  const data = payload.data !== null && typeof payload.data === 'object' ? payload.data : {}
  return {
    kind,
    claimedAt: text(data.claimed_at) || new Date(now).toISOString(),
    creditNum: num(data.credit_num),
    fetchedAt: now,
  }
}
