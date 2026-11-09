/**
 * Plugin activation test: apply() wires credentials, shim, and the adapter.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'
import { WORKBUDDY_MODELS } from '../lib/catalog.js'
import { startFakeWorkBuddy } from './support/fake-workbuddy.js'

/**
 * Minimal Cordis context for one activation.
 *
 * @returns {{ ctx: any, state: { registered?: any, effects: Array<() => void>, warnings: string[] } }} Test context.
 */
function stubContext() {
  const state = { registered: undefined, effects: [], warnings: [] }
  const ctx = {
    logger: {
      info() {},
      warn(message) {
        state.warnings.push(message)
      },
      error() {},
    },
    get() {
      return undefined
    },
    effect(factory) {
      state.effects.push(factory())
      return undefined
    },
    llm: {
      registerAdapter(routes, adapter) {
        state.registered = { routes, adapter }
        return () => {}
      },
    },
  }
  return { ctx, state }
}

test('apply registers the workbuddy route with the full catalog', async () => {
  const upstream = await startFakeWorkBuddy({ reply: 'pong' })
  const { ctx, state } = stubContext()
  try {
    await apply(ctx, {
      token: 'upstream-token',
      uid: 'user-1',
      domain: 'www.codebuddy.cn',
      baseURL: upstream.url,
    })
    assert.ok(state.registered, 'an adapter was registered')
    assert.deepEqual(state.registered.routes, ['workbuddy'])
    const models = await state.registered.adapter.listModels('workbuddy')
    assert.equal(models.length, WORKBUDDY_MODELS.length)
    assert.ok(models.some((model) => model.id === 'glm-5.3'))
  } finally {
    for (const dispose of state.effects.reverse()) {
      if (typeof dispose === 'function') await dispose()
      else if (typeof dispose?.dispose === 'function') await dispose.dispose()
    }
    await upstream.close()
  }
})

test('apply still loads and warns when no credential exists', async () => {
  const upstream = await startFakeWorkBuddy()
  const { ctx, state } = stubContext()
  try {
    await apply(ctx, {
      env: {},
      platform: 'linux',
      home: mkdtempSync(join(tmpdir(), 'dsh-workbuddy-apply-')),
      baseURL: upstream.url,
    })
    assert.ok(state.registered, 'the route is registered even before sign-in')
    assert.ok(
      state.warnings.some((warning) => warning.includes('未检测到 WorkBuddy 登录凭据')),
      'a missing credential produces a diagnostic',
    )
  } finally {
    for (const dispose of state.effects.reverse()) {
      if (typeof dispose === 'function') await dispose()
      else if (typeof dispose?.dispose === 'function') await dispose.dispose()
    }
    await upstream.close()
  }
})
