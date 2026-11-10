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
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import { WORKBUDDY_MODELS } from './lib/catalog.js'
import { fetchRemoteCatalog } from './lib/catalog-source.js'
import { WorkBuddyCredentials } from './lib/credentials.js'
import { createWorkBuddyAdapter } from './lib/adapter.js'
import { startShim } from './lib/shim.js'
import { createWorkBuddyHandler, ROUTE_PATH } from './lib/http.js'
import { WorkBuddyOAuth } from './lib/oauth.js'
import { defaultTokenStorePath, TokenStore } from './lib/token-store.js'
import { loadDeviceSalt, RequestPacer } from './lib/accounts.js'

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
}
