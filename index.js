/**
 * DSH WorkBuddy integration — Host half.
 *
 * Brings WorkBuddy (CodeBuddy) models into DeepSeek Harness:
 *
 * 1. the only credential source is the browser sign-in performed in
 *    Settings → Plugins → WorkBuddy; the token is stored in a 0600 file under
 *    the DSH home directory and is never written to config, logs, or responses,
 * 2. a loopback OpenAI-compatible shim forwards chat requests to the WorkBuddy
 *    gateway with that bearer token and account headers,
 * 3. a `workbuddy` model provider is registered through the pi-ai adapter, so
 *    the models appear in the DSH model picker and run through the normal agent
 *    loop (tools, images, streaming, reasoning levels).
 *
 * @module @ban-sky/dsh-workbuddy
 */

import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import { WORKBUDDY_MODELS } from './lib/catalog.js'
import { fetchRemoteCatalog } from './lib/catalog-source.js'
import { WorkBuddyCredentials } from './lib/credentials.js'
import { createWorkBuddyAdapter } from './lib/adapter.js'
import { startShim } from './lib/shim.js'
import { createWorkBuddyHandler, growthPayload, ROUTE_PATH, todayInActivityZone } from './lib/http.js'
import { WorkBuddyOAuth } from './lib/oauth.js'
import { defaultTokenStorePath, TokenStore } from './lib/token-store.js'
import { loadDeviceSalt, RequestPacer } from './lib/accounts.js'
import { defaultUsagePath, UsageLedger } from './lib/usage.js'
import { billingBaseOf, fetchCredits } from './lib/credits.js'
import { fetchBenefits, claimBenefit } from './lib/benefits.js'
import { fetchGrowth, redeemGrowth } from './lib/growth.js'
import { GO_PANEL_ID, GO_STRIP_ID, goData, goStrip, goView } from './lib/dsh-go.js'

/** Cordis services this plugin needs before it activates. */
export const inject = ['llm']

/** Route name used by every registered model. */
export const PROVIDER_ID = 'workbuddy'

/** Configuration schema shown by the plugin configuration surface. */
export const Config = z.object({
  baseURL: z
    .string()
    .description('WorkBuddy 网关地址；留空按账号区域自动选择（国内 copilot.tencent.com，国际 www.workbuddy.ai）。')
    .default(''),
  region: z
    .union([z.const('auto'), z.const('cn'), z.const('global')])
    .description('登录站点与网关区域。auto 根据账号 domain 判断。')
    .default('auto'),
  port: z
    .natural()
    .description('本地 shim 监听端口；0 表示随机端口（推荐）。')
    .default(0),
})

/**
 * Mount the Host half.
 *
 * @param {any} ctx - Cordis Host context with the `llm` service.
 * @param {any} config - Validated plugin configuration.
 * @returns {Promise<void>} Resolves after the provider is registered.
 */
export async function apply(ctx, config) {
  const cfg = {
    baseURL: '',
    region: 'auto',
    port: 0,
    ...config,
  }

  const storePath = defaultTokenStorePath()
  const tokenStore = new TokenStore({
    path: storePath,
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })
  // One salt per installation: every account derives its own stable device
  // identity from it, and nothing derived is ever shared between accounts.
  const deviceSalt = loadDeviceSalt(`${storePath}.device`)
  const credentials = new WorkBuddyCredentials({
    baseURL: cfg.baseURL,
    region: cfg.region,
    savedStore: tokenStore,
    deviceSalt,
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })
  // Requests are paced per account, so parallel work on one account cannot
  // look like a burst while another account stays untouched.
  const pacer = new RequestPacer()
  // Token and credit counters. The gateway reports the real numbers on the
  // final chunk of each completion, so the shim taps its own stream; this
  // ledger is what the statistics card reads.
  const usage = new UsageLedger({
    path: defaultUsagePath(),
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })

  const oauth = new WorkBuddyOAuth({ fetchImpl: globalThis.fetch })

  const status = credentials.status()
  if (!status.signedIn) {
    ctx.logger.warn(
      'workbuddy: 尚未登录。点击侧边栏的 WorkBuddy 图标（在「更多」上方），在「浏览器登录」里生成登录链接完成一次性登录；模型会先注册，登录后即可使用。',
    )
  }

  // Prefer the live app-channel roster (credits, reasoning levels, promotions),
  // but never delay startup on it: a signed-out or offline install keeps the
  // static snapshot.
  let catalogState = {
    source: 'fallback',
    models: WORKBUDDY_MODELS,
    fetchedAt: Date.now(),
  }
  if (status.signedIn) {
    try {
      const headers = await credentials.headers()
      const remote = await fetchRemoteCatalog({
        baseURL: credentials.baseURL(),
        headers,
        timeoutMs: 2500,
      })
      if (remote.source === 'remote') catalogState = remote
    } catch (error) {
      ctx.logger.warn(`workbuddy: 模型目录读取失败，使用内置快照：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const shim = await startShim({
    credentials,
    pacer,
    usage,
    models: () => catalogState.models,
    providerId: PROVIDER_ID,
    port: cfg.port,
    logger: ctx.logger,
  })
  ctx.logger.info(
    `workbuddy: shim listening on 127.0.0.1:${shim.port}, gateway ${credentials.baseURL()}, ${catalogState.models.length} models (${catalogState.source})${status.signedIn ? '' : ', not signed in yet'}`,
  )

  const { adapter, updateCatalog } = createWorkBuddyAdapter({
    providerId: PROVIDER_ID,
    displayName: 'WorkBuddy',
    catalog: catalogState.models,
    baseUrl: shim.url,
    shimToken: shim.token,
    resolveAttachments: () => ctx.get('attachment'),
    resolveImageAccess: (attachments, ref) =>
      resolveImageAttachmentAccess(
        attachments,
        (hostPath) => ctx.get('fs')?.processPathFromHostPath?.(hostPath),
        ref,
      ),
  })

  let registration
  let refreshing

  /**
   * Refresh the live catalog after sign-in and publish the new roster.
   *
   * @returns {Promise<object>} Catalog state.
   */
  async function refreshCatalog() {
    if (refreshing !== undefined) return refreshing
    refreshing = (async () => {
      if (!credentials.status().signedIn) return catalogState
      try {
        const headers = await credentials.headers()
        const remote = await fetchRemoteCatalog({
          baseURL: credentials.baseURL(),
          headers,
          timeoutMs: 4000,
        })
        if (remote.source === 'remote') {
          catalogState = remote
          updateCatalog(remote.models)
          try {
            registration?.replace([PROVIDER_ID])
          } catch (error) {
            ctx.logger.warn(`workbuddy: 模型列表刷新失败：${error instanceof Error ? error.message : String(error)}`)
          }
        }
      } catch (error) {
        ctx.logger.warn(`workbuddy: 模型目录刷新失败：${error instanceof Error ? error.message : String(error)}`)
      }
      return catalogState
    })().finally(() => {
      refreshing = undefined
    })
    return refreshing
  }

  /**
   * Spend one output token through the local shim so the usage ledger can be
   * checked end to end (shim tap → ledger → settings route). Runs the same code
   * path as a real completion, which is why it proves the wiring.
   */
  async function probeUsage() {
    const model = catalogState.models[0]?.id ?? 'deepseek-v4-flash'
    const response = await fetch(`${shim.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${shim.token}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: true,
      }),
    })
    // Drain the stream so the tap sees the trailing usage chunk.
    await response.text()
    if (!response.ok) throw new Error(`自检请求返回 HTTP ${response.status}`)
  }

  ctx.inject(['connection'], (child) => {
    child.effect(
      () =>
        child.connection.fetch.register({
          path: ROUTE_PATH,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: createWorkBuddyHandler({
            credentials,
            tokenStore,
            fetchImpl: globalThis.fetch,
            oauth,
            catalog: () => catalogState,
            refreshCatalog,
            usage,
            probeUsage,
            onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
          }),
        }),
      'dsh-workbuddy: settings route',
    )
  })

  ctx.effect(() => {
    registration = ctx.llm.registerAdapter([PROVIDER_ID], adapter)
    return () => registration()
  }, 'dsh-workbuddy: model provider')
  ctx.effect(() => () => shim.close(), 'dsh-workbuddy: loopback shim')

  /**
   * Read every number the DSH Go panel shows, for the active account.
   *
   * Credits and the activity streak are independent services, so one failing
   * must not blank the whole panel; the ledger view and credential status are
   * local and always available.
   *
   * @returns {Promise<object>} Snapshot for {@link goData}.
   */
  async function readGoSnapshot() {
    const status = credentials.status()
    const accountId = status.activeAccountId ?? ''
    const view = usage.view(accountId)
    if (!status.signedIn) return { status, credits: null, usage: view, growth: { supported: false, reason: 'SIGNED_OUT' } }
    const headers = await credentials.headers()
    const domain = status.domain ?? ''
    const base = billingBaseOf(domain)
    const [credits, growth] = await Promise.all([
      fetchCredits({ headers, domain, enterpriseId: status.enterpriseId ?? '', fetchImpl: globalThis.fetch }).catch(() => null),
      fetchGrowth({
        headers,
        base,
        domain,
        today: todayInActivityZone(),
        fetchImpl: globalThis.fetch,
      }).catch(() => ({ supported: false, reason: 'FAILED' })),
    ])
    return { status, credits, usage: view, growth }
  }

  // DSH Go (phone app) surface. The service only exists when the app's bridge
  // is installed, so a desktop install simply never runs this block.
  ctx.inject(['dshGo'], (go) => {
    // A host without the DSH Go bridge never provides the service; some test
    // harnesses hand the callback the bare context, so check before using it.
    const dshGo = go?.dshGo ?? go?.get?.('dshGo')
    if (dshGo === undefined || dshGo === null) return
    go.effect(() => {
      let snapshot
      let loading
      const load = async () => {
        loading ??= readGoSnapshot()
          .then((next) => {
            snapshot = next
            return next
          })
          .finally(() => {
            loading = undefined
          })
        return loading
      }
      const current = async () => snapshot ?? (await load())

      const offPanel = dshGo.panel(GO_PANEL_ID, {
        view: (scope, caps) => goView(caps?.locale),
        data: (scope, emit, caps) => {
          let stopped = false
          const push = async () => {
            try {
              const next = await current()
              if (!stopped) emit(goData(next, caps?.locale))
            } catch (error) {
              ctx.logger.warn(`workbuddy: dsh-go 面板读取失败：${error instanceof Error ? error.message : String(error)}`)
            }
          }
          void push()
          const timer = setInterval(() => {
            void load().then(push)
          }, 120_000)
          timer.unref?.()
          return () => {
            stopped = true
            clearInterval(timer)
          }
        },
        actions: {
          refresh: (scope, event) => ({
            pending: { label: '刷新', timeoutMs: 20_000 },
            result: async (signal) => {
              if (signal?.aborted) return []
              await load()
              return [{ type: 'patch', id: GO_PANEL_ID, data: goData(snapshot ?? {}, event?.locale) }]
            },
          }),
          'claim-gift': (scope, event) => ({
            pending: { label: '领取', timeoutMs: 20_000 },
            result: async (signal) => {
              if (signal?.aborted) return []
              try {
                const headers = await credentials.headers()
                const status = credentials.status()
                const state = await fetchBenefits({
                  headers,
                  domain: status.domain ?? '',
                  enterpriseId: status.enterpriseId ?? '',
                  fetchImpl: globalThis.fetch,
                })
                if (!state.supported || state.gift === null) return [{ type: 'toast', text: '没有可领取的福利' }]
                if (state.gift.claimed) return [{ type: 'toast', text: '该福利已经领取过了' }]
                if (!state.gift.active) return [{ type: 'toast', text: '这项福利当前不在可领取时间内' }]
                const receipt = await claimBenefit({
                  headers,
                  domain: status.domain ?? '',
                  kind: 'gift',
                  enterpriseId: '',
                  fetchImpl: globalThis.fetch,
                })
                await load()
                return [
                  { type: 'toast', text: `已领取 ${receipt.creditNum ?? state.gift.creditNum} 积分` },
                  { type: 'patch', id: GO_PANEL_ID, data: goData(snapshot ?? {}, event?.locale) },
                ]
              } catch (error) {
                return [{ type: 'toast', text: error instanceof Error ? error.message.slice(0, 40) : '领取失败' }]
              }
            },
          }),
          ...Object.fromEntries(
            ['7d', '14d', '28d'].map((tier) => [
              `redeem-${tier}`,
              (scope, event) => ({
                pending: { label: '兑换', timeoutMs: 20_000 },
                result: async (signal) => {
                  if (signal?.aborted) return []
                  try {
                    const headers = await credentials.headers()
                    const status = credentials.status()
                    const domain = status.domain ?? ''
                    const base = billingBaseOf(domain)
                    const state = await fetchGrowth({
                      headers,
                      base,
                      domain,
                      today: todayInActivityZone(),
                      fetchImpl: globalThis.fetch,
                    })
                    const entry = state.tiers?.find((item) => item.tier === tier)
                    if (entry === undefined || entry.state !== 'available') {
                      await load()
                      return [{ type: 'toast', text: '这一档还不能兑换' }]
                    }
                    const receipt = await redeemGrowth({
                      headers,
                      base,
                      domain,
                      tier,
                      clientToken: randomUUID(),
                      fetchImpl: globalThis.fetch,
                    })
                    await load()
                    return [
                      { type: 'toast', text: `已兑换 ${receipt.credit > 0 ? `${receipt.credit} 积分` : tier}` },
                      { type: 'patch', id: GO_PANEL_ID, data: goData(snapshot ?? {}, event?.locale) },
                    ]
                  } catch (error) {
                    return [{ type: 'toast', text: error instanceof Error ? error.message.slice(0, 40) : '兑换失败' }]
                  }
                },
              }),
            ]),
          ),
        },
      })

      const offStrip = dshGo.strip(GO_STRIP_ID, (scope, emit, caps) => {
        let stopped = false
        const push = async () => {
          try {
            const next = await current()
            if (!stopped) emit(goStrip(next, caps?.locale))
          } catch {
            // A strip is decoration: never surface a read failure there.
          }
        }
        void push()
        const timer = setInterval(() => {
          void load().then(push)
        }, 120_000)
        timer.unref?.()
        return () => {
          stopped = true
          clearInterval(timer)
        }
      })

      return () => {
        offPanel?.()
        offStrip?.()
      }
    }, 'dsh-workbuddy: dsh-go panel')
  })
}
