/**
 * Loopback shim tests against a fake WorkBuddy gateway.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyCredentials, savedCredentials } from './support/credentials.js'
import { WORKBUDDY_MODELS } from '../lib/catalog.js'
import { prepareChannelBody, startShim } from '../lib/shim.js'
import { startFakeWorkBuddy } from './support/fake-workbuddy.js'


/**
 * POST one chat request to the shim.
 *
 * @param {string} url - Shim base URL.
 * @param {string} token - Shim local token.
 * @param {object} body - Request body.
 * @returns {Promise<Response>} Response.
 */
function postChat(url, token, body) {
  return fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

test('rejects requests without the local shim token', async () => {
  const upstream = await startFakeWorkBuddy()
  const shim = await startShim({
    credentials: savedCredentials(upstream.url),
    models: () => [WORKBUDDY_MODELS[0]],
  })
  try {
    const response = await postChat(shim.url, 'wrong', { model: 'glm-5.2', messages: [] })
    assert.equal(response.status, 401)
    const body = await response.json()
    assert.equal(body.error.code, 'INVALID_API_KEY')
    assert.equal(upstream.requests.length, 0)
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('lists the catalog over /v1/models', async () => {
  const upstream = await startFakeWorkBuddy()
  const shim = await startShim({
    credentials: savedCredentials(upstream.url),
    models: () => WORKBUDDY_MODELS.slice(0, 3),
  })
  try {
    const response = await fetch(`${shim.url}/models`, {
      headers: { authorization: `Bearer ${shim.token}` },
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.object, 'list')
    assert.deepEqual(
      body.data.map((entry) => entry.id),
      WORKBUDDY_MODELS.slice(0, 3).map((entry) => entry.id),
    )
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('streams a chat completion and forwards the WorkBuddy account headers', async () => {
  const upstream = await startFakeWorkBuddy({ reply: 'OK' })
  const shim = await startShim({ credentials: savedCredentials(upstream.url), models: () => [] })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/)
    const text = await response.text()
    assert.match(text, /"content":"O"/)
    assert.match(text, /\[DONE\]/)

    assert.equal(upstream.requests.length, 1)
    const sent = upstream.requests[0]
    assert.equal(sent.headers.authorization, 'Bearer upstream-token')
    assert.equal(sent.headers['x-user-id'], 'user-1')
    assert.equal(sent.headers['x-enterprise-id'], 'ent-1')
    assert.equal(sent.headers['x-tenant-id'], 'ent-1')
    assert.equal(sent.headers['x-domain'], 'www.codebuddy.cn')
    assert.equal(sent.body.model, 'glm-5.2')
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('records the usage block of a streamed completion into the ledger', async () => {
  const upstream = await startFakeWorkBuddy({ reply: 'ok' })
  const calls = []
  const shim = await startShim({
    credentials: savedCredentials(upstream.url),
    models: () => [],
    usage: { record: (input) => calls.push(input) },
  })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 200)
    await response.text()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].model, 'glm-5.2')
    assert.equal(calls[0].accountId, 'default')
    assert.equal(calls[0].usage.prompt_tokens, 7)
    assert.equal(calls[0].usage.completion_tokens, 4)
    assert.equal(calls[0].usage.total_tokens, 11)
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('records the usage block of a non-streaming completion', async () => {
  const upstream = await startFakeWorkBuddy({ reply: 'ok' })
  const calls = []
  const shim = await startShim({
    credentials: savedCredentials(upstream.url),
    models: () => [],
    usage: { record: (input) => calls.push(input) },
  })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 200)
    await response.text()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].usage.total_tokens, 11)
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('a failing ledger never breaks the stream', async () => {
  const upstream = await startFakeWorkBuddy({ reply: 'still fine' })
  const shim = await startShim({
    credentials: savedCredentials(upstream.url),
    models: () => [],
    usage: {
      record: () => {
        throw new Error('disk full')
      },
    },
  })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.match(text, /\[DONE\]/)
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('maps a WorkBuddy quota error to an OpenAI-shaped error body', async () => {
  const upstream = await startFakeWorkBuddy({
    chatOverride: () => ({
      status: 402,
      body: { code: 4001, displayMsg: { zh: '积分不足，请充值后再试', en: 'insufficient credit' } },
    }),
  })
  const shim = await startShim({ credentials: savedCredentials(upstream.url), models: () => [] })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 402)
    const body = await response.json()
    assert.equal(body.error.message, '积分不足，请充值后再试')
    assert.equal(body.error.type, 'insufficient_quota')
    assert.equal(body.error.code, 'QUOTA')
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('refreshes once and retries when the gateway rejects the token', async () => {
  const upstream = await startFakeWorkBuddy({ validToken: 'fresh-token', refreshedToken: 'fresh-token' })
  const credentials = savedCredentials(upstream.url, {
    token: 'stale-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3_600_000,
    uid: 'user-1',
    enterpriseId: 'ent-1',
  })
  const shim = await startShim({ credentials, models: () => [] })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 200)
    await response.text()
    assert.equal(upstream.refreshes.length, 1)
    assert.equal(upstream.requests.length, 2)
    assert.equal(upstream.requests[0].headers.authorization, 'Bearer stale-token')
    assert.equal(upstream.requests[1].headers.authorization, 'Bearer fresh-token')
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('reports missing credentials as MISSING_CREDENTIAL', async () => {
  const upstream = await startFakeWorkBuddy()
  const credentials = emptyCredentials()
  const shim = await startShim({ credentials, models: () => [] })
  try {
    const response = await postChat(shim.url, shim.token, {
      model: 'glm-5.2',
      messages: [{ role: 'user', content: 'hi' }],
    })
    assert.equal(response.status, 401)
    const body = await response.json()
    assert.equal(body.error.code, 'MISSING_CREDENTIAL')
    assert.match(body.error.message, /尚未登录 WorkBuddy/)
  } finally {
    await shim.close()
    await upstream.close()
  }
})

test('serves health without leaking the token', async () => {
  const upstream = await startFakeWorkBuddy()
  const credentials = savedCredentials(upstream.url)
  const shim = await startShim({ credentials, models: () => WORKBUDDY_MODELS })
  try {
    const response = await fetch(`${shim.url}/health`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.equal(body.signedIn, true)
    assert.equal(body.source, 'saved')
    assert.equal(body.models, WORKBUDDY_MODELS.length)
    assert.equal(JSON.stringify(body).includes('upstream-token'), false)
  } finally {
    await shim.close()
    await upstream.close()
  }
})


test('rewrites channel-gate fingerprints and the developer role', () => {
  const raw = Buffer.from(
    JSON.stringify({
      model: 'glm-5.3',
      messages: [
        { role: 'developer', content: 'Create a concise title. You are an AI agent powered by DeepSeek Harness.' },
        { role: 'user', content: 'You are an AI agent powered by DeepSeek Harness' },
        { role: 'assistant', content: [{ type: 'text', text: 'You are interacting with the user through the DeepSeek Harness Web GUI' }] },
      ],
    }),
  )
  const body = JSON.parse(prepareChannelBody(raw).toString('utf8'))
  assert.equal(body.messages[0].role, 'system')
  assert.match(body.messages[0].content, /^You are a helpful assistant\./)
  assert.equal(body.messages[0].content.includes('powered by DeepSeek Harness'), false)
  assert.equal(body.messages[0].content.includes('running inside DeepSeek Harness'), true)
  // User messages are the caller's own words and stay byte-for-byte.
  assert.equal(body.messages[1].content, 'You are an AI agent powered by DeepSeek Harness')
  assert.equal(body.messages[2].content[0].text.includes('working with the user inside'), true)
})

test('forwards a non-chat body unchanged', () => {
  const raw = Buffer.from('{"input":"hello"}')
  assert.equal(prepareChannelBody(raw), raw)
})
