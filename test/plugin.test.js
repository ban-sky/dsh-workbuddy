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
  const state = { registered: undefined, effects: [], warnings: [], route: undefined }
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
    inject(dependencies, callback) {
      const child = Object.create(ctx)
      child.connection = {
        fetch: {
          register(route) {
            state.route = route
            return () => {}
          },
        },
      }
      callback(child)
    },
  }
  return { ctx, state }
}

test('apply registers the workbuddy route with the full catalog', async () => {
  const upstream = await startFakeWorkBuddy({ reply: 'pong' })
  const { ctx, state } = stubContext()
  try {
    await apply(ctx, { baseURL: upstream.url })
    assert.ok(state.registered, 'an adapter was registered')
    assert.equal(state.route?.path, '/api/workbuddy')
    assert.deepEqual(state.route?.methods, ['POST'])
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
  // Keep the developer's real saved token out of this test: the store lives in
  // $DSH_HOME and would otherwise count as a credential.
  const dshHome = mkdtempSync(join(tmpdir(), 'dsh-workbuddy-home-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome
  try {
    await apply(ctx, {
      env: {},
      platform: 'linux',
      home: mkdtempSync(join(tmpdir(), 'dsh-workbuddy-apply-')),
      baseURL: upstream.url,
    })
    assert.ok(state.registered, 'the route is registered even before sign-in')
    assert.ok(
      state.warnings.some((warning) => warning.includes('尚未登录')),
      'a missing credential produces a diagnostic',
    )
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    for (const dispose of state.effects.reverse()) {
      if (typeof dispose === 'function') await dispose()
      else if (typeof dispose?.dispose === 'function') await dispose.dispose()
    }
    await upstream.close()
  }
})
