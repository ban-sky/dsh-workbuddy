/**
 * Host route behind the Settings → Plugins → WorkBuddy page.
 *
 * Actions:
 * - `status` — non-secret credential state for the page.
 * - `save`   — persist a manually entered access token, then report status.
 * - `clear`  — remove the saved token, falling back to the desktop auth file.
 * - `test`   — one authenticated `GET /v3/config` against the gateway.
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
    authFile: status.authFile,
    saved: tokenStore.present(),
    modelCount,
    storagePath: tokenStore.path,
  }
}

/**
 * Probe the gateway with the current credential by sending the smallest
 * possible chat completion. The gateway publishes `/v3/config` without
 * authentication, so it cannot tell a valid token from an invalid one; a
 * one-token completion is the only reliable check. It costs a negligible
 * amount of quota and runs only on an explicit user action.
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
  const url = `${credentials.baseURL().replace(/\/+$/, '')}/v2/chat/completions`
  const body = JSON.stringify({
    model: TEST_MODEL,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: false,
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
    return { connected: true, authFailed: false, httpStatus: response.status, message: '令牌有效，网关连通。' }
  }
  if (response.status === 401 || response.status === 403) {
    return {
      connected: false,
      authFailed: true,
      httpStatus: response.status,
      message: `令牌无效或已过期（HTTP ${response.status}）。请重新复制 accessToken。`,
    }
  }
  return {
    connected: false,
    authFailed: false,
    httpStatus: response.status,
    message: `网关可达，但测试请求返回 HTTP ${response.status}。`,
  }
}

/**
 * Create the route handler.
 *
 * @param {object} deps - Handler dependencies.
 * @param {import('./credentials.js').WorkBuddyCredentials} deps.credentials - Live credentials.
 * @param {import('./token-store.js').TokenStore} deps.tokenStore - Saved-token store.
 * @param {number} deps.modelCount - Registered model count.
 * @param {(message: string) => void} [deps.onWarning] - Diagnostic sink.
 * @returns {(request: Request) => Promise<Response>} Fetch-style handler.
 */
export function createWorkBuddyHandler({ credentials, tokenStore, modelCount, onWarning = () => {} }) {
  const statusOf = () => statusPayload({ credentials, tokenStore, modelCount })

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
      case 'save': {
        const token = typeof body.token === 'string' ? body.token.trim() : ''
        if (token === '') return fail(400, 'MISSING_TOKEN', '请填写 accessToken。')
        try {
          tokenStore.save({
            token,
            uid: typeof body.uid === 'string' ? body.uid : '',
            enterpriseId: typeof body.enterpriseId === 'string' ? body.enterpriseId : '',
            domain: typeof body.domain === 'string' ? body.domain : '',
          })
        } catch (error) {
          return fail(400, 'INVALID_TOKEN', error instanceof Error ? error.message : String(error))
        }
        credentials.reload()
        onWarning('workbuddy: token saved from the settings page')
        return ok(statusOf())
      }
      case 'clear': {
        try {
          tokenStore.clear()
        } catch (error) {
          return fail(500, 'CLEAR_FAILED', error instanceof Error ? error.message : String(error))
        }
        credentials.reload()
        onWarning('workbuddy: saved token cleared from the settings page')
        return ok(statusOf())
      }
      case 'test': {
        try {
          return ok(await probeGateway(credentials))
        } catch (error) {
          return fail(500, 'TEST_FAILED', error instanceof Error ? error.message : String(error))
        }
      }
      default:
        return fail(400, 'UNKNOWN_ACTION', `未知操作：${action === '' ? '(空)' : action}`)
    }
  }
}
