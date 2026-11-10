/**
 * End-to-end tests at the DSH LLM seam: PiAiAdapter -> loopback shim -> fake
 * WorkBuddy gateway.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { WORKBUDDY_MODELS } from '../lib/catalog.js'
import { emptyCredentials, savedCredentials } from './support/credentials.js'
import { createWorkBuddyAdapter } from '../lib/adapter.js'
import { startShim } from '../lib/shim.js'
import { startFakeWorkBuddy } from './support/fake-workbuddy.js'

/**
 * Wire an adapter to a fresh fake gateway and shim.
 *
 * @param {object} [options] - Fake gateway behavior.
 * @returns {Promise<{ adapter: import('@deepseek-ai/dsh-llm-pi-ai').PiAiAdapter, close: () => Promise<void> }>} Harness.
 */
async function harness(options = {}) {
  const upstream = await startFakeWorkBuddy(options)
  const credentials = savedCredentials(upstream.url)
  const shim = await startShim({
    credentials,
    models: () => WORKBUDDY_MODELS,
    providerId: 'workbuddy',
  })
  const { adapter, updateCatalog } = createWorkBuddyAdapter({
    providerId: 'workbuddy',
    catalog: WORKBUDDY_MODELS,
    baseUrl: shim.url,
    shimToken: shim.token,
  })
  return {
    adapter,
    updateCatalog,
    upstream,
    close: async () => {
      await shim.close()
      await upstream.close()
    },
  }
}

/**
 * Collect every chunk of one streamed request.
 *
 * @param {AsyncIterable<any>} stream - Adapter stream.
 * @returns {Promise<any[]>} Chunks.
 */
async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

test('lists the catalog with modalities and reasoning levels', async () => {
  const context = await harness()
  try {
    const models = await context.adapter.listModels('workbuddy')
    assert.equal(models.length, WORKBUDDY_MODELS.length)
    const glm = models.find((model) => model.id === 'glm-5.3')
    assert.deepEqual(glm.inputModalities, ['text', 'image'])
    const glm52 = models.find((model) => model.id === 'glm-5.2')
    assert.deepEqual(glm52.inputModalities, ['text'])

    const resolved = await context.adapter.resolveModel('workbuddy', 'glm-5.3')
    assert.equal(resolved.context.contextWindow, 1_000_000)
    assert.deepEqual(
      resolved.reasoning.efforts.map((effort) => effort.id),
      ['low', 'high', 'max'],
    )
  } finally {
    await context.close()
  }
})

test('updateCatalog changes the roster served to DSH without re-registering', async () => {
  const context = await harness()
  try {
    assert.equal((await context.adapter.listModels('workbuddy')).length, WORKBUDDY_MODELS.length)
    context.updateCatalog([{ ...WORKBUDDY_MODELS[0], id: 'refreshed-model', name: 'Refreshed' }])
    const models = await context.adapter.listModels('workbuddy')
    assert.equal(models.length, 1)
    assert.equal(models[0].id, 'refreshed-model')
  } finally {
    await context.close()
  }
})

test('streams assistant text through the shim', async () => {
  const context = await harness({ reply: 'Hi there' })
  try {
    const chunks = await collect(
      context.adapter.stream({
        provider: 'workbuddy',
        model: 'glm-5.3',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
    )
    const text = chunks
      .filter((chunk) => chunk.type === 'text-delta')
      .map((chunk) => chunk.text)
      .join('')
    assert.equal(text, 'Hi there')
    const finish = chunks.at(-1)
    assert.equal(finish.type, 'finish')
    assert.equal(finish.reason.kind, 'stop')

    const sent = context.upstream.requests[0]
    assert.equal(sent.body.model, 'glm-5.3')
    assert.equal(sent.body.stream, true)
    assert.equal(sent.headers.authorization, 'Bearer upstream-token')
  } finally {
    await context.close()
  }
})

test('preserves native tool calls from the gateway', async () => {
  const context = await harness({ toolCall: true })
  try {
    const chunks = await collect(
      context.adapter.stream({
        provider: 'workbuddy',
        model: 'glm-5.3',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'weather?' }] }],
        tools: [
          {
            name: 'get_weather',
            description: 'Look up the weather for a city.',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
              required: ['city'],
            },
          },
        ],
      }),
    )
    const call = chunks.find((chunk) => chunk.type === 'tool-call-delta')
    assert.ok(call, 'a tool-call delta arrived')
    assert.equal(call.name, 'get_weather')
    const block = chunks.find((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
    assert.ok(block, 'the tool-call block was assembled')
    assert.equal(block.block.name, 'get_weather')
    assert.deepEqual(JSON.parse(block.block.arguments), { city: 'Shenzhen' })
    const finish = chunks.at(-1)
    assert.equal(finish.reason.kind, 'tool-calls')
    const sent = context.upstream.requests[0]
    assert.equal(sent.body.tools[0].function.name, 'get_weather')
  } finally {
    await context.close()
  }
})

test('fails with an auth failure when WorkBuddy has no credential', async () => {
  const upstream = await startFakeWorkBuddy()
  try {
    const credentials = emptyCredentials()
    const shim = await startShim({ credentials, models: () => WORKBUDDY_MODELS })
    const { adapter } = createWorkBuddyAdapter({
      providerId: 'workbuddy',
      catalog: WORKBUDDY_MODELS.slice(0, 1),
      baseUrl: shim.url,
      shimToken: shim.token,
    })
    const chunks = await collect(
      adapter.stream({
        provider: 'workbuddy',
        model: 'hy4-preview',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
    )
    const finish = chunks.at(-1)
    assert.equal(finish.type, 'finish')
    assert.equal(finish.reason.kind, 'error')
    assert.equal(finish.reason.kind, 'error')
    assert.match(finish.reason.failure.message, /尚未登录 WorkBuddy/)
    await shim.close()
  } finally {
    await upstream.close()
  }
})
