import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APP_CHANNEL_UA,
  CN_APP_CHANNEL_UA,
  appChannelUA,
  fetchRemoteCatalog,
  isChatModel,
  mapRemoteModel,
  parseCredits,
} from '../lib/catalog-source.js'
import { WORKBUDDY_MODELS } from '../lib/catalog.js'

const chatRow = {
  id: 'glm-5.3',
  name: 'GLM-5.3',
  credits: 'x0.29 credits',
  maxInputTokens: 200000,
  maxOutputTokens: 32000,
  supportsImages: true,
  supportsToolCall: true,
  reasoning: { supportedEfforts: ['low', 'high', 'max'], defaultEffort: 'high', canDisableThinking: true },
  tags: ['chat', 'reasoning'],
  descriptionZh: '通用模型',
  descriptionEn: 'General model',
}

const now = Date.parse('2026-11-10T00:00:00+08:00')

test('parseCredits reads both wire spellings', () => {
  assert.equal(parseCredits('x0.29 credits'), 0.29)
  assert.equal(parseCredits('0.50x'), 0.5)
  assert.equal(parseCredits('x2.20'), 2.2)
  assert.equal(parseCredits(0.08), 0.08)
  assert.equal(parseCredits('free'), undefined)
})

test('isChatModel filters media and empty models', () => {
  assert.equal(isChatModel(chatRow), true)
  assert.equal(isChatModel({ ...chatRow, tags: ['text-to-image'] }), false)
  assert.equal(isChatModel({ ...chatRow, id: 'kling-video-h3' }), false)
  assert.equal(isChatModel({ ...chatRow, supportsToolCall: false }), false)
  assert.equal(isChatModel({ ...chatRow, maxOutputTokens: 0 }), false)
})

test('mapRemoteModel carries reasoning levels, multiplier, promotion, and tier', () => {
  const promotions = [
    {
      id: 'hy3-free-trial',
      modelIds: ['glm-5.3'],
      badge: { label: '限时免费', color: '#FF0000' },
      schedule: { validUntil: '2026-11-16T00:00:00+08:00' },
    },
  ]
  const tiers = [{ badge: { label: '订阅优先', color: '#00AAFF' }, modelIds: ['glm-5.3'] }]
  const row = mapRemoteModel(chatRow, { promotions, tiers, nowMs: now })
  assert.deepEqual(row.efforts, ['off', 'low', 'high', 'max'])
  assert.equal(row.reasoningDefault, 'high')
  assert.equal(row.credits, 0.29)
  assert.equal(row.creditsText, '×0.29')
  assert.equal(row.promotion.label, '限时免费')
  assert.equal(row.promotion.status, 'active')
  assert.equal(row.promotion.endsAt, Date.parse('2026-11-16T00:00:00+08:00'))
  assert.equal(row.tier.label, '订阅优先')
  assert.equal(row.supportsImages, true)
})

test('fetchRemoteCatalog sends the app-channel UA and maps the roster', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(
      JSON.stringify({
        data: { models: [chatRow], modelPromotions: [], modelTiers: [] },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  const state = await fetchRemoteCatalog({
    baseURL: 'https://copilot.tencent.com',
    headers: { authorization: 'Bearer test-token' },
    fetchImpl,
    nowMs: now,
  })
  assert.equal(state.source, 'remote')
  assert.equal(state.models.length, 1)
  assert.equal(calls[0].url, 'https://copilot.tencent.com/v3/config')
  assert.equal(calls[0].init.headers['user-agent'], CN_APP_CHANNEL_UA)
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-token')
})

test('appChannelUA selects the CN composite and the global short identity', () => {
  assert.equal(appChannelUA('https://copilot.tencent.com'), CN_APP_CHANNEL_UA)
  assert.equal(appChannelUA('https://www.codebuddy.cn'), CN_APP_CHANNEL_UA)
  assert.equal(appChannelUA('https://www.workbuddy.ai'), APP_CHANNEL_UA)
})

test('fetchRemoteCatalog falls back to the static snapshot', async () => {
  const state = await fetchRemoteCatalog({
    baseURL: 'https://copilot.tencent.com',
    fetchImpl: async () => new Response('nope', { status: 500 }),
    nowMs: now,
  })
  assert.equal(state.source, 'fallback')
  assert.equal(state.models.length, WORKBUDDY_MODELS.length)
  assert.match(state.error, /HTTP 500/)
})
