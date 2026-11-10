/**
 * Token usage and credit ledger.
 *
 * The WorkBuddy gateway reports a `usage` block on the final SSE chunk of every
 * completion: prompt/completion tokens, how much of the prompt was served from
 * its cache, and the credits the call cost. That is the only place the real
 * numbers exist — the catalog only advertises a multiplier — so the loopback
 * shim taps the stream and records what it sees here.
 *
 * Everything is kept per account, because two signed-in accounts must never
 * appear to share one bill: the counters are keyed by the account id that was
 * active when the request went out.
 *
 * The ledger is a 0600 JSON file under the DSH home directory. It holds counts
 * only — no prompt text, no response text, no token, no account identifier
 * beyond the store's own account id.
 *
 * Schema v1:
 *
 * ```json
 * {
 *   "version": 1,
 *   "updatedAt": 1794326683000,
 *   "accounts": {
 *     "acct-1": {
 *       "requests": 4,
 *       "promptTokens": 1200,
 *       "completionTokens": 380,
 *       "totalTokens": 1580,
 *       "cachedTokens": 900,
 *       "uncachedTokens": 300,
 *       "reasoningTokens": 0,
 *       "credits": 0.42,
 *       "firstAt": 1794326000000,
 *       "lastAt": 1794326683000,
 *       "models": { "deepseek-v4-flash": { "requests": 4, ... } }
 *     }
 *   }
 * }
 * ```
 *
 * @module @ban-sky/dsh-workbuddy/usage
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** File name inside the DSH home directory. */
export const USAGE_FILE = '.workbuddy-usage.json'

/** Schema version written by this module. */
export const USAGE_VERSION = 1

/** Largest ledger file we are willing to read. */
const MAX_FILE_BYTES = 1024 * 1024

/** Accounts one ledger may hold; extra ids are dropped rather than grown. */
const MAX_ACCOUNTS = 16

/** Models tracked per account. */
const MAX_MODELS = 64

/** Debounce for disk writes: a burst of completions costs one write. */
const FLUSH_DELAY_MS = 2_000

/**
 * Resolve the default ledger path: `$DSH_HOME/.workbuddy-usage.json`.
 *
 * @param {Record<string, string | undefined>} [env] - Environment-like object.
 * @param {string} [home] - Home directory override.
 * @returns {string} Absolute file path.
 */
export function defaultUsagePath(env = process.env, home = homedir()) {
  const dshHome = (env.DSH_HOME ?? '').trim()
  return join(dshHome !== '' ? dshHome : join(home, '.dsh'), USAGE_FILE)
}

/**
 * Coerce a numeric field that may be a number or a numeric string.
 *
 * @param {unknown} value - Raw field.
 * @returns {number} Finite number, or 0.
 */
function num(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return 0
}

/**
 * Read a counter object, keeping only recognized keys.
 *
 * @param {unknown} value - Raw counters.
 * @returns {{ requests: number, promptTokens: number, completionTokens: number, totalTokens: number, cachedTokens: number, uncachedTokens: number, reasoningTokens: number, credits: number, firstAt: number, lastAt: number }} Counters.
 */
export function readCounters(value) {
  const raw = value !== null && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {}
  return {
    requests: Math.max(0, Math.round(num(raw.requests))),
    promptTokens: Math.max(0, Math.round(num(raw.promptTokens))),
    completionTokens: Math.max(0, Math.round(num(raw.completionTokens))),
    totalTokens: Math.max(0, Math.round(num(raw.totalTokens))),
    cachedTokens: Math.max(0, Math.round(num(raw.cachedTokens))),
    uncachedTokens: Math.max(0, Math.round(num(raw.uncachedTokens))),
    reasoningTokens: Math.max(0, Math.round(num(raw.reasoningTokens))),
    credits: Math.max(0, num(raw.credits)),
    firstAt: Math.max(0, Math.round(num(raw.firstAt))),
    lastAt: Math.max(0, Math.round(num(raw.lastAt))),
  }
}

/**
 * Extract the counters from one upstream `usage` block.
 *
 * The gateway sends both the OpenAI-style `prompt_tokens_details.cached_tokens`
 * and its own `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`; either
 * pair is enough, and a miss count is derived when only the hit count exists.
 *
 * @param {Record<string, unknown>} usage - Upstream usage block.
 * @returns {{ promptTokens: number, completionTokens: number, totalTokens: number, cachedTokens: number, uncachedTokens: number, reasoningTokens: number, credits: number }} Counters for one call.
 */
export function readUpstreamUsage(usage) {
  const raw = usage !== null && typeof usage === 'object' ? usage : {}
  const promptTokens = Math.max(0, Math.round(num(raw.prompt_tokens)))
  const completionTokens = Math.max(0, Math.round(num(raw.completion_tokens)))
  const promptDetails =
    raw.prompt_tokens_details !== null && typeof raw.prompt_tokens_details === 'object'
      ? /** @type {Record<string, unknown>} */ (raw.prompt_tokens_details)
      : {}
  const completionDetails =
    raw.completion_tokens_details !== null && typeof raw.completion_tokens_details === 'object'
      ? /** @type {Record<string, unknown>} */ (raw.completion_tokens_details)
      : {}
  const cachedTokens = Math.min(
    promptTokens,
    Math.max(
      0,
      Math.round(
        num(raw.prompt_cache_hit_tokens) || num(raw.cached_tokens) || num(promptDetails.cached_tokens),
      ),
    ),
  )
  const reportedMiss = Math.round(num(raw.prompt_cache_miss_tokens))
  const uncachedTokens = reportedMiss > 0 ? Math.min(promptTokens, reportedMiss) : Math.max(0, promptTokens - cachedTokens)
  const reasoningTokens = Math.max(
    0,
    Math.round(num(completionDetails.reasoning_tokens) || num(raw.completion_thinking_tokens)),
  )
  return {
    promptTokens,
    completionTokens,
    totalTokens: Math.max(0, Math.round(num(raw.total_tokens))) || promptTokens + completionTokens,
    cachedTokens,
    uncachedTokens,
    reasoningTokens,
    credits: Math.max(0, num(raw.credit)),
  }
}

/**
 * Add one usage block to a counter bundle.
 *
 * @param {ReturnType<typeof readCounters>} counters - Existing counters.
 * @param {ReturnType<typeof readUpstreamUsage>} usage - One call.
 * @param {number} at - Epoch milliseconds.
 * @returns {ReturnType<typeof readCounters>} New counters.
 */
export function addUsage(counters, usage, at) {
  const next = { ...counters }
  next.requests += 1
  next.promptTokens += usage.promptTokens
  next.completionTokens += usage.completionTokens
  next.totalTokens += usage.totalTokens
  next.cachedTokens += usage.cachedTokens
  next.uncachedTokens += usage.uncachedTokens
  next.reasoningTokens += usage.reasoningTokens
  // Credits arrive as short decimals; summing floats drifts (0.05 + 0.01 →
  // 0.060000000000000005), so the running total is re-rounded every time.
  next.credits = Math.round((next.credits + usage.credits) * 1e6) / 1e6
  next.firstAt = next.firstAt === 0 ? at : Math.min(next.firstAt, at)
  next.lastAt = Math.max(next.lastAt, at)
  return next
}

/**
 * Normalize one account entry read from disk.
 *
 * @param {unknown} value - Raw entry.
 * @param {number} now - Current epoch milliseconds.
 * @returns {{ counters: ReturnType<typeof readCounters>, models: Map<string, ReturnType<typeof readCounters>> }} Account entry.
 */
export function readAccountEntry(value, now = Date.now()) {
  const raw = value !== null && typeof value === 'object' ? /** @type {Record<string, unknown>} */ (value) : {}
  const counters = readCounters(raw)
  const models = new Map()
  if (raw.models !== null && typeof raw.models === 'object') {
    const entries = Object.entries(/** @type {Record<string, unknown>} */ (raw.models)).slice(0, MAX_MODELS)
    for (const [id, modelCounters] of entries) {
      const key = typeof id === 'string' ? id.trim() : ''
      if (key !== '') models.set(key, readCounters(modelCounters))
    }
  }
  if (counters.requests === 0 && counters.totalTokens === 0 && counters.credits === 0) {
    return { counters: { ...counters, lastAt: counters.lastAt || now }, models }
  }
  return { counters, models }
}

/**
 * Aggregate token counts into the view the settings panel renders.
 *
 * The credit-to-token conversion is computed here so the client never has to
 * guess: `tokensPerCredit` is total tokens per credit spent, and
 * `creditsPerKToken` is the inverse per 1000 tokens.
 *
 * @param {ReturnType<typeof readCounters>} counters - Counters to summarize.
 * @returns {Record<string, number>} Summary with derived ratios.
 */
export function summarizeCounters(counters) {
  const credits = counters.credits
  const totalTokens = counters.totalTokens
  return {
    requests: counters.requests,
    promptTokens: counters.promptTokens,
    completionTokens: counters.completionTokens,
    totalTokens,
    cachedTokens: counters.cachedTokens,
    uncachedTokens: counters.uncachedTokens,
    reasoningTokens: counters.reasoningTokens,
    credits: Math.round(credits * 1e6) / 1e6,
    cacheHitRate: counters.promptTokens > 0 ? counters.cachedTokens / counters.promptTokens : 0,
    tokensPerCredit: credits > 0 ? totalTokens / credits : 0,
    creditsPerKToken: totalTokens > 0 ? Math.round((credits / totalTokens) * 1000 * 1e6) / 1e6 : 0,
    firstAt: counters.firstAt,
    lastAt: counters.lastAt,
  }
}

/**
 * Append-only ledger of tokens and credits per account.
 */
export class UsageLedger {
  /**
   * @param {object} [options] - Options.
   * @param {string} [options.path] - Ledger file path; omit to keep it in memory only.
   * @param {(message: string) => void} [options.onWarning] - Diagnostic sink.
   * @param {number} [options.now] - Clock override for tests.
   */
  constructor({ path = '', onWarning = () => {}, now = () => Date.now() } = {}) {
    this.path = path
    this.onWarning = onWarning
    this.now = now
    /** @type {Map<string, { counters: ReturnType<typeof readCounters>, models: Map<string, ReturnType<typeof readCounters>> }>} */
    this.accounts = new Map()
    this.loaded = false
    this.flushTimer = undefined
    this.dirty = false
  }

  /** Read the ledger from disk once. */
  load() {
    if (this.loaded) return this
    this.loaded = true
    if (this.path === '') return this
    let text
    try {
      const info = statSync(this.path)
      if (info.size > MAX_FILE_BYTES) {
        this.onWarning(`用量统计文件过大（${info.size} 字节），已忽略。`)
        return this
      }
      text = readFileSync(this.path, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.onWarning(`用量统计读取失败：${error instanceof Error ? error.message : String(error)}`)
      }
      return this
    }
    let document
    try {
      document = JSON.parse(text)
    } catch {
      this.onWarning('用量统计文件不是有效 JSON，已忽略。')
      return this
    }
    if (document === null || typeof document !== 'object') return this
    const accounts = document.accounts
    if (accounts === null || typeof accounts !== 'object') return this
    for (const [id, entry] of Object.entries(/** @type {Record<string, unknown>} */ (accounts)).slice(0, MAX_ACCOUNTS)) {
      const key = typeof id === 'string' ? id.trim() : ''
      if (key !== '') this.accounts.set(key, readAccountEntry(entry, this.now()))
    }
    return this
  }

  /**
   * Account entry, created on demand.
   *
   * @param {string} accountId - Account id.
   * @returns {{ counters: ReturnType<typeof readCounters>, models: Map<string, ReturnType<typeof readCounters>> }} Entry.
   */
  entry(accountId) {
    this.load()
    const key = typeof accountId === 'string' && accountId !== '' ? accountId : 'default'
    const existing = this.accounts.get(key)
    if (existing !== undefined) return existing
    const created = { counters: readCounters({}), models: new Map() }
    if (this.accounts.size >= MAX_ACCOUNTS) {
      // Drop the least recently used account rather than growing without bound.
      let oldestKey = ''
      let oldestAt = Number.POSITIVE_INFINITY
      for (const [id, entry] of this.accounts) {
        if (entry.counters.lastAt < oldestAt) {
          oldestAt = entry.counters.lastAt
          oldestKey = id
        }
      }
      if (oldestKey !== '') this.accounts.delete(oldestKey)
    }
    this.accounts.set(key, created)
    return created
  }

  /**
   * Record one completed call.
   *
   * @param {object} input - Call description.
   * @param {string} input.accountId - Account that paid for it.
   * @param {string} input.model - Model id.
   * @param {Record<string, unknown>} input.usage - Upstream usage block.
   * @returns {ReturnType<typeof readUpstreamUsage> | undefined} Parsed usage, or undefined when empty.
   */
  record({ accountId, model, usage }) {
    const parsed = readUpstreamUsage(usage)
    if (parsed.totalTokens === 0 && parsed.credits === 0 && parsed.promptTokens === 0) return undefined
    const at = this.now()
    const entry = this.entry(accountId)
    entry.counters = addUsage(entry.counters, parsed, at)
    const modelId = typeof model === 'string' && model !== '' ? model : 'unknown'
    if (entry.models.size < MAX_MODELS || entry.models.has(modelId)) {
      entry.models.set(modelId, addUsage(entry.models.get(modelId) ?? readCounters({}), parsed, at))
    }
    this.dirty = true
    this.schedule()
    return parsed
  }

  /** Schedule a debounced flush. */
  schedule() {
    if (this.flushTimer !== undefined || this.path === '') return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      this.flush()
    }, FLUSH_DELAY_MS)
    this.flushTimer.unref?.()
  }

  /** Write the ledger to disk when it changed. */
  flush() {
    if (!this.dirty || this.path === '') return
    this.dirty = false
    const accounts = {}
    for (const [id, entry] of this.accounts) {
      const models = {}
      for (const [modelId, counters] of entry.models) models[modelId] = { ...counters }
      accounts[id] = { ...entry.counters, models }
    }
    const document = { version: USAGE_VERSION, updatedAt: this.now(), accounts }
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${process.pid}.tmp`
      writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
      try {
        chmodSync(temporary, 0o600)
      } catch {
        // Best effort on filesystems without POSIX modes.
      }
      renameSync(temporary, this.path)
    } catch (error) {
      this.onWarning(`用量统计写入失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Snapshot for one account, or for every account.
   *
   * @param {string} [accountId] - Restrict to one account.
   * @returns {{ updatedAt: number, accounts: Array<{ id: string, ...Record<string, number>, models: Array<{ id: string, ...Record<string, number> }> }> }} View.
   */
  view(accountId) {
    this.load()
    const ids = accountId !== undefined && accountId !== '' ? [accountId] : [...this.accounts.keys()]
    const accounts = []
    for (const id of ids) {
      const entry = this.accounts.get(id)
      if (entry === undefined) continue
      accounts.push({
        id,
        ...summarizeCounters(entry.counters),
        models: [...entry.models.entries()]
          .map(([modelId, counters]) => ({ id: modelId, ...summarizeCounters(counters) }))
          .sort((left, right) => right.totalTokens - left.totalTokens),
      })
    }
    accounts.sort((left, right) => right.lastAt - left.lastAt)
    const totals = summarizeCounters(
      accounts.reduce(
        (sum, account) => ({
          ...sum,
          requests: sum.requests + account.requests,
          promptTokens: sum.promptTokens + account.promptTokens,
          completionTokens: sum.completionTokens + account.completionTokens,
          totalTokens: sum.totalTokens + account.totalTokens,
          cachedTokens: sum.cachedTokens + account.cachedTokens,
          uncachedTokens: sum.uncachedTokens + account.uncachedTokens,
          reasoningTokens: sum.reasoningTokens + account.reasoningTokens,
          credits: sum.credits + account.credits,
          firstAt: 0,
          lastAt: Math.max(sum.lastAt, account.lastAt),
        }),
        readCounters({}),
      ),
    )
    return { updatedAt: this.now(), totals, accounts }
  }

  /**
   * Forget counters for one account, or for every account.
   *
   * @param {string} [accountId] - Account to clear; omit to clear everything.
   */
  reset(accountId) {
    this.load()
    const key = typeof accountId === 'string' ? accountId.trim() : ''
    if (key === '') this.accounts.clear()
    else this.accounts.delete(key)
    this.dirty = true
    this.flush()
  }
}

/**
 * Build an SSE tap that extracts `usage` blocks from a chat completion stream.
 *
 * The gateway always answers with `text/event-stream`, and the trailing chunk
 * of each completion carries the usage block. Chunks arrive split at arbitrary
 * byte boundaries, so lines are buffered until a newline shows up.
 *
 * @param {(usage: Record<string, unknown>) => void} onUsage - Called once per completion.
 * @returns {{ push: (chunk: Uint8Array | string) => void, flush: () => void }} Tap.
 */
export function createUsageTap(onUsage) {
  let buffer = ''
  const handleLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (payload === '' || payload === '[DONE]') return
    let parsed
    try {
      parsed = JSON.parse(payload)
    } catch {
      return
    }
    const usage = parsed?.usage
    if (usage === null || usage === undefined || typeof usage !== 'object') return
    onUsage(/** @type {Record<string, unknown>} */ (usage), parsed)
  }
  return {
    push(chunk) {
      buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        handleLine(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
      }
      // Guard against a gateway that never sends a newline.
      if (buffer.length > 256 * 1024) buffer = ''
    },
    flush() {
      if (buffer !== '') {
        handleLine(buffer)
        buffer = ''
      }
    },
  }
}
