/**
 * DSH WorkBuddy integration — Host half.
 *
 * Brings the models of a signed-in WorkBuddy (or CodeBuddy) desktop app into
 * DeepSeek Harness. The plugin:
 *
 * 1. locates the desktop app's sign-in document (or accepts a manual token),
 * 2. starts a loopback OpenAI-compatible shim that forwards chat requests to
 *    the WorkBuddy gateway with the app's bearer token and account headers,
 * 3. registers a `workbuddy` model provider through the pi-ai adapter, so the
 *    models appear in the DSH model picker and run through the normal agent
 *    loop (tools, images, streaming, reasoning levels).
 *
 * The desktop app's auth file is read-only by default, and no token is ever
 * written to the plugin configuration, logs, or a response body.
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
  authFile: z
    .string()
    .description(
      'WorkBuddy 桌面端登录文件（*.info）的绝对路径。留空则自动在 macOS / Windows / Linux 的标准位置查找，并可用 WORKBUDDY_AUTH_FILE 覆盖。',
    )
    .default(''),
  token: z
    .string()
    .role('secret')
    .description('手动填写的 WorkBuddy accessToken；填入后不再读取桌面端登录文件。也可用 WORKBUDDY_TOKEN 环境变量。')
    .default(''),
  uid: z.string().description('手动 token 模式下的账号 uid（可选）。').default(''),
  enterpriseId: z.string().description('手动 token 模式下的企业 id（可选）。').default(''),
  domain: z.string().description('账号域名；留空时使用登录文件中的 domain。').default(''),
  baseURL: z
    .string()
    .description('WorkBuddy 网关地址；留空按区域自动选择（国内 copilot.tencent.com，国际 www.workbuddy.ai）。')
    .default(''),
  region: z
    .union([z.const('auto'), z.const('cn'), z.const('global')])
    .description('网关区域。auto 根据账号 domain 判断。')
    .default('auto'),
  port: z
    .natural()
    .description('本地 shim 监听端口；0 表示随机端口（推荐）。')
    .default(0),
  writeBack: z
    .boolean()
    .description('刷新令牌后是否写回桌面端登录文件。默认关闭，避免与桌面端争抢轮换中的 refreshToken。')
    .default(false),
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
    authFile: '',
    token: '',
    uid: '',
    enterpriseId: '',
    domain: '',
    baseURL: '',
    region: 'auto',
    port: 0,
    writeBack: false,
    ...config,
  }

  const tokenStore = new TokenStore({
    path: defaultTokenStorePath(),
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })
  const credentials = new WorkBuddyCredentials({
    authFile: cfg.authFile,
    token: cfg.token,
    uid: cfg.uid,
    enterpriseId: cfg.enterpriseId,
    domain: cfg.domain,
    baseURL: cfg.baseURL,
    region: cfg.region,
    writeBack: cfg.writeBack,
    savedStore: tokenStore,
    onWarning: (message) => ctx.logger.warn(`workbuddy: ${message}`),
  })

  const oauth = new WorkBuddyOAuth({ fetchImpl: globalThis.fetch })

  const status = credentials.status()
  if (!status.signedIn) {
    ctx.logger.warn(
      'workbuddy: 未检测到 WorkBuddy 登录凭据。模型组仍会注册，但请求会返回 MISSING_CREDENTIAL；请登录 WorkBuddy 桌面端或在插件配置中填写 token / authFile。',
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
    `workbuddy: shim listening on 127.0.0.1:${shim.port}, gateway ${credentials.baseURL()}, ${WORKBUDDY_MODELS.length} models${status.signedIn ? '' : ' (no credentials yet)'}`,
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
