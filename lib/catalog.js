/**
 * WorkBuddy model catalog.
 *
 * The roster is a point-in-time snapshot of the models the WorkBuddy desktop
 * app offers (captured 2026-10, CN endpoint). WorkBuddy adds and retires model
 * ids quickly, so this table is a startup placeholder: it lets the DSH model
 * picker show a WorkBuddy group before the first request, and it is also the
 * only catalog source when the plugin is configured with a manual token.
 *
 * Facts encoded per row:
 * - `contextWindow` / `maxTokens` — the window and output cap DSH sizes
 *   context compression against.
 * - `input` — whether the model accepts images. Under-claiming refuses the
 *   image before it is attached; over-claiming fails mid-turn, so a row only
 *   claims images the desktop app advertises.
 * - `reasoning` — the wire spellings of the thinking levels the app declares.
 *   Rows without declared levels carry no level control; the upstream keeps
 *   its own default thinking behaviour.
 *
 * @module @ban-sky/dsh-workbuddy/catalog
 */

/**
 * One catalog row, provider-neutral.
 *
 * @typedef {object} WorkBuddyModel
 * @property {string} id - Model id sent on the wire.
 * @property {string} name - Display name shown in the picker.
 * @property {number} contextWindow - Input context window in tokens.
 * @property {number} maxTokens - Output token cap.
 * @property {boolean} supportsImages - Whether the model accepts image input.
 * @property {readonly string[]} [efforts] - Declared reasoning levels on the wire.
 * @property {boolean} [canDisableThinking] - Whether `reasoning_effort: "off"` is accepted.
 * @property {boolean} [onlyReasoning] - Whether the model always reasons.
 */

/** @type {ReadonlyArray<WorkBuddyModel>} */
export const WORKBUDDY_MODELS = Object.freeze([
  {
    id: 'hy4-preview',
    name: 'Hy4 preview',
    contextWindow: 960_000,
    maxTokens: 64_000,
    supportsImages: true,
    efforts: ['high'],
    onlyReasoning: true,
  },
  {
    id: 'hy3',
    name: 'Hy3',
    contextWindow: 192_000,
    maxTokens: 64_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'hy3-x',
    name: 'Hy3-X',
    contextWindow: 192_000,
    maxTokens: 64_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'step-5-preview',
    name: 'Step-5-Preview',
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    supportsImages: true,
    efforts: ['low', 'medium', 'high'],
    onlyReasoning: true,
  },
  {
    id: 'space-bunny',
    name: 'Space-Bunny',
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    supportsImages: true,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    onlyReasoning: true,
  },
  {
    id: 'deepseek-v4.1-flash',
    name: 'Deepseek-V4.1-Flash',
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    supportsImages: true,
    efforts: ['low', 'high', 'max'],
    canDisableThinking: true,
  },
  {
    id: 'deepseek-v4-flash',
    name: 'Deepseek-V4-Flash',
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    supportsImages: true,
  },
  {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    supportsImages: true,
    efforts: ['low', 'high', 'max'],
    onlyReasoning: true,
  },
  {
    id: 'glm-5.3-flash',
    name: 'GLM-5.3-Flash',
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    supportsImages: true,
    efforts: ['low', 'high', 'max'],
    onlyReasoning: true,
  },
  {
    id: 'glm-5.3-flashx',
    name: 'GLM-5.3-FlashX',
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    supportsImages: true,
    efforts: ['low', 'high', 'max'],
    onlyReasoning: true,
  },
  {
    id: 'glm-5.2',
    name: 'GLM-5.2',
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    supportsImages: false,
    onlyReasoning: true,
  },
  {
    id: 'glm-5.1',
    name: 'GLM-5.1',
    contextWindow: 200_000,
    maxTokens: 48_000,
    supportsImages: false,
    onlyReasoning: true,
  },
  {
    id: 'glm-5v-turbo',
    name: 'GLM-5v-Turbo',
    contextWindow: 200_000,
    maxTokens: 64_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'minimax-m3-pay',
    name: 'MiniMax-M3',
    contextWindow: 512_000,
    maxTokens: 128_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'minimax-m2.7',
    name: 'MiniMax-M2.7',
    contextWindow: 200_000,
    maxTokens: 48_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'kimi-k3-2',
    name: 'Kimi-K3',
    contextWindow: 1_000_000,
    maxTokens: 32_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'kimi-k2.8-preview',
    name: 'Kimi-K2.8-Preview',
    contextWindow: 1_000_000,
    maxTokens: 64_000,
    supportsImages: true,
    efforts: ['low', 'high', 'max'],
    canDisableThinking: true,
  },
  {
    id: 'kimi-k2.7',
    name: 'Kimi-K2.7-Code',
    contextWindow: 256_000,
    maxTokens: 32_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'kimi-k2.6',
    name: 'Kimi-K2.6',
    contextWindow: 256_000,
    maxTokens: 32_000,
    supportsImages: true,
    onlyReasoning: true,
  },
  {
    id: 'deepseek-v4-pro',
    name: 'Deepseek-V4-Pro',
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    supportsImages: true,
    onlyReasoning: true,
  },
])

/** Provider-neutral cost: a WorkBuddy subscription is not per-token priced. */
export const NO_COST = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

/**
 * Map one WorkBuddy row to a pi-ai model descriptor pointing at the loopback
 * shim.
 *
 * @param {WorkBuddyModel} row - Catalog row.
 * @param {object} options - Descriptor inputs.
 * @param {string} options.providerId - DSH route the model belongs to.
 * @param {string} options.baseUrl - Loopback shim base URL ending in `/v1`.
 * @returns {object} pi-ai model descriptor.
 */
export function toPiModel(row, { providerId, baseUrl }) {
  return {
    id: row.id,
    name: row.name,
    api: 'openai-completions',
    provider: providerId,
    baseUrl,
    input: row.supportsImages ? ['text', 'image'] : ['text'],
    ...reasoningFields(row),
    cost: NO_COST,
    contextWindow: row.contextWindow,
    maxTokens: row.maxTokens,
    compat: { maxTokensField: 'max_tokens' },
  }
}

/**
 * Build the pi-ai thinking-level map for a row.
 *
 * `off` is offered only for a model the upstream says can disable thinking;
 * models that always reason must not receive a disable request. Levels the row
 * does not declare map to `null`, which makes them unavailable in the picker.
 *
 * @param {WorkBuddyModel} row - Catalog row.
 * @returns {{ reasoning: boolean, thinkingLevelMap?: Record<string, string | null> }} Reasoning fields.
 */
export function reasoningFields(row) {
  if (!row.efforts || row.efforts.length === 0) return { reasoning: false }
  const declared = row.efforts
  return {
    reasoning: true,
    thinkingLevelMap: {
      off: row.canDisableThinking === true ? 'off' : null,
      minimal: null,
      low: declared.includes('low') ? 'low' : null,
      medium: declared.includes('medium') ? 'medium' : null,
      high: declared.includes('high') ? 'high' : null,
      xhigh: declared.includes('xhigh') ? 'xhigh' : null,
      max: declared.includes('max') ? 'max' : null,
    },
  }
}

/**
 * Find one catalog row by id.
 *
 * @param {string} id - Model id.
 * @returns {WorkBuddyModel | undefined} The row, if the snapshot lists it.
 */
export function findModel(id) {
  return WORKBUDDY_MODELS.find((row) => row.id === id)
}
