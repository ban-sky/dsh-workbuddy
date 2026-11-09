/**
 * Loopback OpenAI-compatible shim in front of the WorkBuddy chat gateway.
 *
 * The DSH pi-ai adapter speaks the OpenAI chat-completions protocol. The
 * WorkBuddy gateway (`POST /v2/chat/completions`) also speaks that protocol,
 * but it authenticates with the desktop app's bearer token plus account
 * headers, and that token rotates. Pointing pi-ai straight at the gateway would
 * bake a stale token and account identity into every model descriptor.
 *
 * This shim closes that gap: it listens on 127.0.0.1 with an ephemeral port,
 * accepts only a random per-boot token, and forwards each request to the
 * gateway with freshly resolved WorkBuddy credentials. It also serves
 * `/v1/models` for discovery and `/health` for diagnostics.
 *
 * @module @ban-sky/dsh-workbuddy/shim
 */

import { createServer } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'

/** Largest request body accepted from the local client. */
const MAX_BODY_BYTES = 64 * 1024 * 1024

/** Largest upstream error body retained for diagnostics. */
const MAX_ERROR_BODY_BYTES = 8 * 1024

/**
 * Constant-time string comparison.
 *
 * @param {string} left - First value.
 * @param {string} right - Second value.
 * @returns {boolean} True when equal.
 */
function safeEqual(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Read a request body with a hard byte cap.
 *
 * @param {import('node:http').IncomingMessage} request - Incoming request.
 * @returns {Promise<Buffer>} Body bytes.
 * @throws {Error} When the body exceeds the cap.
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

/**
 * Send one OpenAI-style error document.
 *
 * @param {import('node:http').ServerResponse} response - Response.
 * @param {number} status - HTTP status.
 * @param {string} message - Human-facing message.
 * @param {string} [type] - OpenAI error type.
 * @param {string} [code] - Stable machine code.
 */
function sendError(response, status, message, type = 'invalid_request_error', code) {
  if (response.headersSent) {
    response.end()
    return
  }
  const body = JSON.stringify({ error: { message, type, ...(code === undefined ? {} : { code }) } })
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/**
 * Turn a WorkBuddy error body into an OpenAI-compatible one.
 *
 * @param {number} status - Upstream HTTP status.
 * @param {string} text - Upstream response text.
 * @returns {{ message: string, type: string, code: string }} Error fields.
 */
export function classifyUpstreamError(status, text) {
  let message = text.trim()
  let upstreamCode
  try {
    const parsed = JSON.parse(text)
    upstreamCode = parsed?.code
    message =
      parsed?.displayMsg?.zh ??
      parsed?.displayMsg?.en ??
      parsed?.msg ??
      parsed?.error?.message ??
      message
  } catch {
    // Keep the raw text; it is already truncated.
  }
  if (message === '') message = `WorkBuddy 上游返回 HTTP ${status}`
  if (status === 401 || status === 403) {
    return { message, type: 'authentication_error', code: 'UNAUTHENTICATED' }
  }
  if (status === 402) {
    return { message, type: 'insufficient_quota', code: 'QUOTA' }
  }
  if (status === 429) {
    return { message, type: 'rate_limit_error', code: 'RATE_LIMIT' }
  }
  if (status === 404) {
    return { message, type: 'not_found_error', code: String(upstreamCode ?? 'NOT_FOUND') }
  }
  return { message, type: 'upstream_error', code: String(upstreamCode ?? 'UPSTREAM') }
}

/**
 * Stable machine code for one credential failure kind.
 *
 * @param {string} kind - Credential error kind.
 * @returns {string} OpenAI error code.
 */
function credentialCode(kind) {
  if (kind === 'missing') return 'MISSING_CREDENTIAL'
  if (kind === 'encrypted') return 'ENCRYPTED_CREDENTIAL'
  return 'CREDENTIAL_EXPIRED'
}

/**
 * Read at most `limit` bytes from a fetch response body.
 *
 * @param {Response} response - Fetch response.
 * @param {number} [limit] - Byte cap.
 * @returns {Promise<string>} Decoded excerpt.
 */
async function readExcerpt(response, limit = MAX_ERROR_BODY_BYTES) {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    size += value.byteLength
  }
  await reader.cancel().catch(() => {})
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Create and start the loopback shim.
 *
 * @param {object} options - Shim options.
 * @param {import('./credentials.js').WorkBuddyCredentials} options.credentials - Credential source.
 * @param {() => ReadonlyArray<{ id: string, name: string }>} options.models - Model list for `/v1/models`.
 * @param {string} [options.providerId] - Provider route id for diagnostics.
 * @param {number} [options.port] - Requested port (0 picks an ephemeral one).
 * @param {{ info?: Function, warn?: Function, error?: Function }} [options.logger] - Logger.
 * @returns {Promise<{ url: string, token: string, port: number, health: () => object, close: () => Promise<void> }>} Running shim handle.
 */
export async function startShim(options) {
  const { credentials, models } = options
  const providerId = options.providerId ?? 'workbuddy'
  const logger = options.logger ?? {}
  const token = randomBytes(24).toString('base64url')
  const endpoint = '/v2/chat/completions'

  /**
   * Forward one chat request to WorkBuddy.
   *
   * @param {Buffer} body - Client request body.
   * @param {AbortSignal} signal - Cancellation signal for this client.
   * @returns {Promise<{ response: Response }>} Upstream response.
   */
  const forward = async (body, signal) => {
    const headers = await credentials.headers()
    const url = `${credentials.baseURL()}${endpoint}`
    let response = await fetch(url, { method: 'POST', headers, body, signal })
    if (response.status === 401) {
      // The desktop token rotated under us: refresh once and repeat. A manual
      // token has no refresh token, and the original 401 is reported.
      const status = credentials.status()
      if (status.refreshable) {
        logger.warn?.('workbuddy: upstream rejected the token; refreshing once')
        const refreshed = await credentials.headers({ forceRefresh: true })
        response = await fetch(url, { method: 'POST', headers: refreshed, body, signal })
      }
    }
    return { response }
  }

  const server = createServer(async (request, response) => {
    const url = request.url ?? '/'
    const pathname = url.split('?')[0]

    if (request.method === 'GET' && (pathname === '/health' || pathname === '/v1/health')) {
      const body = JSON.stringify({
        ok: true,
        provider: providerId,
        models: models().length,
        upstream: credentials.baseURL(),
        ...credentials.status(),
      })
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(body)
      return
    }

    const authorization = request.headers.authorization ?? ''
    const presented = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!safeEqual(presented, token)) {
      sendError(response, 401, 'invalid local shim token', 'authentication_error', 'INVALID_API_KEY')
      return
    }

    if (request.method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) {
      const body = JSON.stringify({
        object: 'list',
        data: models().map((model) => ({
          id: model.id,
          object: 'model',
          created: 0,
          owned_by: providerId,
          name: model.name,
        })),
      })
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(body)
      return
    }

    if (request.method === 'POST' && (pathname === '/v1/chat/completions' || pathname === '/chat/completions')) {
      const controller = new AbortController()
      response.on('close', () => {
        if (!response.writableEnded) controller.abort()
      })
      let body
      try {
        body = await readBody(request)
      } catch (error) {
        sendError(response, 413, error instanceof Error ? error.message : 'request body too large')
        return
      }
      if (body.length === 0) {
        sendError(response, 400, 'empty request body')
        return
      }
      let parsed
      try {
        parsed = JSON.parse(body.toString('utf8'))
      } catch {
        sendError(response, 400, 'request body is not valid JSON')
        return
      }
      if (typeof parsed.model !== 'string' || parsed.model === '') {
        sendError(response, 400, "request body has no 'model'")
        return
      }

      try {
        const { response: upstream } = await forward(body, controller.signal)
        if (!upstream.ok) {
          const text = await readExcerpt(upstream)
          const { message, type, code } = classifyUpstreamError(upstream.status, text)
          logger.warn?.(`workbuddy: upstream ${upstream.status} for ${parsed.model}: ${message}`)
          sendError(response, upstream.status, message, type, code)
          return
        }
        const contentType = upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8'
        response.writeHead(200, {
          'content-type': contentType,
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        if (upstream.body === null) {
          response.end()
          return
        }
        const reader = upstream.body.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            response.write(Buffer.from(value))
          }
        } finally {
          await reader.cancel().catch(() => {})
          if (!response.writableEnded) response.end()
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        logger.warn?.(`workbuddy: shim request failed: ${message}`)
        const kind = /** @type {{ kind?: string }} */ (error)?.kind
        if (kind === 'missing' || kind === 'encrypted' || kind === 'expired' || kind === 'refresh-failed') {
          sendError(response, 401, message, 'authentication_error', credentialCode(kind))
          return
        }
        sendError(response, 502, message, 'upstream_error', 'UPSTREAM_UNAVAILABLE')
      }
      return
    }

    sendError(response, 404, `unknown route ${request.method ?? ''} ${pathname}`, 'not_found_error', 'NOT_FOUND')
  })

  const port = options.port ?? 0
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(undefined)
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('workbuddy shim: no TCP address')
  const actualPort = address.port

  return {
    url: `http://127.0.0.1:${actualPort}/v1`,
    token,
    port: actualPort,
    health: () => ({ ok: true, provider: providerId, ...credentials.status() }),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve(undefined))
      }),
  }
}
