/**
 * Fake WorkBuddy gateway for tests.
 *
 * Implements the two endpoints the plugin talks to:
 * - `POST /v2/chat/completions` — OpenAI-compatible SSE or JSON, with the
 *   WorkBuddy extensions the real gateway adds (account headers, `displayMsg`).
 * - `POST /v2/plugin/auth/token/refresh` — rotates `old-token` to a fresh one.
 *
 * Every request is recorded so tests can assert the headers the plugin sent.
 *
 * @module test/support/fake-workbuddy
 */

import { createServer } from 'node:http'

/**
 * Build one SSE data frame.
 *
 * @param {unknown} payload - JSON payload.
 * @returns {string} Encoded frame.
 */
export function frame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

/**
 * Start the fake gateway.
 *
 * @param {object} [options] - Behavior options.
 * @param {string} [options.reply] - Assistant text to stream.
 * @param {(request: { headers: import('node:http').IncomingHttpHeaders, body: any }) => ({ status: number, body: unknown } | undefined)} [options.chatOverride] - Custom chat response.
 * @param {boolean} [options.toolCall] - Emit one `tool_calls` delta instead of text.
 * @param {string} [options.validToken] - Bearer value accepted for chat; others get 401.
 * @param {string} [options.refreshedToken] - Token the refresh endpoint returns.
 * @returns {Promise<{ url: string, requests: any[], refreshes: any[], close: () => Promise<void> }>} Running server.
 */
export async function startFakeWorkBuddy(options = {}) {
  const requests = []
  const refreshes = []
  const validToken = options.validToken
  const refreshedToken = options.refreshedToken ?? 'refreshed-token'

  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const body = raw === '' ? undefined : safeJson(raw)
      const pathname = (request.url ?? '/').split('?')[0]

      if (pathname === '/v2/plugin/auth/token/refresh') {
        refreshes.push({ headers: request.headers, body })
        const payload = {
          code: 0,
          data: {
            accessToken: refreshedToken,
            refreshToken: 'rotated-refresh',
            expiresIn: 3600,
            domain: 'www.codebuddy.cn',
          },
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(payload))
        return
      }

      if (pathname !== '/v2/chat/completions') {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ code: 404, msg: 'not found' }))
        return
      }

      requests.push({ headers: request.headers, body })
      if (options.chatOverride !== undefined) {
        const override = options.chatOverride({ headers: request.headers, body })
        if (override !== undefined) {
          response.writeHead(override.status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(override.body))
          return
        }
      }
      if (validToken !== undefined && request.headers.authorization !== `Bearer ${validToken}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ code: 12153, msg: 'Offline user session not found' }))
        return
      }

      const stream = body?.stream === true
      if (!stream) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            id: 'chatcmpl-fake',
            object: 'chat.completion',
            created: 0,
            model: body?.model ?? 'fake',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: options.reply ?? 'Hello from WorkBuddy' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 },
          }),
        )
        return
      }

      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      })
      const id = 'chatcmpl-fake'
      response.write(
        frame({
          id,
          object: 'chat.completion.chunk',
          created: 0,
          model: body?.model ?? 'fake',
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        }),
      )
      if (options.toolCall === true) {
        response.write(
          frame({
            id,
            object: 'chat.completion.chunk',
            created: 0,
            model: body?.model ?? 'fake',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'get_weather', arguments: '{"city":"Shenzhen"}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }),
        )
        response.write(
          frame({
            id,
            object: 'chat.completion.chunk',
            created: 0,
            model: body?.model ?? 'fake',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          }),
        )
      } else {
        for (const piece of options.reply ?? 'Hello from WorkBuddy') {
          response.write(
            frame({
              id,
              object: 'chat.completion.chunk',
              created: 0,
              model: body?.model ?? 'fake',
              choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
            }),
          )
        }
        response.write(
          frame({
            id,
            object: 'chat.completion.chunk',
            created: 0,
            model: body?.model ?? 'fake',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 },
          }),
        )
      }
      response.end('data: [DONE]\n\n')
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(undefined)
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake upstream: no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    refreshes,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve(undefined))
      }),
  }
}

/**
 * Parse JSON without throwing.
 *
 * @param {string} raw - Text.
 * @returns {any} Parsed value or undefined.
 */
function safeJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
