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
import { WorkBuddyCredentials } from './lib/credentials.js'
import { createWorkBuddyAdapter } from './lib/adapter.js'
import { startShim } from './lib/shim.js'
import { createWorkBuddyHandler, ROUTE_PATH } from './lib/http.js'
import { WorkBuddyOAuth } from './lib/oauth.js'
import { defaultTokenStorePath, TokenStore } from './lib/token-store.js'

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

  const tokenStore = new TokenStore({
    path: defaultTokenStorePath(),
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })
  const credentials = new WorkBuddyCredentials({
    baseURL: cfg.baseURL,
    region: cfg.region,
    savedStore: tokenStore,
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })

  const oauth = new WorkBuddyOAuth({ fetchImpl: globalThis.fetch })

  const status = credentials.status()
  if (!status.signedIn) {
    ctx.logger.warn(
      'workbuddy: 尚未登录。打开 设置 → 插件 → WorkBuddy，点击「生成登录链接」完成一次性浏览器登录；模型会先注册，登录后即可使用。',
    )
  }

  const shim = await startShim({
    credentials,
    models: () => WORKBUDDY_MODELS,
    providerId: PROVIDER_ID,
    port: cfg.port,
    logger: ctx.logger,
  })
  ctx.logger.info(
    `workbuddy: shim listening on 127.0.0.1:${shim.port}, gateway ${credentials.baseURL()}, ${WORKBUDDY_MODELS.length} models${status.signedIn ? '' : ' (not signed in yet)'}`,
  )

  const { adapter } = createWorkBuddyAdapter({
    providerId: PROVIDER_ID,
    displayName: 'WorkBuddy',
    catalog: WORKBUDDY_MODELS,
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
            oauth,
            modelCount: WORKBUDDY_MODELS.length,
            onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
          }),
        }),
      'dsh-workbuddy: settings route',
    )
  })

  ctx.effect(() => ctx.llm.registerAdapter([PROVIDER_ID], adapter), 'dsh-workbuddy: model provider')
  ctx.effect(() => () => shim.close(), 'dsh-workbuddy: loopback shim')
}
