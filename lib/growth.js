/**
 * WorkBuddy daily activity ("连续登录") status and tier rewards.
 *
 * The console's growth space records one day per **completed conversation** —
 * not per page visit — and unlocks a redeemable packet at 7, 14 and 28
 * consecutive days. `GET /activity/growth/streak` reports the current streak,
 * the remaining days to the next tier and each tier's state
 * (`locked` | `available` | `redeemed`); `POST /activity/growth/redeem` claims
 * one tier with an idempotency token.
 *
 * Two rules shape this module:
 *
 * 1. **Nothing is derived from the local clock.** The server answers in its own
 *    timezone (Asia/Shanghai) and already computed `next_tier_remaining`; a
 *    client-side day count would disagree across timezones and around midnight.
 * 2. **A redemption is never attempted blindly.** The tier state is re-read
 *    immediately before claiming, and a tier that is not `available` is refused
 *    locally so a duplicate click cannot spam the activity service.
 *
 * @module @ban-sky/dsh-workbuddy/growth
 */

/** Timeout for one growth request. */
export const GROWTH_TIMEOUT_MS = 15_000

/** Tiers the activity offers, in ascending order. */
export const GROWTH_TIERS = Object.freeze(['7d', '14d', '28d'])

/** Upstream paths, relative to the account's billing host. */
export const GROWTH_PATHS = Object.freeze({
  streak: '/activity/growth/streak',
  heatmap: '/activity/growth/heatmap',
  redeem: '/activity/growth/redeem',
})

/** Tier states the activity reports. */
export const TIER_STATES = Object.freeze(['locked', 'available', 'redeemed'])

/** A growth request that the caller should surface as a specific failure. */
export class GrowthError extends Error {
  /**
   * @param {string} message - Human-readable detail.
   * @param {'UNSUPPORTED'|'NOT_ENOUGH_DAYS'|'ALREADY_REDEEMED'|'FAILED'|'BAD_RESPONSE'} kind - Failure class.
   */
  constructor(message, kind) {
    super(message)
    this.name = 'GrowthError'
    this.kind = kind
  }
}

/**
 * The growth activity only exists on the mainland console.
 *
 * @param {string} domain - Account domain from the credential.
 * @returns {boolean} Whether the activity can be queried for this account.
 */
export function growthSupported(domain) {
  const value = typeof domain === 'string' ? domain.toLowerCase() : ''
  return !value.endsWith('workbuddy.ai')
}

/**
 * Read one tier row from the streak document.
 *
 * @param {unknown} raw - Tier entry from `redemption_status.tiers`.
 * @param {unknown} state - Reported `tier_<tier>_status`.
 * @param {unknown} count - Reported `tier_<tier>_count`.
 * @param {string} tier - Tier id fallback.
 * @returns {{tier: string, days: number, credit: number, energy: number, cards: number, chances: number, state: string, count: number}} Tier view.
 */
export function readTier(raw, state, count, tier) {
  const entry = raw !== null && typeof raw === 'object' ? raw : {}
  const id = typeof entry.tier === 'string' && entry.tier !== '' ? entry.tier : tier
  const status = typeof state === 'string' && TIER_STATES.includes(state) ? state : 'locked'
  return {
    tier: id,
    days: Number.isFinite(entry.days) ? entry.days : 0,
    credit: Number.isFinite(entry.credit) ? entry.credit : 0,
    energy: Number.isFinite(entry.energy) ? entry.energy : 0,
    cards: Number.isFinite(entry.cards) ? entry.cards : 0,
    chances: Number.isFinite(entry.chances) ? entry.chances : 0,
    state: status,
    count: Number.isFinite(count) ? count : 0,
  }
}

/**
 * Normalize the streak document into the shape the panel renders.
 *
 * @param {unknown} data - `data` field of `GET /activity/growth/streak`.
 * @returns {{streak: object, cards: object, tiers: ReadonlyArray<object>, remainingDays: number, timezone: string, launchDate: string}} Growth state.
 */
export function readGrowth(data) {
  const root = data !== null && typeof data === 'object' ? data : {}
  const streak = root.streak !== null && typeof root.streak === 'object' ? root.streak : {}
  const cards = root.makeup_cards !== null && typeof root.makeup_cards === 'object' ? root.makeup_cards : {}
  const redemption =
    root.redemption_status !== null && typeof root.redemption_status === 'object' ? root.redemption_status : {}
  const rawTiers = Array.isArray(redemption.tiers) ? redemption.tiers : []
  // Older payloads carry no `tier` id, so the position is the only hint there;
  // once any entry names its tier, ids are authoritative and position is ignored.
  const labeled = rawTiers.some((entry) => entry !== null && typeof entry === 'object' && typeof entry.tier === 'string' && entry.tier !== '')
  const tiers = GROWTH_TIERS.map((tier, index) =>
    readTier(
      rawTiers.find((entry) => entry !== null && typeof entry === 'object' && entry.tier === tier) ??
        (labeled ? undefined : rawTiers[index]),
      redemption[`tier_${tier}_status`],
      redemption[`tier_${tier}_count`],
      tier,
    ),
  )
  return {
    streak: {
      days: Number.isFinite(streak.days) ? streak.days : 0,
      monthTotalDays: Number.isFinite(streak.month_total_days) ? streak.month_total_days : 0,
      monthConsumedDays: Number.isFinite(streak.month_consumed_days) ? streak.month_consumed_days : 0,
      nextTier: typeof streak.next_tier === 'string' ? streak.next_tier : '',
      nextTierRemaining: Number.isFinite(streak.next_tier_remaining) ? streak.next_tier_remaining : 0,
      makeupDates: Array.isArray(streak.makeup_dates) ? streak.makeup_dates.filter((date) => typeof date === 'string') : [],
    },
    cards: {
      balance: Number.isFinite(cards.balance) ? cards.balance : 0,
      max: Number.isFinite(cards.max) ? cards.max : 0,
    },
    tiers,
    remainingDays: Number.isFinite(redemption.remaining_days) ? redemption.remaining_days : 0,
    timezone: typeof root.timezone === 'string' ? root.timezone : '',
    launchDate: typeof root.launch_date === 'string' ? root.launch_date : '',
  }
}

/**
 * Read today's cell out of the yearly heatmap.
 *
 * The heatmap returns a rolling 365-day window regardless of the `month`
 * parameter, so the cell is found by date rather than by position. A missing
 * cell means "not reported", never "not counted".
 *
 * @param {unknown} data - `data` field of `GET /activity/growth/heatmap`.
 * @param {string} today - Local calendar date `YYYY-MM-DD`.
 * @returns {{counted: boolean|null, score: number, hotDays: number}} Today's state.
 */
export function readHeatmap(data, today) {
  const root = data !== null && typeof data === 'object' ? data : {}
  const cells = Array.isArray(root.cells) ? root.cells : []
  let score = 0
  let hotDays = 0
  let found = false
  for (const cell of cells) {
    if (cell === null || typeof cell !== 'object' || typeof cell.date !== 'string') continue
    const value = Number.isFinite(cell.score) ? cell.score : 0
    if (value > 0) hotDays += 1
    if (cell.date === today) {
      found = true
      score = value
    }
  }
  return { counted: found ? score > 0 : null, score, hotDays }
}

/**
 * Request headers for the activity service.
 *
 * @param {Record<string, string>} headers - Credential headers (bearer + identity).
 * @param {string} base - Billing host the request goes to.
 * @returns {Record<string, string>} Headers with console-origin metadata.
 */
export function growthHeaders(headers, base) {
  return {
    ...headers,
    accept: 'application/json',
    'content-type': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
    'x-codebuddy-request': '1',
    origin: base,
    referer: `${base}/`,
  }
}

/**
 * Read the current streak plus today's check-in state.
 *
 * @param {object} options - Request options.
 * @param {Record<string, string>} options.headers - Credential headers.
 * @param {string} options.base - Billing host, e.g. `https://www.codebuddy.cn`.
 * @param {string} [options.domain] - Account domain, for the region guard.
 * @param {string} [options.today] - Calendar date for the heatmap lookup.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {number} [options.timeoutMs] - Per-request timeout.
 * @param {() => number} [options.now] - Clock.
 * @returns {Promise<object>} Growth state with `supported` and `today`.
 */
export async function fetchGrowth({
  headers,
  base,
  domain = '',
  today = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = GROWTH_TIMEOUT_MS,
  now = Date.now,
}) {
  if (!growthSupported(domain)) {
    return { supported: false, reason: 'REGION', fetchedAt: now() }
  }
  const send = async (path) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${base}${path}`, {
        method: 'GET',
        headers: growthHeaders(headers, base),
        signal: controller.signal,
      })
      const text = await response.text()
      if (!response.ok) {
        throw new GrowthError(`成长活动接口返回 HTTP ${response.status}`, 'FAILED')
      }
      let document
      try {
        document = JSON.parse(text)
      } catch {
        throw new GrowthError('成长活动接口返回的不是 JSON', 'BAD_RESPONSE')
      }
      if (document === null || typeof document !== 'object' || document.code !== 0) {
        const detail = document !== null && typeof document === 'object' && typeof document.msg === 'string' ? document.msg : ''
        throw new GrowthError(detail === '' ? '成长活动接口返回了错误' : detail, 'FAILED')
      }
      return document.data
    } finally {
      clearTimeout(timer)
    }
  }

  const data = await send(GROWTH_PATHS.streak)
  const state = readGrowth(data)

  let todayState = { counted: null, score: 0, hotDays: 0 }
  if (today !== '') {
    try {
      todayState = readHeatmap(await send(GROWTH_PATHS.heatmap), today)
    } catch {
      // The streak is the primary signal; a heatmap failure only hides today's dot.
      todayState = { counted: null, score: 0, hotDays: 0 }
    }
  }

  return { supported: true, reason: '', ...state, today: todayState, fetchedAt: now() }
}

/**
 * Claim one tier reward.
 *
 * @param {object} options - Claim options.
 * @param {Record<string, string>} options.headers - Credential headers.
 * @param {string} options.base - Billing host.
 * @param {string} options.domain - Account domain, for the region guard.
 * @param {string} options.tier - One of {@link GROWTH_TIERS}.
 * @param {string} options.clientToken - Idempotency token for this attempt.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {number} [options.timeoutMs] - Request timeout.
 * @param {() => number} [options.now] - Clock.
 * @returns {Promise<object>} `{tier, credit, energy, cards, chances, fetchedAt}`.
 */
export async function redeemGrowth({
  headers,
  base,
  domain = '',
  tier,
  clientToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = GROWTH_TIMEOUT_MS,
  now = Date.now,
}) {
  if (!growthSupported(domain)) {
    throw new GrowthError('该账号地区不支持成长活动。', 'UNSUPPORTED')
  }
  if (!GROWTH_TIERS.includes(tier)) {
    throw new GrowthError(`未知的成长档位：${String(tier)}`, 'UNSUPPORTED')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${base}${GROWTH_PATHS.redeem}`, {
      method: 'POST',
      headers: growthHeaders(headers, base),
      body: JSON.stringify({ tier, client_token: clientToken }),
      signal: controller.signal,
    })
    const text = await response.text()
    let document = null
    try {
      document = JSON.parse(text)
    } catch {
      document = null
    }
    const code = document !== null && typeof document === 'object' && Number.isFinite(document.code) ? document.code : 0
    const message =
      document !== null && typeof document === 'object' && typeof document.msg === 'string' ? document.msg : ''
    if (!response.ok || code !== 0) {
      if (response.status === 403 || code === 403) {
        throw new GrowthError(message === '' ? '连续登录天数不足。' : message, 'NOT_ENOUGH_DAYS')
      }
      throw new GrowthError(message === '' ? `兑换失败（HTTP ${response.status}）` : message, 'FAILED')
    }
    const receipt = document !== null && typeof document === 'object' && document.data !== null && typeof document.data === 'object' ? document.data : {}
    return {
      tier,
      credit: Number.isFinite(receipt.credit) ? receipt.credit : 0,
      energy: Number.isFinite(receipt.energy) ? receipt.energy : 0,
      cards: Number.isFinite(receipt.cards) ? receipt.cards : 0,
      chances: Number.isFinite(receipt.chances) ? receipt.chances : 0,
      fetchedAt: now(),
    }
  } finally {
    clearTimeout(timer)
  }
}
