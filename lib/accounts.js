/**
 * Multi-account session for WorkBuddy.
 *
 * Each signed-in account is an isolated record in the token store: its own
 * access token, refresh token, expiry, account ids, and domain. Exactly one is
 * active at a time, and every outbound request is built from that record
 * alone — no header, cookie, or identifier from another account is ever mixed
 * in.
 *
 * Two risk-control measures live here rather than at the call sites:
 *
 * 1. **Request pacing per account.** A burst of parallel completions from one
 *    account is the shape that gets flagged, so requests to the same account
 *    are spaced by a minimum gap and capped by a concurrency limit. Different
 *    accounts do not share a queue, because sharing one would make one
 *    account's traffic look like another's.
 * 2. **Derived, stable device identity per account.** A random local salt is
 *    generated once and stored beside the tokens; the machine and session ids
 *    are derived from `salt + account uid`, so one account always presents the
 *    same device and two accounts never present the same one. These values are
 *    explicitly *derived*, not read from the physical machine: they carry no
 *    real hardware information.
 *
 * @module @ban-sky/dsh-workbuddy/accounts
 */

import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Namespace and version for the derived device identity. */
const DEVICE_NAMESPACE = 'dsh-workbuddy/device/v1'

/** Characters in a derived device id (shape-compatible with a 36-char uuid). */
export const DEVICE_ID_LENGTH = 36

/** Minimum gap between two requests from the same account. */
export const MIN_REQUEST_GAP_MS = 1_200

/** Requests one account may have in flight. */
export const MAX_CONCURRENT_PER_ACCOUNT = 2

/**
 * Derive one stable identifier for an account.
 *
 * @param {string} uid - Account uid.
 * @param {'machine' | 'session'} purpose - Which header the value is for.
 * @param {string} salt - This installation's random salt.
 * @returns {string} 36 lowercase hex characters, or '' without a uid or salt.
 */
export function deriveDeviceId(uid, purpose, salt) {
  if (uid === '' || salt === '') return ''
  return createHash('sha256')
    .update(`${DEVICE_NAMESPACE}\0${salt}\0${purpose}\0${uid}`, 'utf8')
    .digest('hex')
    .slice(0, DEVICE_ID_LENGTH)
}

/**
 * Read or create the installation device salt.
 *
 * The salt is random per installation, so two users never derive the same id
 * for the same account — a constant salt would make every user of this plugin
 * one identifiable group.
 *
 * @param {string} path - Salt file path.
 * @returns {string} 64 lowercase hex characters, or '' when unavailable.
 */
export function loadDeviceSalt(path) {
  try {
    const value = readFileSync(path, 'utf8').trim()
    if (/^[0-9a-f]{64}$/.test(value)) return value
  } catch {
    // Missing or unreadable: fall through and create a new one.
  }
  try {
    const value = randomBytes(32).toString('hex')
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, `${value}\n`, { mode: 0o600 })
    renameSync(temporary, path)
    chmodSync(path, 0o600)
    return value
  } catch {
    return ''
  }
}

/**
 * Per-account request pacer.
 *
 * Keeps at most `maxConcurrent` requests in flight and spaces request starts by
 * `minGapMs`. Channels are keyed by account id, so a busy account never delays
 * another one.
 */
export class RequestPacer {
  /**
   * @param {object} [options] - Pacer options.
   * @param {number} [options.minGapMs] - Minimum gap between request starts.
   * @param {number} [options.maxConcurrent] - In-flight limit per account.
   * @param {() => number} [options.now] - Clock (tests).
   */
  constructor({ minGapMs = MIN_REQUEST_GAP_MS, maxConcurrent = MAX_CONCURRENT_PER_ACCOUNT, now = Date.now } = {}) {
    this.minGapMs = minGapMs
    this.maxConcurrent = maxConcurrent
    this.now = now
    /** @type {Map<string, { nextAt: number, active: number }>} */
    this.channels = new Map()
  }

  /**
   * Read (creating on demand) one account's channel state.
   *
   * @param {string} key - Account id.
   * @returns {{ nextAt: number, active: number }} Channel state.
   */
  channel(key) {
    let channel = this.channels.get(key)
    if (channel === undefined) {
      channel = { nextAt: 0, active: 0 }
      this.channels.set(key, channel)
    }
    return channel
  }

  /**
   * Wait until this account may start one more request.
   *
   * @param {string} key - Account id.
   * @param {AbortSignal} [signal] - Cancellation signal.
   * @returns {Promise<void>} Resolves when the request may start.
   */
  async acquire(key, signal) {
    for (;;) {
      if (signal?.aborted === true) throw new DOMException('Aborted', 'AbortError')
      const channel = this.channel(key)
      const wait = channel.nextAt - this.now()
      if (channel.active < this.maxConcurrent && wait <= 0) {
        channel.active += 1
        channel.nextAt = this.now() + this.minGapMs
        return
      }
      const delay = Math.max(25, Math.min(wait > 0 ? wait : 50, 250))
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  /**
   * Mark one request finished.
   *
   * @param {string} key - Account id.
   * @returns {void}
   */
  release(key) {
    const channel = this.channels.get(key)
    if (channel !== undefined && channel.active > 0) channel.active -= 1
  }

  /**
   * Forget one account's channel (after sign-out).
   *
   * @param {string} key - Account id.
   * @returns {void}
   */
  forget(key) {
    this.channels.delete(key)
  }
}

/**
 * Build the account-scoped headers the gateway sees.
 *
 * @param {Record<string, string>} headers - Base credential headers.
 * @param {object} options - Identity inputs.
 * @param {string} [options.uid] - Account uid.
 * @param {string} [options.salt] - Installation salt.
 * @returns {Record<string, string>} Headers with a derived device identity.
 */
export function withDeviceIdentity(headers, { uid = '', salt = '' } = {}) {
  const machine = deriveDeviceId(uid, 'machine', salt)
  const session = deriveDeviceId(uid, 'session', salt)
  if (machine === '' || session === '') return headers
  return { ...headers, 'x-machine-id': machine, 'x-session-id': session }
}
