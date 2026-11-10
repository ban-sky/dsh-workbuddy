/**
 * WorkBuddy credentials for the loopback shim.
 *
 * There is exactly one credential source: the token saved by the plugin's
 * browser sign-in. It lives in a 0600 JSON file under the DSH home directory
 * (`$DSH_HOME/.workbuddy-credentials.json`), never in the plugin config, an
 * environment variable, a log line, or an HTTP response.
 *
 * This module loads that record, merges account ids from the access token's
 * JWT claims, refreshes an expiring token against the same endpoint the
 * desktop client uses, and builds the headers the gateway expects.
 *
 * @module @ban-sky/dsh-workbuddy/credentials
 */

import { withDeviceIdentity } from './accounts.js'
import { normalizeDomain, tokenClaims } from './jwt.js'

/** CN chat gateway (the CodeBuddy / WorkBuddy backend). */
export const CN_BASE_URL = 'https://copilot.tencent.com'

/** International chat gateway. */
export const GLOBAL_BASE_URL = 'https://www.workbuddy.ai'

/** Domain used when neither the token nor the login response carries one. */
export const DEFAULT_DOMAIN = 'www.codebuddy.cn'

/** Header identity; the upstream accepts a plain client string. */
export const CLIENT_USER_AGENT = 'dsh-workbuddy/0.2.0 (CodeBuddy compatible)'

/** Read the access token no earlier than this many ms before expiry. */
const REFRESH_GRACE_MS = 60_000

/**
 * Credential failure with a human-facing reason and a stable kind.
 */
export class CredentialError extends Error {
  /**
   * @param {string} message - Human-facing explanation.
   * @param {string} kind - `missing` | `refresh-failed` | `expired`.
   * @param {ErrorOptions} [options] - Standard error options.
   */
  constructor(message, kind, options) {
    super(message, options)
    this.name = 'CredentialError'
    this.kind = kind
  }
}

/**
 * Normalize an expiry timestamp to milliseconds.
 *
 * @param {unknown} value - Raw `expiresAt` / `expiresIn` field.
 * @returns {number} Epoch milliseconds, or 0 when absent.
 */
export function expiryToMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
}

/**
 * Decide the WorkBuddy region for a domain.
 *
 * @param {string} domain - Account domain.
 * @returns {'cn' | 'global'} Region.
 */
export function regionOf(domain) {
  const lowered = domain.trim().toLowerCase()
  if (lowered === 'workbuddy.ai' || lowered.endsWith('.workbuddy.ai')) return 'global'
  return 'cn'
}

/**
 * Resolve the chat gateway from an explicit override, region, and domain.
 *
 * @param {object} options - Resolution inputs.
 * @param {string} [options.baseURL] - Explicit gateway from plugin config.
 * @param {string} [options.region] - `auto`, `cn`, or `global`.
 * @param {string} [options.domain] - Credential domain.
 * @returns {string} Gateway origin without a trailing slash.
 */
export function resolveBaseURL({ baseURL, region, domain }) {
  const explicit = baseURL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const effective = region === 'cn' || region === 'global' ? region : regionOf(domain ?? '')
  return effective === 'global' ? GLOBAL_BASE_URL : CN_BASE_URL
}

/**
 * Live credential backed by the plugin's browser-login token store.
 */
export class WorkBuddyCredentials {
  /**
   * @param {object} [options] - Credential options.
   * @param {import('./token-store.js').TokenStore} [options.savedStore] - Browser-login token store.
   * @param {string} [options.baseURL] - Explicit gateway origin.
   * @param {'auto' | 'cn' | 'global'} [options.region] - Region override.
   * @param {((message: string) => void)} [options.onWarning] - Diagnostic sink.
   * @param {typeof fetch} [options.fetch] - Fetch implementation.
   * @param {string} [options.deviceSalt] - Installation salt for derived device ids.
   */
  constructor(options = {}) {
    this.savedStore = options.savedStore
    this.explicitBaseURL = options.baseURL?.trim() ?? ''
    this.region = options.region ?? 'auto'
    this.onWarning = options.onWarning ?? (() => {})
    this.fetch = options.fetch ?? globalThis.fetch
    this.deviceSalt = options.deviceSalt ?? ''

    /** @type {Record<string, any> | undefined} */
    this.credential = undefined
    /** @type {Promise<void> | undefined} */
    this.refreshing = undefined
  }

  /**
   * Re-read the saved token on the next `load()`.
   *
   * @returns {void}
   */
  reload() {
    this.credential = undefined
  }

  /**
   * Load the saved credential, merging JWT claims where the store has no ids.
   *
   * @returns {Record<string, any> | undefined} Normalized credential.
   */
  load() {
    if (this.credential !== undefined) return this.credential
    const saved = this.savedStore?.read()
    if (saved === undefined) return undefined
    const claims = tokenClaims(saved.token)
    const enterpriseId = saved.enterpriseId || claims.enterpriseId
    this.credential = {
      id: saved.id,
      accessToken: saved.token,
      refreshToken: saved.refreshToken,
      expiresAt: saved.expiresAt || claims.expiresAt,
      domain: normalizeDomain(saved.domain) || claims.domain || DEFAULT_DOMAIN,
      uid: saved.uid || claims.uid,
      enterpriseId,
      tenantId: saved.tenantId || claims.tenantId || enterpriseId,
      nickname: saved.nickname || claims.nickname,
      enterpriseName: '',
    }
    return this.credential
  }

  /**
   * Whether a browser-login token is available.
   *
   * @returns {boolean} True when requests can be signed.
   */
  signedIn() {
    return this.load() !== undefined
  }

  /**
   * Current gateway origin for this credential.
   *
   * @returns {string} Origin without a trailing slash.
   */
  baseURL() {
    const credential = this.load()
    return resolveBaseURL({
      baseURL: this.explicitBaseURL,
      region: this.region,
      domain: credential?.domain ?? '',
    })
  }

  /**
   * Whether the current token is at or past its refresh point.
   *
   * @returns {boolean} True when refresh is due.
   */
  refreshDue() {
    const credential = this.load()
    if (credential === undefined) return false
    if (credential.refreshToken === '') return false
    if (credential.expiresAt === 0) return false
    return Date.now() >= credential.expiresAt - REFRESH_GRACE_MS
  }

  /**
   * Build the upstream request headers for one credential.
   *
   * @param {Record<string, any>} credential - Credential.
   * @returns {Record<string, string>} Headers.
   */
  buildHeaders(credential) {
    return withDeviceIdentity(
      {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${credential.accessToken}`,
        'user-agent': CLIENT_USER_AGENT,
        'x-user-id': credential.uid,
        'x-enterprise-id': credential.enterpriseId,
        'x-tenant-id': credential.tenantId || credential.enterpriseId,
        'x-domain': credential.domain || DEFAULT_DOMAIN,
      },
      { uid: credential.uid, salt: this.deviceSalt },
    )
  }

  /**
   * Which account the current credential belongs to.
   *
   * @returns {string} Account id, or '' when signed out.
   */
  activeAccountId() {
    return this.load()?.id ?? ''
  }

  /**
   * Switch the active account and re-read it on the next `load()`.
   *
   * @param {string} id - Account id that exists in the store.
   * @returns {boolean} True when the account exists and is now active.
   */
  switchAccount(id) {
    const changed = this.savedStore?.setActive(id) === true
    if (changed) this.reload()
    return changed
  }

  /**
   * Request headers for the current credential, refreshing first when due.
   *
   * @param {object} [options] - Header options.
   * @param {boolean} [options.forceRefresh] - Refresh regardless of expiry.
   * @returns {Promise<Record<string, string>>} Headers including `authorization`.
   * @throws {CredentialError} When no credential is available.
   */
  async headers(options = {}) {
    let credential = this.load()
    if (credential === undefined) {
      throw new CredentialError(
        '尚未登录 WorkBuddy。请在 设置 → 模型 · WorkBuddy 中点击「生成登录链接」完成网页登录。',
        'missing',
      )
    }
    if (options.forceRefresh === true || this.refreshDue()) {
      credential = await this.refresh()
    }
    return this.buildHeaders(credential)
  }

  /**
   * Refresh the access token against the WorkBuddy refresh endpoint.
   *
   * Concurrent callers share one in-flight request.
   *
   * @param {AbortSignal} [signal] - Cancellation signal.
   * @returns {Promise<Record<string, any>>} Refreshed credential.
   * @throws {CredentialError} When no credential or refresh token exists, or the refresh fails.
   */
  async refresh(signal) {
    if (this.refreshing !== undefined) {
      await this.refreshing
      const current = this.load()
      if (current === undefined) throw new CredentialError('WorkBuddy 凭据刷新失败', 'refresh-failed')
      return current
    }
    const credential = this.load()
    if (credential === undefined) {
      throw new CredentialError('尚未登录 WorkBuddy，请先在设置页完成网页登录。', 'missing')
    }
    if (credential.refreshToken === '') {
      throw new CredentialError('WorkBuddy 令牌已过期且没有 refreshToken，请重新生成登录链接。', 'expired')
    }
    this.refreshing = this.performRefresh(credential, signal)
    try {
      await this.refreshing
    } finally {
      this.refreshing = undefined
    }
    const refreshed = this.load()
    if (refreshed === undefined) throw new CredentialError('WorkBuddy 凭据刷新失败', 'refresh-failed')
    return refreshed
  }

  /**
   * Perform one refresh request, persist the rotated token, and cache it.
   *
   * @param {Record<string, any>} credential - Expiring credential.
   * @param {AbortSignal} [signal] - Cancellation signal.
   * @returns {Promise<void>} Resolves after the token is replaced.
   */
  async performRefresh(credential, signal) {
    const url = `${this.baseURL()}/v2/plugin/auth/token/refresh`
    const headers = {
      ...this.buildHeaders(credential),
      'x-refresh-token': credential.refreshToken,
      'x-auth-refresh-source': 'plugin',
    }
    let response
    try {
      response = await this.fetch(url, { method: 'POST', headers, body: '{}', signal })
    } catch (error) {
      throw new CredentialError(
        `刷新 WorkBuddy 令牌失败：${error instanceof Error ? error.message : String(error)}`,
        'refresh-failed',
        { cause: error },
      )
    }
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new CredentialError(
        `刷新 WorkBuddy 令牌返回了非 JSON 响应（HTTP ${response.status}）`,
        'refresh-failed',
      )
    }
    if (!response.ok || payload?.code !== 0 || typeof payload?.data !== 'object' || payload.data === null) {
      const message =
        payload?.displayMsg?.zh ??
        payload?.displayMsg?.en ??
        payload?.msg ??
        `HTTP ${response.status}`
      throw new CredentialError(`刷新 WorkBuddy 令牌失败：${message}`, 'refresh-failed')
    }
    const data = /** @type {Record<string, any>} */ (payload.data)
    const next = {
      accessToken: typeof data.accessToken === 'string' ? data.accessToken : '',
      refreshToken:
        typeof data.refreshToken === 'string' && data.refreshToken !== ''
          ? data.refreshToken
          : credential.refreshToken,
      expiresAt: expiryToMs(data.expiresAt) || (typeof data.expiresIn === 'number' ? Date.now() + data.expiresIn * 1000 : 0),
      domain: normalizeDomain(typeof data.domain === 'string' ? data.domain : '') || credential.domain,
      uid: credential.uid,
      enterpriseId: credential.enterpriseId,
      tenantId: credential.tenantId,
      nickname: credential.nickname,
      enterpriseName: credential.enterpriseName,
    }
    if (next.accessToken === '') {
      throw new CredentialError('刷新 WorkBuddy 令牌的响应里没有 accessToken', 'refresh-failed')
    }
    this.credential = next
    try {
      this.savedStore?.save({
        token: next.accessToken,
        refreshToken: next.refreshToken,
        expiresAt: next.expiresAt,
        domain: next.domain,
        uid: next.uid,
        enterpriseId: next.enterpriseId,
        tenantId: next.tenantId,
        nickname: next.nickname,
      })
    } catch (error) {
      this.onWarning(
        `刷新后的 WorkBuddy 令牌未能写入插件令牌文件：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Non-secret status for `/health` and the settings page.
   *
   * @returns {{ signedIn: boolean, source: string, uid: string, nickname: string, enterpriseName: string, domain: string, expiresAt: number, refreshable: boolean, baseURL: string }} Status.
   */
  status() {
    const credential = this.load()
    return {
      signedIn: credential !== undefined,
      source: credential === undefined ? 'none' : 'saved',
      uid: credential?.uid ?? '',
      nickname: credential?.nickname ?? '',
      enterpriseName: credential?.enterpriseName ?? '',
      domain: credential?.domain ?? '',
      expiresAt: credential?.expiresAt ?? 0,
      refreshable: (credential?.refreshToken ?? '') !== '',
      baseURL: this.baseURL(),
    }
  }
}
