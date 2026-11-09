/**
 * DSH model provider built on the loopback shim.
 *
 * Discovery is static: the catalog snapshot is turned into pi-ai descriptors
 * once and the route is registered for its whole lifetime. Credentials, model
 * availability, and token rotation are handled per request by the shim, so a
 * desktop sign-in change needs no model-registration churn.
 *
 * @module @ban-sky/dsh-workbuddy/adapter
 */

import { createProvider } from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { WORKBUDDY_MODELS, toPiModel } from './catalog.js'

/** A request may sit idle this long before the adapter gives up. */
const STREAM_IDLE_TIMEOUT_MS = 300_000

/** Image budgets: total request, per-image pixels, and raw bytes per image. */
const IMAGE_BUDGETS = Object.freeze({
  maxRequestImageBytes: 20 * 1024 * 1024,
  requestImagePixelBudget: 4_194_304,
  requestImageMaxBytes: 1024 * 1024,
})

/**
 * Inert pi-ai auth plane.
 *
 * The WorkBuddy route authenticates only through the shim's per-boot secret,
 * resolved by `resolveApiKey`; pi-ai's own credential store and ambient
 * discovery must never invent a credential for it.
 */
const INERT_AUTH = {
  credentials: {
    /** @returns {Promise<undefined>} Nothing stored. */
    async read() {
      return undefined
    },
    /** @returns {Promise<never[]>} No stored records. */
    async list() {
      return []
    },
    /** @throws {Error} The route has no writable credential lifecycle. */
    async modify() {
      throw new Error('dsh-workbuddy: the workbuddy route has no pi-ai credential lifecycle')
    },
    /** @returns {Promise<void>} Nothing to delete. */
    async delete() {},
  },
  authContext: {
    /** @returns {Promise<undefined>} No ambient environment credential. */
    async env() {
      return undefined
    },
    /** @returns {Promise<boolean>} No ambient file credential. */
    async fileExists() {
      return false
    },
  },
}

/**
 * Build the WorkBuddy pi-ai provider and adapter.
 *
 * @param {object} options - Adapter options.
 * @param {string} [options.providerId] - Route name (default `workbuddy`).
 * @param {string} [options.displayName] - Picker label.
 * @param {ReadonlyArray<import('./catalog.js').WorkBuddyModel>} [options.catalog] - Rows to expose.
 * @param {string} options.baseUrl - Loopback shim base URL ending in `/v1`.
 * @param {string} options.shimToken - Per-boot shim secret.
 * @param {() => unknown} [options.resolveAttachments] - Attachment store lookup.
 * @param {(attachments: any, ref: any) => unknown} [options.resolveImageAccess] - Image bridge.
 * @returns {{ adapter: PiAiAdapter, providerId: string }} Adapter bundle.
 */
export function createWorkBuddyAdapter(options) {
  const providerId = options.providerId ?? 'workbuddy'
  const displayName = options.displayName ?? 'WorkBuddy'
  const catalog = options.catalog ?? WORKBUDDY_MODELS
  const baseUrl = options.baseUrl
  const shimToken = options.shimToken

  const models = catalog.map((row) => toPiModel(row, { providerId, baseUrl }))
  const provider = {
    ...createProvider({
      id: providerId,
      name: displayName,
      auth: {
        apiKey: {
          name: 'WorkBuddy local shim',
          /**
           * Resolve the pi-ai auth override.
           *
           * @param {{ credential?: { key?: string } }} input - pi-ai auth context.
           * @returns {Promise<{ auth: { apiKey: string }, source: string } | undefined>} Auth, when a key exists.
           */
          async resolve({ credential }) {
            const key = credential?.key
            if (key === undefined || key === '') return undefined
            return { auth: { apiKey: key }, source: 'WorkBuddy' }
          },
        },
      },
      models,
      api: openAICompletionsApi(),
    }),
    getModels: () => models,
  }

  const profile = {
    provider: providerId,
    displayName,
    streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-workbuddy retryPolicy'),
    configuredMaxTokens: new Map(),
    modelErrors: new Map(),
    ...IMAGE_BUDGETS,
    piProvider: provider,
  }
  /** @type {import('@deepseek-ai/dsh-llm-pi-ai').PiAiAdapterOptions} */
  const adapterOptions = {
    profiles: () => new Map([[providerId, profile]]),
    auth: INERT_AUTH,
    resolveApiKey: async () => shimToken,
  }
  if (typeof options.resolveAttachments === 'function') {
    adapterOptions.resolveAttachments = () => options.resolveAttachments?.()
  }
  if (typeof options.resolveImageAccess === 'function') {
    const bridge = options.resolveImageAccess
    adapterOptions.resolveImageAccess = (attachments, ref) => bridge(attachments, ref)
  }

  return { adapter: new PiAiAdapter(adapterOptions), providerId }
}
