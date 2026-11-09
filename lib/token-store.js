/**
 * Token store for tokens entered in the plugin's own settings page.
 *
 * The desktop app's auth document stays the preferred source (it refreshes
 * itself), but a user without the desktop app can paste an access token in
 * Settings → Plugins → WorkBuddy. That token is stored next to the DSH home
 * directory in a 0600 JSON file, never in the plugin configuration and never
 * in a response body.
 *
 * @module @ban-sky/dsh-workbuddy/token-store
 */

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** File name inside the DSH home directory. */
export const TOKEN_STORE_FILE = '.workbuddy-credentials.json'

/** Largest auth document we are willing to read (a token is a few KiB). */
const MAX_FILE_BYTES = 64 * 1024

/** Longest access token accepted from the settings form. */
const MAX_TOKEN_LENGTH = 16_384

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
 * Validate and normalize a token record.
 *
 * @param {unknown} value - Parsed JSON or form payload.
 * @returns {{ token: string, uid: string, enterpriseId: string, domain: string } | undefined} Normalized record, or undefined when unusable.
 */
export function normalizeTokenRecord(value) {
  if (value === null || typeof value !== 'object') return undefined
  const record = /** @type {Record<string, unknown>} */ (value)
  const token = typeof record.token === 'string' ? record.token.trim() : ''
  if (token === '' || token.length > MAX_TOKEN_LENGTH || /[\u0000-\u001f\u007f]/.test(token)) return undefined
  const text = (field) => (typeof field === 'string' ? field.trim().slice(0, 512) : '')
  return {
    token,
    uid: text(record.uid),
    enterpriseId: text(record.enterpriseId),
    domain: text(record.domain).replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
  }
}

/**
 * Persistent store for a manually entered WorkBuddy token.
 *
 * `read()` caches by mtime, so the file can be replaced on disk (or cleared)
 * without restarting DSH. Writes go through a temporary file and `rename`, so
 * a crash can never leave a half-written credential behind.
 */
export class TokenStore {
  /**
   * @param {object} [options] - Store options.
   * @param {string} [options.path] - Absolute file path.
   * @param {(message: string) => void} [options.onWarning] - Diagnostic sink.
   */
  constructor(options = {}) {
    this.path = options.path ?? defaultTokenStorePath()
    this.onWarning = options.onWarning ?? (() => {})
    /** @type {{ token: string, uid: string, enterpriseId: string, domain: string } | undefined} */
    this.cached = undefined
    this.cachedMtimeMs = 0
  }

  /**
   * Read the saved token, if any.
   *
   * @returns {{ token: string, uid: string, enterpriseId: string, domain: string } | undefined} Saved record.
   */
  read() {
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
      const record = normalizeTokenRecord(parsed)
      this.cached = record
      this.cachedMtimeMs = mtimeMs
      return record
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
   * Persist a token record.
   *
   * @param {{ token: string, uid?: string, enterpriseId?: string, domain?: string }} input - Form payload.
   * @returns {{ token: string, uid: string, enterpriseId: string, domain: string }} Stored record.
   * @throws {Error} When the payload has no usable token.
   */
  save(input) {
    const record = normalizeTokenRecord(input)
    if (record === undefined) throw new Error('token 不能为空，且不能包含控制字符。')
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(
      temporary,
      `${JSON.stringify({ version: 1, ...record, savedAt: new Date().toISOString() }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    )
    renameSync(temporary, this.path)
    chmodSync(this.path, 0o600)
    this.cached = record
    try {
      this.cachedMtimeMs = statSync(this.path).mtimeMs
    } catch {
      this.cachedMtimeMs = 0
    }
    return record
  }

  /**
   * Remove the saved token. Missing files are not an error.
   *
   * @returns {boolean} True when a file was removed.
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
   * Whether a saved token exists.
   *
   * @returns {boolean} True when `read()` yields a record.
   */
  present() {
    return this.read() !== undefined
  }
}
