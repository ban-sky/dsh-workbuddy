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
 *
 * The token itself is never returned by any action, never logged, and never
 * echoed in an error message.
 *
 * @module @ban-sky/dsh-workbuddy/http
 */

import { CredentialError } from './credentials.js'

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
 * @param {(message: string) => void} [deps.onWarning] - Diagnostic sink.
 * @returns {(request: Request) => Promise<Response>} Fetch-style handler.
 */
export function createWorkBuddyHandler({
  credentials,
  tokenStore,
  oauth,
  catalog,
  refreshCatalog,
  onWarning = () => {},
}) {
  const statusOf = () => statusPayload({ credentials, tokenStore, modelCount: catalog().models.length })

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
        try {
          tokenStore.clear()
        } catch (error) {
          return fail(500, 'CLEAR_FAILED', error instanceof Error ? error.message : String(error))
        }
        credentials.reload()
        onWarning('workbuddy: browser-login token cleared from the settings page')
        return ok(statusOf())
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
          tokenStore.save({
            token: credential.accessToken,
            refreshToken: credential.refreshToken,
            expiresAt: credential.expiresAt,
            domain: credential.domain,
            uid: credential.uid,
            enterpriseId: credential.enterpriseId,
            tenantId: credential.tenantId,
            nickname: credential.nickname,
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
