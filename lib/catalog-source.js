/**
 * Live WorkBuddy catalog.
 *
 * `/v3/config` is the document the desktop app itself reads: it carries the
 * model roster, per-model credit multipliers and reasoning levels, plus the
 * promotion and tier badge feeds. The static snapshot in `catalog.js` remains
 * the fallback for a signed-out install and for an upstream error.
 *
 * @module @ban-sky/dsh-workbuddy/catalog-source
 */

import { WORKBUDDY_MODELS } from './catalog.js'
import { THINKING_LEVELS, resolvePromotion } from './promotions.js'

/** Global app-channel user agent (one WorkBuddy segment, no CLI part). */
export const APP_CHANNEL_UA = 'WorkBuddy/5.8.3'

/** CN app-channel user agent; the richest roster plus the badge feed. */
export const CN_APP_CHANNEL_UA = 'WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0'

/** Path that answers the app-channel document. */
export const CATALOG_PATH = '/v3/config'

/**
 * Pick the user agent that selects the richest document for one gateway.
 *
 * The CN gateway publishes its 62-model document with the badge feed only for
 * the composite app identity; the global gateway publishes its 23-model
 * document (also with the feed) only for the short app identity.
 *
 * @param {string} baseURL - Gateway origin.
 * @returns {string} User agent.
 */
export function appChannelUA(baseURL) {
  return /(^|\.)workbuddy\.ai$/i.test(new URL(baseURL).hostname) ? APP_CHANNEL_UA : CN_APP_CHANNEL_UA
}

/** Model tags that mean "not a chat model". */
const MEDIA_TAGS = new Set([
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video',
  'image-generation',
  'video-generation',
])

/**
 * Parse a credit multiplier (`x0.29 credits`, `0.50x`, `x0.00`).
 *
 * @param {unknown} value - Wire value.
 * @returns {number | undefined} Multiplier.
 */
export function parseCredits(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = /([0-9]+(?:\.[0-9]+)?)\s*x|x\s*([0-9]+(?:\.[0-9]+)?)/i.exec(value)
  if (!match) return undefined
  const parsed = Number(match[1] ?? match[2])
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Keep only reasoning levels the DSH picker understands.
 *
 * @param {unknown} value - Wire level list or single level.
 * @returns {string[]} Declared levels.
 */
export function normalizeEfforts(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return values.filter((level) => typeof level === 'string' && THINKING_LEVELS.includes(level) && level !== 'off')
}

/**
 * Whether one wire row is a chat model worth exposing.
 *
 * @param {object} model - Wire model.
 * @returns {boolean} Whether it is a chat model.
 */
export function isChatModel(model) {
  if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') return false
  if (model.videoGeneration === true) return false
  if (model.supportsToolCall === false) return false
  const tags = Array.isArray(model.tags) ? model.tags : []
  if (tags.some((tag) => MEDIA_TAGS.has(tag))) return false
  if (/image|video/i.test(model.id) && !/chat|thinking/i.test(model.id)) return false
  if (!Number.isFinite(Number(model.maxOutputTokens)) || Number(model.maxOutputTokens) <= 0) return false
  if (!Number.isFinite(Number(model.maxInputTokens)) || Number(model.maxInputTokens) <= 0) return false
  return true
}

/**
 * Map one wire model to a catalog row.
 *
 * @param {object} raw - Wire model.
 * @param {object} context - Mapping context.
 * @param {ReadonlyArray<object>} context.promotions - Promotion feed.
 * @param {ReadonlyArray<object>} context.tiers - Tier feed.
 * @param {number} context.nowMs - Epoch milliseconds.
 * @returns {object | undefined} Catalog row.
 */
export function mapRemoteModel(raw, { promotions, tiers, nowMs }) {
  if (!isChatModel(raw)) return undefined
  const reasoning = raw.reasoning && typeof raw.reasoning === 'object' ? raw.reasoning : {}
  const declared = normalizeEfforts(reasoning.supportedEfforts ?? reasoning.effort)
  const canDisableThinking = reasoning.canDisableThinking === true
  const efforts = canDisableThinking && declared.length > 0 ? ['off', ...declared.filter((level) => level !== 'off')] : declared
  const credits = parseCredits(raw.credits)
  const promotion = resolvePromotion(promotions, raw.id, nowMs)
  const tier = Array.isArray(tiers)
    ? tiers.find((entry) => entry && entry.badge && Array.isArray(entry.modelIds) && entry.modelIds.includes(raw.id))
    : undefined
  return {
    id: raw.id,
    name: raw.name,
    contextWindow: Number(raw.maxInputTokens),
    maxTokens: Number(raw.maxOutputTokens),
    supportsImages: raw.supportsImages === true,
    efforts,
    canDisableThinking,
    onlyReasoning: raw.onlyReasoning === true,
    reasoningDefault: typeof reasoning.defaultEffort === 'string' ? reasoning.defaultEffort : undefined,
    credits,
    creditsText: credits === undefined ? undefined : `×${credits.toFixed(2)}`,
    descriptionZh: typeof raw.descriptionZh === 'string' ? raw.descriptionZh : undefined,
    descriptionEn: typeof raw.descriptionEn === 'string' ? raw.descriptionEn : undefined,
    promotion: promotion === undefined ? undefined : toPromotionView(promotion),
    tier: tier === undefined ? undefined : {
      label: typeof tier.badge.label === 'string' ? tier.badge.label : '',
      color: typeof tier.badge.color === 'string' ? tier.badge.color : undefined,
      text: typeof tier.hover?.textZh === 'string' ? tier.hover.textZh : undefined,
      requiredUserType: typeof tier.requiredUserType === 'string' ? tier.requiredUserType : undefined,
    },
  }
}

/**
 * Serialize one resolved promotion for the settings table.
 *
 * @param {{ promotion: object, state: object }} entry - Resolved promotion.
 * @returns {object} Public promotion view.
 */
export function toPromotionView(entry) {
  const { promotion, state } = entry
  return {
    label: typeof promotion.badge?.label === 'string' ? promotion.badge.label : '',
    color: typeof promotion.badge?.color === 'string' ? promotion.badge.color : undefined,
    status: state.status,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    daily: state.daily,
    timezone: state.timezone,
    textZh: typeof promotion.hover?.textZh === 'string' ? promotion.hover.textZh : undefined,
    textEn: typeof promotion.hover?.textEn === 'string' ? promotion.hover.textEn : undefined,
    discount: typeof promotion.discount?.discountedCredits === 'string' ? promotion.discount.discountedCredits : undefined,
  }
}

/**
 * Fetch and map the live catalog.
 *
 * Never throws: a missing credential, timeout, or malformed document falls
 * back to the static snapshot so the provider still starts.
 *
 * @param {object} options - Fetch options.
 * @param {string} options.baseURL - Gateway origin.
 * @param {Record<string, string>} [options.headers] - Credential headers.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation.
 * @param {number} [options.timeoutMs] - Request timeout.
 * @param {number} [options.nowMs] - Clock override.
 * @returns {Promise<{ source: 'remote' | 'fallback', models: ReadonlyArray<object>, fetchedAt: number, promotions?: ReadonlyArray<object>, error?: string }>} Catalog state.
 */
export async function fetchRemoteCatalog({
  baseURL,
  headers = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = 2500,
  nowMs = Date.now(),
}) {
  try {
    const response = await fetchImpl(`${baseURL}${CATALOG_PATH}`, {
      method: 'GET',
      // Credential headers already carry a chat UA; the catalog channel needs
      // its own identity, so this override must come last.
      headers: { ...headers, accept: 'application/json', 'user-agent': appChannelUA(baseURL) },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const document = await response.json()
    const data = document?.data ?? document
    const rows = Array.isArray(data?.models) ? data.models : []
    const promotions = Array.isArray(data?.modelPromotions) ? data.modelPromotions : []
    const tiers = Array.isArray(data?.modelTiers) ? data.modelTiers : []
    const models = rows
      .map((row) => mapRemoteModel(row, { promotions, tiers, nowMs }))
      .filter((row) => row !== undefined)
    if (models.length === 0) throw new Error('empty model roster')
    return { source: 'remote', models, promotions, fetchedAt: nowMs }
  } catch (error) {
    return {
      source: 'fallback',
      models: WORKBUDDY_MODELS,
      fetchedAt: nowMs,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
