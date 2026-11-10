/**
 * WorkBuddy credit balance.
 *
 * Two tables exist and picking the wrong one is worse than failing:
 *
 * 1. the personal table `POST {billing}/v2/billing/meter/get-user-resource`
 *    returns one row per resource package (monthly cycles and one-off gifts),
 * 2. enterprise members get HTTP 200 and an EMPTY package list there — a
 *    legally-shaped "you have no credits" that is simply false — so they read
 *    `POST {billing}/billing/meter/get-enterprise-user-usage` (no `/v2` prefix)
 *    instead, where `limitNum - credit` is what remains.
 *
 * Which table to read is decided by `enterpriseId` alone. An unreadable
 * enterprise response is reported as an error, never as a zero balance.
 *
 * @module @ban-sky/dsh-workbuddy/credits
 */

import { regionOf } from './credentials.js'

/** Billing console for the China region. */
export const CN_BILLING_BASE = 'https://www.codebuddy.cn'

/** Billing console for the international region. */
export const GLOBAL_BILLING_BASE = 'https://www.workbuddy.ai'

/** Product code the desktop client asks for. */
const PRODUCT_CODE = 'p_tcaca'

/** Timeout for a billing request. */
const BILLING_TIMEOUT_MS = 15_000

/** Header user-agent the billing console expects from the desktop app. */
const BILLING_USER_AGENT = 'WorkBuddy/5.8.3'

/**
 * Pick the billing console for a region.
 *
 * @param {'cn' | 'global'} region - Region.
 * @returns {string} Console origin.
 */
export function billingBase(region) {
  return region === 'global' ? GLOBAL_BILLING_BASE : CN_BILLING_BASE
}

/**
 * Resolve the billing console from an account domain.
 *
 * @param {string} domain - Account domain, e.g. `www.codebuddy.cn`.
 * @returns {string} Console origin.
 */
export function billingBaseOf(domain) {
  return billingBase(regionOf(domain ?? ''))
}

/**
 * Headers the billing console requires on top of the account identity.
 *
 * @param {Record<string, string>} identity - Headers from the credential.
 * @param {string} base - Console origin.
 * @returns {Record<string, string>} Request headers.
 */
export function billingHeaders(identity, base) {
  return {
    ...identity,
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': BILLING_USER_AGENT,
    'x-requested-with': 'XMLHttpRequest',
    'x-codebuddy-request': '1',
    origin: base,
    referer: `${base}/`,
  }
}

/**
 * Coerce a numeric field that may be a number or a numeric string.
 *
 * @param {unknown} value - Raw field.
 * @returns {number} Finite number, or 0.
 */
function num(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return 0
}

/**
 * Parse a `YYYY-MM-DD HH:mm:ss` wall-clock string as local time.
 *
 * @param {unknown} value - Raw field.
 * @returns {number} Epoch milliseconds, or 0 when unparsable.
 */
export function parseTimestamp(value) {
  if (typeof value === 'number' && value > 0) return value > 1e12 ? Math.round(value) : Math.round(value * 1000)
  if (typeof value !== 'string' || value.trim() === '') return 0
  const parsed = Date.parse(value.trim().replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Read one package row from the personal table.
 *
 * Monthly resources (`CapacityType === 4`) reset on the cycle end, so they are
 * shown with `refreshAt`; gifts carry an `ExpiresTime` and are dropped once
 * exhausted.
 *
 * @param {Record<string, unknown>} account - Raw row.
 * @param {number} now - Current epoch milliseconds.
 * @returns {{ name: string, remain: number, size: number, monthly: boolean, refreshAt: number, expiresAt: number } | undefined} Package, or undefined when unusable.
 */
export function readPackage(account, now) {
  const monthly = num(account.CapacityType) === 4
  const remain = monthly
    ? num(account.CycleCapacityRemain) || num(account.CapacityRemain)
    : num(account.CapacityRemain)
  const size = monthly ? num(account.CycleCapacitySize) || num(account.CapacitySize) : num(account.CapacitySize)
  const cycleEnd = parseTimestamp(account.CycleEndTime)
  const expiresAt = monthly ? 0 : parseTimestamp(account.ExpiredTime) || cycleEnd
  if (!monthly && (remain <= 0 || (expiresAt > 0 && expiresAt <= now))) return undefined
  return {
    name: typeof account.PackageName === 'string' && account.PackageName !== '' ? account.PackageName : '(未命名)',
    remain: Math.max(0, remain),
    size: Math.max(0, size),
    monthly,
    refreshAt: monthly && cycleEnd > 0 ? cycleEnd + 1000 : 0,
    expiresAt,
  }
}

/**
 * Summarize a list of packages.
 *
 * @param {Array<NonNullable<ReturnType<typeof readPackage>>>} packages - Packages.
 * @param {number} now - Current epoch milliseconds.
 * @returns {{ total: number, packages: Array<object>, expiringSoon: number, nearestExpiryMs: number }} Summary.
 */
export function summarizePackages(packages, now) {
  const soonMs = 3 * 24 * 60 * 60 * 1000
  let total = 0
  let expiringSoon = 0
  let nearestExpiryMs = 0
  for (const entry of packages) {
    total += entry.remain
    if (entry.expiresAt > 0) {
      if (nearestExpiryMs === 0 || entry.expiresAt < nearestExpiryMs) nearestExpiryMs = entry.expiresAt
      if (entry.expiresAt - now <= soonMs) expiringSoon += entry.remain
    }
  }
  return { total, packages, expiringSoon, nearestExpiryMs }
}

/**
 * Unwrap the nested billing envelope: `data.Response.Data`.
 *
 * @param {unknown} payload - Parsed JSON.
 * @returns {{ accounts: Array<Record<string, unknown>>, error: string }} Rows and an error message.
 */
export function readPersonalRows(payload) {
  const root = payload !== null && typeof payload === 'object' ? /** @type {Record<string, any>} */ (payload) : {}
  if (root.code !== 0) return { accounts: [], error: root.displayMsg?.zh ?? root.msg ?? `code ${String(root.code)}` }
  const data = root.data?.Response?.Data
  const accounts = Array.isArray(data?.Accounts) ? data.Accounts : []
  return { accounts, error: '' }
}

/**
 * Fetch the credit balance for one account.
 *
 * @param {object} options - Request inputs.
 * @param {Record<string, string>} options.headers - Credential headers.
 * @param {string} options.domain - Account domain (selects the console).
 * @param {string} [options.enterpriseId] - Enterprise id, when the account has one.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {number} [options.now] - Current epoch milliseconds.
 * @param {number} [options.timeoutMs] - Request timeout.
 * @returns {Promise<{ source: 'personal' | 'enterprise', total: number, packages: Array<object>, expiringSoon: number, nearestExpiryMs: number, resetAt: number, fetchedAt: number }>} Balance.
 * @throws {Error & { code?: string }} When the console answers unusably.
 */
export async function fetchCredits({
  headers,
  domain,
  enterpriseId = '',
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  timeoutMs = BILLING_TIMEOUT_MS,
}) {
  const base = billingBaseOf(domain)
  const identity = billingHeaders(headers, base)

  if (enterpriseId !== '') {
    const url = `${base}/billing/meter/get-enterprise-user-usage`
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: identity,
      body: JSON.stringify({ ProductCode: PRODUCT_CODE }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw Object.assign(new Error(`点数接口返回了非 JSON 响应（HTTP ${response.status}）`), { code: 'CREDITS_BAD_RESPONSE' })
    }
    const data = payload?.data ?? payload
    const limit = num(data?.limitNum)
    const used = num(data?.credit)
    if (!response.ok || limit <= 0) {
      throw Object.assign(new Error('企业账号的点数响应里没有可读余额。'), { code: 'CREDITS_UNREADABLE' })
    }
    const remain = Math.max(0, limit - used)
    return {
      source: 'enterprise',
      total: remain,
      packages: [
        {
          name: '企业额度',
          remain,
          size: limit,
          monthly: true,
          refreshAt: parseTimestamp(data?.cycleResetTime),
          expiresAt: 0,
        },
      ],
      expiringSoon: 0,
      nearestExpiryMs: 0,
      resetAt: parseTimestamp(data?.cycleResetTime),
      fetchedAt: now,
    }
  }

  const url = `${base}/v2/billing/meter/get-user-resource`
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: identity,
      body: JSON.stringify({ PageNumber: 1, PageSize: 100, ProductCode: PRODUCT_CODE, Status: [0, 3] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw Object.assign(new Error(`读取点数失败：${error instanceof Error ? error.message : String(error)}`), {
      code: 'CREDITS_NETWORK',
      cause: error,
    })
  }
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw Object.assign(new Error(`点数接口返回了非 JSON 响应（HTTP ${response.status}）`), { code: 'CREDITS_BAD_RESPONSE' })
  }
  const { accounts, error } = readPersonalRows(payload)
  if (!response.ok || error !== '') {
    throw Object.assign(new Error(`读取点数失败：${error || `HTTP ${response.status}`}`), { code: 'CREDITS_UPSTREAM' })
  }
  const packages = accounts.map((account) => readPackage(account, now)).filter((entry) => entry !== undefined)
  return { source: 'personal', ...summarizePackages(packages, now), resetAt: 0, fetchedAt: now }
}
