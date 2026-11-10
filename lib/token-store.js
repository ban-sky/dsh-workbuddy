/**
 * Multi-account token store for browser sign-in.
 *
 * This is the plugin's only credential store. It holds one record per
 * signed-in WorkBuddy account plus the id of the active one, in a 0600 JSON
 * file under the DSH home directory — never in the plugin configuration, an
 * environment variable, a log line, or a response body.
 *
 * Schema v3:
 *
 * ```json
 * { "version": 3, "activeId": "acct-1", "accounts": [ { "id": "acct-1", ... } ] }
 * ```
 *
 * A v2 file (a single record at the top level) is read as one account with id
 * `default`, so upgrading needs no migration step and can never log the user
 * out.
 *
 * @module @ban-sky/dsh-workbuddy/token-store
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** File name inside the DSH home directory. */
export const TOKEN_STORE_FILE = '.workbuddy-credentials.json'

/** Account id used for a record read from a v2 (single-account) file. */
export const DEFAULT_ACCOUNT_ID = 'default'

/** Accounts one install may hold. */
export const MAX_ACCOUNTS = 8

/** Largest store file we are willing to read (a token is a few KiB). */
const MAX_FILE_BYTES = 512 * 1024

/** Longest access token accepted from the login response. */
const MAX_TOKEN_LENGTH = 16_384

/** Longest account label / nickname accepted. */
const MAX_LABEL_LENGTH = 128

/**
 * Resolve the default store path: `$DSH_HOME/.workbuddy-credentials.json`.
 *
 * @param {Record<string, string | undefined>} [env] - Environment-like object.
 * @param {string} [home] - Home directory override.
 * @returns {string} Absolute file path.
 */
export function defaultTokenStorePath(env = process.env, home = homedir()) {
  const dshHome = (env.DSH_HOME ?? '').trim()
  return join(dshHome !== '' ? dshHome : join(home, '.dsh'), TOKEN_STORE_FILE)
}

/**
 * Coerce a persisted expiry to epoch milliseconds.
 *
 * @param {unknown} value - Number of milliseconds/seconds or an ISO string.
 * @returns {number} Epoch milliseconds, or 0 when unknown.
 */
function expiryMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value > 1e12 ? value : value * 1000)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return 0
}

/**
 * Trim one string field, rejecting control characters.
 *
 * @param {unknown} field - Raw value.
 * @param {number} [max] - Longest accepted length.
 * @returns {string} Cleaned value or the empty string.
 */
function text(field, max = 512) {
  if (typeof field !== 'string') return ''
  const value = field.trim().slice(0, max)
  if (/[\u0000-\u001f\u007f]/.test(value)) return ''
  return value
}

/**
 * Validate and normalize one account record.
 *
 * @param {unknown} value - Parsed JSON or login payload.
 * @param {string} [fallbackId] - Account id to use when the record has none.
 * @returns {{ id: string, label: string, token: string, refreshToken: string, expiresAt: number, uid: string, enterpriseId: string, tenantId: string, domain: string, nickname: string, enterpriseName: string, savedAt: string, lastUsedAt: number } | undefined} Normalized record, or undefined when unusable.
 */
export function normalizeTokenRecord(value, fallbackId = DEFAULT_ACCOUNT_ID) {
  if (value === null || typeof value !== 'object') return undefined
  const record = /** @type {Record<string, unknown>} */ (value)
  const token = typeof record.token === 'string' ? record.token.trim() : ''
  if (token === '' || token.length > MAX_TOKEN_LENGTH || /[\u0000-\u001f\u007f]/.test(token)) return undefined
  const refreshCandidate = text(record.refreshToken, MAX_TOKEN_LENGTH)
  const uid = text(record.uid)
  const id = text(record.id, 128) || uid || fallbackId
  return {
    id,
    label: text(record.label, MAX_LABEL_LENGTH),
    token,
    refreshToken: refreshCandidate,
    expiresAt: expiryMs(record.expiresAt),
    uid,
    enterpriseId: text(record.enterpriseId),
    tenantId: text(record.tenantId),
    domain: text(record.domain).replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    nickname: text(record.nickname, MAX_LABEL_LENGTH),
    enterpriseName: text(record.enterpriseName, MAX_LABEL_LENGTH),
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
    lastUsedAt: expiryMs(record.lastUsedAt),
  }
}

/**
 * Normalize a whole store document, migrating v2 shapes in place.
 *
 * @param {unknown} value - Parsed JSON.
 * @returns {{ version: 3, activeId: string, accounts: Array<NonNullable<ReturnType<typeof normalizeTokenRecord>>> } | undefined} State, or undefined when there is nothing usable.
 */
export function normalizeAccountState(value) {
  if (value === null || typeof value !== 'object') return undefined
  const document = /** @type {Record<string, unknown>} */ (value)
  /** @type {Array<NonNullable<ReturnType<typeof normalizeTokenRecord>>>} */
  const accounts = []
  const seen = new Set()
  const push = (candidate, fallbackId = `acct-${accounts.length + 1}`) => {
    const record = normalizeTokenRecord(candidate, fallbackId)
    if (record === undefined || seen.has(record.id)) return
    seen.add(record.id)
    accounts.push(record)
  }
  if (Array.isArray(document.accounts)) {
    for (const candidate of document.accounts) {
      if (accounts.length >= MAX_ACCOUNTS) break
      push(candidate)
    }
  } else if (typeof document.token === 'string') {
    // A v2 document carries no id; prefer its uid so a later sign-in by the
    // same account replaces this record instead of adding a duplicate.
    push(document, DEFAULT_ACCOUNT_ID)
  }
  if (accounts.length === 0) return undefined
  const wanted = text(document.activeId, 128)
  const activeId = accounts.some((account) => account.id === wanted) ? wanted : accounts[0].id
  return { version: 3, activeId, accounts }
}

/**
 * Persistent, multi-account credential store.
 *
 * `read()` caches by mtime, so the file can be replaced on disk (or cleared)
 * without restarting DSH. Writes go through a temporary file and `rename`, so
 * a crash can never leave a half-written credential behind.
 */
export class AccountStore {
  /**
   * @param {object} [options] - Store options.
   * @param {string} [options.path] - Absolute file path.
   * @param {(message: string) => void} [options.onWarning] - Diagnostic sink.
   */
  constructor(options = {}) {
    this.path = options.path ?? defaultTokenStorePath()
    this.onWarning = options.onWarning ?? (() => {})
    /** @type {ReturnType<typeof normalizeAccountState>} */
    this.cached = undefined
    this.cachedMtimeMs = 0
  }

  /**
   * Read the whole state document.
   *
   * @returns {ReturnType<typeof normalizeAccountState>} State, or undefined when signed out.
   */
  readState() {
    let mtimeMs
    try {
      mtimeMs = statSync(this.path).mtimeMs
    } catch {
      this.cached = undefined
      this.cachedMtimeMs = 0
      return undefined
    }
    if (this.cached !== undefined && mtimeMs === this.cachedMtimeMs) return this.cached
    try {
      if (statSync(this.path).size > MAX_FILE_BYTES) {
        this.onWarning(`WorkBuddy 令牌文件过大，已忽略：${this.path}`)
        return undefined
      }
      const parsed = JSON.parse(readFileSync(this.path, 'utf8'))
      this.cached = normalizeAccountState(parsed)
      this.cachedMtimeMs = mtimeMs
      return this.cached
    } catch (error) {
      this.onWarning(
        `无法读取 WorkBuddy 令牌文件 ${this.path}：${error instanceof Error ? error.message : String(error)}`,
      )
      this.cached = undefined
      this.cachedMtimeMs = 0
      return undefined
    }
  }

  /**
   * Every signed-in account, active first.
   *
   * @returns {Array<NonNullable<ReturnType<typeof normalizeTokenRecord>>>} Account records.
   */
  list() {
    const state = this.readState()
    if (state === undefined) return []
    return [...state.accounts].sort((left, right) => {
      if (left.id === state.activeId) return -1
      if (right.id === state.activeId) return 1
      return 0
    })
  }

  /**
   * Id of the active account.
   *
   * @returns {string} Account id, or the empty string when signed out.
   */
  activeId() {
    return this.readState()?.activeId ?? ''
  }

  /**
   * One account by id.
   *
   * @param {string} id - Account id.
   * @returns {ReturnType<typeof normalizeTokenRecord>} Record, or undefined.
   */
  get(id) {
    return this.readState()?.accounts.find((account) => account.id === id)
  }

  /**
   * The active account record.
   *
   * @returns {ReturnType<typeof normalizeTokenRecord>} Record, or undefined.
   */
  read() {
    const state = this.readState()
    if (state === undefined) return undefined
    return state.accounts.find((account) => account.id === state.activeId) ?? state.accounts[0]
  }

  /**
   * Write the whole state document atomically.
   *
   * @param {{ activeId: string, accounts: Array<Record<string, unknown>> }} state - Next state.
   * @returns {{ version: 3, activeId: string, accounts: Array<NonNullable<ReturnType<typeof normalizeTokenRecord>>> }} Stored state.
   * @throws {Error} When no account is usable.
   */
  #write(state) {
    const normalized = normalizeAccountState({ version: 3, ...state })
    if (normalized === undefined) throw new Error('没有可保存的 WorkBuddy 账号。')
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(temporary, `${JSON.stringify({ version: 3, ...normalized }, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(temporary, this.path)
    chmodSync(this.path, 0o600)
    this.cached = normalized
    try {
      this.cachedMtimeMs = statSync(this.path).mtimeMs
    } catch {
      this.cachedMtimeMs = 0
    }
    return normalized
  }

  /**
   * Add or replace one account and make it active.
   *
   * @param {Record<string, unknown>} input - Login payload or record patch.
   * @returns {NonNullable<ReturnType<typeof normalizeTokenRecord>>} Stored record.
   * @throws {Error} When the payload has no usable token.
   */
  saveAccount(input) {
    const record = normalizeTokenRecord(input, `acct-${Date.now()}`)
    if (record === undefined) throw new Error('token 不能为空，且不能包含控制字符。')
    const state = this.readState() ?? { version: 3, activeId: record.id, accounts: [] }
    const accounts = state.accounts.filter((account) => account.id !== record.id)
    if (accounts.length >= MAX_ACCOUNTS) throw new Error(`最多只能保存 ${MAX_ACCOUNTS} 个账号。`)
    const stored = { ...record, savedAt: record.savedAt || new Date().toISOString() }
    accounts.unshift(stored)
    this.#write({ activeId: record.id, accounts })
    return stored
  }

  /**
   * Update an existing account, keeping the active selection.
   *
   * @param {string} id - Account id.
   * @param {Record<string, unknown>} patch - Fields to replace.
   * @returns {NonNullable<ReturnType<typeof normalizeTokenRecord>>} Updated record.
   * @throws {Error} When the account is unknown or the patch has no token.
   */
  updateAccount(id, patch) {
    const state = this.readState()
    const existing = state?.accounts.find((account) => account.id === id)
    if (state === undefined || existing === undefined) throw new Error('账号不存在。')
    const merged = normalizeTokenRecord({ ...existing, ...patch, id }, id)
    if (merged === undefined) throw new Error('更新后的账号无效。')
    this.#write({
      activeId: state.activeId,
      accounts: state.accounts.map((account) => (account.id === id ? merged : account)),
    })
    return merged
  }

  /**
   * Save into the active account, creating `default` when none exists.
   *
   * Kept for the credential refresh path, which rotates exactly one token.
   *
   * @param {Record<string, unknown>} input - Login payload.
   * @returns {NonNullable<ReturnType<typeof normalizeTokenRecord>>} Stored record.
   */
  save(input) {
    const active = this.read()
    if (active !== undefined) return this.updateAccount(active.id, input)
    return this.saveAccount({ ...input, id: DEFAULT_ACCOUNT_ID })
  }

  /**
   * Mark one account active.
   *
   * @param {string} id - Account id.
   * @returns {boolean} True when the account exists.
   */
  setActive(id) {
    const state = this.readState()
    if (state === undefined) return false
    if (!state.accounts.some((account) => account.id === id)) return false
    this.#write({ activeId: id, accounts: state.accounts })
    return true
  }

  /**
   * Remove one account; the next remaining account becomes active.
   *
   * @param {string} id - Account id.
   * @returns {boolean} True when an account was removed.
   */
  remove(id) {
    const state = this.readState()
    if (state === undefined) return false
    const accounts = state.accounts.filter((account) => account.id !== id)
    if (accounts.length === state.accounts.length) return false
    if (accounts.length === 0) {
      this.clear()
      return true
    }
    this.#write({ activeId: state.activeId === id ? accounts[0].id : state.activeId, accounts })
    return true
  }

  /**
   * Remove every saved account.
   *
   * @returns {boolean} True when the file was removed.
   */
  clear() {
    this.cached = undefined
    this.cachedMtimeMs = 0
    try {
      unlinkSync(this.path)
      return true
    } catch (error) {
      if (error !== null && typeof error === 'object' && /** @type {any} */ (error).code === 'ENOENT') return false
      throw error
    }
  }

  /**
   * Whether any account is saved.
   *
   * @returns {boolean} True when at least one record exists.
   */
  present() {
    return this.readState() !== undefined
  }
}

/** Backwards-compatible alias: the store used to be single-account. */
export const TokenStore = AccountStore
