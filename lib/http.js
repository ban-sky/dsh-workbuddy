/**
 * Host route behind the Settings → Plugins → WorkBuddy page.
 *
 * Actions:
 * - `status` — non-secret credential state for the page.
 * - `clear`  — remove the browser-login token.
 * - `test`   — one-token chat completion against the gateway.
 * - `loginStart` / `loginPoll` / `loginCancel` — browser sign-in; the only
 *              way a token enters the plugin.
 * - `models` — the current roster with reasoning levels, credit multipliers,
 *              and promotion windows (no secrets).
 * - `refreshModels` — re-read the live app-channel catalog.
 * - `usage` — token and credit counters recorded from completed completions,
 *              plus the credit-to-token conversion for the statistics card.
 * - `resetUsage` — clear the counters for one account.
 *
 * The token itself is never returned by any action, never logged, and never
 * echoed in an error message.
 *
 * @module @ban-sky/dsh-workbuddy/http
 */

import { CredentialError, WorkBuddyCredentials } from './credentials.js'
import { fetchCredits } from './credits.js'
import { defaultUsagePath, UsageLedger } from './usage.js'

/** Route path registered on the Host connection. */
export const ROUTE_PATH = '/api/workbuddy'

/** Largest settings request accepted (a token plus a few account ids). */
const MAX_BODY_BYTES = 256 * 1024

/** Gateway probe timeout. */
const TEST_TIMEOUT_MS = 10_000

/** Cheap catalog model used for the one-token connection probe. */
const TEST_MODEL = 'deepseek-v4-flash'

/**
 * Build a JSON response with the plugin's response headers.
 *
 * @param {unknown} value - Response payload.
 * @param {number} [status] - HTTP status.
 * @returns {Response} Response.
 */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

/**
 * Success envelope.
 *
 * @param {unknown} value - Payload.
 * @returns {Response} Response.
 */
function ok(value) {
  return json({ ok: true, value })
}

/**
 * Failure envelope.
 *
 * @param {number} status - HTTP status.
 * @param {string} code - Stable error code.
 * @param {string} message - Human-facing message.
 * @returns {Response} Response.
 */
function fail(status, code, message) {
  return json({ ok: false, error: { code, message } }, status)
}

/**
 * Read and parse a JSON request body.
 *
 * @param {Request} request - Incoming request.
 * @returns {Promise<Record<string, unknown>>} Parsed body.
 * @throws {Error & { code?: string, status?: number }} When the body is unusable.
 */
async function readJson(request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('请求必须使用 application/json。'), { code: 'INVALID_CONTENT_TYPE', status: 415 })
  }
  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > MAX_BODY_BYTES) {
    throw Object.assign(new Error('请求体过大。'), { code: 'BODY_TOO_LARGE', status: 413 })
  }
  let parsed
  try {
    parsed = JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON。'), { code: 'INVALID_JSON', status: 400 })
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('请求体必须是 JSON 对象。'), { code: 'INVALID_JSON', status: 400 })
  }
  return /** @type {Record<string, unknown>} */ (parsed)
}

/**
 * Non-secret credential state shared by every action.
 *
 * @param {{ credentials: import('./credentials.js').WorkBuddyCredentials, tokenStore: import('./token-store.js').TokenStore, modelCount: number }} deps - Dependencies.
 * @returns {Record<string, unknown>} Status payload.
 */
function statusPayload({ credentials, tokenStore, modelCount }) {
  const status = credentials.status()
  return {
    signedIn: status.signedIn,
    activeAccountId: credentials.activeAccountId?.() ?? '',
    source: status.source,
    uid: status.uid,
    nickname: status.nickname,
    enterpriseName: status.enterpriseName,
    domain: status.domain,
    expiresAt: status.expiresAt,
    refreshable: status.refreshable,
    baseURL: status.baseURL,
    saved: tokenStore.present(),
    modelCount,
    storagePath: tokenStore.path,
  }
}

/**
 * Probe the gateway with the saved credential by sending the smallest possible
 * chat completion. The gateway publishes `/v3/config` without authentication,
 * so it cannot tell a valid token from an invalid one; a one-token completion
 * is the only reliable check. It costs a negligible amount of quota and runs
 * only on an explicit user action.
 *
 * @param {import('./credentials.js').WorkBuddyCredentials} credentials - Credentials.
 * @param {typeof fetch} [fetchImpl] - Fetch implementation (tests).
 * @returns {Promise<{ connected: boolean, authFailed: boolean, httpStatus: number | null, message: string }>} Probe result.
 */
export async function probeGateway(credentials, fetchImpl = globalThis.fetch) {
  let headers
  try {
    headers = await credentials.headers()
  } catch (error) {
    if (error instanceof CredentialError) {
      return { connected: false, authFailed: false, httpStatus: null, message: error.message, code: error.kind }
    }
    return {
      connected: false,
      authFailed: false,
      httpStatus: null,
      message: error instanceof Error ? error.message : String(error),
    }
  }
  const url = `${credentials.baseURL()}/v2/chat/completions`
  const body = JSON.stringify({
    model: TEST_MODEL,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: true,
  })
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      connected: false,
      authFailed: false,
      httpStatus: null,
      message: `无法连接 ${url}：${message}`,
    }
  }
  if (response.ok) {
    await response.body?.cancel()
    return { connected: true, authFailed: false, httpStatus: response.status, message: '连接正常，令牌有效。' }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      connected: false,
      authFailed: true,
      httpStatus: response.status,
      message: `登录已失效（HTTP ${response.status}），请重新生成登录链接。`,
    }
  }
  const text = await response.text().catch(() => '')
  let detail = ''
  try {
    const payload = JSON.parse(text)
    detail =
      payload?.displayMsg?.zh ??
      payload?.displayMsg?.en ??
      payload?.msg ??
      payload?.error?.message ??
      ''
  } catch {
    detail = text.slice(0, 200)
  }
  const suffix = typeof detail === 'string' && detail !== '' ? `：${detail}` : '。'
  return {
    connected: false,
    authFailed: false,
    httpStatus: response.status,
    message: `网关可达，但测试请求返回 HTTP ${response.status}${suffix}`,
  }
}

/**
 * Create the route handler.
 *
 * @param {object} deps - Handler dependencies.
 * @param {import('./credentials.js').WorkBuddyCredentials} deps.credentials - Live credentials.
 * @param {import('./token-store.js').TokenStore} deps.tokenStore - Saved-token store.
 * @param {import('./oauth.js').WorkBuddyOAuth} deps.oauth - Web login sessions.
 * @param {() => object} deps.catalog - Current catalog state.
 * @param {() => Promise<object>} deps.refreshCatalog - Live catalog refresh.
 * @param {typeof fetch} [deps.fetchImpl] - Fetch implementation for billing.
 * @param {(message: string) => void} [deps.onWarning] - Diagnostic sink.
 * @returns {(request: Request) => Promise<Response>} Fetch-style handler.
 */
export function createWorkBuddyHandler({
  credentials,
  tokenStore,
  oauth,
  catalog,
  refreshCatalog,
  usage,
  probeUsage,
  fetchImpl = globalThis.fetch,
  onWarning = () => {},
}) {
  const statusOf = () => statusPayload({ credentials, tokenStore, modelCount: catalog().models.length })

  // One ledger serves usage/resetUsage/usageProbe. When the Host module that
  // records completions was not reloaded with this route, fall back to the
  // on-disk ledger so the panel still reports what was already recorded.
  let fallbackUsage
  const ledger = () => {
    if (usage !== undefined) return usage
    if (fallbackUsage === undefined) fallbackUsage = new UsageLedger({ path: defaultUsagePath(), onWarning })
    return fallbackUsage
  }

  /**
   * Build headers for one saved account without switching the active one.
   *
   * Credit reads may target a specific account, and handing that account's
   * token to the active-credential object would leak its identity into the
   * next chat request, so the headers are built from a throwaway credential.
   *
   * @param {string} id - Account id.
   * @returns {Promise<Record<string, string>>} Headers for that account.
   */
  async function headersFor(id) {
    const record = tokenStore.get(id)
    if (record === undefined) throw new Error('没有找到这个账号。')
    const scoped = new WorkBuddyCredentials({
      savedStore: {
        read: () => record,
        save: () => {},
        present: () => true,
        list: () => [record],
        get: () => record,
        activeId: () => record.id,
      },
      deviceSalt: credentials.deviceSalt,
      baseURL: credentials.baseURL(),
      region: 'auto',
      fetch: fetchImpl,
    })
    return scoped.headers()
  }

  return async function handle(request) {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', '仅支持 POST。')
    let body
    try {
      body = await readJson(request)
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 400
      const code = typeof error?.code === 'string' ? error.code : 'INVALID_REQUEST'
      return fail(status, code, error instanceof Error ? error.message : String(error))
    }
    const action = typeof body.action === 'string' ? body.action : ''
    switch (action) {
      case 'status':
        return ok(statusOf())
      case 'models':
        return ok(modelsPayload(catalog()))
      case 'refreshModels': {
        try {
          const state = await refreshCatalog()
          return ok(modelsPayload(state))
        } catch (error) {
          return fail(502, 'CATALOG_REFRESH_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'clear': {
        // Sign out of the ACTIVE account only; the others stay usable.
        try {
          const activeId = credentials.activeAccountId?.() ?? ''
          if (activeId !== '' && tokenStore.remove(activeId)) {
            // Removed one account.
          } else {
            tokenStore.clear()
          }
        } catch (error) {
          return fail(500, 'CLEAR_FAILED', error instanceof Error ? error.message : String(error))
        }
        credentials.reload()
        onWarning('workbuddy: browser-login token cleared from the settings page')
        return ok(statusOf())
      }
      case 'accounts':
        return ok(accountsPayload(tokenStore, credentials.activeAccountId?.() ?? ''))
      case 'switchAccount': {
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        if (id === '') return fail(400, 'MISSING_ACCOUNT_ID', '缺少账号 id。')
        const changed = credentials.switchAccount?.(id) === true
        if (!changed) return fail(404, 'UNKNOWN_ACCOUNT', '没有找到这个账号。')
        void refreshCatalog()
        return ok({ ...accountsPayload(tokenStore, credentials.activeAccountId?.() ?? ''), state: statusOf() })
      }
      case 'removeAccount': {
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        if (id === '') return fail(400, 'MISSING_ACCOUNT_ID', '缺少账号 id。')
        let removed = false
        try {
          removed = tokenStore.remove(id)
        } catch (error) {
          return fail(500, 'REMOVE_FAILED', error instanceof Error ? error.message : String(error))
        }
        if (!removed) return fail(404, 'UNKNOWN_ACCOUNT', '没有找到这个账号。')
        credentials.reload()
        void refreshCatalog()
        return ok({ ...accountsPayload(tokenStore, credentials.activeAccountId?.() ?? ''), state: statusOf() })
      }
      case 'renameAccount': {
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        const label = typeof body.label === 'string' ? body.label.trim() : ''
        if (id === '') return fail(400, 'MISSING_ACCOUNT_ID', '缺少账号 id。')
        let updated = false
        try {
          updated = tokenStore.updateAccount(id, { label }) !== undefined
        } catch (error) {
          return fail(500, 'RENAME_FAILED', error instanceof Error ? error.message : String(error))
        }
        if (!updated) return fail(404, 'UNKNOWN_ACCOUNT', '没有找到这个账号。')
        return ok(accountsPayload(tokenStore, credentials.activeAccountId?.() ?? ''))
      }
      case 'credits': {
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        try {
          const headers = id !== '' && id !== credentials.activeAccountId?.() ? await headersFor(id) : await credentials.headers()
          const record = id !== '' ? tokenStore.get(id) : undefined
          const active = credentials.status()
          const balance = await fetchCredits({
            headers,
            domain: record?.domain || active.domain,
            enterpriseId: record?.enterpriseId || '',
            fetchImpl,
          })
          return ok(creditsPayload(balance))
        } catch (error) {
          return fail(502, 'CREDITS_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'usage': {
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        try {
          const active = credentials.activeAccountId?.() ?? ''
          return ok(usagePayload(ledger().view(id !== '' ? id : active)))
        } catch (error) {
          return fail(500, 'USAGE_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'resetUsage': {
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        try {
          // The card shows one account at a time, so reset that account only.
          const active = credentials.activeAccountId?.() ?? ''
          const target = id !== '' ? id : active
          ledger().reset(target)
          return ok(usagePayload(ledger().view(target)))
        } catch (error) {
          return fail(500, 'USAGE_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'usageProbe': {
        // Sends one 1-token completion through the local shim so the counters can
        // be proven end-to-end. The gateway bills 0 credits for a single token.
        if (probeUsage === undefined) {
          return fail(501, 'USAGE_PROBE_UNAVAILABLE', '当前版本不支持自检请求，请重启 DSH 后再试。')
        }
        try {
          await probeUsage()
          const active = credentials.activeAccountId?.() ?? ''
          return ok(usagePayload(ledger().view(active)))
        } catch (error) {
          return fail(502, 'USAGE_PROBE_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'test': {
        try {
          return ok(await probeGateway(credentials, globalThis.fetch))
        } catch (error) {
          return fail(500, 'TEST_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'loginStart': {
        try {
          const region = body.region === 'global' ? 'global' : 'cn'
          return ok(
            await oauth.start({
              region,
              baseURL: typeof body.baseURL === 'string' ? body.baseURL : '',
            }),
          )
        } catch (error) {
          return fail(502, 'LOGIN_START_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      case 'loginPoll': {
        const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : ''
        if (loginId === '') return fail(400, 'MISSING_LOGIN_ID', '缺少登录会话 id。')
        let result
        try {
          result = await oauth.poll(loginId)
        } catch (error) {
          return fail(502, 'LOGIN_POLL_FAILED', error instanceof Error ? error.message : String(error))
        }
        if (result.status !== 'done' || result.credential === undefined) return ok(result)
        const credential = result.credential
        try {
          // A new sign-in becomes its own account, keyed by uid, so signing
          // into a second account never overwrites the first one.
          tokenStore.saveAccount({
            id: credential.uid || undefined,
            label: credential.nickname || credential.uid,
            token: credential.accessToken,
            refreshToken: credential.refreshToken,
            expiresAt: credential.expiresAt,
            domain: credential.domain,
            uid: credential.uid,
            enterpriseId: credential.enterpriseId,
            tenantId: credential.tenantId,
            nickname: credential.nickname,
            enterpriseName: credential.enterpriseName,
          })
        } catch (error) {
          return fail(400, 'LOGIN_SAVE_FAILED', error instanceof Error ? error.message : String(error))
        }
        credentials.reload()
        onWarning('workbuddy: signed in through the web login')
        void refreshCatalog()
        return ok({
          status: 'done',
          account: {
            uid: credential.uid,
            nickname: credential.nickname,
            enterpriseName: credential.enterpriseName,
            domain: credential.domain,
            expiresAt: credential.expiresAt,
          },
          state: statusOf(),
        })
      }
      case 'loginCancel': {
        const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : ''
        if (loginId !== '') oauth.cancel(loginId)
        return ok({ cancelled: loginId !== '' })
      }
      default:
        return fail(400, 'UNKNOWN_ACTION', `未知操作：${action === '' ? '(空)' : action}`)
    }
  }
}


/**
 * Serialize the catalog for the settings table.
 *
 * Only display metadata: no credential, account, or gateway headers.
 *
 * @param {{ source: string, fetchedAt: number, models: ReadonlyArray<object> }} state - Catalog state.
 * @returns {object} Public payload.
 */
/**
 * Serialize the saved accounts for the settings list.
 *
 * Account ids, nicknames, and expiry are display metadata; tokens and refresh
 * tokens never leave the store.
 *
 * @param {import('./token-store.js').TokenStore} tokenStore - Token store.
 * @param {string} activeId - Currently active account id.
 * @returns {{ activeId: string, accounts: Array<object> }} Accounts payload.
 */
export function accountsPayload(tokenStore, activeId) {
  return {
    activeId,
    accounts: tokenStore.list().map((account) => ({
      id: account.id,
      label: account.label,
      uid: account.uid,
      nickname: account.nickname,
      enterpriseName: account.enterpriseName,
      domain: account.domain,
      expiresAt: account.expiresAt,
      refreshable: account.refreshToken !== '',
      savedAt: account.savedAt,
      active: account.id === activeId,
    })),
  }
}

/**
 * Serialize a credit balance for the settings card.
 *
 * @param {Awaited<ReturnType<typeof fetchCredits>>} balance - Balance.
 * @returns {object} Public payload.
 */
export function creditsPayload(balance) {
  return {
    source: balance.source,
    total: balance.total,
    expiringSoon: balance.expiringSoon,
    nearestExpiryMs: balance.nearestExpiryMs,
    resetAt: balance.resetAt,
    fetchedAt: balance.fetchedAt,
    packages: balance.packages.map((entry) => ({
      name: entry.name,
      remain: entry.remain,
      size: entry.size,
      monthly: entry.monthly === true,
      refreshAt: entry.refreshAt,
      expiresAt: entry.expiresAt,
    })),
  }
}

/**
 * Serialize token/credit counters for the statistics card.
 *
 * Only counts are exposed: no prompt text, no account identifiers beyond the
 * store's own ids, and no credential material.
 *
 * @param {{ updatedAt: number, totals: Record<string, number>, accounts: ReadonlyArray<Record<string, any>> }} view - Ledger view.
 * @returns {object} Public payload.
 */
export function usagePayload(view) {
  const account = (entry) => ({
    id: entry.id,
    requests: entry.requests,
    promptTokens: entry.promptTokens,
    completionTokens: entry.completionTokens,
    totalTokens: entry.totalTokens,
    cachedTokens: entry.cachedTokens,
    uncachedTokens: entry.uncachedTokens,
    reasoningTokens: entry.reasoningTokens,
    credits: entry.credits,
    cacheHitRate: entry.cacheHitRate,
    tokensPerCredit: entry.tokensPerCredit,
    creditsPerKToken: entry.creditsPerKToken,
    firstAt: entry.firstAt,
    lastAt: entry.lastAt,
    models: Array.isArray(entry.models)
      ? entry.models.map((model) => ({
          id: model.id,
          requests: model.requests,
          promptTokens: model.promptTokens,
          completionTokens: model.completionTokens,
          totalTokens: model.totalTokens,
          cachedTokens: model.cachedTokens,
          uncachedTokens: model.uncachedTokens,
          reasoningTokens: model.reasoningTokens,
          credits: model.credits,
          cacheHitRate: model.cacheHitRate,
          tokensPerCredit: model.tokensPerCredit,
          creditsPerKToken: model.creditsPerKToken,
        }))
      : [],
  })
  const totals = view.totals ?? {}
  return {
    updatedAt: view.updatedAt,
    totals: account({ id: '', ...totals, models: [] }),
    accounts: (view.accounts ?? []).map(account),
  }
}

export function modelsPayload(state) {
  return {
    source: state.source,
    fetchedAt: state.fetchedAt,
    models: state.models.map((model) => ({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      supportsImages: model.supportsImages === true,
      efforts: Array.isArray(model.efforts) ? model.efforts : [],
      defaultEffort: model.reasoningDefault,
      canDisableThinking: model.canDisableThinking === true,
      credits: model.credits,
      creditsText: model.creditsText,
      descriptionZh: model.descriptionZh,
      descriptionEn: model.descriptionEn,
      promotion: model.promotion,
      tier: model.tier,
    })),
  }
}
