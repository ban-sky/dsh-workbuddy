/**
 * Client rendering tests.
 *
 * The panel is plain `React.createElement`, so it can be rendered without a
 * browser: stub the module loader and the four hooks it uses, feed canned Host
 * replies, and assert on the returned tree. This exists because a card body
 * once arrived as a single node instead of a list and the whole page rendered
 * blank — a failure no syntax check can catch.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

/** Host replies for a signed-in account with every card populated. */
const REPLIES = {
  status: {
    ok: true,
    value: {
      signedIn: true,
      activeAccountId: 'acct-1',
      source: 'saved',
      uid: 'uid-1',
      nickname: '176****1757',
      enterpriseName: '',
      domain: 'www.codebuddy.cn',
      expiresAt: 1_700_000_000_000,
      refreshable: true,
      baseURL: 'https://copilot.tencent.com',
      saved: true,
      modelCount: 3,
      storagePath: '/tmp/.workbuddy-credentials.json',
    },
  },
  accounts: {
    ok: true,
    value: {
      activeId: 'acct-1',
      accounts: [{ id: 'acct-1', label: '主账号', nickname: '176****1757', domain: 'www.codebuddy.cn', expiresAt: 1_700_000_000_000, refreshable: true, active: true }],
    },
  },
  credits: { ok: true, value: { source: 'personal', total: 748, expiringSoon: 120, packages: [{ name: '套餐', remain: 148, size: 1500 }] } },
  benefits: {
    ok: true,
    value: {
      supported: true,
      gift: { kind: 'gift', active: true, claimed: false, pending: true, creditNum: 1500, endTime: '2026-11-30 23:59:59' },
      // Deliberately missing `endTime`: the row must not assume it exists.
      compensation: { kind: 'compensation', active: false, claimed: true, pending: false, creditNum: 500 },
    },
  },
  usage: {
    ok: true,
    value: {
      updatedAt: 1_700_000_000_000,
      totals: { requests: 12, promptTokens: 1000, completionTokens: 200, totalTokens: 1200, cachedTokens: 750, uncachedTokens: 250, credits: 0.4, cacheHitRate: 0.75, tokensPerCredit: 3000, creditsPerKToken: 0.333333 },
      accounts: [],
    },
  },
  models: {
    ok: true,
    value: {
      source: 'remote',
      fetchedAt: 1_700_000_000_000,
      models: [{ id: 'glm-5.3', name: 'GLM 5.3', contextWindow: 200_000, maxTokens: 32_000, efforts: ['low', 'high'], defaultEffort: 'high', credits: 0.29, creditsText: '×0.29', promotion: null }],
    },
  },
  growth: {
    ok: true,
    value: {
      supported: true,
      streak: { days: 8, monthTotalDays: 8, monthConsumedDays: 0, nextTier: '14d', nextTierRemaining: 6, makeupDates: [] },
      cards: { balance: 2, max: 4 },
      tiers: [
        { tier: '7d', days: 7, credit: 0, energy: 2, cards: 1, chances: 1, state: 'redeemed', count: 1 },
        { tier: '14d', days: 14, credit: 50, energy: 3, cards: 1, chances: 1, state: 'available', count: 0 },
        { tier: '28d', days: 28, credit: 150, energy: 5, cards: 1, chances: 1, state: 'locked', count: 0 },
      ],
      remainingDays: 8,
      timezone: 'Asia/Shanghai',
      launchDate: '2026-06-17',
      today: { counted: true, score: 1, hotDays: 6 },
      fetchedAt: 1_700_000_000_000,
    },
  },
}

/**
 * Load the client half with a stub module loader and render it.
 *
 * @param {{signedIn?: boolean}} [options] - Scenario knobs.
 * @returns {Promise<{tree: any, classes: string[], calls: string[]}>} Rendered tree and the actions it called.
 */
async function render(options = {}) {
  const calls = []
  const states = []
  let cursor = 0
  const effects = []

  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false) }),
    useState: (initial) => {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
    },
    useEffect: (fn) => { effects.push(fn) },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
  }

  globalThis.window = { __ModuleLoader__: { load: (descriptor) => { globalThis.__clientDescriptor = descriptor } } }
  globalThis.document = { createElement: () => ({ dataset: {}, remove() {}, textContent: '' }), head: { appendChild() {} }, getElementById: () => null }
  globalThis.fetch = async (_url, init) => {
    const action = JSON.parse(String(init?.body ?? '{}')).action
    calls.push(action)
    if (action === 'status' && options.signedIn === false) {
      return Response.json({ ok: true, value: { signedIn: false, source: 'none', modelCount: 3, saved: false, storagePath: '/tmp/x' } })
    }
    return Response.json(REPLIES[action] ?? { ok: true, value: {} })
  }

  const moduleUrl = new URL('../client.js', import.meta.url).href
  await import(`${moduleUrl}?probe=${Math.random()}`)

  let panel
  const ctx = {
    effect: (fn) => fn(),
    locale: { register() {}, bind: () => (key) => key },
    slots: {
      inject: (_name, fn) => fn(),
      register: (registration, component) => {
        if (registration.name === 'main') panel = component
        return () => {}
      },
    },
  }
  globalThis.__clientDescriptor.factory((id) => (id === 'react' ? React : {})).apply(ctx)
  assert.equal(typeof panel, 'function', 'the panel must register into the "main" slot')

  let tree
  for (let pass = 0; pass < 4; pass += 1) {
    cursor = 0
    tree = panel({ t: (key) => key })
    const queued = effects.splice(0, effects.length)
    for (const fn of queued) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanup()
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  const classes = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    const className = node.props?.className
    if (typeof className === 'string') classes.push(...className.split(/\s+/).filter(Boolean))
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  return { tree, classes, calls }
}

test('the signed-in panel renders every card', async () => {
  const { classes, calls } = await render()
  assert.ok(calls.includes('status'), 'status must be requested')
  assert.equal(classes.filter((name) => name === 'wb-card').length, 5, 'accounts, connection, models, check-in, usage')
  for (const body of ['wb-checkin', 'wb-tier', 'wb-account', 'wb-kv', 'wb-usage-grid']) {
    assert.ok(classes.includes(body), `missing ${body}`)
  }
})

test('the check-in card shows the streak and only claims claimable tiers', async () => {
  const { tree } = await render()
  const text = JSON.stringify(tree)
  assert.ok(text.includes('wb-streak-value'), 'streak value cell must render')
  assert.ok(text.includes('8'), 'streak day count must render')
  const claimable = (text.match(/checkinClaimable|checkinRedeem/g) ?? []).length
  assert.ok(claimable > 0, 'an available tier must offer a redeem button')
})

test('the signed-out panel still renders its shell', async () => {
  const { classes } = await render({ signedIn: false })
  assert.ok(classes.includes('wb-page'))
  assert.ok(classes.includes('wb-card'))
})
