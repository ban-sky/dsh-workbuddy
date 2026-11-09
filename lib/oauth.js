/**
 * WorkBuddy web / QR sign-in.
 *
 * The desktop app is not the only way to obtain a token: the WorkBuddy web
 * login can authorize a plugin session directly. This module starts that
 * session and polls it until the user finishes signing in, so the settings
 * page works on a headless server where the desktop app cannot run.
 *
 * Flow (verified against the public plugin client):
 * 1. `POST {base}/v2/plugin/auth/state?platform=workbuddy` → `{state, authUrl}`
 * 2. the user opens `authUrl` and signs in / scans the QR code
 * 3. `GET {base}/v2/plugin/auth/token?state=...` → `{accessToken, refreshToken, ...}`
 *
 * State is kept in memory only; a login session expires after ten minutes.
 *
 * @module @ban-sky/dsh-workbuddy/oauth
 */

import { normalizeDomain, tokenClaims } from './jwt.js'

/** Billing / login hosts per region. */
export const OAUTH_BASES = {
  cn: 'https://www.codebuddy.cn',
  global: 'https://www.workbuddy.ai',
}

/** Login sessions are valid for ten minutes. */
const SESSION_TTL_MS = 10 * 60 * 1000

/** Timeout for one OAuth HTTP call. */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * Pick the login host for a region.
 *
 * @param {string} region - `cn` or `global`.
 * @param {string} [baseURL] - Explicit override.
 * @returns {string} Origin without a trailing slash.
 */
export function oauthBaseURL(region, baseURL) {
  const explicit = (baseURL ?? '').trim()
  if (explicit !== '') return explicit.replace(/\/+$/, '')
  return region === 'global' ? OAUTH_BASES.global : OAUTH_BASES.cn
}

/**
 * Coerce a token response expiry to epoch milliseconds.
 *
 * @param {unknown} value - Milliseconds, seconds, or ISO string.
 * @returns {number} Epoch milliseconds, or 0.
 */
function expiryMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value > 1e12 ? value : value * 1000)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return 0
}

/**
 * Parse a JSON response without throwing on an empty body.
 *
 * @param {Response} response - Fetch response.
 * @returns {Promise<Record<string, any> | undefined>} Parsed body.
 */
async function readPayload(response) {
  try {
    const parsed = await response.json()
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a token response means success.
 *
 * @param {Record<string, any> | undefined} payload - Parsed body.
 * @returns {boolean} True when the body carries an access token.
 */
function isTokenPayload(payload) {
  const code = payload?.code
  const data = payload?.data
  return (
    (code === 0 || code === 200) &&
    data !== null &&
    typeof data === 'object' &&
    typeof data.accessToken === 'string' &&
    data.accessToken !== ''
  )
}

/**
 * In-memory OAuth session registry.
 */
export class WorkBuddyOAuth {
  /**
   * @param {object} [options] - Options.
   * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
   * @param {() => number} [options.now] - Clock (tests).
   * @param {number} [options.ttlMs] - Session lifetime.
   */
  constructor(options = {}) {
    this.fetch = options.fetchImpl ?? globalThis.fetch
    this.now = options.now ?? Date.now
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS
    /** @type {Map<string, { base: string, region: string, expiresAt: number }>} */
    this.sessions = new Map()
  }

  /**
   * Forget sessions past their deadline.
   *
   * @returns {void}
   */
  prune() {
    const now = this.now()
    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) this.sessions.delete(id)
    }
  }

  /**
   * Start a login session.
   *
   * @param {object} [options] - Start options.
   * @param {'cn' | 'global'} [options.region] - Account region.
   * @param {string} [options.baseURL] - Explicit login host.
   * @returns {Promise<{ loginId: string, verificationUri: string, expiresAt: number, region: string }>} Session.
   * @throws {Error} When the host rejects the request.
   */
  async start(options = {}) {
    this.prune()
    const region = options.region === 'global' ? 'global' : 'cn'
    const base = oauthBaseURL(region, options.baseURL)
    let response
    try {
      response = await this.fetch(`${base}/v2/plugin/auth/state?platform=workbuddy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new Error(`无法连接 WorkBuddy 登录服务：${error instanceof Error ? error.message : String(error)}`)
    }
    const payload = await readPayload(response)
    const data = payload?.data
    if (!response.ok || (payload?.code !== 0 && payload?.code !== 200) || typeof data?.state !== 'string') {
      const message =
        payload?.displayMsg?.zh ?? payload?.displayMsg?.en ?? payload?.msg ?? `HTTP ${response.status}`
      throw new Error(`无法发起 WorkBuddy 登录：${message}`)
    }
    const loginId = data.state
    const expiresAt = this.now() + (typeof data.expiresIn === 'number' && data.expiresIn > 0 ? data.expiresIn * 1000 : this.ttlMs)
    this.sessions.set(loginId, { base, region, expiresAt })
    return {
      loginId,
      verificationUri:
        typeof data.authUrl === 'string' && data.authUrl !== ''
          ? data.authUrl
          : `${base}/login?platform=workbuddy&state=${encodeURIComponent(loginId)}`,
      expiresAt,
      region,
    }
  }

  /**
   * Poll one login session.
   *
   * @param {string} loginId - State returned by {@link start}.
   * @returns {Promise<{ status: 'pending' | 'done' | 'expired' | 'error', message?: string, credential?: Record<string, any> }>} Poll result.
   */
  async poll(loginId) {
    const session = this.sessions.get(loginId)
    if (session === undefined) return { status: 'expired', message: '登录会话不存在或已过期，请重新生成链接。' }
    if (this.now() > session.expiresAt) {
      this.sessions.delete(loginId)
      return { status: 'expired', message: '登录超时，请重新生成链接。' }
    }
    let response
    try {
      response = await this.fetch(`${session.base}/v2/plugin/auth/token?state=${encodeURIComponent(loginId)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      return { status: 'pending', message: error instanceof Error ? error.message : String(error) }
    }
    const payload = await readPayload(response)
    if (isTokenPayload(payload)) {
      this.sessions.delete(loginId)
      const data = /** @type {Record<string, any>} */ (payload?.data)
      const accessToken = data.accessToken
      const claims = tokenClaims(accessToken)
      const domain =
        normalizeDomain(data.domain) ||
        claims.domain ||
        (session.region === 'global' ? 'www.workbuddy.ai' : 'www.codebuddy.cn')
      const account = await this.loadAccount(session.base, accessToken)
      return {
        status: 'done',
        credential: {
          accessToken,
          refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : '',
          expiresAt:
            expiryMs(data.expiresAt) ||
            (typeof data.expiresIn === 'number' && data.expiresIn > 0
              ? this.now() + data.expiresIn * 1000
              : claims.expiresAt),
          domain,
          uid: account.uid || claims.uid,
          enterpriseId: account.enterpriseId || claims.enterpriseId,
          tenantId: account.tenantId || claims.tenantId || account.enterpriseId || claims.enterpriseId,
          nickname: account.nickname || claims.nickname,
          enterpriseName: account.enterpriseName,
        },
      }
    }
    if (response.status === 404 || response.status === 410) {
      this.sessions.delete(loginId)
      return { status: 'expired', message: '登录会话已失效，请重新生成链接。' }
    }
    return { status: 'pending', message: typeof payload?.msg === 'string' ? payload.msg : '' }
  }

  /**
   * Fetch the account profile after a successful login. Failures are not fatal:
   * the token's own claims already carry the ids used in request headers.
   *
   * @param {string} base - Login host.
   * @param {string} accessToken - Fresh access token.
   * @returns {Promise<{ uid: string, enterpriseId: string, tenantId: string, nickname: string, enterpriseName: string }>} Profile fields.
   */
  async loadAccount(base, accessToken) {
    const empty = { uid: '', enterpriseId: '', tenantId: '', nickname: '', enterpriseName: '' }
    try {
      const response = await this.fetch(`${base}/v2/plugin/login/account`, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) return empty
      const payload = await readPayload(response)
      const raw = payload?.data
      const data = raw !== null && typeof raw === 'object' && raw.account !== null && typeof raw.account === 'object' ? raw.account : raw
      if (data === null || typeof data !== 'object') return empty
      const text = (...keys) => {
        for (const key of keys) {
          const value = data[key]
          if (typeof value === 'string' && value.trim() !== '') return value.trim()
          if (typeof value === 'number' && Number.isFinite(value)) return String(value)
        }
        return ''
      }
      return {
        uid: text('uid', 'userId', 'user_id', 'sub'),
        enterpriseId: text('enterpriseId', 'enterprise_id', 'entId'),
        tenantId: text('tenantId', 'tenant_id', 'tenant'),
        nickname: text('nickname', 'name', 'userName', 'user_name'),
        enterpriseName: text('enterpriseName', 'enterprise_name', 'entName'),
      }
    } catch {
      return empty
    }
  }

  /**
   * Forget a login session.
   *
   * @param {string} loginId - Session id.
   * @returns {boolean} True when a session existed.
   */
  cancel(loginId) {
    return this.sessions.delete(loginId)
  }
}
